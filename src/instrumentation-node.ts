import { createLogger } from "@/lib/logger";

const log = createLogger("instrumentation");

log.info("register() called");

async function setupIngestion() {
  const { runMigrations } = await import("./lib/db/migrate");
  const { getDb } = await import("./lib/db");
  const { profiles } = await import("./lib/db/schema");
  const { getIngestionManager } = await import("./lib/ingestion/ingestion-manager");

  await runMigrations();
  log.info("Migrations complete");

  const db = getDb();
  const allProfiles = await db.select().from(profiles);

  if (allProfiles.length > 0) {
    log.info({ profileCount: allProfiles.length }, "Found profiles, starting ingestion...");
    const manager = getIngestionManager();
    manager.start().catch((error: unknown) => {
      log.error({ err: error }, "Ingestion manager startup error");
    });
    log.info("Ingestion manager starting in background");
  } else {
    log.info("No profiles configured yet, skipping ingestion");
  }
}

setupIngestion().catch((error: unknown) => {
  log.error({ err: error }, "Startup error");
});

export {};
