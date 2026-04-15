import { getDb } from "@/lib/db";
import { dnsLogs, profiles } from "@/lib/db/schema";
import { and, count, eq, gte } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";
import { LogPoller } from "./log-poller";
import { SSEStreamer } from "./sse-streamer";
import { AnalyticsScheduler } from "./analytics-scheduler";
import { RetentionCleanup } from "./retention-cleanup";
import { createLogger } from "@/lib/logger";

const log = createLogger("ingestion");

function subtractDays(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export class IngestionManager {
  private pollers = new Map<string, LogPoller>();
  private streamers = new Map<string, SSEStreamer>();
  private analyticsScheduler: AnalyticsScheduler;
  private retentionCleanup: RetentionCleanup;
  private started = false;

  constructor() {
    this.analyticsScheduler = new AnalyticsScheduler();
    this.retentionCleanup = new RetentionCleanup();
  }

  async start() {
    if (this.started) return;
    this.started = true;

    log.info("Starting ingestion manager...");

    const db = getDb();
    const allProfiles = await db.select().from(profiles);
    const pollInterval = parseInt(process.env.POLL_INTERVAL_SECONDS || "30") * 1000;

    log.info({ profileCount: allProfiles.length }, "Found profiles");

    for (const profile of allProfiles) {
      this.startProfile(profile.id, pollInterval).catch((error) => {
        log.error({ err: error, profileId: profile.id }, "Failed to start profile");
      });
    }

    this.analyticsScheduler.start();
    this.retentionCleanup.start();

    log.info({ profileCount: allProfiles.length }, "Manager started");
  }

  stop() {
    for (const poller of this.pollers.values()) poller.stop();
    for (const streamer of this.streamers.values()) streamer.stop();
    this.analyticsScheduler.stop();
    this.retentionCleanup.stop();
    this.started = false;
    log.info("Manager stopped");
  }

  async ensureProfileRunning(profileId: string) {
    if (!this.started) {
      await this.start();
      return;
    }

    if (this.pollers.has(profileId) && this.streamers.has(profileId)) {
      return;
    }

    const pollInterval = parseInt(process.env.POLL_INTERVAL_SECONDS || "30") * 1000;
    await this.startProfile(profileId, pollInterval);
  }

  stopProfile(profileId: string) {
    this.pollers.get(profileId)?.stop();
    this.streamers.get(profileId)?.stop();
    this.pollers.delete(profileId);
    this.streamers.delete(profileId);
  }

  async backfillProfile(profileId: string): Promise<number> {
    const db = getDb();
    const profileRows = await db.select().from(profiles).where(eq(profiles.id, profileId));
    const profile = profileRows[0] ?? null;
    if (!profile) throw new Error(`Profile ${profileId} not found`);

    const apiKey = decrypt(profile.apiKey);
    const poller = new LogPoller(profileId, apiKey);
    return poller.backfill();
  }

  async getStatus() {
    const db = getDb();
    const allProfiles = await db.select().from(profiles);
    return allProfiles.map((p) => ({
      id: p.id,
      name: p.name,
      lastIngestedAt: p.lastIngestedAt,
      lastStreamId: p.lastStreamId,
      bootstrapStatus: p.bootstrapStatus,
      bootstrapWindowStart: p.bootstrapWindowStart,
      bootstrapWindowEnd: p.bootstrapWindowEnd,
      bootstrapCutoffAt: p.bootstrapCutoffAt,
      bootstrapCompletedAt: p.bootstrapCompletedAt,
      lastSuccessfulPollAt: p.lastSuccessfulPollAt,
      lastSuccessfulStreamAt: p.lastSuccessfulStreamAt,
      isPolling: this.pollers.has(p.id),
      isStreaming: this.streamers.has(p.id),
    }));
  }

  private async shouldBootstrapProfile(profileId: string) {
    const db = getDb();
    const profileRows = await db.select().from(profiles).where(eq(profiles.id, profileId));
    const profile = profileRows[0] ?? null;
    if (!profile) {
      return false;
    }

    if (profile.bootstrapStatus === "running") {
      return true;
    }

    if (!profile.lastIngestedAt) {
      return true;
    }

    const recentWindowStart = subtractDays(7);
    const recentLogRows = await db
      .select({ count: count() })
      .from(dnsLogs)
      .where(
        and(
          eq(dnsLogs.profileId, profileId),
          gte(dnsLogs.timestamp, recentWindowStart)
        )
      );
    const recentLogs = recentLogRows[0] ?? null;

    return (recentLogs?.count || 0) === 0;
  }

  private async startProfile(profileId: string, pollInterval: number) {
    if (this.pollers.has(profileId) && this.streamers.has(profileId)) {
      return;
    }

    const db = getDb();
    const profileRows = await db.select().from(profiles).where(eq(profiles.id, profileId));
    const profile = profileRows[0] ?? null;
    if (!profile) {
      throw new Error(`Profile ${profileId} not found`);
    }

    const apiKey = decrypt(profile.apiKey);
    log.info({ profileId: profile.id, profileName: profile.name }, "Setting up profile");

    const poller = new LogPoller(profile.id, apiKey, pollInterval);
    poller.start();
    this.pollers.set(profile.id, poller);

    const streamer = new SSEStreamer(profile.id, apiKey);
    streamer.start();
    this.streamers.set(profile.id, streamer);

    this.bootstrapInBackground(poller, { id: profile.id, name: profile.name }).catch((error) => {
      log.error({ err: error, profileName: profile.name }, "Background bootstrap failed");
    });
  }

  private async bootstrapInBackground(
    poller: LogPoller,
    profile: { id: string; name: string }
  ) {
    const fetchHistory = process.env.ENABLE_HISTORY_FETCH === "1";

    if (fetchHistory && await this.shouldBootstrapProfile(profile.id)) {
      log.info({ profileName: profile.name }, "Bootstrapping 7-day history (background)...");
      const count = await poller.bootstrapRecentHistory();
      log.info({ profileName: profile.name, count }, "Bootstrap complete");
    }

    const enableCatchup = process.env.ENABLE_CATCHUP_ON_BOOT === "1";

    if (enableCatchup) {
      const catchUpCount = await poller.catchUpGap();
      if (catchUpCount > 0) {
        log.info({ profileName: profile.name, count: catchUpCount }, "Catch-up logs ingested");
      }
    }
  }
}

let _manager: IngestionManager | null = null;

export function getIngestionManager(): IngestionManager {
  if (!_manager) {
    _manager = new IngestionManager();
  }
  return _manager;
}
