import { NextResponse } from "next/server";

export async function GET() {
  try {
    const { getDb } = await import("@/lib/db");
    const { profiles } = await import("@/lib/db/schema");
    const { getIngestionManager } = await import("@/lib/ingestion/ingestion-manager");

    const db = getDb();
    const allProfiles = await db.select().from(profiles);
    const manager = getIngestionManager();
    const ingestionStatus = await manager.getStatus();

    return NextResponse.json({
      status: "ok",
      uptime: process.uptime(),
      profiles: ingestionStatus,
      dbSize: allProfiles.length,
    });
  } catch (error) {
    return NextResponse.json(
      { status: "error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 503 }
    );
  }
}
