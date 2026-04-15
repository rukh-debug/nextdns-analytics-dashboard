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
import { devices, dnsLogs } from "@/lib/db/schema";
import { calculateActivityStreak } from "@/lib/activity/detector";
import { getNumericSetting } from "@/lib/settings";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:analytics");

function getAnalyticsWindow(searchParams: URLSearchParams) {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const range = searchParams.get("range") ?? "7d";

  if (from || to) {
    return {
      range: "custom",
      from: from ?? new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      to: to ?? new Date().toISOString(),
    };
  }

  const hoursByRange: Record<string, number> = {
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
  };
  const hours = hoursByRange[range] ?? 24 * 7;

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

    if (!profileId) {
      return NextResponse.json(
        { error: "profileId is required" },
        { status: 400 }
      );
    }

    const db = getDb();
    const window = getAnalyticsWindow(searchParams);
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
          topDomains: [],
          topBlocked: [],
          peakHours: [],
          anomalies: [],
          volumeTrend: { current: 0, previous: 0, changePercent: 0, series: [] },
          encryption: { encrypted: 0, total: 0, encryptedPercentage: 0, protocols: [] },
          activityStreak: {
            active: false,
            startedAt: null,
            lastActiveAt: null,
            durationMinutes: 0,
          },
        });
      }

      conditions.push(inArray(dnsLogs.deviceId, personDeviceIds as [string, ...string[]]));
    }

    const whereClause = and(...conditions);
    const currentWindowMs =
      new Date(window.to).getTime() - new Date(window.from).getTime();
    const previousFrom = new Date(
      new Date(window.from).getTime() - currentWindowMs
    ).toISOString();

    const topDomains = await db
      .select({ domain: dnsLogs.domain, count: count() })
      .from(dnsLogs)
      .where(and(whereClause, eq(dnsLogs.status, "default")))
      .groupBy(dnsLogs.domain)
      .orderBy(desc(count()))
      .limit(10);

    const topBlocked = await db
      .select({ domain: dnsLogs.domain, count: count() })
      .from(dnsLogs)
      .where(and(whereClause, eq(dnsLogs.status, "blocked")))
      .groupBy(dnsLogs.domain)
      .orderBy(desc(count()))
      .limit(10);

    const peakHours = await db
      .select({
        hour: sql<string>`to_char(${dnsLogs.timestamp}::timestamp, 'HH24')`,
        count: count(),
      })
      .from(dnsLogs)
      .where(whereClause)
      .groupBy(sql`to_char(${dnsLogs.timestamp}::timestamp, 'HH24')`)
      .orderBy(desc(count()))
      .limit(3);

    const repeatedDomains = await db
      .select({
        deviceId: dnsLogs.deviceId,
        domain: dnsLogs.domain,
        count: count(),
      })
      .from(dnsLogs)
      .where(and(whereClause, gte(dnsLogs.timestamp, new Date(Date.now() - 5 * 60 * 1000).toISOString())))
      .groupBy(dnsLogs.deviceId, dnsLogs.domain)
      .having(sql`count(*) >= 10`)
      .orderBy(desc(count()))
      .limit(10);

    const currentVolume = (await db
      .select({ count: count() })
      .from(dnsLogs)
      .where(whereClause))[0]?.count ?? 0;
    const previousVolume = (await db
      .select({ count: count() })
      .from(dnsLogs)
      .where(
        and(
          eq(dnsLogs.profileId, profileId),
          gte(dnsLogs.timestamp, previousFrom),
          lt(dnsLogs.timestamp, window.from)
        )
      ))[0]?.count ?? 0;

    const volumeTrendSeries = await db
      .select({
        bucket: sql<string>`to_char(${dnsLogs.timestamp}::timestamp, 'YYYY-MM-DD')`,
        count: count(),
      })
      .from(dnsLogs)
      .where(whereClause)
      .groupBy(sql`to_char(${dnsLogs.timestamp}::timestamp, 'YYYY-MM-DD')`)
      .orderBy(sql`to_char(${dnsLogs.timestamp}::timestamp, 'YYYY-MM-DD')`);

    const encryption = (await db
      .select({
        encrypted: sql<number>`sum(case when ${dnsLogs.encrypted} = 1 then 1 else 0 end)`,
        total: count(),
      })
      .from(dnsLogs)
      .where(whereClause))[0] ?? { encrypted: 0, total: 0 };

    const protocols = await db
      .select({ protocol: dnsLogs.protocol, count: count() })
      .from(dnsLogs)
      .where(whereClause)
      .groupBy(dnsLogs.protocol)
      .orderBy(desc(count()));

    const idleWindowMinutes = await getNumericSetting(db, "idle_threshold_minutes", 10);
    const activityTimestamps = (await db
      .select({ timestamp: dnsLogs.timestamp })
      .from(dnsLogs)
      .where(whereClause)
      .orderBy(desc(dnsLogs.timestamp))
      .limit(5000))
      .map((row) => row.timestamp);

    return NextResponse.json({
      range: window.range,
      scope: { profileId, groupId, deviceId },
      topDomains,
      topBlocked,
      peakHours,
      anomalies: repeatedDomains,
      volumeTrend: {
        current: currentVolume,
        previous: previousVolume,
        changePercent: previousVolume === 0
          ? (currentVolume > 0 ? 100 : 0)
          : Math.round(((currentVolume - previousVolume) / previousVolume) * 100),
        series: volumeTrendSeries,
      },
      encryption: {
        encrypted: encryption?.encrypted ?? 0,
        total: encryption?.total ?? 0,
        encryptedPercentage:
          encryption && encryption.total > 0
            ? Math.round((encryption.encrypted / encryption.total) * 1000) / 10
            : 0,
        protocols,
      },
      activityStreak: calculateActivityStreak(activityTimestamps, idleWindowMinutes),
    });
  } catch (error) {
    log.error({ err: error }, "Request error");
    return NextResponse.json(
      { error: "Failed to load analytics" },
      { status: 500 }
    );
  }
}
