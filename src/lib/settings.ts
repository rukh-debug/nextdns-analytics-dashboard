import { eq } from "drizzle-orm";
import { settings } from "@/lib/db/schema";
import { getDb } from "@/lib/db";

type Db = ReturnType<typeof getDb>;

export async function getSetting(db: Db, key: string): Promise<string | null> {
  return (
    (await db.select({ value: settings.value })
      .from(settings)
      .where(eq(settings.key, key)))[0]?.value ?? null
  );
}

export async function getNumericSetting(db: Db, key: string, fallback: number): Promise<number> {
  const rawValue = await getSetting(db, key);
  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    return fallback;
  }

  return parsedValue;
}
