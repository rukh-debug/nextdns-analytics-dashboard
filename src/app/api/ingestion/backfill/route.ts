import { NextResponse } from "next/server";
import { getIngestionManager } from "@/lib/ingestion/ingestion-manager";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:ingestion");

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { profileId } = body;

    if (!profileId) {
      return NextResponse.json(
        { error: "profileId is required" },
        { status: 400 }
      );
    }

    const manager = getIngestionManager();
    const count = await manager.backfillProfile(profileId);
    return NextResponse.json({ success: true, ingested: count });
  } catch (error) {
    log.error({ err: error }, "Request error");
    return NextResponse.json(
      { error: "Failed to run backfill" },
      { status: 500 }
    );
  }
}
