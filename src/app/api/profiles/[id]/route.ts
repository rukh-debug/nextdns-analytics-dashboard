import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { analyticsSnapshots, devices, dnsLogs, dnsLogTags, profiles } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { getIngestionManager } from "@/lib/ingestion/ingestion-manager";
import { toPublicProfile } from "@/lib/profiles/service";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:profiles");

type ProfilePatch = Partial<typeof profiles.$inferInsert>;

function chunk<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const rows = await db.select().from(profiles).where(eq(profiles.id, id));
    const profile = rows[0] ?? null;
    if (!profile) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    return NextResponse.json({ profile: toPublicProfile(profile) });
  } catch (error) {
    log.error({ err: error }, "GET error");
    return NextResponse.json({ error: "Failed to fetch profile" }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const body = await request.json();

    const updates: ProfilePatch = { updatedAt: new Date().toISOString() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.isActive !== undefined) updates.isActive = body.isActive;
    if (body.lastIngestedAt !== undefined) updates.lastIngestedAt = body.lastIngestedAt;
    if (body.lastStreamId !== undefined) updates.lastStreamId = body.lastStreamId;

    await db.update(profiles).set(updates).where(eq(profiles.id, id));
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error({ err: error }, "PATCH error");
    return NextResponse.json({ error: "Failed to update profile" }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const exRows = await db.select().from(profiles).where(eq(profiles.id, id));
    const existing = exRows[0] ?? null;
    if (!existing) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }

    getIngestionManager().stopProfile(id);

    const logIdRows = await db
      .select({ id: dnsLogs.id })
      .from(dnsLogs)
      .where(eq(dnsLogs.profileId, id));
    const logIds = logIdRows.map((row) => row.id);

    await db.transaction(async (tx) => {
      for (const batch of chunk(logIds, 500)) {
        await tx.delete(dnsLogTags).where(inArray(dnsLogTags.logId, batch as [number, ...number[]]));
      }

      await tx.delete(analyticsSnapshots).where(eq(analyticsSnapshots.profileId, id));
      await tx.delete(dnsLogs).where(eq(dnsLogs.profileId, id));
      await tx.delete(devices).where(eq(devices.profileId, id));
      await tx.delete(profiles).where(eq(profiles.id, id));
    });

    return NextResponse.json({
      success: true,
      deleted: {
        profileId: id,
        dnsLogs: logIds.length,
      },
    });
  } catch (error) {
    log.error({ err: error }, "DELETE error");
    return NextResponse.json({ error: "Failed to delete profile" }, { status: 500 });
  }
}
