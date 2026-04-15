import { getDb } from "@/lib/db";
import { dnsLogs, settings } from "@/lib/db/schema";
import { eq, lt, inArray } from "drizzle-orm";
import { createLogger } from "@/lib/logger";

const log = createLogger("retention");

export class RetentionCleanup {
  private timer: ReturnType<typeof setInterval> | null = null;

  start() {
    log.info("Starting daily cleanup scheduler");
    this.run();
    this.timer = setInterval(() => this.run(), 24 * 60 * 60 * 1000);
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
      const retentionSettingRows = await db.select().from(settings).where(eq(settings.key, "retention_days"));
      const retentionSetting = retentionSettingRows[0] ?? null;
      const retentionDays = retentionSetting ? parseInt(retentionSetting.value) : 90;

      if (retentionDays === 0) {
        log.info("Indefinite retention - skipping cleanup");
        return;
      }

      const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
      let deleted = 0;
      const BATCH = 1000;

      while (true) {
        const idsToDelete = await db
          .select({ id: dnsLogs.id })
          .from(dnsLogs)
          .where(lt(dnsLogs.timestamp, cutoff))
          .limit(BATCH);

        if (idsToDelete.length === 0) break;

        const ids = idsToDelete.map((r) => r.id);
        await db.delete(dnsLogs).where(inArray(dnsLogs.id, ids));
        deleted += ids.length;
        if (ids.length < BATCH) break;
      }

      if (deleted > 0) {
        log.info({ deleted, retentionDays }, "Deleted expired logs");
      }
    } catch (error) {
      log.error({ err: error }, "Cleanup error");
    }
  }
}
