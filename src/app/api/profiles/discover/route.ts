import { NextResponse } from "next/server";
import { getIngestionManager } from "@/lib/ingestion/ingestion-manager";
import { syncProfilesFromNextDns, toPublicProfile } from "@/lib/profiles/service";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:profiles");

export async function POST() {
  try {
    const sync = await syncProfilesFromNextDns();
    const manager = getIngestionManager();

    for (const profile of sync.profiles) {
      await manager.ensureProfileRunning(profile.id);
    }

    return NextResponse.json({
      profiles: sync.profiles.map(toPublicProfile),
      summary: {
        fetched: sync.fetched,
        created: sync.created,
        updated: sync.updated,
        unchanged: sync.unchanged,
      },
    });
  } catch (error) {
    log.error({ err: error }, "Request error");
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to sync profiles from NextDNS",
      },
      { status: 400 }
    );
  }
}
