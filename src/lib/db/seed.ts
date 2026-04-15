import { getDb } from "./index";
import { settings } from "./schema";
import { eq } from "drizzle-orm";
import { createLogger } from "@/lib/logger";

const log = createLogger("seed");

const DEFAULTS: Record<string, string> = {
  retention_days: "90",
  idle_threshold_queries: "5",
  idle_threshold_minutes: "10",
  polling_interval_seconds: "30",
  volume_spike_threshold: "200",
};

export async function seed() {
  const db = getDb();

  for (const [key, value] of Object.entries(DEFAULTS)) {
    const existing = await db
      .select()
      .from(settings)
      .where(eq(settings.key, key))
      .limit(1);

    if (existing.length === 0) {
      await db.insert(settings).values({ key, value });
      log.info({ key, value }, "Set default setting");
    }
  }

  log.info("Seeding complete");
}

seed().catch((error) => log.error({ err: error }, "Seed failed"));
