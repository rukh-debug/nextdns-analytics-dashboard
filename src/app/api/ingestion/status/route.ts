import { NextResponse } from "next/server";
import { getIngestionManager } from "@/lib/ingestion/ingestion-manager";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:ingestion");

export async function GET() {
  try {
    const manager = getIngestionManager();
    const status = manager.getStatus();
    return NextResponse.json({ profiles: status });
  } catch (error) {
    log.error({ err: error }, "Request error");
    return NextResponse.json(
      { error: "Failed to get ingestion status" },
      { status: 500 }
    );
  }
}
