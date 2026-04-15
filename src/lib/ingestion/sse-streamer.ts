import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { processLogBatch } from "./log-processor";
import type { NextDNSLog } from "@/types/nextdns";
import { EventSource } from "eventsource";
import { createLogger } from "@/lib/logger";

const log = createLogger("sse");

function maxIso(left: string | null | undefined, right: string) {
  if (!left) {
    return right;
  }

  return left >= right ? left : right;
}

export class SSEStreamer {
  private profileId: string;
  private apiKey: string;
  private eventSource: EventSource | null = null;
  private backoffMs = 5000;
  private maxBackoff = 120000;
  private shouldReconnect = true;

  constructor(profileId: string, apiKey: string) {
    this.profileId = profileId;
    this.apiKey = apiKey;
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
    log.info({ profileId: this.profileId }, "Stopped SSE stream");
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
          const log: NextDNSLog = JSON.parse(event.data);
          await processLogBatch(this.profileId, [log]);

          const currentRows = await db.select().from(profiles).where(eq(profiles.id, this.profileId));
          const current = currentRows[0] ?? null;
          if (!current) {
            return;
          }

          await db.update(profiles)
            .set({
              lastIngestedAt: maxIso(current.lastIngestedAt, log.timestamp),
              lastStreamId: event.lastEventId || current.lastStreamId,
              lastSuccessfulStreamAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            })
            .where(eq(profiles.id, this.profileId));

          this.backoffMs = 5000;
        } catch (error) {
          log.error({ err: error, profileId: this.profileId }, "SSE parse error");
        }
      });

      this.eventSource.addEventListener("error", () => {
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
