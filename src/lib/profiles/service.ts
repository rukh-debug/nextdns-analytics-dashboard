import { eq } from "drizzle-orm";
import { createClient } from "@/lib/api";
import { encrypt } from "@/lib/crypto";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";

export function getBackendNextDnsApiKey() {
  const apiKey = process.env.NEXTDNS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("NEXTDNS_API_KEY is not configured on the backend");
  }
  return apiKey;
}

export function toPublicProfile(profile: typeof profiles.$inferSelect) {
  return {
    id: profile.id,
    name: profile.name,
    fingerprint: profile.fingerprint,
    isActive: profile.isActive,
    lastIngestedAt: profile.lastIngestedAt,
    lastSuccessfulPollAt: profile.lastSuccessfulPollAt,
    lastSuccessfulStreamAt: profile.lastSuccessfulStreamAt,
    bootstrapStatus: profile.bootstrapStatus,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  };
}

export async function upsertProfileFromBackend(input: {
  id: string;
  name: string;
  fingerprint?: string;
}) {
  const db = getDb();
  const encryptedApiKey = encrypt(getBackendNextDnsApiKey());
  const existingRows = await db.select().from(profiles).where(eq(profiles.id, input.id));
  const existing = existingRows[0] ?? null;

  if (!existing) {
    const createdRows = await db
      .insert(profiles)
      .values({
        id: input.id,
        name: input.name,
        fingerprint: input.fingerprint,
        apiKey: encryptedApiKey,
      })
      .returning();
    const created = createdRows[0];

    return { profile: created, status: "created" as const };
  }

  const metadataChanged =
    existing.name !== input.name ||
    existing.fingerprint !== (input.fingerprint ?? null);

  await db.update(profiles)
    .set({
      name: input.name,
      fingerprint: input.fingerprint,
      apiKey: encryptedApiKey,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(profiles.id, input.id));

  const updatedRows = await db.select().from(profiles).where(eq(profiles.id, input.id));
  const profile = updatedRows[0] ?? null;
  if (!profile) {
    throw new Error(`Profile ${input.id} not found after upsert`);
  }

  return {
    profile,
    status: metadataChanged ? ("updated" as const) : ("unchanged" as const),
  };
}

export async function syncProfilesFromNextDns() {
  const client = createClient(getBackendNextDnsApiKey());
  const response = await client.getProfiles();

  const synced: Array<{ profile: typeof profiles.$inferSelect; status: "created" | "updated" | "unchanged" }> = [];
  for (const nextDnsProfile of response.data) {
    synced.push(
      await upsertProfileFromBackend({
        id: nextDnsProfile.id,
        name: nextDnsProfile.name,
        fingerprint: nextDnsProfile.fingerprint,
      })
    );
  }

  return {
    profiles: synced.map((entry) => entry.profile),
    created: synced.filter((entry) => entry.status === "created").length,
    updated: synced.filter((entry) => entry.status === "updated").length,
    unchanged: synced.filter((entry) => entry.status === "unchanged").length,
    fetched: synced.length,
  };
}
