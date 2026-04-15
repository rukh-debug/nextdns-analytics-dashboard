import { NextResponse } from "next/server";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  lt,
  or,
  sql,
} from "drizzle-orm";
import { getDb } from "@/lib/db";
import { devices, dnsLogs, dnsLogTags, groups } from "@/lib/db/schema";
import { getTagsForLogIds } from "@/lib/alerts/tagging";
import { createLogger } from "@/lib/logger";

const log = createLogger("api:logs");

function getSortOrder(sortBy: string, sortDir: string) {
  const direction = sortDir === "asc" ? asc : desc;

  switch (sortBy) {
    case "domain":
      return direction(dnsLogs.domain);
    case "status":
      return direction(dnsLogs.status);
    default:
      return direction(dnsLogs.timestamp);
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const profileId = searchParams.get("profileId");
    if (!profileId) {
      return NextResponse.json({ error: "profileId required" }, { status: 400 });
    }

    const page = Math.max(Number.parseInt(searchParams.get("page") || "1", 10), 1);
    const limit = Math.min(Number.parseInt(searchParams.get("limit") || "50", 10), 1000);
    const status = searchParams.get("status");
    const deviceId = searchParams.get("deviceId");
    const groupId = searchParams.get("groupId") || searchParams.get("personId");
    const search = searchParams.get("search")?.trim();
    const flagged = searchParams.get("flagged");
    const tagId = searchParams.get("tagId");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const sortBy = searchParams.get("sortBy") || "timestamp";
    const sortDir = searchParams.get("sortDir") || searchParams.get("sort") || "desc";
    const hideTrackers = searchParams.get("hideTrackers");

    const db = getDb();
    const conditions = [eq(dnsLogs.profileId, profileId)];

    if (status && status !== "all") {
      conditions.push(eq(dnsLogs.status, status as typeof dnsLogs.status.enumValues[number]));
    }

    if (deviceId) {
      conditions.push(eq(dnsLogs.deviceId, deviceId));
    }

    if (flagged === "true") {
      conditions.push(eq(dnsLogs.isFlagged, true));
    }

    if (hideTrackers === "true") {
      conditions.push(sql`coalesce(${dnsLogs.tracker}, '') = ''`);
    }

    if (tagId) {
      const taggedLogIds = (await db
        .select({ logId: dnsLogTags.logId })
        .from(dnsLogTags)
        .where(eq(dnsLogTags.tagId, tagId)))
        .map((row) => row.logId);

      if (taggedLogIds.length === 0) {
        return NextResponse.json({ logs: [], total: 0, page, limit, hasMore: false });
      }

      conditions.push(inArray(dnsLogs.id, taggedLogIds as [number, ...number[]]));
    }

    if (from) {
      conditions.push(gte(dnsLogs.timestamp, from));
    }

    if (to) {
      conditions.push(lt(dnsLogs.timestamp, to));
    }

    if (groupId) {
      const groupDeviceIds = (await db
        .select({ id: devices.id })
        .from(devices)
        .where(and(eq(devices.profileId, profileId), eq(devices.groupId, groupId))))
        .map((device) => device.id);

      if (groupDeviceIds.length === 0) {
        return NextResponse.json({ logs: [], total: 0, page, limit, hasMore: false });
      }

      conditions.push(inArray(dnsLogs.deviceId, groupDeviceIds as [string, ...string[]]));
    }

    if (search) {
      const searchPattern = `%${search}%`;
      const matchedDeviceIds = (await db
        .select({ id: devices.id })
        .from(devices)
        .where(
          and(
            eq(devices.profileId, profileId),
            or(
              sql`${devices.name} like ${searchPattern}`,
              sql`coalesce(${devices.model}, '') like ${searchPattern}`,
              sql`coalesce(${devices.localIp}, '') like ${searchPattern}`
            )
          )
        ))
        .map((device) => device.id);

      const searchConditions = [
        sql`${dnsLogs.domain} like ${searchPattern}`,
        sql`coalesce(${dnsLogs.rootDomain}, '') like ${searchPattern}`,
        sql`coalesce(${dnsLogs.clientIp}, '') like ${searchPattern}`,
        sql`coalesce(${dnsLogs.clientName}, '') like ${searchPattern}`,
        sql`coalesce(${dnsLogs.tracker}, '') like ${searchPattern}`,
        sql`coalesce(${dnsLogs.queryType}, '') like ${searchPattern}`,
        sql`coalesce(${dnsLogs.deviceName}, '') like ${searchPattern}`,
        sql`coalesce(${dnsLogs.deviceModel}, '') like ${searchPattern}`,
        sql`coalesce(${dnsLogs.deviceLocalIp}, '') like ${searchPattern}`,
        sql`${dnsLogs.status} like ${searchPattern}`,
      ];

      if (matchedDeviceIds.length > 0) {
        searchConditions.push(
          inArray(dnsLogs.deviceId, matchedDeviceIds as [string, ...string[]])
        );
      }

      const searchClause = or(...searchConditions);
      if (searchClause) {
        conditions.push(searchClause);
      }
    }

    const whereClause = and(...conditions);
    const total = (await db.select({ count: count() }).from(dnsLogs).where(whereClause))[0] ?? null;

    const logs = await db
      .select({
        id: dnsLogs.id,
        timestamp: dnsLogs.timestamp,
        domain: dnsLogs.domain,
        rootDomain: dnsLogs.rootDomain,
        tracker: dnsLogs.tracker,
        status: dnsLogs.status,
        queryType: dnsLogs.queryType,
        dnssec: dnsLogs.dnssec,
        encrypted: dnsLogs.encrypted,
        protocol: dnsLogs.protocol,
        clientIp: dnsLogs.clientIp,
        clientName: dnsLogs.clientName,
        isFlagged: dnsLogs.isFlagged,
        flagReason: dnsLogs.flagReason,
        reasons: dnsLogs.reasons,
        deviceId: dnsLogs.deviceId,
        deviceName: dnsLogs.deviceName,
        deviceModel: dnsLogs.deviceModel,
        deviceLocalIp: dnsLogs.deviceLocalIp,
      })
      .from(dnsLogs)
      .where(whereClause)
      .orderBy(getSortOrder(sortBy, sortDir))
      .limit(limit)
      .offset((page - 1) * limit);

    const deviceIds = [...new Set(logs.map((log) => log.deviceId).filter(Boolean))] as string[];
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
    const groupIds = [
      ...new Set(deviceRows.map((device) => device.groupId).filter(Boolean)),
    ] as string[];
    const groupRows = groupIds.length
      ? await db
          .select({ id: groups.id, name: groups.name, color: groups.color })
          .from(groups)
          .where(inArray(groups.id, groupIds as [string, ...string[]]))
      : [];
    const deviceMap = new Map(deviceRows.map((device) => [device.id, device]));
    const groupMap = new Map(groupRows.map((group) => [group.id, group]));
    const tagMap = await getTagsForLogIds(logs.map((log) => log.id));

    return NextResponse.json({
      logs: logs.map((log) => {
        const device = log.deviceId ? deviceMap.get(log.deviceId) : null;

        return {
          ...log,
          device: device
            ? {
                id: device.id,
                name: device.name,
                model: device.model,
                localIp: log.deviceLocalIp,
              }
            : log.deviceId
              ? {
                  id: log.deviceId,
                  name: log.deviceName,
                  model: log.deviceModel,
                  localIp: log.deviceLocalIp,
                }
              : null,
          person: device?.groupId ? groupMap.get(device.groupId) ?? null : null,
          tags: (tagMap.get(log.id) ?? []).map((tag) => ({
            id: tag.tagId,
            name: tag.tagName,
            slug: tag.tagSlug,
            listId: tag.listId,
            listName: tag.listName,
            matchedDomain: tag.matchedDomain,
          })),
        };
      }),
      total: total?.count || 0,
      page,
      limit,
      hasMore: page * limit < (total?.count || 0),
    });
  } catch (error) {
    log.error({ err: error }, "Request error");
    return NextResponse.json({ error: "Failed to fetch logs" }, { status: 500 });
  }
}
