import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { tags } from "@/lib/db/schema";
import { createTag, ensureBuiltInDomainLists } from "@/lib/alerts/domain-lists";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:tags");

const createTagSchema = z.object({
  name: z.string().trim().min(1),
  color: z.string().trim().min(1).nullable().optional(),
});

export async function GET() {
  try {
    await ensureBuiltInDomainLists();
    const db = getDb();
    const rows = await db.select().from(tags);
    return NextResponse.json({ tags: rows });
  } catch (error) {
    log.error({ err: error }, "GET error");
    return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const input = createTagSchema.parse(await request.json());
    const tag = await createTag(input);
    return NextResponse.json({ tag });
  } catch (error) {
    log.error({ err: error }, "POST error");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create tag" },
      { status: 400 }
    );
  }
}