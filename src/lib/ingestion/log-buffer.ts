import { processLogBatch } from "./log-processor";
import type { NextDNSLog } from "@/types/nextdns";
import { createLogger } from "@/lib/logger";

const log = createLogger("log-buffer");

const DEFAULT_FLUSH_INTERVAL_MS = 2000;
const DEFAULT_MAX_BUFFER_SIZE = 50;
const OVERFLOW_LIMIT = 500;

export class LogBuffer {
  private profileId: string;
  private buffer: NextDNSLog[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;
  private flushIntervalMs: number;
  private maxBufferSize: number;

  constructor(
    profileId: string,
    flushIntervalMs = DEFAULT_FLUSH_INTERVAL_MS,
    maxBufferSize = DEFAULT_MAX_BUFFER_SIZE
  ) {
    this.profileId = profileId;
    this.flushIntervalMs = flushIntervalMs;
    this.maxBufferSize = maxBufferSize;
  }

  add(entry: NextDNSLog) {
    this.buffer.push(entry);

    if (this.buffer.length >= this.maxBufferSize || this.buffer.length >= OVERFLOW_LIMIT) {
      this.flush();
      return;
    }

    if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => this.flush(), this.flushIntervalMs);
    }
  }

  flush() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    if (this.buffer.length === 0 || this.flushing) {
      return;
    }

    const batch = this.buffer.splice(0);
    this.flushing = true;

    processLogBatch(this.profileId, batch)
      .then((result) => {
        if (result.inserted > 0) {
          log.debug(
            { profileId: this.profileId, attempted: result.attempted, inserted: result.inserted },
            "Buffer flush complete"
          );
        }
      })
      .catch((error) => {
        log.error({ err: error, profileId: this.profileId, batchSize: batch.length }, "Buffer flush error");
      })
      .finally(() => {
        this.flushing = false;
      });
  }

  destroy() {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.flush();
  }
}
