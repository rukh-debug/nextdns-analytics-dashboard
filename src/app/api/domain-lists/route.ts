import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { domainLists, tags } from "@/lib/db/schema";
import { createDomainList, ensureBuiltInDomainLists } from "@/lib/alerts/domain-lists";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:domain-lists");

const createDomainListSchema = z.object({
  name: z.string().trim().min(1),
  tagId: z.string().trim().min(1),
  sourceUrl: z.string().url(),
});

export async function GET() {
  try {
    const db = getDb();
    await ensureBuiltInDomainLists();
    const lists = await db
      .select({
        id: domainLists.id,
        name: domainLists.name,
        sourceType: domainLists.sourceType,
        sourceUrl: domainLists.sourceUrl,
        isSystem: domainLists.isSystem,
        isActive: domainLists.isActive,
        lastFetchedAt: domainLists.lastFetchedAt,
        lastFetchStatus: domainLists.lastFetchStatus,
        lastFetchError: domainLists.lastFetchError,
        entryCount: domainLists.entryCount,
        createdAt: domainLists.createdAt,
        updatedAt: domainLists.updatedAt,
        tagId: tags.id,
        tagName: tags.name,
        tagSlug: tags.slug,
        tagColor: tags.color,
      })
      .from(domainLists)
      .innerJoin(tags, eq(domainLists.tagId, tags.id));

    return NextResponse.json({
      lists: lists.map((list) => ({
        id: list.id,
        name: list.name,
        sourceType: list.sourceType,
        sourceUrl: list.sourceUrl,
        isSystem: list.isSystem,
        isActive: list.isActive,
        lastFetchedAt: list.lastFetchedAt,
        lastFetchStatus: list.lastFetchStatus,
        lastFetchError: list.lastFetchError,
        entryCount: list.entryCount,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
        tag: {
          id: list.tagId,
          name: list.tagName,
          slug: list.tagSlug,
          color: list.tagColor,
        },
      })),
    });
  } catch (error) {
    log.error({ err: error }, "GET error");
    return NextResponse.json({ error: "Failed to fetch domain lists" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = createDomainListSchema.parse(await request.json());
    const list = await createDomainList(input);
    return NextResponse.json({ list });
  } catch (error) {
    log.error({ err: error }, "POST error");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create domain list" },
      { status: 400 }
    );
  }
}
