import { NextResponse } from "next/server";
import { refreshDomainList } from "@/lib/alerts/domain-lists";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:domain-lists");

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await refreshDomainList(id);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    log.error({ err: error }, "POST error");
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to refresh domain list" },
      { status: 400 }
    );
  }
}
