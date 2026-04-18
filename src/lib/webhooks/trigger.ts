import { createHmac } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { webhookTags, webhooks } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const log = createLogger("webhooks");

export type WebhookEvent = "flagged" | "volume_spike" | "new_device" | "device_online" | "device_offline";

const EVENT_LABELS: Record<WebhookEvent, string> = {
  flagged: "🚩 Flagged Query",
  volume_spike: "📈 Volume Spike",
  new_device: "🖥️ New Device",
  device_online: "🟢 Device Online",
  device_offline: "🔴 Device Offline",
};

// --- Circuit breaker (per URL) ---
const circuitBreakers = new Map<string, { failures: number; openUntil: number }>();
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 60_000;

// --- Cooldown cache (per webhook + root domain) ---
const cooldownCache = new Map<string, number>();
const COOLDOWN_PRUNE_INTERVAL = 60_000 * 5; // prune every 5 minutes
let lastPruneAt = 0;

interface WebhookPayload {
  groupId?: string | null;
  personId?: string | null;
  rootDomain?: string | null;
  profileName?: string | null;
  groupName?: string | null;
  deviceName?: string | null;
  tags?: Array<{ id: string; name: string; slug: string }>;
  [key: string]: unknown;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function parseTriggers(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  if (typeof value === "string") {
    try {
      const parsedValue = JSON.parse(value);
      if (Array.isArray(parsedValue)) {
        return parsedValue.filter(
          (item): item is string => typeof item === "string"
        );
      }
    } catch {
      return [];
    }
  }

  return [];
}

function isDiscordWebhook(url: string): boolean {
  return url.includes("discord.com") || url.includes("discordapp.com");
}

// --- Discord embed formatting ---
const DISCORD_HIDE_KEYS = new Set([
  "tags", "trigger", "timestamp", "groupid", "personid",
  "profileid", "deviceid", "groupid", "profileid",
]);

function formatDiscordPayload(event: WebhookEvent, rawPayload: Record<string, unknown>): string {
  const fields: { name: string; value: string; inline: boolean }[] = [];

  // Add human-readable fields first
  if (rawPayload.profileName) {
    fields.push({ name: "Profile", value: String(rawPayload.profileName), inline: true });
  }
  if (rawPayload.groupName) {
    fields.push({ name: "Group", value: String(rawPayload.groupName), inline: true });
  }
  if (rawPayload.deviceName) {
    fields.push({ name: "Device", value: String(rawPayload.deviceName), inline: true });
  }
  if (rawPayload.domain) {
    fields.push({ name: "Domain", value: String(rawPayload.domain), inline: false });
  }
  if (rawPayload.rootDomain && rawPayload.rootDomain !== rawPayload.domain) {
    fields.push({ name: "Root Domain", value: String(rawPayload.rootDomain), inline: true });
  }
  if (rawPayload.flagReason) {
    fields.push({ name: "Reason", value: String(rawPayload.flagReason), inline: true });
  }
  if (rawPayload.volume != null) {
    fields.push({ name: "Volume", value: String(rawPayload.volume), inline: true });
  }
  if (rawPayload.threshold != null) {
    fields.push({ name: "Threshold", value: String(rawPayload.threshold), inline: true });
  }
  if (rawPayload.model) {
    fields.push({ name: "Model", value: String(rawPayload.model), inline: true });
  }
  if (rawPayload.localIp) {
    fields.push({ name: "Local IP", value: String(rawPayload.localIp), inline: true });
  }
  if (rawPayload.offlineDuration != null) {
    fields.push({ name: "Offline Duration", value: `${rawPayload.offlineDuration} min`, inline: true });
  }
  if (rawPayload.offlineSince) {
    fields.push({ name: "Offline Since", value: String(rawPayload.offlineSince), inline: true });
  }

  // Catch any remaining fields we haven't explicitly handled (excluding hidden ones)
  const handledKeys = new Set([
    "profileName", "groupName", "deviceName", "domain", "rootDomain",
    "flagReason", "volume", "threshold", "model", "localIp",
    "offlineDuration", "offlineSince",
  ]);
  for (const [key, val] of Object.entries(rawPayload)) {
    if (val == null || DISCORD_HIDE_KEYS.has(key.toLowerCase()) || handledKeys.has(key)) continue;
    if (typeof val === "object") continue;
    const label = key
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .replace(/^\w/, (c) => c.toUpperCase());
    fields.push({ name: label, value: String(val), inline: true });
  }

  if (rawPayload.tags && Array.isArray(rawPayload.tags)) {
    const tagNames = (rawPayload.tags as Array<{ name: string }>).map((t) => t.name).join(", ");
    fields.push({ name: "Tags", value: tagNames, inline: false });
  }

  return JSON.stringify({
    content: null,
    embeds: [
      {
        title: EVENT_LABELS[event],
        color: event === "flagged" ? 0xe74c3c : event === "volume_spike" ? 0xf39c12 : event === "device_online" ? 0x2ecc71 : event === "device_offline" ? 0x95a5a6 : 0x3498db,
        fields: fields.slice(0, 25),
        timestamp: rawPayload.timestamp as string,
      },
    ],
  });
}

// --- Webhook delivery with retry + circuit breaker ---
async function deliverWebhook(
  url: string,
  body: string,
  secret?: string | null
): Promise<boolean> {
  const breaker = circuitBreakers.get(url);
  if (breaker && breaker.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    if (Date.now() < breaker.openUntil) {
      return false;
    }
    breaker.failures = 0;
  }

  const signature = secret
    ? createHmac("sha256", secret).update(body).digest("hex")
    : null;
  const retryDelays = [0, 1000, 5000, 15000];

  for (let attempt = 0; attempt < retryDelays.length; attempt += 1) {
    if (retryDelays[attempt] > 0) {
      await sleep(retryDelays[attempt]);
    }

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(signature ? { "x-ndns-signature": signature } : {}),
        },
        body,
      });

      if (response.ok) {
        circuitBreakers.delete(url);
        return true;
      }

      const text = await response.text().catch(() => "");
      log.error(
        { url, status: response.status, statusText: response.statusText, body: text.slice(0, 500), attempt: attempt + 1 },
        "Webhook response not OK"
      );
    } catch (error) {
      log.error({ err: error, url, attempt: attempt + 1 }, "Webhook delivery error");
    }
  }

  const current = circuitBreakers.get(url) || { failures: 0, openUntil: 0 };
  current.failures += 1;
  if (current.failures >= CIRCUIT_BREAKER_THRESHOLD) {
    current.openUntil = Date.now() + CIRCUIT_BREAKER_COOLDOWN_MS;
    log.warn(
      { url, failures: current.failures, cooldownSec: CIRCUIT_BREAKER_COOLDOWN_MS / 1000 },
      "Circuit breaker open for URL"
    );
  }
  circuitBreakers.set(url, current);

  return false;
}

