import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { profiles } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { toPublicProfile, upsertProfileFromBackend } from "@/lib/profiles/service";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:profiles");

export async function GET() {
  try {
    const db = getDb();
    const allProfiles = await db.select().from(profiles);
    return NextResponse.json({ profiles: allProfiles.map(toPublicProfile) });
  } catch (error) {
    log.error({ err: error }, "GET error");
    return NextResponse.json(
      { error: "Failed to fetch profiles" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { id, name, fingerprint } = body;

    if (!id || !name) {
      return NextResponse.json(
        { error: "id and name are required" },
        { status: 400 }
      );
    }

    const { profile } = await upsertProfileFromBackend({ id, name, fingerprint });
    return NextResponse.json({ profile: toPublicProfile(profile) });
  } catch (error) {
    log.error({ err: error }, "POST error");
    return NextResponse.json(
      { error: "Failed to create profile" },
      { status: 500 }
    );
  }
}
