import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { createClient, NextDNSClient } from "@/lib/api";
import { eq } from "drizzle-orm";
import { processLogBatch } from "./log-processor";
import { createLogger } from "@/lib/logger";

const log = createLogger("poller");

const DEFAULT_BOOTSTRAP_DAYS = 7;
const DEFAULT_BOOTSTRAP_WINDOW_HOURS = 6;
const DEFAULT_RECONCILE_OVERLAP_SECONDS = 60;
const DEFAULT_RECONCILE_LAG_SECONDS = 5;
const DEFAULT_RECONCILE_LOOKBACK_SECONDS = 300;
const PAGE_SIZE = 1000;

type ProfileRecord = typeof profiles.$inferSelect;

function addMilliseconds(iso: string, milliseconds: number) {
  return new Date(Date.parse(iso) + milliseconds).toISOString();
}

function subtractMilliseconds(iso: string, milliseconds: number) {
  return new Date(Date.parse(iso) - milliseconds).toISOString();
}

function maxIso(left: string | null | undefined, right: string | null | undefined) {
  if (!left) {
    return right ?? null;
  }

  if (!right) {
    return left;
  }

  return left >= right ? left : right;
}

function minIso(left: string, right: string) {
  return left <= right ? left : right;
}

export class LogPoller {
  private client: NextDNSClient;
  private profileId: string;
  private intervalMs: number;
  private bootstrapDays: number;
  private bootstrapWindowMs: number;
  private reconcileOverlapMs: number;
  private reconcileLagMs: number;
  private reconcileLookbackMs: number;
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(profileId: string, apiKey: string, intervalMs = 30000) {
    this.client = createClient(apiKey);
    this.profileId = profileId;
    this.intervalMs = intervalMs;
    this.bootstrapDays = parseInt(process.env.INITIAL_BACKFILL_DAYS || String(DEFAULT_BOOTSTRAP_DAYS), 10);
    this.bootstrapWindowMs = parseInt(
      process.env.BOOTSTRAP_WINDOW_HOURS || String(DEFAULT_BOOTSTRAP_WINDOW_HOURS),
      10
    ) * 60 * 60 * 1000;
    this.reconcileOverlapMs = parseInt(
      process.env.LIVE_RECONCILE_OVERLAP_SECONDS || String(DEFAULT_RECONCILE_OVERLAP_SECONDS),
      10
    ) * 1000;
    this.reconcileLagMs = parseInt(
      process.env.LIVE_RECONCILE_LAG_SECONDS || String(DEFAULT_RECONCILE_LAG_SECONDS),
      10
    ) * 1000;
    this.reconcileLookbackMs = parseInt(
      process.env.LIVE_RECONCILE_LOOKBACK_SECONDS || String(DEFAULT_RECONCILE_LOOKBACK_SECONDS),
      10
    ) * 1000;
  }

  start() {
    if (this.timer) return;
    log.info({ profileId: this.profileId, intervalSec: this.intervalMs / 1000 }, "Starting poller");
    this.poll();
    this.timer = setInterval(() => this.poll(), this.intervalMs);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    log.info({ profileId: this.profileId }, "Stopped poller");
  }

  async backfill(): Promise<number> {
    return this.bootstrapRecentHistory();
  }

  async bootstrapRecentHistory(): Promise<number> {
    let profile = await this.getProfile();
    if (!profile) {
      return 0;
    }

    const cutoff = profile.bootstrapCutoffAt || new Date().toISOString();
    const bootstrapStart = subtractMilliseconds(cutoff, this.bootstrapDays * 24 * 60 * 60 * 1000);
    let windowStart = profile.bootstrapWindowStart || bootstrapStart;
    let windowEnd = profile.bootstrapWindowEnd || minIso(addMilliseconds(windowStart, this.bootstrapWindowMs), cutoff);
    let cursor = profile.bootstrapCursor || null;
    let totalInserted = 0;

    await this.updateProfile({
      bootstrapStatus: "running",
      bootstrapCutoffAt: cutoff,
      bootstrapWindowStart: windowStart,
      bootstrapWindowEnd: windowEnd,
      bootstrapCursor: cursor,
      bootstrapCompletedAt: null,
    });

    log.info({ profileId: this.profileId, from: bootstrapStart, to: cutoff }, "Bootstrapping profile");

    try {
      while (windowStart < cutoff) {
        const page = await this.fetchPage(windowStart, windowEnd, cursor || undefined, { skipWebhooks: true });
        totalInserted += page.inserted;

        profile = await this.persistPageState(profile, page.lastTimestamp, page.streamId);

        if (page.cursor) {
          cursor = page.cursor;
          profile = await this.updateProfile({
            bootstrapStatus: "running",
            bootstrapCursor: cursor,
          });
          continue;
        }

        cursor = null;
        windowStart = windowEnd;

        if (windowStart >= cutoff) {
          await this.updateProfile({
            bootstrapStatus: "done",
            bootstrapCursor: null,
            bootstrapWindowStart: null,
            bootstrapWindowEnd: null,
            bootstrapCompletedAt: new Date().toISOString(),
          });
          break;
        }

        windowEnd = minIso(addMilliseconds(windowStart, this.bootstrapWindowMs), cutoff);
        profile = await this.updateProfile({
          bootstrapStatus: "running",
          bootstrapCursor: null,
          bootstrapWindowStart: windowStart,
          bootstrapWindowEnd: windowEnd,
        });
      }

      log.info({ profileId: this.profileId, totalInserted }, "Bootstrap complete");
      return totalInserted;
    } catch (error) {
      await this.updateProfile({ bootstrapStatus: "failed" });
      log.error({ err: error, profileId: this.profileId }, "Bootstrap error");
      throw error;
    }
  }

