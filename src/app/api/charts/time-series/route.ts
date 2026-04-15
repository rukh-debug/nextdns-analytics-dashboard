import { NextResponse } from "next/server";
import {
  and,
  count,
  eq,
  gte,
  inArray,
  lt,
  sql,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import { devices, dnsLogs } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:charts");

function resolveWindow(searchParams: URLSearchParams) {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const range = searchParams.get("range") ?? "24h";

  if (from || to) {
    return {
      range: "custom",
      from: from ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      to: to ?? new Date().toISOString(),
    };
  }

  const hoursByRange: Record<string, number> = {
    "6h": 6,
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
  };
  const hours = hoursByRange[range] ?? 24;

  return {
    range,
    from: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
    to: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("profileId");
    const groupId = searchParams.get("groupId") || searchParams.get("personId");
    const deviceId = searchParams.get("deviceId");
    const tz = searchParams.get("timezone") || "UTC";

    if (!profileId) {
      return NextResponse.json(
        { error: "profileId is required" },
        { status: 400 }
      );
    }

    const db = getDb();
    const window = resolveWindow(searchParams);
    const windowMs =
      new Date(window.to).getTime() - new Date(window.from).getTime();
    const conditions = [
      eq(dnsLogs.profileId, profileId),
      gte(dnsLogs.timestamp, window.from),
      lt(dnsLogs.timestamp, window.to),
    ];

    if (deviceId) {
      conditions.push(eq(dnsLogs.deviceId, deviceId));
    } else if (groupId) {
      const personDeviceIds = (await db
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.profileId, profileId), eq(devices.groupId, groupId))))
        .map((device) => device.id);

      if (personDeviceIds.length === 0) {
        return NextResponse.json({
          range: window.range,
          intervalSeconds: 0,
          series: [],
        });
      }

      conditions.push(inArray(dnsLogs.deviceId, personDeviceIds as [string, ...string[]]));
    }

    const bucketExpression =
      windowMs <= 6 * 60 * 60 * 1000
        ? sql<string>`to_char(date_trunc('hour', ${dnsLogs.timestamp}::timestamptz AT TIME ZONE ${tz}) + interval '5 min' * floor(extract(minute from ${dnsLogs.timestamp}::timestamptz AT TIME ZONE ${tz}) / 5), 'YYYY-MM-DD HH24:MI')`
        : windowMs <= 48 * 60 * 60 * 1000
          ? sql<string>`to_char(${dnsLogs.timestamp}::timestamptz AT TIME ZONE ${tz}, 'YYYY-MM-DD HH24')`
          : sql<string>`to_char(${dnsLogs.timestamp}::timestamptz AT TIME ZONE ${tz}, 'YYYY-MM-DD')`;
    const intervalSeconds =
      windowMs <= 6 * 60 * 60 * 1000
        ? 300
        : windowMs <= 48 * 60 * 60 * 1000
          ? 3600
          : 86400;

    const series = await db
      .select({
        bucket: bucketExpression,
        total: count(),
        default: sql<number>`sum(case when ${dnsLogs.status} = 'default' then 1 else 0 end)`,
        blocked: sql<number>`sum(case when ${dnsLogs.status} = 'blocked' then 1 else 0 end)`,
        allowed: sql<number>`sum(case when ${dnsLogs.status} = 'allowed' then 1 else 0 end)`,
        relayed: sql<number>`sum(case when ${dnsLogs.status} = 'relayed' then 1 else 0 end)`,
        error: sql<number>`sum(case when ${dnsLogs.status} = 'error' then 1 else 0 end)`,
      })
      .from(dnsLogs)
      .where(and(...conditions))
      .groupBy(bucketExpression)
      .orderBy(bucketExpression);

    return NextResponse.json({
      range: window.range,
      intervalSeconds,
      series,
    });
  } catch (error) {
    log.error({ err: error }, "Request error");
    return NextResponse.json(
      { error: "Failed to load time series" },
      { status: 500 }
    );
  }
}
