import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteDomainList, updateDomainList } from "@/lib/alerts/domain-lists";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:domain-lists");

const patchDomainListSchema = z.object({
  name: z.string().trim().min(1).optional(),
  tagId: z.string().trim().min(1).optional(),
  sourceUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
});

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const input = patchDomainListSchema.parse(await request.json());
    const list = await updateDomainList(id, input);
    return NextResponse.json({ list });
  } catch (error) {
    log.error({ err: error }, "PATCH error");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to update domain list" },
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
    await deleteDomainList(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    log.error({ err: error }, "DELETE error");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to delete domain list" },
      { status: 400 }
    );
  }
}
