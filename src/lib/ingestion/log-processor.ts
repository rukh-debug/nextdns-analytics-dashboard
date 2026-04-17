import { createHash } from "node:crypto";
import { getDb } from "@/lib/db";
import { devices, dnsLogs, groups, profiles } from "@/lib/db/schema";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { NextDNSBlockReason, NextDNSLog } from "@/types/nextdns";
import { fireWebhooks } from "@/lib/webhooks/trigger";
import { getNumericSetting } from "@/lib/settings";
import {
  attachTagsToInsertedLogs,
  resolveTagMatchesForDomains,
  summarizeTagMatches,
} from "@/lib/alerts/tagging";
import { createLogger } from "@/lib/logger";
import { getDedupCache } from "./dedup-cache";

const log = createLogger("log-processor");

const BATCH_SIZE = 100;
const HASH_QUERY_BATCH_SIZE = 500;
const profileLocks = new Map<string, Promise<void>>();

type ProcessLogBatchResult = {
  attempted: number;
  inserted: number;
};

type ProcessLogBatchOptions = {
  skipWebhooks?: boolean;
};

type PreparedLog = {
  log: NextDNSLog;
  row: typeof dnsLogs.$inferInsert;
};

function normalizeReasons(reasons: NextDNSBlockReason[] | undefined) {
  if (!reasons?.length) {
    return [];
  }

  return reasons
    .map((reason) => ({ id: reason.id, name: reason.name }))
    .sort((left, right) => {
      const leftKey = `${left.id}:${left.name}`;
      const rightKey = `${right.id}:${right.name}`;
      return leftKey.localeCompare(rightKey);
    });
}

function buildEventHash(profileId: string, log: NextDNSLog) {
  // Fast field concatenation instead of JSON.stringify of the full object
  const reasons = normalizeReasons(log.reasons);
  const parts = [
    profileId,
    log.timestamp,
    log.domain,
    log.root ?? "",
    log.tracker ?? "",
    log.type ?? "",
    log.dnssec ?? "",
    String(log.encrypted),
    log.protocol,
    log.clientIp,
    log.client ?? "",
    log.device ? `${log.device.id}|${log.device.name}|${log.device.model ?? ""}|${log.device.localIp ?? ""}` : "",
    log.status,
    reasons.map((r) => `${r.id}:${r.name}`).join(","),
  ];

  return createHash("sha256").update(parts.join("|")).digest("hex");
}

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function maxTimestamp(left: string | null | undefined, right: string) {
  if (!left) {
    return right;
  }

  return left >= right ? left : right;
}

