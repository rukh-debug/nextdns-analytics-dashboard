import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { tags, webhookDevices, webhookTags, webhooks } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

const webhookTriggerSchema = z.enum(["flagged", "new_device", "volume_spike", "device_online", "device_offline"]);

const patchWebhookSchema = z.object({
  name: z.string().trim().min(1).optional(),
  url: z.string().url().optional(),
  secret: z.string().trim().min(1).nullable().optional(),
  triggers: z.array(webhookTriggerSchema).min(1).optional(),
  isActive: z.boolean().optional(),
  cooldownMinutes: z.number().int().min(0).max(1440).optional(),
  groupId: z.string().uuid().nullable().optional(),
  personId: z.string().uuid().nullable().optional(),
  tagIds: z.array(z.string().trim().min(1)).optional(),
  deviceIds: z.array(z.string().trim().min(1)).optional(),
  deviceGapSeconds: z.number().int().min(60).max(86400).optional(),
});

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const whRows = await db.select().from(webhooks).where(eq(webhooks.id, id));
  const webhook = whRows[0] ?? null;

  if (!webhook) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  const rows = await db
    .select({
      tagId: tags.id,
      tagName: tags.name,
      tagSlug: tags.slug,
      tagColor: tags.color,
    })
    .from(webhookTags)
    .innerJoin(tags, eq(webhookTags.tagId, tags.id))
    .where(eq(webhookTags.webhookId, id));

  const deviceRows = await db
    .select({ deviceId: webhookDevices.deviceId })
    .from(webhookDevices)
    .where(eq(webhookDevices.webhookId, id));

  return NextResponse.json({
    webhook: {
      ...webhook,
      tags: rows.map((row) => ({
        id: row.tagId,
        name: row.tagName,
        slug: row.tagSlug,
        color: row.tagColor,
      })),
      tagIds: rows.map((row) => row.tagId),
      deviceIds: deviceRows.map((r) => r.deviceId),
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const exRows = await db.select({ id: webhooks.id }).from(webhooks).where(eq(webhooks.id, id));
  if (!exRows[0]) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  const body = patchWebhookSchema.parse(await req.json());
  const updates: Partial<typeof webhooks.$inferInsert> = {};
  if (body.name) updates.name = body.name;
  if (body.url) updates.url = body.url;
  if (body.secret !== undefined) updates.secret = body.secret;
  if (body.triggers) updates.triggers = body.triggers;
  if (body.isActive !== undefined) updates.isActive = body.isActive;
  if (body.cooldownMinutes !== undefined) updates.cooldownMinutes = body.cooldownMinutes;
  if (body.deviceGapSeconds !== undefined) updates.deviceGapSeconds = body.deviceGapSeconds;
  const newGroupId = body.groupId !== undefined ? body.groupId : body.personId;
  if (newGroupId !== undefined) updates.groupId = newGroupId;
  updates.updatedAt = new Date().toISOString();
  await db.update(webhooks).set(updates).where(eq(webhooks.id, id));

  if (body.tagIds !== undefined) {
    await db.delete(webhookTags).where(eq(webhookTags.webhookId, id));
    if (body.tagIds.length > 0) {
      await db.insert(webhookTags)
        .values(body.tagIds.map((tagId) => ({ webhookId: id, tagId })))
        .onConflictDoNothing();
    }
  }

  if (body.deviceIds !== undefined) {
    await db.delete(webhookDevices).where(eq(webhookDevices.webhookId, id));
    if (body.deviceIds.length > 0) {
      await db.insert(webhookDevices)
        .values(body.deviceIds.map((deviceId) => ({ webhookId: id, deviceId })))
        .onConflictDoNothing();
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const exRows = await db.select({ id: webhooks.id }).from(webhooks).where(eq(webhooks.id, id));
  if (!exRows[0]) {
    return NextResponse.json({ error: "Webhook not found" }, { status: 404 });
  }

  await db.delete(webhookDevices).where(eq(webhookDevices.webhookId, id));
  await db.delete(webhookTags).where(eq(webhookTags.webhookId, id));
  await db.delete(webhooks).where(eq(webhooks.id, id));
  return NextResponse.json({ success: true });
}
