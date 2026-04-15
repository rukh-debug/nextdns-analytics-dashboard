import { getDb } from "./index";
import { sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { createLogger } from "@/lib/logger";

const log = createLogger("db");

export async function runMigrations() {
  const db = getDb();
  try {
    await db.execute(sql`CREATE SCHEMA IF NOT EXISTS "drizzle"`);
  } catch {
    // PG 17 bug: IF NOT EXISTS can still throw duplicate key
  }
  await migrate(db, { migrationsFolder: "./drizzle" });
  log.info("Migrations complete");
}
