import { NextResponse } from "next/server";
import { inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { groups } from "@/lib/db/schema";
import { getActivitySnapshot } from "@/lib/activity/detector";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:devices");

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("profileId");
    const groupId = searchParams.get("groupId") || searchParams.get("personId");
    const unassigned = searchParams.get("unassigned") === "true";

    if (!profileId) {
      return NextResponse.json(
        { error: "profileId is required" },
        { status: 400 }
      );
    }

    const db = getDb();
    const snapshot = await getActivitySnapshot(db, profileId, {
      groupId,
      unassigned,
    });
    const groupIds = [
      ...new Set(snapshot.devices.map((device) => device.groupId).filter(Boolean)),
    ] as string[];
    const groupRows = groupIds.length
      ? await db
          .select({ id: groups.id, name: groups.name, color: groups.color })
          .from(groups)
          .where(inArray(groups.id, groupIds as [string, ...string[]]))
      : [];
    const groupMap = new Map(groupRows.map((group) => [group.id, group]));

    return NextResponse.json({
      devices: snapshot.devices.map((device) => ({
        ...device,
        group: device.groupId ? groupMap.get(device.groupId) ?? null : null,
        person: device.groupId ? groupMap.get(device.groupId) ?? null : null,
      })),
      summary: {
        total: snapshot.devices.length,
        active: snapshot.devices.filter((device) => device.status === "active").length,
        unassigned: snapshot.devices.filter((device) => !device.groupId).length,
      },
      thresholds: {
        windowMinutes: snapshot.windowMinutes,
        minimumQueries: snapshot.minimumQueries,
      },
    });
  } catch (error) {
    log.error({ err: error }, "GET error");
    return NextResponse.json(
      { error: "Failed to fetch devices" },
      { status: 500 }
    );
  }
}
