import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { devices, groups } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:groups");

const createGroupSchema = z.object({
  name: z.string().trim().min(1),
  color: z.string().trim().min(1).nullable().optional(),
  icon: z.string().trim().min(1).nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("profileId");
    const allGroups = await db.select().from(groups);

    if (!profileId) {
      return NextResponse.json({ groups: allGroups, persons: allGroups });
    }

    const profileDevices = await db
      .select({
        id: devices.id,
        groupId: devices.groupId,
        name: devices.name,
      })
      .from(devices)
      .where(and(eq(devices.profileId, profileId)));

    const devicesByGroupId = new Map<string, { id: string; name: string }[]>();
    for (const device of profileDevices) {
      if (!device.groupId) continue;
      const items = devicesByGroupId.get(device.groupId) ?? [];
      items.push({ id: device.id, name: device.name });
      devicesByGroupId.set(device.groupId, items);
    }

    const result = allGroups.map((group) => {
      const boundDevices = devicesByGroupId.get(group.id) ?? [];
      return {
        ...group,
        deviceCount: boundDevices.length,
        devices: boundDevices,
      };
    });

    return NextResponse.json({ groups: result, persons: result });
  } catch (error) {
    log.error({ err: error }, "GET error");
    return NextResponse.json({ error: "Failed to fetch groups" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = getDb();
    const { name, color, icon } = createGroupSchema.parse(await request.json());
    const resultRows = await db.insert(groups).values({ name, color, icon }).returning();
    return NextResponse.json({ group: resultRows[0], person: resultRows[0] });
  } catch (error) {
    log.error({ err: error }, "POST error");
    return NextResponse.json({ error: "Failed to create group" }, { status: 500 });
  }
}
