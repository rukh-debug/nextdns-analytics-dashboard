import { NextResponse } from "next/server";
import {
  and,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import { devices, dnsLogs, dnsLogTags, groups } from "@/lib/db/schema";
import { getTagsForLogIds } from "@/lib/alerts/tagging";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:tags");

function getActivityWindow(searchParams: URLSearchParams) {
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const range = searchParams.get("range");

  if (from || to) {
    return { from, to };
  }

  if (!range) {
    return { from: null, to: null };
  }

  const now = new Date();
  const rangeHours: Record<string, number> = {
    "1h": 1,
    "24h": 24,
    hour: 1,
    today: 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
  };
  const hours = rangeHours[range];

  return hours
    ? {
        from: new Date(now.getTime() - hours * 60 * 60 * 1000).toISOString(),
        to: now.toISOString(),
      }
    : { from: null, to: null };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("profileId");
    const deviceId = searchParams.get("deviceId");
    const groupId = searchParams.get("groupId") || searchParams.get("personId");
    const flagReason = searchParams.get("flagReason");
    const tagId = searchParams.get("tagId");
    const groupByDomain = searchParams.get("groupByDomain") === "true";
    const limit = Math.min(Number.parseInt(searchParams.get("limit") ?? "100", 10), 500);

    if (!profileId) {
      return NextResponse.json({ error: "profileId required" }, { status: 400 });
    }

    const db = getDb();
    const window = getActivityWindow(searchParams);
    let scopedDeviceIds: string[] | null = null;

    if (groupId) {
      scopedDeviceIds = (await db
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.profileId, profileId), eq(devices.groupId, groupId))))
        .map((row) => row.id);

      if (scopedDeviceIds.length === 0) {
        return NextResponse.json({
          matches: [],
          summary: {
            total: 0,
            today: 0,
            topDomain: null,
            topDevice: null,
          },
        });
      }
    }

    const conditions = [eq(dnsLogs.profileId, profileId), eq(dnsLogs.isFlagged, true)];
    if (deviceId) {
      conditions.push(eq(dnsLogs.deviceId, deviceId));
    }
    if (flagReason) {
      conditions.push(eq(dnsLogs.flagReason, flagReason));
    }
    if (window.from) {
      conditions.push(gte(dnsLogs.timestamp, window.from));
    }
    if (window.to) {
      conditions.push(lt(dnsLogs.timestamp, window.to));
    }
    if (scopedDeviceIds?.length) {
      conditions.push(inArray(dnsLogs.deviceId, scopedDeviceIds as [string, ...string[]]));
    }
    if (tagId) {
      const taggedLogIds = (await db
        .select({ logId: dnsLogTags.logId })
        .from(dnsLogTags)
        .where(eq(dnsLogTags.tagId, tagId)))
        .map((row) => row.logId);

      if (taggedLogIds.length === 0) {
        return NextResponse.json({
          matches: [],
          summary: {
            total: 0,
            today: 0,
            topDomain: null,
            topDevice: null,
          },
        });
      }

      conditions.push(inArray(dnsLogs.id, taggedLogIds as [number, ...number[]]));
    }

    const whereClause = and(...conditions);
    const rows = await db
      .select({
        id: dnsLogs.id,
        timestamp: dnsLogs.timestamp,
        domain: dnsLogs.domain,
        rootDomain: dnsLogs.rootDomain,
        status: dnsLogs.status,
        isFlagged: dnsLogs.isFlagged,
        flagReason: dnsLogs.flagReason,
        deviceId: dnsLogs.deviceId,
      })
      .from(dnsLogs)
      .where(whereClause)
      .orderBy(desc(dnsLogs.timestamp))
      .limit(limit);

    const deviceIds = [...new Set(rows.map((row) => row.deviceId).filter(Boolean))] as string[];
    const deviceRows = deviceIds.length
      ? await db
          .select({
            id: devices.id,
            name: devices.name,
            model: devices.model,
            groupId: devices.groupId,
          })
          .from(devices)
          .where(inArray(devices.id, deviceIds as [string, ...string[]]))
      : [];
    const groupIds = [...new Set(deviceRows.map((device) => device.groupId).filter(Boolean))] as string[];
    const groupRows = groupIds.length
      ? await db
          .select({ id: groups.id, name: groups.name, color: groups.color })
          .from(groups)
          .where(inArray(groups.id, groupIds as [string, ...string[]]))
      : [];
    const deviceMap = new Map(deviceRows.map((device) => [device.id, device]));
    const groupMap = new Map(groupRows.map((group) => [group.id, group]));
    const tagMap = await getTagsForLogIds(rows.map((row) => row.id));

    const matches = rows.map((row) => {
      const device = row.deviceId ? deviceMap.get(row.deviceId) : null;

      return {
        ...row,
        device: device ? { id: device.id, name: device.name, model: device.model } : null,
        group: device?.groupId ? groupMap.get(device.groupId) ?? null : null,
        person: device?.groupId ? groupMap.get(device.groupId) ?? null : null,
        tags: (tagMap.get(row.id) ?? []).map((tag) => ({
          id: tag.tagId,
          name: tag.tagName,
          slug: tag.tagSlug,
          listId: tag.listId,
          listName: tag.listName,
          matchedDomain: tag.matchedDomain,
        })),
      };
    });

    const payload = groupByDomain
      ? Object.values(
          matches.reduce<Record<string, {
            domain: string;
            count: number;
            latestTimestamp: string;
            flagReason: string | null;
            tags: Array<{ id: string; name: string; slug: string; listId: string; listName: string; matchedDomain: string }>;
          }>>((accumulator, match) => {
            const current = accumulator[match.domain];
            if (current) {
              current.count += 1;
              if (match.timestamp > current.latestTimestamp) {
                current.latestTimestamp = match.timestamp;
              }
              for (const tag of match.tags) {
                if (!current.tags.some((existing) => existing.id === tag.id && existing.listId === tag.listId)) {
                  current.tags.push(tag);
                }
              }
              return accumulator;
            }

            accumulator[match.domain] = {
              domain: match.domain,
              count: 1,
              latestTimestamp: match.timestamp,
              flagReason: match.flagReason,
              tags: [...match.tags],
            };

            return accumulator;
          }, {})
        ).sort((left, right) => right.count - left.count)
      : matches;

    const todayStart = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      new Date().getDate()
    ).toISOString();

    const totalRows = await db.select({ count: count() }).from(dnsLogs).where(whereClause);
    const todayRows = await db
      .select({ count: count() })
      .from(dnsLogs)
      .where(and(whereClause, gte(dnsLogs.timestamp, todayStart)));
    const topDomainRows = await db
      .select({ domain: dnsLogs.domain, count: count() })
      .from(dnsLogs)
      .where(whereClause)
      .groupBy(dnsLogs.domain)
      .orderBy(desc(count()))
      .limit(1);
    const topDeviceRows = await db
      .select({ deviceId: dnsLogs.deviceId, count: count() })
      .from(dnsLogs)
      .where(whereClause)
      .groupBy(dnsLogs.deviceId)
      .orderBy(desc(count()))
      .limit(1);

    const topDeviceRow = topDeviceRows[0] ?? null;
    const topDevice = topDeviceRow?.deviceId ? deviceMap.get(topDeviceRow.deviceId) ?? null : null;

    return NextResponse.json({
      matches: payload,
      summary: {
        total: totalRows[0]?.count || 0,
        today: todayRows[0]?.count || 0,
        topDomain: topDomainRows[0] ?? null,
        topDevice: topDevice
          ? {
              id: topDevice.id,
              name: topDevice.name,
              count: topDeviceRow?.count || 0,
            }
          : null,
      },
    });
  } catch (error) {
    log.error({ err: error }, "Request error");
    return NextResponse.json({ error: "Failed to fetch tagged activity" }, { status: 500 });
  }
}