import { NextResponse } from "next/server";
import { getIngestionManager } from "@/lib/ingestion/ingestion-manager";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:ingestion");

export async function POST() {
  try {
    const manager = getIngestionManager();
    await manager.start();

    const status = manager.getStatus();
    return NextResponse.json({
      success: true,
      message: "Ingestion running",
      profiles: status,
    });
  } catch (error) {
    log.error({ err: error }, "Request error");
    return NextResponse.json(
      { error: "Failed to start ingestion" },
      { status: 500 }
    );
  }
}
