import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { dnsLogs, devices } from "@/lib/db/schema";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { calculateActivityStreak } from "@/lib/activity/detector";
import { getNumericSetting } from "@/lib/settings";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const timezone = searchParams.get("timezone") || "UTC";
  const requestedRange = searchParams.get("range") || "24h";

  const rangeConfig = {
    "24h": {
      windowMs: 24 * 60 * 60 * 1000,
      bucketFormat: "YYYY-MM-DD HH24",
      activityGranularity: "hour",
    },
    "7d": {
      windowMs: 7 * 24 * 60 * 60 * 1000,
      bucketFormat: "YYYY-MM-DD",
      activityGranularity: "day",
    },
    "30d": {
      windowMs: 30 * 24 * 60 * 60 * 1000,
      bucketFormat: "YYYY-MM-DD",
      activityGranularity: "day",
    },
  } as const;

  const activeRange = requestedRange in rangeConfig ? requestedRange as keyof typeof rangeConfig : "24h";
  const activeConfig = rangeConfig[activeRange];

  const db = getDb();
  const groupDevices = await db.select({ id: devices.id, name: devices.name })
    .from(devices)
    .where(eq(devices.groupId, id));

  if (groupDevices.length === 0) {
    return NextResponse.json({
      devices: [],
      stats: { total: 0, blocked: 0 },
      topDomains: [],
      activitySeries: [],
      activityGranularity: activeConfig.activityGranularity,
      peakHours: [],
      topCategories: [],
      activityStreak: {
        active: false,
        startedAt: null,
        lastActiveAt: null,
        durationMinutes: 0,
      },
      flaggedCount: 0,
      deviceBreakdown: [],
      range: activeRange,
    });
  }

  const deviceIds = groupDevices.map((d) => d.id) as [string, ...string[]];
  const deviceMap = new Map(groupDevices.map((device) => [device.id, device.name]));
  const now = new Date();
  const rangeStart = new Date(now.getTime() - activeConfig.windowMs).toISOString();
  const activityStreakStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const idleWindowMinutes = await getNumericSetting(db, "idle_threshold_minutes", 10);
  const bucketExpression = sql<string>`to_char(${dnsLogs.timestamp}::timestamptz AT TIME ZONE ${timezone}, ${activeConfig.bucketFormat})`;
  const peakHourExpression = sql<string>`to_char(${dnsLogs.timestamp}::timestamptz AT TIME ZONE ${timezone}, 'HH24')`;

  const totalRows = await db.select({ count: count() })
    .from(dnsLogs)
    .where(and(inArray(dnsLogs.deviceId, deviceIds), gte(dnsLogs.timestamp, rangeStart)));
  const total = totalRows[0] ?? null;

  const blockedRows = await db.select({ count: count() })
    .from(dnsLogs)
    .where(and(
      inArray(dnsLogs.deviceId, deviceIds),
      gte(dnsLogs.timestamp, rangeStart),
      eq(dnsLogs.status, "blocked")
    ));
  const blocked = blockedRows[0] ?? null;

  const topDomains = await db.select({ domain: dnsLogs.domain, count: count() })
    .from(dnsLogs)
    .where(and(inArray(dnsLogs.deviceId, deviceIds), gte(dnsLogs.timestamp, rangeStart)))
    .groupBy(dnsLogs.domain)
    .orderBy(desc(count()))
    .limit(10);

  const activitySeries = await db.select({
    bucket: bucketExpression,
    total: count(),
    blocked: sql<number>`sum(case when ${dnsLogs.status} = 'blocked' then 1 else 0 end)`,
    allowed: sql<number>`sum(case when ${dnsLogs.status} = 'allowed' then 1 else 0 end)`,
    flagged: sql<number>`sum(case when ${dnsLogs.isFlagged} = true then 1 else 0 end)`,
  })
    .from(dnsLogs)
    .where(and(inArray(dnsLogs.deviceId, deviceIds), gte(dnsLogs.timestamp, rangeStart)))
    .groupBy(sql.raw("1"))
    .orderBy(sql.raw("1"));

  const peakHours = await db.select({
    hour: peakHourExpression,
    count: count(),
  })
    .from(dnsLogs)
    .where(and(inArray(dnsLogs.deviceId, deviceIds), gte(dnsLogs.timestamp, rangeStart)))
    .groupBy(sql.raw("1"))
    .orderBy(desc(count()))
    .limit(3);

  const topCategories = await db.select({
    category: sql<string>`coalesce(${dnsLogs.flagReason}, ${dnsLogs.tracker}, ${dnsLogs.status}, 'uncategorized')`,
    count: count(),
  })
    .from(dnsLogs)
    .where(and(inArray(dnsLogs.deviceId, deviceIds), gte(dnsLogs.timestamp, rangeStart)))
    .groupBy(sql`coalesce(${dnsLogs.flagReason}, ${dnsLogs.tracker}, ${dnsLogs.status}, 'uncategorized')`)
    .orderBy(desc(count()))
    .limit(5);

  const deviceBreakdownRows = await db.select({
    deviceId: dnsLogs.deviceId,
    count: count(),
  })
    .from(dnsLogs)
    .where(and(inArray(dnsLogs.deviceId, deviceIds), gte(dnsLogs.timestamp, rangeStart)))
    .groupBy(dnsLogs.deviceId)
    .orderBy(desc(count()))
    .limit(8);

  const activityTimestampRows = await db.select({ timestamp: dnsLogs.timestamp })
    .from(dnsLogs)
    .where(and(inArray(dnsLogs.deviceId, deviceIds), gte(dnsLogs.timestamp, activityStreakStart)))
    .orderBy(desc(dnsLogs.timestamp))
    .limit(5000);
  const activityTimestamps = activityTimestampRows.map((row) => row.timestamp);

  const flaggedRows = await db.select({ count: count() })
    .from(dnsLogs)
    .where(and(
      inArray(dnsLogs.deviceId, deviceIds),
      gte(dnsLogs.timestamp, rangeStart),
      eq(dnsLogs.isFlagged, true)
    ));
  const flaggedCount = flaggedRows[0] ?? null;

  return NextResponse.json({
    devices: groupDevices,
    stats: { total: total?.count || 0, blocked: blocked?.count || 0 },
    topDomains,
    activitySeries: activitySeries.map((point) => ({
      bucket: point.bucket,
      total: Number(point.total || 0),
      blocked: Number(point.blocked || 0),
      allowed: Number(point.allowed || 0),
      flagged: Number(point.flagged || 0),
    })),
    activityGranularity: activeConfig.activityGranularity,
    peakHours,
    topCategories,
    activityStreak: calculateActivityStreak(activityTimestamps, idleWindowMinutes),
    flaggedCount: flaggedCount?.count || 0,
    deviceBreakdown: deviceBreakdownRows.map((row) => ({
      label: row.deviceId ? deviceMap.get(row.deviceId) || row.deviceId : "Unknown device",
      count: row.count,
    })),
    range: activeRange,
  });
}
