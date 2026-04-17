import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import type { NextDNSLog } from "@/types/nextdns";
import { EventSource } from "eventsource";
import { createLogger } from "@/lib/logger";
import { LogBuffer } from "./log-buffer";

const log = createLogger("sse");

function maxIso(left: string | null | undefined, right: string) {
  if (!left) {
    return right;
  }

  return left >= right ? left : right;
}

const PROFILE_STATE_THROTTLE_MS = 10_000;

export class SSEStreamer {
  private profileId: string;
  private apiKey: string;
  private eventSource: EventSource | null = null;
  private backoffMs = 5000;
  private maxBackoff = 120000;
  private shouldReconnect = true;
  private logBuffer: LogBuffer;
  private lastProfileUpdateAt = 0;
  private latestStreamId: string | null = null;
  private latestTimestamp: string | null = null;

  constructor(profileId: string, apiKey: string) {
    this.profileId = profileId;
    this.apiKey = apiKey;
    this.logBuffer = new LogBuffer(profileId);
  }

  start() {
    this.shouldReconnect = true;
    this.connect();
    log.info({ profileId: this.profileId }, "Starting SSE stream");
  }

  stop() {
    this.shouldReconnect = false;
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this.logBuffer.destroy();
    log.info({ profileId: this.profileId }, "Stopped SSE stream");
  }

  private async maybeUpdateProfileState() {
    const now = Date.now();
    if (now - this.lastProfileUpdateAt < PROFILE_STATE_THROTTLE_MS) {
      return;
    }
    this.lastProfileUpdateAt = now;

    if (!this.latestTimestamp && !this.latestStreamId) {
      return;
    }

    try {
      const db = getDb();
      const currentRows = await db.select().from(profiles).where(eq(profiles.id, this.profileId));
      const current = currentRows[0] ?? null;
      if (!current) return;

      await db.update(profiles)
        .set({
          lastIngestedAt: this.latestTimestamp
            ? maxIso(current.lastIngestedAt, this.latestTimestamp)
            : current.lastIngestedAt,
          lastStreamId: this.latestStreamId || current.lastStreamId,
          lastSuccessfulStreamAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(eq(profiles.id, this.profileId));

      this.latestTimestamp = null;
      this.latestStreamId = null;
    } catch (error) {
      log.error({ err: error, profileId: this.profileId }, "Profile state update error");
    }
  }

  private connect() {
    if (!this.shouldReconnect) return;

    const db = getDb();
    db.select().from(profiles).where(eq(profiles.id, this.profileId)).then((profileRows) => {
      const profile = profileRows[0] ?? null;
      if (!profile) return;

      const url = `https://api.nextdns.io/profiles/${this.profileId}/logs/stream`;
      this.eventSource = new EventSource(url, {
        fetch: (input: RequestInfo | URL, init) => {
          const headers: Record<string, string> = {
            ...((init?.headers as Record<string, string> | undefined) || {}),
            "X-Api-Key": this.apiKey,
          };
          if (profile.lastStreamId) {
            headers["Last-Event-ID"] = profile.lastStreamId;
          }

          return globalThis.fetch(input, {
            ...init,
            headers,
          });
        },
      });

      this.eventSource.addEventListener("open", () => {
        this.backoffMs = 5000;
      });

      this.eventSource.addEventListener("message", async (event: MessageEvent) => {
        try {
          const parsed: NextDNSLog = JSON.parse(event.data);

          // Track latest timestamp and stream ID for throttled profile updates
          if (event.lastEventId) {
            this.latestStreamId = event.lastEventId;
          }
          this.latestTimestamp = parsed.timestamp;

          // Buffer the log instead of processing one-by-one
          this.logBuffer.add(parsed);

          this.backoffMs = 5000;
        } catch (error) {
          log.error({ err: error, profileId: this.profileId }, "SSE parse error");
        }
      });

      // Periodic profile state flush
      const profileStateTimer = setInterval(() => {
        if (!this.shouldReconnect) {
          clearInterval(profileStateTimer);
          return;
        }
        this.maybeUpdateProfileState();
      }, PROFILE_STATE_THROTTLE_MS);

      this.eventSource.addEventListener("error", () => {
        clearInterval(profileStateTimer);
        this.maybeUpdateProfileState();
        this.eventSource?.close();
        this.eventSource = null;

        if (this.shouldReconnect) {
          log.info({ profileId: this.profileId, backoffSec: this.backoffMs / 1000 }, "Reconnecting SSE stream");
          setTimeout(() => this.connect(), this.backoffMs);
          this.backoffMs = Math.min(this.backoffMs * 2, this.maxBackoff);
        }
      });
    });
  }
}
