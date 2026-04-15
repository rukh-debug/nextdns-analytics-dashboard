import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { devices, groups } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:devices");

const patchDeviceSchema = z.object({
  groupId: z.string().uuid().nullable(),
  personId: z.string().uuid().nullable().optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const deviceRows = await db.select().from(devices).where(eq(devices.id, id));
    const device = deviceRows[0] ?? null;

    if (!device) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    let group = null;
    if (device.groupId) {
      const groupRows = await db.select().from(groups).where(eq(groups.id, device.groupId));
      group = groupRows[0] ?? null;
    }

    return NextResponse.json({ device: { ...device, group, person: group } });
  } catch (error) {
    log.error({ err: error }, "GET error");
    return NextResponse.json(
      { error: "Failed to fetch device" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getDb();
    const existingRows = await db.select().from(devices).where(eq(devices.id, id));
    const existingDevice = existingRows[0] ?? null;

    if (!existingDevice) {
      return NextResponse.json({ error: "Device not found" }, { status: 404 });
    }

    const body = patchDeviceSchema.parse(await request.json());
    const resolvedGroupId = body.groupId !== undefined ? body.groupId : (body.personId ?? null);

    if (resolvedGroupId) {
      const groupRows = await db.select().from(groups).where(eq(groups.id, resolvedGroupId));
      if (!groupRows[0]) {
        return NextResponse.json({ error: "Group not found" }, { status: 404 });
      }
    }

    await db.update(devices)
      .set({
        groupId: resolvedGroupId,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(devices.id, id));

    const updatedRows = await db.select().from(devices).where(eq(devices.id, id));
    const updatedDevice = updatedRows[0] ?? null;
    let group = null;
    if (updatedDevice?.groupId) {
      const groupRows = await db.select().from(groups).where(eq(groups.id, updatedDevice.groupId));
      group = groupRows[0] ?? null;
    }

    return NextResponse.json({
      success: true,
      device: updatedDevice ? { ...updatedDevice, group, person: group } : null,
    });
  } catch (error) {
    log.error({ err: error }, "PATCH error");
    return NextResponse.json(
      { error: "Failed to update device" },
      { status: 500 }
    );
  }
}