  async catchUpGap(): Promise<number> {
    const profile = await this.getProfile();
    if (!profile) {
      return 0;
    }

    const now = new Date().toISOString();
    const from = profile.lastIngestedAt
      ? subtractMilliseconds(profile.lastIngestedAt, this.reconcileOverlapMs)
      : subtractMilliseconds(now, this.reconcileLookbackMs);

    return this.ingestWindowedRange(from, now);
  }

  private async poll() {
    if (this.running) return;
    this.running = true;

    try {
      const inserted = await this.reconcileRecent();
      if (inserted > 0) {
        log.info({ profileId: this.profileId, inserted }, "Reconciled new logs");
      }
    } catch (error) {
      log.error({ err: error, profileId: this.profileId }, "Poll error");
    } finally {
      this.running = false;
    }
  }

  private async reconcileRecent() {
    const profile = await this.getProfile();
    if (!profile) {
      return 0;
    }

    const now = new Date();
    const to = new Date(now.getTime() - this.reconcileLagMs).toISOString();
    const floor = new Date(now.getTime() - this.reconcileLookbackMs).toISOString();

    if (profile.lastSuccessfulPollAt && profile.lastSuccessfulPollAt < floor) {
      const gapFrom = profile.lastIngestedAt
        ? subtractMilliseconds(profile.lastIngestedAt, this.reconcileOverlapMs)
        : floor;
      return this.ingestWindowedRange(gapFrom, to);
    }

    const from = profile.lastIngestedAt
      ? maxIso(subtractMilliseconds(profile.lastIngestedAt, this.reconcileOverlapMs), floor) || floor
      : floor;

    if (from >= to) {
      return 0;
    }

    return this.ingestRange(from, to);
  }

  private async ingestWindowedRange(from: string, to: string) {
    if (from >= to) {
      return 0;
    }

    let totalInserted = 0;
    let windowStart = from;

    while (windowStart < to) {
      const windowEnd = minIso(addMilliseconds(windowStart, this.bootstrapWindowMs), to);
      totalInserted += await this.ingestRange(windowStart, windowEnd);
      windowStart = windowEnd;
    }

    return totalInserted;
  }

  private async ingestRange(from: string, to: string) {
    let totalInserted = 0;
    let cursor: string | null = null;
    let profile = await this.getProfile();

    if (!profile) {
      return 0;
    }

    do {
      const page = await this.fetchPage(from, to, cursor || undefined);
      totalInserted += page.inserted;
      profile = await this.persistPageState(profile, page.lastTimestamp, page.streamId);
      cursor = page.cursor;
    } while (cursor);

    return totalInserted;
  }

  private async fetchPage(from: string, to: string, cursor?: string, options?: { skipWebhooks?: boolean }) {
    const response = await this.client.getLogs(this.profileId, {
      from,
      to,
      limit: PAGE_SIZE,
      sort: "asc",
      cursor,
      raw: true,
    });

    const processed = await processLogBatch(this.profileId, response.data, options);
    const lastTimestamp = response.data.length > 0
      ? response.data[response.data.length - 1].timestamp
      : null;

    return {
      inserted: processed.inserted,
      cursor: response.meta.pagination.cursor,
      lastTimestamp,
      streamId: response.meta.stream?.id || null,
    };
  }

  private async persistPageState(
    profile: ProfileRecord,
    lastTimestamp: string | null,
    streamId: string | null
  ) {
    return this.updateProfile({
      lastSuccessfulPollAt: new Date().toISOString(),
      lastIngestedAt: maxIso(profile.lastIngestedAt, lastTimestamp),
      lastStreamId: streamId || profile.lastStreamId,
    });
  }

  private async getProfile() {
    const db = getDb();
    const rows = await db.select().from(profiles).where(eq(profiles.id, this.profileId));
    return rows[0] ?? null;
  }

  private async updateProfile(updates: Partial<typeof profiles.$inferInsert>) {
    const db = getDb();
    await db.update(profiles)
      .set({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(profiles.id, this.profileId));

    const rows = await db.select().from(profiles).where(eq(profiles.id, this.profileId));
    const profile = rows[0] ?? null;
    if (!profile) {
      throw new Error(`Profile ${this.profileId} not found`);
    }
    return profile;
  }
}
