import { getDb } from "@/lib/db";
import { profiles, analyticsSnapshots } from "@/lib/db/schema";
import { decrypt } from "@/lib/crypto";
import { createClient } from "@/lib/api";
import { format } from "date-fns";
import { createLogger } from "@/lib/logger";

const log = createLogger("analytics");

type SnapshotData = typeof analyticsSnapshots.$inferInsert["data"];

export class AnalyticsScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;

  start() {
    log.info("Starting hourly scheduler");
    this.run();
    this.timer = setInterval(() => this.run(), 60 * 60 * 1000);
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async run() {
    try {
      const db = getDb();
      const allProfiles = await db.select().from(profiles);

      for (const profile of allProfiles) {
        try {
          const apiKey = decrypt(profile.apiKey);
          const client = createClient(apiKey);
          const today = format(new Date(), "yyyy-MM-dd");

          const [status, domains, deviceAnalytics, gafam] = await Promise.all([
            client.getStatusAnalytics(profile.id),
            client.getDomainAnalytics(profile.id, { limit: "50" }),
            client.getDeviceAnalytics(profile.id),
            client.getGafamAnalytics(profile.id),
          ]);

          const upsertSnapshot = async (type: string, data: SnapshotData) => {
            await db.insert(analyticsSnapshots)
              .values({
                profileId: profile.id,
                snapshotDate: today,
                period: "daily",
                type,
                data,
              })
              .onConflictDoNothing();
          };

          await upsertSnapshot("status", status.data);
          await upsertSnapshot("domains", domains.data);
          await upsertSnapshot("devices", deviceAnalytics.data);
          await upsertSnapshot("gafam", gafam.data);

          log.info({ profileName: profile.name }, "Updated snapshots");
        } catch (error) {
          log.error({ err: error, profileId: profile.id }, "Profile snapshot error");
        }
      }
    } catch (error) {
      log.error({ err: error }, "Scheduler error");
    }
  }
}
