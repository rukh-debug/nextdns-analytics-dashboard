import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { dnsLogs, devices } from "@/lib/db/schema";
import { and, count, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { calculateActivityStreak } from "@/lib/activity/detector";
import { getNumericSetting } from "@/lib/settings";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const personDevices = await db.select({ id: devices.id, name: devices.name })
    .from(devices)
    .where(eq(devices.groupId, id));

  if (personDevices.length === 0) {
    return NextResponse.json({
      devices: [],
      stats: { total: 0, blocked: 0 },
      topDomains: [],
      hourlyActivity: [],
      peakHours: [],
      topCategories: [],
      activityStreak: {
        active: false,
        startedAt: null,
        lastActiveAt: null,
        durationMinutes: 0,
      },
      flaggedCount: 0,
    });
  }

  const deviceIds = personDevices.map((d) => d.id) as [string, ...string[]];
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const last24HoursStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const last7DaysStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const idleWindowMinutes = await getNumericSetting(db, "idle_threshold_minutes", 10);

  const totalRows = await db.select({ count: count() })
    .from(dnsLogs)
    .where(and(inArray(dnsLogs.deviceId, deviceIds), gte(dnsLogs.timestamp, todayStart)));
  const total = totalRows[0] ?? null;

  const blockedRows = await db.select({ count: count() })
    .from(dnsLogs)
    .where(and(inArray(dnsLogs.deviceId, deviceIds), gte(dnsLogs.timestamp, todayStart), eq(dnsLogs.status, "blocked")));
  const blocked = blockedRows[0] ?? null;

  const topDomains = await db.select({ domain: dnsLogs.domain, count: count() })
    .from(dnsLogs)
    .where(and(inArray(dnsLogs.deviceId, deviceIds), gte(dnsLogs.timestamp, todayStart)))
    .groupBy(dnsLogs.domain)
    .orderBy(desc(count()))
    .limit(10);

  const hourlyActivity = await db.select({
    bucket: sql<string>`to_char(${dnsLogs.timestamp}::timestamp, 'YYYY-MM-DD HH24')`,
    total: count(),
    blocked: sql<number>`sum(case when ${dnsLogs.status} = 'blocked' then 1 else 0 end)`,
    allowed: sql<number>`sum(case when ${dnsLogs.status} = 'allowed' then 1 else 0 end)`,
    flagged: sql<number>`sum(case when ${dnsLogs.isFlagged} = true then 1 else 0 end)`,
  })
    .from(dnsLogs)
    .where(and(inArray(dnsLogs.deviceId, deviceIds), gte(dnsLogs.timestamp, last24HoursStart)))
    .groupBy(sql`to_char(${dnsLogs.timestamp}::timestamp, 'YYYY-MM-DD HH24')`)
    .orderBy(sql`to_char(${dnsLogs.timestamp}::timestamp, 'YYYY-MM-DD HH24')`);

  const peakHours = await db.select({
    hour: sql<string>`to_char(${dnsLogs.timestamp}::timestamp, 'HH24')`,
    count: count(),
  })
    .from(dnsLogs)
    .where(and(inArray(dnsLogs.deviceId, deviceIds), gte(dnsLogs.timestamp, last7DaysStart)))
    .groupBy(sql`to_char(${dnsLogs.timestamp}::timestamp, 'HH24')`)
    .orderBy(desc(count()))
    .limit(3);

  const topCategories = await db.select({
    category: sql<string>`coalesce(${dnsLogs.flagReason}, ${dnsLogs.tracker}, ${dnsLogs.status}, 'uncategorized')`,
    count: count(),
  })
    .from(dnsLogs)
    .where(and(inArray(dnsLogs.deviceId, deviceIds), gte(dnsLogs.timestamp, last7DaysStart)))
    .groupBy(sql`coalesce(${dnsLogs.flagReason}, ${dnsLogs.tracker}, ${dnsLogs.status}, 'uncategorized')`)
    .orderBy(desc(count()))
    .limit(5);

  const activityTimestampRows = await db.select({ timestamp: dnsLogs.timestamp })
    .from(dnsLogs)
    .where(and(inArray(dnsLogs.deviceId, deviceIds), gte(dnsLogs.timestamp, last24HoursStart)))
    .orderBy(desc(dnsLogs.timestamp))
    .limit(5000);
  const activityTimestamps = activityTimestampRows.map((row) => row.timestamp);

  const flaggedRows = await db.select({ count: count() })
    .from(dnsLogs)
    .where(
      and(
        inArray(dnsLogs.deviceId, deviceIds),
        gte(dnsLogs.timestamp, last7DaysStart),
        eq(dnsLogs.isFlagged, true)
      )
    );
  const flaggedCount = flaggedRows[0] ?? null;

  return NextResponse.json({
    devices: personDevices,
    stats: { total: total?.count || 0, blocked: blocked?.count || 0 },
    topDomains,
    hourlyActivity,
    peakHours,
    topCategories,
    activityStreak: calculateActivityStreak(activityTimestamps, idleWindowMinutes),
    flaggedCount: flaggedCount?.count || 0,
  });
}
