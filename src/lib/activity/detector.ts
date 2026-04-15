import { and, count, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { devices, dnsLogs, groups } from "@/lib/db/schema";
import { getNumericSetting } from "@/lib/settings";

type Db = ReturnType<typeof getDb>;

export type ActivityStatus = "active" | "idle";

export interface DeviceActivitySnapshot {
  id: string;
  name: string;
  model: string | null;
  localIp: string | null;
  groupId: string | null;
  lastSeenAt: string | null;
  queryCount: number;
  lastQueryAt: string | null;
  status: ActivityStatus;
}

export interface GroupActivitySnapshot {
  id: string;
  name: string;
  color: string | null;
  deviceCount: number;
  activeDeviceCount: number;
  queryCount: number;
  status: ActivityStatus;
}

export interface ActivitySnapshot {
  windowMinutes: number;
  minimumQueries: number;
  devices: DeviceActivitySnapshot[];
  groups: GroupActivitySnapshot[];
  /** @deprecated Use groups instead */
  persons: GroupActivitySnapshot[];
}

export interface ActivityStreak {
  active: boolean;
  startedAt: string | null;
  lastActiveAt: string | null;
  durationMinutes: number;
}

function buildDeviceWhereClause(
  profileId: string,
  groupId?: string | null,
  unassigned?: boolean
) {
  const conditions = [eq(devices.profileId, profileId)];

  if (groupId) {
    conditions.push(eq(devices.groupId, groupId));
  } else if (unassigned) {
    conditions.push(sql`${devices.groupId} is null`);
  }

  return and(...conditions);
}

export async function getActivitySnapshot(
  db: Db,
  profileId: string,
  options?: {
    personId?: string | null;
    groupId?: string | null;
    unassigned?: boolean;
  }
): Promise<ActivitySnapshot> {
  const minimumQueries = await getNumericSetting(db, "idle_threshold_queries", 5);
  const windowMinutes = await getNumericSetting(db, "idle_threshold_minutes", 10);
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

  const scopedDevices = await db
    .select({
      id: devices.id,
      name: devices.name,
      model: devices.model,
      localIp: devices.localIp,
      groupId: devices.groupId,
      lastSeenAt: devices.lastSeenAt,
    })
    .from(devices)
    .where(
      buildDeviceWhereClause(
        profileId,
        options?.groupId ?? options?.personId,
        options?.unassigned
      )
    );

  if (scopedDevices.length === 0) {
    return {
      windowMinutes,
      minimumQueries,
      devices: [],
      groups: [],
      persons: [],
    };
  }

  const deviceIds = scopedDevices.map((device) => device.id) as [string, ...string[]];
  const recentActivity = await db
    .select({
      deviceId: dnsLogs.deviceId,
      queryCount: count(),
      lastQueryAt: sql<string>`max(${dnsLogs.timestamp})`,
    })
    .from(dnsLogs)
    .where(
      and(
        eq(dnsLogs.profileId, profileId),
        gte(dnsLogs.timestamp, windowStart),
        inArray(dnsLogs.deviceId, deviceIds)
      )
    )
    .groupBy(dnsLogs.deviceId);

  const activityByDeviceId = new Map<string, (typeof recentActivity)[number]>();
  for (const row of recentActivity) {
    if (!row.deviceId) {
      continue;
    }

    activityByDeviceId.set(row.deviceId, row);
  }

  const deviceSnapshots = scopedDevices.map((device) => {
    const recent = activityByDeviceId.get(device.id);
    const queryCount = recent?.queryCount ?? 0;

    return {
      ...device,
      queryCount,
      lastQueryAt: recent?.lastQueryAt ?? device.lastSeenAt,
      status: queryCount >= minimumQueries ? "active" : "idle",
    } satisfies DeviceActivitySnapshot;
  });

  const groupIds = [...new Set(deviceSnapshots.map((device) => device.groupId).filter(Boolean))] as string[];
  const groupList = groupIds.length
    ? await db
        .select({
          id: groups.id,
          name: groups.name,
          color: groups.color,
        })
        .from(groups)
        .where(inArray(groups.id, groupIds as [string, ...string[]]))
    : [];

  const devicesByGroupId = new Map<string, DeviceActivitySnapshot[]>();
  for (const device of deviceSnapshots) {
    if (!device.groupId) {
      continue;
    }

    const items = devicesByGroupId.get(device.groupId) ?? [];
    items.push(device);
    devicesByGroupId.set(device.groupId, items);
  }

  const groupSnapshots = groupList.map((group) => {
    const groupDevices = devicesByGroupId.get(group.id) ?? [];
    const activeDeviceCount = groupDevices.filter(
      (device) => device.status === "active"
    ).length;

    return {
      ...group,
      deviceCount: groupDevices.length,
      activeDeviceCount,
      queryCount: groupDevices.reduce((sum, device) => sum + device.queryCount, 0),
      status: activeDeviceCount > 0 ? "active" : "idle",
    } satisfies GroupActivitySnapshot;
  });

  return {
    windowMinutes,
    minimumQueries,
    devices: deviceSnapshots,
    groups: groupSnapshots,
    persons: groupSnapshots, // backward compat
  };
}

export function calculateActivityStreak(
  timestamps: string[],
  idleWindowMinutes: number
): ActivityStreak {
  if (timestamps.length === 0) {
    return {
      active: false,
      startedAt: null,
      lastActiveAt: null,
      durationMinutes: 0,
    };
  }

  const sortedTimestamps = [...timestamps].sort(
    (left, right) => new Date(right).getTime() - new Date(left).getTime()
  );
  const latestTimestamp = sortedTimestamps[0];
  const idleWindowMs = idleWindowMinutes * 60 * 1000;
  const latestTimestampMs = new Date(latestTimestamp).getTime();
  const isCurrentlyActive = Date.now() - latestTimestampMs <= idleWindowMs;

  if (!isCurrentlyActive) {
    return {
      active: false,
      startedAt: null,
      lastActiveAt: latestTimestamp,
      durationMinutes: 0,
    };
  }

  let streakStart = latestTimestamp;
  let previousTimestampMs = latestTimestampMs;

  for (let index = 1; index < sortedTimestamps.length; index += 1) {
    const currentTimestamp = sortedTimestamps[index];
    const currentTimestampMs = new Date(currentTimestamp).getTime();

    if (previousTimestampMs - currentTimestampMs > idleWindowMs) {
      break;
    }

    streakStart = currentTimestamp;
    previousTimestampMs = currentTimestampMs;
  }

  return {
    active: true,
    startedAt: streakStart,
    lastActiveAt: latestTimestamp,
    durationMinutes: Math.max(
      1,
      Math.round((latestTimestampMs - new Date(streakStart).getTime()) / 60000)
    ),
  };
}
