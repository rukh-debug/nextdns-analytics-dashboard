"use client";

import { useCallback, useEffect, useState, type ElementType } from "react";
import { motion } from "framer-motion";
import {
  BarChart2,
  ChevronDown,
  Clock3,
  Link2,
  Laptop,
  MonitorSmartphone,
  RefreshCw,
  Router,
  Smartphone,
  Tablet,
  Trash2,
  Tv,
  Unlink,
  Users,
} from "lucide-react";

import { useDashboardStore } from "@/stores/dashboard-store";
import { AreaChart } from "@/components/charts/area-chart";
import { HorizontalBarChart } from "@/components/charts/bar-chart";
import { StatusDot } from "@/components/ui/status-dot";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface Group {
  id: string;
  name: string;
  color: string | null;
  icon: string | null;
  deviceCount?: number;
  isActive?: boolean;
}

interface Device {
  id: string;
  name: string;
  model: string | null;
  localIp: string | null;
  groupId: string | null;
  isActive?: boolean;
  lastSeen?: string | null;
}

interface GroupAnalytics {
  stats?: { total: number; blocked: number };
  topDomains?: { domain: string; count: number }[];
  activitySeries?: { bucket: string; total: number; blocked: number; flagged: number }[];
  activityGranularity?: "hour" | "day";
  peakHours?: { hour: string; count: number }[];
  topCategories?: { category: string; count: number }[];
  activityStreak?: {
    active: boolean;
    startedAt: string | null;
    lastActiveAt: string | null;
    durationMinutes: number;
  } | number;
  flaggedCount?: number;
  deviceBreakdown?: { label: string; count: number }[];
  range?: string;
}

const DEVICE_ICONS: Record<string, ElementType> = {
  smartphone: Smartphone,
  phone: Smartphone,
  laptop: Laptop,
  tv: Tv,
  router: Router,
  tablet: Tablet,
};

const PALETTE = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6"];
const ANALYTICS_RANGES = [
  { label: "24h", value: "24h" },
  { label: "7d", value: "7d" },
  { label: "30d", value: "30d" },
];

function DeviceIcon({ model, className }: { model?: string | null; className?: string }) {
  const key = Object.keys(DEVICE_ICONS).find((candidate) => model?.toLowerCase().includes(candidate));
  const Icon = key ? DEVICE_ICONS[key] : MonitorSmartphone;

  return <Icon className={cn("h-4 w-4", className)} />;
}

function GroupAvatar({ group, size = "md" }: { group: Group; size?: "sm" | "md" | "lg" }) {
  const dims = { sm: "h-8 w-8 text-sm", md: "h-10 w-10 text-base", lg: "h-14 w-14 text-xl" };

  return (
    <div
      className={cn("flex shrink-0 items-center justify-center rounded-full font-bold text-white", dims[size])}
      style={{ backgroundColor: group.color || "#6366f1" }}
    >
      {group.icon || group.name[0]?.toUpperCase()}
    </div>
  );
}

function AnalyticsStat({
  label,
  value,
  helper,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: ElementType;
}) {
  return (
    <div className="rounded-xl border border-border/70 bg-background/50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
        </div>
        <div className="rounded-lg bg-primary/10 p-2">
          <Icon className="h-4 w-4 text-primary" />
        </div>
      </div>
    </div>
  );
}

function formatBucketLabel(bucket: string, granularity: "hour" | "day") {
  if (granularity === "day") {
    const parsed = new Date(`${bucket}T00:00:00`);
    return Number.isNaN(parsed.valueOf())
      ? bucket
      : parsed.toLocaleDateString([], { month: "short", day: "numeric" });
  }

  return bucket.length >= 13 ? `${bucket.slice(11)}:00` : bucket;
}

function getStreakLabel(streak: GroupAnalytics["activityStreak"]) {
  if (!streak || typeof streak === "number" || !streak.active) {
    return { value: "Idle", helper: "No active session" };
  }

  return {
    value: `${Math.round(streak.durationMinutes)}m`,
    helper: "Current active streak",
  };
}

