import { NextResponse } from "next/server";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  sql,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import { devices, dnsLogs, groups } from "@/lib/db/schema";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:dashboard");

function getTimeWindow(searchParams: URLSearchParams) {
  const explicitFrom = searchParams.get("from");
  const explicitTo = searchParams.get("to");
  const range = searchParams.get("timeRange") ?? searchParams.get("range") ?? "24h";

  if (explicitFrom || explicitTo) {
    return {
      range: "custom",
      from: explicitFrom ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      to: explicitTo ?? new Date().toISOString(),
    };
  }

  const now = new Date();
  const rangeHours: Record<string, number> = {
    "1h": 1,
    "6h": 6,
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
  };
  const hours = rangeHours[range] ?? 24;

  return {
    range,
    from: new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString(),
    to: now.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("profileId");
    const groupId = searchParams.get("groupId") || searchParams.get("personId");
    const tz = searchParams.get("timezone") || "UTC";

    if (!profileId) {
      return NextResponse.json(
        { error: "profileId is required" },
        { status: 400 }
      );
    }

    const db = getDb();
    const window = getTimeWindow(searchParams);
    const currentStart = window.from;
    const currentEnd = window.to;
    const currentWindowMs =
      new Date(currentEnd).getTime() - new Date(currentStart).getTime();
    const previousStart = new Date(
      new Date(currentStart).getTime() - currentWindowMs
    ).toISOString();
    const previousEnd = currentStart;

    let scopedDeviceIds: string[] | null = null;
    if (groupId) {
      scopedDeviceIds = (await db
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.profileId, profileId), eq(devices.groupId, groupId))))
        .map((device) => device.id);

      if (scopedDeviceIds.length === 0) {
        return NextResponse.json({
          range: window.range,
          scope: { profileId, groupId },
          stats: {
            totalToday: 0,
            blockedToday: 0,
            flaggedToday: 0,
            deviceCount: 0,
          },
          comparisonStats: {
            totalToday: 0,
            blockedToday: 0,
            flaggedToday: 0,
            deviceCount: 0,
          },
          topDomains: [],
          topBlocked: [],
          hourlyData: [],
          deviceBreakdown: [],
          recentFlagged: [],
        });
      }
    }

    const baseConditions = [eq(dnsLogs.profileId, profileId)];
    if (scopedDeviceIds?.length) {
      baseConditions.push(inArray(dnsLogs.deviceId, scopedDeviceIds as [string, ...string[]]));
    }

    const inCurrentWindow = and(
      ...baseConditions,
      gte(dnsLogs.timestamp, currentStart),
      lt(dnsLogs.timestamp, currentEnd)
    );
    const inPreviousWindow = and(
      ...baseConditions,
      gte(dnsLogs.timestamp, previousStart),
      lt(dnsLogs.timestamp, previousEnd)
    );
    const deviceCount = groupId
      ? scopedDeviceIds?.length ?? 0
      : ((await db.select({ count: count() })
          .from(devices)
          .where(eq(devices.profileId, profileId)))[0]?.count ?? 0);

    const [
      totalCurrent,
      blockedCurrent,
      flaggedCurrent,
      totalPrevious,
      blockedPrevious,
      flaggedPrevious,
    ] = await Promise.all([
      db.select({ count: count() }).from(dnsLogs).where(inCurrentWindow),
      db
        .select({ count: count() })
        .from(dnsLogs)
        .where(and(inCurrentWindow, eq(dnsLogs.status, "blocked"))),
      db
        .select({ count: count() })
        .from(dnsLogs)
        .where(and(inCurrentWindow, eq(dnsLogs.isFlagged, true))),
      db.select({ count: count() }).from(dnsLogs).where(inPreviousWindow),
      db
        .select({ count: count() })
        .from(dnsLogs)
        .where(and(inPreviousWindow, eq(dnsLogs.status, "blocked"))),
      db
        .select({ count: count() })
        .from(dnsLogs)
        .where(and(inPreviousWindow, eq(dnsLogs.isFlagged, true))),
    ]);

    const topDomains = await db
      .select({
        domain: dnsLogs.domain,
        count: count(),
      })
      .from(dnsLogs)
      .where(and(inCurrentWindow, eq(dnsLogs.status, "default")))
      .groupBy(dnsLogs.domain)
      .orderBy(desc(count()))
      .limit(10);

    const topBlocked = await db
      .select({
        domain: dnsLogs.domain,
        count: count(),
      })
      .from(dnsLogs)
      .where(and(inCurrentWindow, eq(dnsLogs.status, "blocked")))
      .groupBy(dnsLogs.domain)
      .orderBy(desc(count()))
      .limit(10);

    const bucketExpression =
      currentWindowMs <= 48 * 60 * 60 * 1000
        ? sql<string>`to_char(${dnsLogs.timestamp}::timestamptz AT TIME ZONE ${tz}, 'YYYY-MM-DD HH24')`
        : sql<string>`to_char(${dnsLogs.timestamp}::timestamptz AT TIME ZONE ${tz}, 'YYYY-MM-DD')`;

    const hourlyData = await db
      .select({
        bucket: bucketExpression,
        total: count(),
        blocked: sql<number>`sum(case when ${dnsLogs.status} = 'blocked' then 1 else 0 end)`,
        allowed: sql<number>`sum(case when ${dnsLogs.status} = 'allowed' then 1 else 0 end)`,
        relayed: sql<number>`sum(case when ${dnsLogs.status} = 'relayed' then 1 else 0 end)`,
        error: sql<number>`sum(case when ${dnsLogs.status} = 'error' then 1 else 0 end)`,
      })
      .from(dnsLogs)
      .where(inCurrentWindow)
      .groupBy(sql`1`)
      .orderBy(sql`1`);

    const deviceBreakdownRows = await db
      .select({
        deviceId: dnsLogs.deviceId,
        count: count(),
      })
      .from(dnsLogs)
      .where(inCurrentWindow)
      .groupBy(dnsLogs.deviceId)
      .orderBy(desc(count()))
      .limit(10);
    const deviceBreakdownIds = deviceBreakdownRows
      .map((row) => row.deviceId)
      .filter(Boolean) as string[];
    const deviceRows = deviceBreakdownIds.length
      ? await db
          .select({ id: devices.id, name: devices.name, groupId: devices.groupId })
          .from(devices)
          .where(inArray(devices.id, deviceBreakdownIds as [string, ...string[]]))
      : [];
    const groupIds = [
      ...new Set(deviceRows.map((device) => device.groupId).filter(Boolean)),
    ] as string[];
    const groupRows = groupIds.length
      ? await db
          .select({ id: groups.id, name: groups.name })
          .from(groups)
          .where(inArray(groups.id, groupIds as [string, ...string[]]))
      : [];
    const deviceMap = new Map(deviceRows.map((device) => [device.id, device]));
    const groupMap = new Map(groupRows.map((group) => [group.id, group]));

    const deviceBreakdown = deviceBreakdownRows.map((row) => {
      const device = row.deviceId ? deviceMap.get(row.deviceId) : null;

      return {
        deviceId: row.deviceId,
        name: device?.name ?? "Unknown",
        count: row.count,
        group: device?.groupId ? groupMap.get(device.groupId) ?? null : null,
        person: device?.groupId ? groupMap.get(device.groupId) ?? null : null,
      };
    });

    const recentFlaggedRows = await db
      .select({
        id: dnsLogs.id,
        timestamp: dnsLogs.timestamp,
        domain: dnsLogs.domain,
        rootDomain: dnsLogs.rootDomain,
        flagReason: dnsLogs.flagReason,
        deviceId: dnsLogs.deviceId,
      })
      .from(dnsLogs)
      .where(and(inCurrentWindow, eq(dnsLogs.isFlagged, true)))
      .orderBy(desc(dnsLogs.timestamp))
      .limit(5);

    const recentFlagged = recentFlaggedRows.map((row) => {
      const device = row.deviceId ? deviceMap.get(row.deviceId) : null;

      return {
        ...row,
        device: device ? { id: device.id, name: device.name } : null,
        group: device?.groupId ? groupMap.get(device.groupId) ?? null : null,
        person: device?.groupId ? groupMap.get(device.groupId) ?? null : null,
      };
    });

    return NextResponse.json({
      range: window.range,
      scope: { profileId, groupId },
      stats: {
        totalToday: totalCurrent[0]?.count || 0,
        blockedToday: blockedCurrent[0]?.count || 0,
        flaggedToday: flaggedCurrent[0]?.count || 0,
        deviceCount,
      },
      comparisonStats: {
        totalToday: totalPrevious[0]?.count || 0,
        blockedToday: blockedPrevious[0]?.count || 0,
        flaggedToday: flaggedPrevious[0]?.count || 0,
        deviceCount,
      },
      topDomains,
      topBlocked,
      hourlyData,
      deviceBreakdown,
      recentFlagged,
    });
  } catch (error) {
    log.error({ err: error }, "Request error");
    return NextResponse.json(
      { error: "Failed to load dashboard data" },
      { status: 500 }
    );
  }
}
