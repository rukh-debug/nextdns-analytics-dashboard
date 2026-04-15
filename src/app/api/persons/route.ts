import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { devices, persons } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:persons");

const createPersonSchema = z.object({
  name: z.string().trim().min(1),
  color: z.string().trim().min(1).nullable().optional(),
  icon: z.string().trim().min(1).nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const db = getDb();
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("profileId");
    const allPersons = await db.select().from(persons);

    if (!profileId) {
      return NextResponse.json({ persons: allPersons });
    }

    const profileDevices = await db
      .select({
        id: devices.id,
        groupId: devices.groupId,
        name: devices.name,
      })
      .from(devices)
      .where(and(eq(devices.profileId, profileId)));

    const devicesByPersonId = new Map<string, { id: string; name: string }[]>();
    for (const device of profileDevices) {
      if (!device.groupId) {
        continue;
      }

      const items = devicesByPersonId.get(device.groupId) ?? [];
      items.push({ id: device.id, name: device.name });
      devicesByPersonId.set(device.groupId, items);
    }

    return NextResponse.json({
      persons: allPersons.map((person) => {
        const boundDevices = devicesByPersonId.get(person.id) ?? [];

        return {
          ...person,
          deviceCount: boundDevices.length,
          devices: boundDevices,
        };
      }),
    });
  } catch (error) {
    log.error({ err: error }, "GET error");
    return NextResponse.json({ error: "Failed to fetch persons" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const db = getDb();
    const { name, color, icon } = createPersonSchema.parse(await request.json());
    const resultRows = await db.insert(persons).values({ name, color, icon }).returning();
    return NextResponse.json({ person: resultRows[0] });
  } catch (error) {
    log.error({ err: error }, "POST error");
    return NextResponse.json({ error: "Failed to create person" }, { status: 500 });
  }
}