function GroupAnalyticsSection({
  group,
  range,
  onRangeChange,
  deviceCount,
}: {
  group: Group;
  range: string;
  onRangeChange: (range: string) => void;
  deviceCount: number;
}) {
  const [analytics, setAnalytics] = useState<GroupAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadAnalytics = async () => {
      setLoading(true);
      try {
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const response = await fetch(
          `/api/groups/${group.id}/analytics?timezone=${encodeURIComponent(timezone)}&range=${range}`
        );
        const data = await response.json();

        if (isMounted) {
          setAnalytics(data);
        }
      } catch {
        if (isMounted) {
          setAnalytics(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void loadAnalytics();

    return () => {
      isMounted = false;
    };
  }, [group.id, range]);

  if (loading) {
    return (
      <Card className="space-y-4 p-6">
        <Skeleton className="h-12 w-64" />
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-80" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72" />
          <Skeleton className="h-72" />
        </div>
      </Card>
    );
  }

  const streak = getStreakLabel(analytics?.activityStreak);
  const activitySeries = (analytics?.activitySeries ?? []).map((point) => ({
    bucket: formatBucketLabel(point.bucket, analytics?.activityGranularity ?? "hour"),
    total: point.total,
    blocked: point.blocked,
    flagged: point.flagged,
  }));

  return (
    <Card className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <GroupAvatar group={group} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-tight">{group.name}</h2>
              <Badge variant="outline">{deviceCount} devices</Badge>
              {analytics?.range ? <Badge variant="secondary">{analytics.range}</Badge> : null}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <StatusDot active={group.isActive ?? false} size="sm" />
                {group.isActive ? "Active now" : "Idle"}
              </span>
              <span>
                Analytics are centered here so the activity trend stays the main focus instead of a right-side rail.
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 rounded-xl border border-border/70 bg-background/70 p-1">
          {ANALYTICS_RANGES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => onRangeChange(option.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer",
                range === option.value
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <AnalyticsStat
          label="Queries"
          value={(analytics?.stats?.total ?? 0).toLocaleString()}
          helper="Rows in the selected window"
          icon={Users}
        />
        <AnalyticsStat
          label="Blocked"
          value={(analytics?.stats?.blocked ?? 0).toLocaleString()}
          helper="Resolver blocks in range"
          icon={BarChart2}
        />
        <AnalyticsStat
          label="Flagged"
          value={(analytics?.flaggedCount ?? 0).toLocaleString()}
          helper="Custom or list-based flagging"
          icon={Clock3}
        />
        <AnalyticsStat
          label="Active Streak"
          value={streak.value}
          helper={streak.helper}
          icon={RefreshCw}
        />
      </div>

      <div className="rounded-2xl border border-border/70 bg-background/50 p-5">
        <div className="mb-4">
          <h3 className="text-sm font-semibold">Activity Trend</h3>
          <p className="text-xs text-muted-foreground">
            Full-width trend view for total, blocked, and flagged traffic across the selected range.
          </p>
        </div>

        {activitySeries.length > 0 ? (
          <AreaChart
            data={activitySeries}
            index="bucket"
            series={[
              { key: "total", color: group.color || "var(--chart-1)", label: "Queries" },
              { key: "blocked", color: "var(--status-blocked)", label: "Blocked" },
              { key: "flagged", color: "var(--status-flagged)", label: "Flagged" },
            ]}
            height={320}
          />
        ) : (
          <div className="flex min-h-64 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground">
            No analytics in this range yet.
          </div>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-background/50 p-5">
          <h3 className="text-sm font-semibold">Top Domains</h3>
          <p className="mt-1 text-xs text-muted-foreground">Most queried domains for this group in the selected window.</p>
          <div className="mt-4">
            {analytics?.topDomains && analytics.topDomains.length > 0 ? (
              <HorizontalBarChart
                data={analytics.topDomains.slice(0, 8).map((domain) => ({
                  label: domain.domain,
                  value: domain.count,
                  color: group.color || "var(--chart-1)",
                }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No domains available in this range.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-background/50 p-5">
          <h3 className="text-sm font-semibold">Most Active Devices</h3>
          <p className="mt-1 text-xs text-muted-foreground">The busiest devices inside this group over the selected range.</p>
          <div className="mt-4">
            {analytics?.deviceBreakdown && analytics.deviceBreakdown.length > 0 ? (
              <HorizontalBarChart
                data={analytics.deviceBreakdown.map((device) => ({
                  label: device.label,
                  value: device.count,
                  color: group.color || "var(--chart-2)",
                }))}
              />
            ) : (
              <p className="text-sm text-muted-foreground">No device breakdown available yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-border/70 bg-background/50 p-5">
          <h3 className="text-sm font-semibold">Top Categories</h3>
          <p className="mt-1 text-xs text-muted-foreground">Aggregated reasons from flagging, trackers, and resolver status.</p>
          <div className="mt-4 space-y-2">
            {analytics?.topCategories && analytics.topCategories.length > 0 ? (
              analytics.topCategories.map((category) => (
                <div key={category.category} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                  <span className="truncate text-sm">{category.category}</span>
                  <span className="font-mono text-xs text-muted-foreground">{category.count.toLocaleString()}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No categories available yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-background/50 p-5">
          <h3 className="text-sm font-semibold">Peak Hours</h3>
          <p className="mt-1 text-xs text-muted-foreground">When this group tends to be busiest inside the current window.</p>
          <div className="mt-4 space-y-2">
            {analytics?.peakHours && analytics.peakHours.length > 0 ? (
              analytics.peakHours.map((hour) => (
                <div key={hour.hour} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2">
                  <span className="text-sm">{hour.hour}:00</span>
                  <span className="font-mono text-xs text-muted-foreground">{hour.count.toLocaleString()} queries</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No hourly peaks available yet.</p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function GroupsPage() {
  const { activeProfileId, selectedGroupId, setSelectedGroup } = useDashboardStore();
  const [groups, setGroups] = useState<Group[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [creating, setCreating] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState("24h");

  const loadData = useCallback(async () => {
    if (!activeProfileId) {
      setGroups([]);
      setDevices([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [groupsResponse, devicesResponse] = await Promise.all([
        fetch(`/api/groups?profileId=${activeProfileId}`),
        fetch(`/api/devices?profileId=${activeProfileId}`),
      ]);
      const [groupsData, devicesData] = await Promise.all([
        groupsResponse.json(),
        devicesResponse.json(),
      ]);

      setGroups(groupsData.groups || []);
      setDevices(devicesData.devices || []);
      setLastUpdated(new Date());
    } catch {
      setGroups([]);
      setDevices([]);
    } finally {
      setLoading(false);
    }
  }, [activeProfileId]);

  useEffect(() => {
    void loadData();
    if (!activeProfileId) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadData();
    }, 30_000);

    return () => window.clearInterval(interval);
  }, [activeProfileId, loadData]);

  useEffect(() => {
    if (groups.length === 0) {
      if (selectedGroupId) {
        setSelectedGroup(null);
      }
      return;
    }

    if (!selectedGroupId || !groups.some((group) => group.id === selectedGroupId)) {
      setSelectedGroup(groups[0].id);
    }
  }, [groups, selectedGroupId, setSelectedGroup]);

  const createGroup = async () => {
    if (!newName.trim() || !activeProfileId) return;

    setCreating(true);
    await fetch("/api/groups", {
      method: "POST",
      body: JSON.stringify({ name: newName.trim(), color: newColor, profileId: activeProfileId }),
      headers: { "Content-Type": "application/json" },
    });

    setNewName("");
    setNewColor(PALETTE[0]);
    setCreateOpen(false);
    setCreating(false);
    await loadData();
  };

  const deleteGroup = async (id: string) => {
    setDeletingGroupId(id);
    await fetch(`/api/groups/${id}`, { method: "DELETE" });
    if (selectedGroupId === id) {
      setSelectedGroup(null);
    }
    await loadData();
    setDeletingGroupId(null);
  };

  const assignDevice = async (deviceId: string, groupId: string | null) => {
    await fetch(`/api/devices/${deviceId}`, {
      method: "PATCH",
      body: JSON.stringify({ groupId }),
      headers: { "Content-Type": "application/json" },
    });

    setDevices((previous) => previous.map((device) => (device.id === deviceId ? { ...device, groupId } : device)));
  };

  const selectedGroup = selectedGroupId ? groups.find((group) => group.id === selectedGroupId) ?? null : null;
  const selectedGroupDevices = selectedGroup ? devices.filter((device) => device.groupId === selectedGroup.id) : [];
  const unassignedDevices = devices.filter((device) => !device.groupId);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48" />
        <Skeleton className="h-128" />
      </div>
    );
  }

  if (!activeProfileId) {
    return (
      <Card className="p-14 text-center">
        <Users className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        <h1 className="text-xl font-semibold">Choose a profile first</h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
          Group management is scoped to the active profile. Select a profile from the top bar, then come back here to organize devices and inspect behavior.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Groups</h1>
          <p className="text-sm text-muted-foreground">
            {groups.length} group{groups.length !== 1 ? "s" : ""} · {devices.length} device{devices.length !== 1 ? "s" : ""}
            {lastUpdated ? (
              <span className="ml-2 inline-flex items-center gap-1">
                <RefreshCw className="h-3 w-3" />
                {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </Button>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger render={<Button />}>
              <Users className="mr-2 h-4 w-4" />Add Group
            </DialogTrigger>
            <DialogContent className="max-w-sm">
              <DialogHeader>
                <DialogTitle>Create Group</DialogTitle>
              </DialogHeader>
              <div className="mt-2 space-y-4">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input
                    placeholder="e.g. Kids, Work, IoT"
                    value={newName}
                    onChange={(event) => setNewName(event.target.value)}
                    onKeyDown={(event) => event.key === "Enter" && createGroup()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Color</Label>
                  <div className="flex flex-wrap gap-2">
                    {PALETTE.map((color) => (
                      <button
                        key={color}
                        type="button"
                        className={cn(
                          "h-7 w-7 rounded-full ring-offset-2 ring-offset-background transition-all cursor-pointer",
                          newColor === color ? "scale-110 ring-2 ring-ring" : "hover:scale-105"
                        )}
                        style={{ backgroundColor: color }}
                        onClick={() => setNewColor(color)}
                        aria-label={`Color ${color}`}
                      />
                    ))}
                  </div>
                </div>
                {newName ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div
                      className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold text-white"
                      style={{ backgroundColor: newColor }}
                    >
                      {newName[0]?.toUpperCase()}
                    </div>
                    Preview: {newName}
                  </div>
                ) : null}
                <div className="flex gap-2 pt-1">
                  <Button onClick={createGroup} disabled={!newName.trim() || creating} className="flex-1">
                    {creating ? "Creating..." : "Create"}
                  </Button>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {groups.length === 0 ? (
        <Card className="p-12 text-center">
          <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h2 className="font-semibold">No groups yet</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            Create a group to organize devices and unlock full-width activity analytics for each segment.
          </p>
          <Button className="mx-auto mt-4" onClick={() => setCreateOpen(true)}>
            Add First Group
          </Button>
        </Card>
      ) : (
        <>
          <Card className="space-y-4 p-5">
            <div>
              <h2 className="text-sm font-semibold">Groups Overview</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Pick a group to keep its analytics centered below. Device assignment stays on this page so you can reorganize and inspect behavior in one place.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {groups.map((group) => {
                const groupDevices = devices.filter((device) => device.groupId === group.id);
                const isSelected = selectedGroupId === group.id;

                return (
                  <motion.div key={group.id} whileHover={{ y: -2 }} transition={{ duration: 0.15 }}>
                    <Card
                      className={cn(
                        "cursor-pointer p-4 transition-all",
                        isSelected ? "ring-2 ring-primary" : "hover:shadow-md"
                      )}
                      onClick={() => setSelectedGroup(group.id)}
                    >
                      <div className="mb-3 flex items-start justify-between">
                        <div className="flex items-center gap-2.5">
                          <GroupAvatar group={group} />
                          <div>
                            <p className="font-semibold leading-tight">{group.name}</p>
                            <div className="mt-0.5 flex items-center gap-1.5">
                              <StatusDot active={group.isActive ?? false} size="sm" />
                              <span className="text-xs text-muted-foreground">
                                {groupDevices.length} device{groupDevices.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                          </div>
                        </div>

                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={<Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(event) => event.stopPropagation()} />}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(event) => {
                                event.stopPropagation();
                                void deleteGroup(group.id);
                              }}
                              disabled={deletingGroupId === group.id}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-3.5 w-3.5" />
                              {deletingGroupId === group.id ? "Deleting..." : "Delete group"}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>

                      {groupDevices.length > 0 ? (
                        <div className="space-y-1.5">
                          {groupDevices.slice(0, 3).map((device) => (
                            <div key={device.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <DeviceIcon model={device.model} className="shrink-0 text-muted-foreground" />
                              <span className="truncate">{device.name}</span>
                            </div>
                          ))}
                          {groupDevices.length > 3 ? (
                            <p className="text-xs text-muted-foreground">+{groupDevices.length - 3} more</p>
                          ) : null}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground">No devices assigned yet.</p>
                      )}
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          </Card>

          {selectedGroup ? (
            <GroupAnalyticsSection
              group={selectedGroup}
              range={analyticsRange}
              onRangeChange={setAnalyticsRange}
              deviceCount={selectedGroupDevices.length}
            />
          ) : null}

          <Card className="space-y-5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold">Device Assignments</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Reassign devices without leaving the page. The selected group stays visible above so you can confirm the analytics impact immediately.
                </p>
              </div>
              {selectedGroup ? <Badge variant="outline">Focused on {selectedGroup.name}</Badge> : null}
            </div>

            {selectedGroup ? (
              <div className="space-y-2 rounded-2xl border border-border/70 bg-background/50 p-4">
                <div className="flex items-center gap-3">
                  <GroupAvatar group={selectedGroup} size="sm" />
                  <div>
                    <p className="text-sm font-medium">{selectedGroup.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {selectedGroupDevices.length} device{selectedGroupDevices.length !== 1 ? "s" : ""} currently assigned
                    </p>
                  </div>
                </div>
                {selectedGroupDevices.length > 0 ? (
                  <div className="mt-3 space-y-1">
                    {selectedGroupDevices.map((device) => (
                      <DeviceRow
                        key={device.id}
                        device={device}
                        groups={groups}
                        onAssign={(groupId) => void assignDevice(device.id, groupId)}
                      />
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted-foreground">No devices assigned to this group yet.</p>
                )}
              </div>
            ) : null}

            <div className="space-y-4">
              {groups.map((group) => {
                const groupDevices = devices.filter((device) => device.groupId === group.id);
                if (groupDevices.length === 0) return null;

                return (
                  <div key={group.id} className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: group.color || "#6366f1" }} />
                      <span className="text-xs font-medium text-muted-foreground">{group.name}</span>
                    </div>
                    <div className="space-y-1">
                      {groupDevices.map((device) => (
                        <DeviceRow
                          key={device.id}
                          device={device}
                          groups={groups}
                          onAssign={(groupId) => void assignDevice(device.id, groupId)}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              {unassignedDevices.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Unassigned</p>
                  <div className="space-y-1">
                    {unassignedDevices.map((device) => (
                      <DeviceRow
                        key={device.id}
                        device={device}
                        groups={groups}
                        onAssign={(groupId) => void assignDevice(device.id, groupId)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {devices.length === 0 ? (
                <Card className="p-8 text-center">
                  <MonitorSmartphone className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    No devices discovered yet. DNS queries will auto-register devices.
                  </p>
                </Card>
              ) : null}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}

function DeviceRow({
  device,
  groups,
  onAssign,
}: {
  device: Device;
  groups: Group[];
  onAssign: (groupId: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2 transition-colors hover:bg-accent/30">
      <DeviceIcon model={device.model} className="shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{device.name}</p>
        <div className="flex items-center gap-2">
          {device.localIp ? <span className="font-mono text-[10px] text-muted-foreground">{device.localIp}</span> : null}
          {device.lastSeen ? (
            <span className="text-[10px] text-muted-foreground">
              {new Date(device.lastSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          ) : null}
        </div>
      </div>
      <StatusDot active={device.isActive ?? false} size="sm" />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" />}>
          <Link2 className="h-3 w-3" />
          {device.groupId ? "Move" : "Assign"}
          <ChevronDown className="h-3 w-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {groups.map((group) => (
            <DropdownMenuItem
              key={group.id}
              onClick={() => onAssign(group.id)}
              className={cn("gap-2", device.groupId === group.id && "bg-accent")}
            >
              <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: group.color || "#6366f1" }} />
              {group.name}
            </DropdownMenuItem>
          ))}
          {device.groupId ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onAssign(null)} className="gap-2 text-destructive">
                <Unlink className="h-3.5 w-3.5" />
                Unassign
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}