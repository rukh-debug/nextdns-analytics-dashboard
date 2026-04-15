import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { tags, webhookTags, webhooks } from "@/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { z } from "zod";

const webhookTriggerSchema = z.enum(["flagged", "new_device", "volume_spike"]);

const webhookSchema = z.object({
  name: z.string().trim().min(1),
  url: z.string().url(),
  secret: z.string().trim().min(1).nullable().optional(),
  triggers: z.array(webhookTriggerSchema).min(1),
  groupId: z.string().uuid().nullable().optional(),
  personId: z.string().uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  cooldownMinutes: z.number().int().min(0).max(1440).optional(),
  tagIds: z.array(z.string().trim().min(1)).optional().default([]),
});

export async function GET(request: Request) {
  const db = getDb();
  const { searchParams } = new URL(request.url);
  const groupId = searchParams.get("groupId") || searchParams.get("personId");
  const activeOnly = searchParams.get("active") === "true";
  const allRows = await db.select().from(webhooks);
  const all = allRows.filter((webhook) => {
    if (activeOnly && !webhook.isActive) {
      return false;
    }

    if (groupId && webhook.groupId !== groupId) {
      return false;
    }

    return true;
  });

  const webhookIds = all.map((webhook) => webhook.id);
  const rows = webhookIds.length > 0
    ? await db
        .select({
          webhookId: webhookTags.webhookId,
          tagId: tags.id,
          tagName: tags.name,
          tagSlug: tags.slug,
          tagColor: tags.color,
        })
        .from(webhookTags)
        .innerJoin(tags, eq(webhookTags.tagId, tags.id))
        .where(inArray(webhookTags.webhookId, webhookIds as [string, ...string[]]))
    : [];

  const tagMap = new Map<string, Array<{ id: string; name: string; slug: string; color: string | null }>>();
  for (const row of rows) {
    const existing = tagMap.get(row.webhookId) ?? [];
    existing.push({
      id: row.tagId,
      name: row.tagName,
      slug: row.tagSlug,
      color: row.tagColor,
    });
    tagMap.set(row.webhookId, existing);
  }

  return NextResponse.json({
    webhooks: all.map((webhook) => ({
      ...webhook,
      tags: tagMap.get(webhook.id) ?? [],
      tagIds: (tagMap.get(webhook.id) ?? []).map((tag) => tag.id),
    })),
  });
}

export async function POST(request: Request) {
  const db = getDb();
  const { name, url, secret, triggers, groupId, personId, isActive, cooldownMinutes, tagIds } = webhookSchema.parse(
    await request.json()
  );
  const resolvedGroupId = groupId ?? personId ?? null;
  const resultRows = await db.insert(webhooks).values({
    name,
    url,
    secret,
    triggers,
    groupId: resolvedGroupId,
    isActive,
    cooldownMinutes,
  }).returning();
  const result = resultRows[0];

  if (tagIds.length > 0 && result) {
    await db.insert(webhookTags)
      .values(tagIds.map((tagId) => ({ webhookId: result.id, tagId })))
      .onConflictDoNothing();
  }

  return NextResponse.json({ webhook: result });
}