// --- Cooldown deduplication ---
function pruneCooldownCache() {
  const now = Date.now();
  if (now - lastPruneAt < COOLDOWN_PRUNE_INTERVAL) return;
  lastPruneAt = now;

  // Remove entries older than 60 minutes (safe upper bound for any cooldown)
  const maxAge = 60 * 60_000;
  for (const [key, ts] of cooldownCache) {
    if (now - ts > maxAge) cooldownCache.delete(key);
  }
}

function isCooldownActive(
  webhookId: string,
  rootDomain: string | null | undefined,
  cooldownMinutes: number | null
): boolean {
  if (!rootDomain || !cooldownMinutes || cooldownMinutes <= 0) return false;

  pruneCooldownCache();

  const key = `${webhookId}:${rootDomain}`;
  const lastSent = cooldownCache.get(key);
  if (lastSent && Date.now() - lastSent < cooldownMinutes * 60_000) {
    return true;
  }
  return false;
}

function markCooldownSent(webhookId: string, rootDomain: string | null | undefined) {
  if (!rootDomain) return;
  cooldownCache.set(`${webhookId}:${rootDomain}`, Date.now());
}

// --- Main webhook dispatch ---
export async function fireWebhooks(
  event: WebhookEvent,
  payload: WebhookPayload
) {
  const db = getDb();
  const allWebhooks = await db.select().from(webhooks);
  const webhookIds = allWebhooks.map((webhook) => webhook.id);
  const tagRows = webhookIds.length > 0
    ? await db
        .select({ webhookId: webhookTags.webhookId, tagId: webhookTags.tagId })
        .from(webhookTags)
        .where(inArray(webhookTags.webhookId, webhookIds as [string, ...string[]]))
    : [];
  const webhookTagMap = new Map<string, string[]>();
  for (const row of tagRows) {
    const existing = webhookTagMap.get(row.webhookId) ?? [];
    existing.push(row.tagId);
    webhookTagMap.set(row.webhookId, existing);
  }
  const rawPayload = {
    trigger: event,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  for (const webhook of allWebhooks) {
    const triggers = parseTriggers(webhook.triggers);
    const matchesEvent = webhook.isActive && triggers.includes(event);
    const matchesPerson =
      webhook.groupId == null || webhook.groupId === (payload.groupId ?? payload.personId);
    const scopedTagIds = webhookTagMap.get(webhook.id) ?? [];
    const payloadTagIds = payload.tags?.map((tag) => tag.id) ?? [];
    const matchesTags =
      event !== "flagged" || scopedTagIds.length === 0
        ? true
        : scopedTagIds.some((tagId) => payloadTagIds.includes(tagId));

    if (!matchesEvent || !matchesPerson || !matchesTags) {
      continue;
    }

    // Cooldown check: only for flagged events with a root domain
    if (event === "flagged" && isCooldownActive(webhook.id, payload.rootDomain, webhook.cooldownMinutes ?? null)) {
      log.debug(
        { webhookId: webhook.id, webhookName: webhook.name, rootDomain: payload.rootDomain },
        "Webhook suppressed by cooldown"
      );
      continue;
    }

    const body = isDiscordWebhook(webhook.url)
      ? formatDiscordPayload(event, rawPayload)
      : JSON.stringify(rawPayload);

    const delivered = await deliverWebhook(webhook.url, body, webhook.secret);

    if (!delivered) {
      const cb = circuitBreakers.get(webhook.url);
      if (!cb || cb.failures < CIRCUIT_BREAKER_THRESHOLD) {
        log.error(
          { event, webhookName: webhook.name },
          "Failed to deliver webhook event"
        );
      }
      continue;
    }

    // Mark cooldown after successful delivery
    if (event === "flagged") {
      markCooldownSent(webhook.id, payload.rootDomain);
    }

    await db.update(webhooks)
      .set({ lastTriggeredAt: new Date().toISOString() })
      .where(eq(webhooks.id, webhook.id));
  }
}