async function withProfileLock<T>(profileId: string, task: () => Promise<T>) {
  const previous = profileLocks.get(profileId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const queued = previous.then(() => current);

  profileLocks.set(profileId, queued);
  await previous;

  try {
    return await task();
  } finally {
    release();
    if (profileLocks.get(profileId) === queued) {
      profileLocks.delete(profileId);
    }
  }
}

async function processLogBatchUnsafe(
  profileId: string,
  logs: NextDNSLog[],
  options: ProcessLogBatchOptions = {}
): Promise<ProcessLogBatchResult> {
  if (logs.length === 0) {
    return { attempted: 0, inserted: 0 };
  }

  const db = getDb();

  // --- Resolve human-readable names for webhook payloads ---
  const profileRow = await db.select({ name: profiles.name })
    .from(profiles)
    .where(eq(profiles.id, profileId))
    .limit(1);
  const profileName = profileRow[0]?.name ?? null;

  const volumeSpikeThreshold = await getNumericSetting(db, "volume_spike_threshold", 200);
  const tagMatches = await resolveTagMatchesForDomains(logs.map((log) => log.domain));

  const preparedLogs = logs.map((log, index) => {
    const rootDomain = log.root || null;
    const reasons = normalizeReasons(log.reasons);
    const matches = tagMatches[index] ?? [];
    const row: typeof dnsLogs.$inferInsert = {
      profileId,
      eventHash: buildEventHash(profileId, log),
      deviceId: log.device?.id || null,
      deviceName: log.device?.name || null,
      deviceModel: log.device?.model || null,
      deviceLocalIp: log.device?.localIp || null,
      timestamp: log.timestamp,
      domain: log.domain,
      rootDomain,
      tracker: log.tracker || null,
      status: log.status,
      queryType: log.type || null,
      dnssec: typeof log.dnssec === "boolean" ? log.dnssec : null,
      encrypted: log.encrypted,
      protocol: log.protocol,
      clientIp: log.clientIp,
      clientName: log.client || null,
      isFlagged: matches.length > 0,
      flagReason: summarizeTagMatches(matches),
      reasons: reasons.length > 0 ? reasons : null,
    };

    return { log, row, matches } satisfies PreparedLog & { matches: typeof matches };
  });

  const existingHashes = new Set<string>();
  const hashes = preparedLogs.map((entry) => entry.row.eventHash);

  // Check in-memory dedup cache first — skip DB for known hashes
  const dedupCache = getDedupCache();
  const cacheMisses = dedupCache.filterMisses(profileId, hashes);

  // All hashes found in memory cache — nothing to do
  if (cacheMisses.length === 0) {
    return { attempted: logs.length, inserted: 0 };
  }

  // Only query DB for hashes not found in memory cache
  for (const hashBatch of chunk(cacheMisses, HASH_QUERY_BATCH_SIZE)) {
    const rows = await db
      .select({ eventHash: dnsLogs.eventHash })
      .from(dnsLogs)
      .where(
        and(
          eq(dnsLogs.profileId, profileId),
          inArray(dnsLogs.eventHash, hashBatch as [string, ...string[]])
        )
      );

    for (const row of rows) {
      existingHashes.add(row.eventHash);
    }
  }

  // Add cache-miss hashes to the memory cache (they've now been checked against DB)
  dedupCache.addHashes(profileId, cacheMisses);

  const freshLogs = preparedLogs.filter((entry) => !existingHashes.has(entry.row.eventHash));
  if (freshLogs.length === 0) {
    return { attempted: logs.length, inserted: 0 };
  }

  // Collect unique devices from fresh logs, tracking latest timestamp per device
  const deviceUpdates = new Map<string, {
    id: string;
    name: string;
    model: string | null;
    localIp: string | null;
    lastSeenAt: string;
  }>();

  for (const { log } of freshLogs) {
    if (!log.device?.id) continue;

    const existing = deviceUpdates.get(log.device.id);
    const timestamp = existing
      ? maxTimestamp(existing.lastSeenAt, log.timestamp)
      : log.timestamp;

    deviceUpdates.set(log.device.id, {
      id: log.device.id,
      name: log.device.name,
      model: log.device.model || existing?.model || null,
      localIp: log.device.localIp || existing?.localIp || null,
      lastSeenAt: timestamp,
    });
  }

  // Fetch existing devices to distinguish new vs updated
  const deviceIds = [...deviceUpdates.keys()] as [string, ...string[]];
  const existingDevices = deviceIds.length > 0
    ? await db.select().from(devices).where(inArray(devices.id, deviceIds))
    : [];
  const existingDeviceMap = new Map(existingDevices.map((d) => [d.id, d]));
  const devicePersonMap = new Map(existingDevices.map((d) => [d.id, d.groupId]));

  const newDevices: Array<{
    id: string;
    name: string;
    model?: string | null;
    localIp?: string | null;
  }> = [];

  // Batch upsert all devices in one query
  if (deviceUpdates.size > 0) {
    const allDeviceValues = [...deviceUpdates.values()].map((d) => ({
      id: d.id,
      profileId,
      name: d.name,
      model: d.model,
      localIp: d.localIp,
      lastSeenAt: d.lastSeenAt,
    }));

    // Use ON CONFLICT to batch insert new + update existing in one query
    await db.insert(devices)
      .values(allDeviceValues)
      .onConflictDoUpdate({
        target: devices.id,
        set: {
          name: sql`EXCLUDED.name`,
          model: sql`COALESCE(NULLIF(EXCLUDED.model, ''), devices.model)`,
          localIp: sql`COALESCE(NULLIF(EXCLUDED.local_ip, ''), devices.local_ip)`,
          lastSeenAt: sql`GREATEST(devices.last_seen_at, EXCLUDED.last_seen_at)`,
          updatedAt: new Date().toISOString(),
        },
      });

    // Identify new devices (not in existing map) for webhooks
    for (const [deviceId, update] of deviceUpdates) {
      if (!existingDeviceMap.has(deviceId)) {
        newDevices.push({
          id: deviceId,
          name: update.name,
          model: update.model,
          localIp: update.localIp,
        });
        devicePersonMap.set(deviceId, null);
      } else {
        // Update local map with latest data for volume spike webhooks
        const existing = existingDeviceMap.get(deviceId)!;
        existingDeviceMap.set(deviceId, {
          ...existing,
          name: update.name,
          model: update.model || existing.model,
          localIp: update.localIp || existing.localIp,
          lastSeenAt: update.lastSeenAt,
        });
      }
    }
  }

  // Batch-resolve group names for webhook enrichment
  const uniqueGroupIds = [...new Set(devicePersonMap.values())].filter(Boolean) as string[];
  const groupNameMap = new Map<string, string>();
  if (uniqueGroupIds.length > 0) {
    const groupRows = await db.select({ id: groups.id, name: groups.name })
      .from(groups)
      .where(inArray(groups.id, uniqueGroupIds as [string, ...string[]]));
    for (const row of groupRows) {
      groupNameMap.set(row.id, row.name);
    }
  }

  let inserted = 0;
  const rows = freshLogs.map((entry) => entry.row);
  for (let index = 0; index < rows.length; index += BATCH_SIZE) {
    const batch = rows.slice(index, index + BATCH_SIZE);
    await db.insert(dnsLogs).values(batch).onConflictDoNothing();
    inserted += batch.length;
  }

  const insertedLogs = rows.length > 0
    ? await db
        .select({ id: dnsLogs.id, eventHash: dnsLogs.eventHash })
        .from(dnsLogs)
        .where(
          and(
            eq(dnsLogs.profileId, profileId),
            inArray(
              dnsLogs.eventHash,
              rows.map((row) => row.eventHash) as [string, ...string[]]
            )
          )
        )
    : [];

  const matchesByEventHash = new Map(
    freshLogs.map((entry) => [entry.row.eventHash, entry.matches])
  );
  await attachTagsToInsertedLogs(insertedLogs, matchesByEventHash);

  if (!options.skipWebhooks) {
    for (const device of newDevices) {
      fireWebhooks("new_device", {
        profileId,
        profileName,
        deviceId: device.id,
        deviceName: device.name,
        model: device.model ?? null,
        localIp: device.localIp ?? null,
        personId: null,
      }).catch((err) => log.error({ err, event: "new_device" }, "Webhook error"));
    }

    const rowByEventHash = new Map(rows.map((row) => [row.eventHash, row]));
    for (const insertedLog of insertedLogs) {
      const row = rowByEventHash.get(insertedLog.eventHash);
      if (!row?.isFlagged) {
        continue;
      }

      const groupId = row.deviceId ? devicePersonMap.get(row.deviceId) ?? null : null;
      const matches = matchesByEventHash.get(insertedLog.eventHash) ?? [];
      fireWebhooks("flagged", {
        logId: insertedLog.id,
        profileId,
        profileName,
        groupId,
        personId: groupId,
        groupName: groupId ? groupNameMap.get(groupId) ?? null : null,
        deviceId: row.deviceId,
        deviceName: row.deviceName ?? null,
        domain: row.domain,
        rootDomain: row.rootDomain,
        timestamp: row.timestamp,
        flagReason: row.flagReason,
        tags: matches.map((match) => ({
          id: match.tagId,
          name: match.tagName,
          slug: match.tagSlug,
          listId: match.listId,
          listName: match.listName,
          matchedDomain: match.matchedDomain,
        })),
      }).catch((err) => log.error({ err, event: "flagged" }, "Webhook error"));
    }

    const volumeByDeviceId = new Map<string, number>();
    for (const row of rows) {
      if (!row.deviceId) {
        continue;
      }

      volumeByDeviceId.set(row.deviceId, (volumeByDeviceId.get(row.deviceId) ?? 0) + 1);
    }

    for (const [deviceId, volume] of volumeByDeviceId) {
      if (volume < volumeSpikeThreshold) {
        continue;
      }

      const device = existingDeviceMap.get(deviceId) ?? newDevices.find((entry) => entry.id === deviceId);
      const groupId = devicePersonMap.get(deviceId) ?? null;
      fireWebhooks("volume_spike", {
        profileId,
        profileName,
        groupId,
        personId: groupId,
        groupName: groupId ? groupNameMap.get(groupId) ?? null : null,
        deviceId,
        deviceName: device?.name ?? null,
        volume,
        threshold: volumeSpikeThreshold,
        window: "batch",
      }).catch((err) => log.error({ err, event: "volume_spike" }, "Webhook error"));
    }
  }

  return {
    attempted: logs.length,
    inserted,
  };
}

export async function processLogBatch(
  profileId: string,
  logs: NextDNSLog[],
  options: ProcessLogBatchOptions = {}
): Promise<ProcessLogBatchResult> {
  return withProfileLock(profileId, () => processLogBatchUnsafe(profileId, logs, options));
}
