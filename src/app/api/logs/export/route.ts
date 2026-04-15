import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { devices, dnsLogs } from "@/lib/db/schema";
import { and, eq, gte, inArray, lt, or, sql } from "drizzle-orm";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:logs");

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("profileId");
    if (!profileId) {
      return NextResponse.json({ error: "profileId required" }, { status: 400 });
    }

    const status = searchParams.get("status");
    const deviceId = searchParams.get("deviceId");
    const groupId = searchParams.get("groupId") || searchParams.get("personId");
    const flagged = searchParams.get("flagged");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const search = searchParams.get("search")?.trim();

    const db = getDb();
    const conditions = [eq(dnsLogs.profileId, profileId)];
    if (status && status !== "all") {
      conditions.push(
        eq(
          dnsLogs.status,
          status as "default" | "blocked" | "allowed" | "relayed" | "error"
        )
      );
    }
    if (deviceId) conditions.push(eq(dnsLogs.deviceId, deviceId));
    if (flagged === "true") conditions.push(eq(dnsLogs.isFlagged, true));
    if (from) conditions.push(gte(dnsLogs.timestamp, from));
    if (to) conditions.push(lt(dnsLogs.timestamp, to));

    if (search) {
      const searchPattern = `%${search}%`;
      conditions.push(
        or(
          sql`${dnsLogs.domain} like ${searchPattern}`,
          sql`coalesce(${dnsLogs.rootDomain}, '') like ${searchPattern}`,
          sql`coalesce(${dnsLogs.clientIp}, '') like ${searchPattern}`,
          sql`coalesce(${dnsLogs.clientName}, '') like ${searchPattern}`,
          sql`coalesce(${dnsLogs.tracker}, '') like ${searchPattern}`,
          sql`coalesce(${dnsLogs.queryType}, '') like ${searchPattern}`,
          sql`coalesce(${dnsLogs.deviceName}, '') like ${searchPattern}`,
          sql`coalesce(${dnsLogs.deviceModel}, '') like ${searchPattern}`,
          sql`coalesce(${dnsLogs.deviceLocalIp}, '') like ${searchPattern}`,
          sql`${dnsLogs.status} like ${searchPattern}`
        )!
      );
    }

    if (groupId) {
      const personDeviceIds = (await db
        .select({ id: devices.id })
        .from(devices)
        .where(eq(devices.groupId, groupId)))
        .map((device) => device.id);

      if (personDeviceIds.length === 0) {
          return new Response(
          "Timestamp,Domain,RootDomain,Status,QueryType,Dnssec,DeviceId,DeviceName,DeviceModel,DeviceLocalIp,Protocol,ClientIP,ClientName,Encrypted,Flagged,FlagReason\n",
          {
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition": `attachment; filename="dns-logs-${new Date().toISOString().split("T")[0]}.csv"`,
            },
          }
        );
      }

      conditions.push(inArray(dnsLogs.deviceId, personDeviceIds as [string, ...string[]]));
    }

    const logs = await db.select()
      .from(dnsLogs)
      .where(and(...conditions))
      .orderBy(dnsLogs.timestamp)
      .limit(50000);

    const header = "Timestamp,Domain,RootDomain,Status,QueryType,Dnssec,DeviceId,DeviceName,DeviceModel,DeviceLocalIp,Protocol,ClientIP,ClientName,Encrypted,Flagged,FlagReason\n";
    const rows = logs.map((l) =>
      `"${l.timestamp}","${l.domain}","${l.rootDomain || ""}","${l.status}","${l.queryType || ""}","${l.dnssec ?? ""}","${l.deviceId || ""}","${l.deviceName || ""}","${l.deviceModel || ""}","${l.deviceLocalIp || ""}","${l.protocol || ""}","${l.clientIp || ""}","${l.clientName || ""}","${l.encrypted}","${l.isFlagged}","${l.flagReason || ""}"`
    ).join("\n");

    return new Response(header + rows, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="dns-logs-${new Date().toISOString().split("T")[0]}.csv"`,
      },
    });
  } catch (error) {
    log.error({ err: error }, "Request error");
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }
}
