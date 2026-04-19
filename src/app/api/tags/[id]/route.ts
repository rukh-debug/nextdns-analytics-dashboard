import { after, NextResponse } from "next/server";
import { rebuildAllLogTags } from "@/lib/alerts/tagging";
import { deleteTag, updateTag } from "@/lib/alerts/domain-lists";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:tags");

const patchTagSchema = z.object({
  name: z.string().trim().min(1).optional(),
  color: z.string().trim().min(1).nullable().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const input = patchTagSchema.parse(await request.json());
    const tag = await updateTag(id, input, { rebuildLogs: false });

    after(async () => {
      try {
        await rebuildAllLogTags();
      } catch (error) {
        log.error({ err: error, tagId: id }, "Deferred tag rebuild failed");
      }
    });

    return NextResponse.json({ tag, syncQueued: true });
  } catch (error) {
    log.error({ err: error }, "PATCH error");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update tag" },
      { status: 400 }
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await deleteTag(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error({ err: error }, "DELETE error");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete tag" },
      { status: 400 }
    );
  }
}