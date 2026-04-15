import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getActivitySnapshot } from "@/lib/activity/detector";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:activity");

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

    return NextResponse.json({
      thresholds: {
        windowMinutes: snapshot.windowMinutes,
        minimumQueries: snapshot.minimumQueries,
      },
      summary: {
        activeDevices: snapshot.devices.filter((device) => device.status === "active").length,
        totalDevices: snapshot.devices.length,
        activeGroups: snapshot.groups.filter((group) => group.status === "active").length,
        totalGroups: snapshot.groups.length,
        activePersons: snapshot.groups.filter((group) => group.status === "active").length,
        totalPersons: snapshot.groups.length,
      },
      devices: snapshot.devices,
      groups: snapshot.groups,
      persons: snapshot.groups,
    });
  } catch (error) {
    log.error({ err: error }, "GET error");
    return NextResponse.json(
      { error: "Failed to fetch activity status" },
      { status: 500 }
    );
  }
}
