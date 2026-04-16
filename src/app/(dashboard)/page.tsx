"use client";

import { useDashboardStore } from "@/stores/dashboard-store";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Globe,
  ShieldBan,
  MonitorSmartphone,
  OctagonAlert,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
  AlertTriangle,
  RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { AreaChart } from "@/components/charts/area-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { HorizontalBarChart } from "@/components/charts/bar-chart";
import { ActivityHeatmap } from "@/components/charts/activity-heatmap";
import { Sparkline } from "@/components/charts/sparkline";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface HourlyBucket {
  bucket: string;
  total: number;
  blocked: number;
  allowed: number;
  relayed?: number;
}

interface DashboardData {
  stats: {
    totalToday: number;
    blockedToday: number;
    flaggedToday: number;
    deviceCount: number;
  };
  comparisonStats?: {
    totalToday: number;
    blockedToday: number;
    flaggedToday: number;
    deviceCount: number;
  };
  topDomains: { domain: string; count: number }[];
  topBlocked: { domain: string; count: number }[];
  hourlyData: HourlyBucket[];
  deviceBreakdown?: { deviceId: string | null; name: string; count: number; person?: { id: string; name: string } | null }[];
  recentFlagged?: {
    id: number;
    timestamp: string;
    domain: string;
    deviceId: string | null;
    flagReason: string | null;
    device?: { name: string; model?: string } | null;
    person?: { name: string; color?: string } | null;
  }[];
}

function parseBucketLabel(bucket: string): string {
  if (!bucket) return "";
  // "2024-01-15 14" -> "14:00"
  if (bucket.length === 13) return `${bucket.slice(11)}:00`;
  // "2024-01-15" -> "01-15"
  if (bucket.length === 10) return bucket.slice(5);
  return bucket;
}

function parseBucketDay(bucket: string): number {
  if (!bucket || bucket.length < 10) return new Date().getDay();
  // Parse local date to avoid UTC offset shifting the day
  const [year, month, day] = bucket.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

function parseBucketHour(bucket: string): number {
  if (!bucket) return 0;
  if (bucket.length >= 13) return parseInt(bucket.slice(11, 13), 10);
  return 0;
}

function Delta({ current, previous }: { current: number; previous?: number }) {
  if (previous === undefined || previous === 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct > 0;
  const flat = Math.abs(pct) < 1;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium tabular-nums",
        flat ? "text-muted-foreground" : up ? "text-[var(--status-blocked)]" : "text-[var(--status-allowed)]"
      )}
    >
      {flat ? <Minus className="h-3 w-3" /> : up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
      {flat ? "—" : `${Math.abs(pct).toFixed(1)}%`}
    </span>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  previous?: number;
  icon: React.ElementType;
  iconColor: string;
  sparkData?: number[];
  sparkColor?: string;
  delay?: number;
}

function StatCard({ label, value, previous, icon: Icon, iconColor, sparkData, sparkColor, delay = 0 }: StatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <Card className="p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
            <span className="text-3xl font-bold tabular-nums leading-none">{value.toLocaleString()}</span>
            <Delta current={value} previous={previous} />
          </div>
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
            style={{ backgroundColor: `color-mix(in oklch, ${iconColor} 12%, transparent)` }}
          >
            <Icon className="h-5 w-5" style={{ color: iconColor }} />
          </div>
        </div>
        {sparkData && sparkData.length > 1 && (
          <div className="-mx-1">
            <Sparkline data={sparkData} color={sparkColor || iconColor} height={32} />
          </div>
        )}
      </Card>
    </motion.div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-5 space-y-3">
            <div className="flex justify-between">
              <div className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-3 w-12" />
              </div>
              <Skeleton className="h-9 w-9 rounded-lg" />
            </div>
            <Skeleton className="h-8" />
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-5 space-y-3">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-72" />
        </Card>
        <Card className="p-5 space-y-3">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-40 w-40 rounded-full mx-auto" />
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-3" />)}
          </div>
        </Card>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-28 text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
        <Globe className="h-8 w-8 text-primary" />
      </div>
      <h2 className="text-xl font-bold mb-2">No Profile Selected</h2>
      <p className="text-muted-foreground mb-6 max-w-sm text-sm leading-relaxed">
        Set up a NextDNS profile to start monitoring DNS queries across your network.
      </p>
      <Link
        href="https://ndns.rukh.me/profiles"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
      >
        Set Up Profile
        <ArrowRight className="h-4 w-4" />
      </Link>
    </motion.div>
  );
}

const CHART_SERIES = [
  { key: "total", color: "var(--chart-1)", label: "Total" },
  { key: "blocked", color: "var(--chart-2)", label: "Blocked" },
  { key: "allowed", color: "var(--chart-3)", label: "Allowed" },
];

const TIME_RANGES = ["1h", "6h", "24h", "7d"];

export default function DashboardPage() {
  const { activeProfileId, selectedGroupId } = useDashboardStore();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [noProfiles, setNoProfiles] = useState(!activeProfileId);
  const [timeRange, setTimeRange] = useState("24h");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  useEffect(() => {
    if (!activeProfileId) {
      Promise.resolve().then(() => {
        setLoading(false);
        setNoProfiles(true);
      });
      return;
    }
    const fetchData = () => {
      const params = new URLSearchParams({ profileId: activeProfileId, timeRange, timezone });
      if (selectedGroupId) params.set("groupId", selectedGroupId);
      fetch(`/api/dashboard?${params}`)
        .then((r) => r.json())
        .then((d) => {
          setData(d);
          setNoProfiles(false);
          setLastUpdated(new Date());
        })
        .catch(console.error)
        .finally(() => setLoading(false));
    };
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [activeProfileId, selectedGroupId, timeRange, timezone]);

  if (noProfiles) return <EmptyState />;
  if (loading || !data) return <DashboardSkeleton />;

  const { stats, comparisonStats, topDomains, topBlocked, hourlyData, deviceBreakdown, recentFlagged } = data;

  const chartData = hourlyData.map((d) => ({
    hour: parseBucketLabel(d.bucket),
    total: d.total,
    blocked: d.blocked,
    allowed: d.allowed,
  }));

  const sparkTotal = hourlyData.map((d) => d.total);
  const sparkBlocked = hourlyData.map((d) => d.blocked);

  // Status distribution donut (computed from stats)
  const other = Math.max(0, stats.totalToday - stats.blockedToday - stats.flaggedToday);
  const donutData = [
    { label: "blocked", value: stats.blockedToday, color: "var(--chart-2)" },
    { label: "flagged", value: stats.flaggedToday, color: "var(--chart-4)" },
    { label: "other", value: other, color: "var(--chart-1)" },
  ].filter((d) => d.value > 0);

  // Heatmap: parse bucket to day/hour
  const heatmapData = hourlyData
    .filter((d) => d.bucket)
    .map((d) => ({
      day: parseBucketDay(d.bucket),
      hour: parseBucketHour(d.bucket),
      value: d.total,
    }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {selectedGroupId ? "Filtered by group" : "All traffic across profile"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="hidden sm:flex items-center gap-1.5 text-xs text-muted-foreground">
              <RefreshCw className="h-3 w-3" />
              {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          <div className="flex items-center gap-1 rounded-lg border p-1">
            {TIME_RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setTimeRange(r)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                  timeRange === r
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent"
                )}
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Queries"
          value={stats.totalToday}
          previous={comparisonStats?.totalToday}
          icon={Globe}
          iconColor="var(--chart-1)"
          sparkData={sparkTotal}
          sparkColor="var(--chart-1)"
          delay={0}
        />
        <StatCard
          label="Blocked"
          value={stats.blockedToday}
          previous={comparisonStats?.blockedToday}
          icon={ShieldBan}
          iconColor="var(--chart-2)"
          sparkData={sparkBlocked}
          sparkColor="var(--chart-2)"
          delay={0.05}
        />
        <StatCard
          label="Devices Monitored"
          value={stats.deviceCount}
          previous={comparisonStats?.deviceCount}
          icon={MonitorSmartphone}
          iconColor="var(--chart-3)"
          delay={0.1}
        />
        <StatCard
          label="Flagged Queries"
          value={stats.flaggedToday}
          previous={comparisonStats?.flaggedToday}
          icon={OctagonAlert}
          iconColor="var(--chart-4)"
          delay={0.15}
        />
      </div>

      {/* Main chart + donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.2 }}
          className="lg:col-span-2"
        >
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold">DNS Activity</h2>
                <p className="text-xs text-muted-foreground">Query volume over time</p>
              </div>
            </div>
            <AreaChart
              data={chartData}
              index="hour"
              series={CHART_SERIES}
              height={248}
              tickFormatter={(v) => v}
            />
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.4, delay: 0.25 }}
        >
          <Card className="p-5 flex flex-col h-full">
            <h2 className="text-sm font-semibold mb-4">Query Distribution</h2>
            <div className="flex flex-col items-center gap-4 flex-1">
              <DonutChart
                data={donutData}
                size={156}
                innerRadius={52}
                centerLabel="total"
                centerValue={stats.totalToday.toLocaleString()}
              />
              <div className="w-full space-y-2">
                {donutData.map((d) => (
                  <div key={d.label} className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                      <span className="capitalize text-muted-foreground">{d.label}</span>
                    </div>
                    <span className="tabular-nums font-mono text-xs font-medium">{d.value.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>
        </motion.div>
      </div>

      {/* Activity Heatmap */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <Card className="p-5">
          <div className="mb-4">
            <h2 className="text-sm font-semibold">Activity Pattern</h2>
            <p className="text-xs text-muted-foreground">Query distribution by hour</p>
          </div>
          <ActivityHeatmap data={heatmapData} />
        </Card>
      </motion.div>

      {/* Top domains */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.35 }}
        >
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold">Top Allowed Domains</h2>
                <p className="text-xs text-muted-foreground">Most queried</p>
              </div>
              <Globe className="h-4 w-4 text-muted-foreground" />
            </div>
            {topDomains.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data</p>
            ) : (
              <HorizontalBarChart
                data={topDomains.slice(0, 8).map((d) => ({
                  label: d.domain,
                  value: d.count,
                  color: "var(--chart-3)",
                }))}
                onBarClick={(label) => {
                  window.location.href = `/logs?search=${encodeURIComponent(label)}`;
                }}
              />
            )}
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.4 }}
        >
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold">Top Blocked Domains</h2>
                <p className="text-xs text-muted-foreground">Most blocked requests</p>
              </div>
              <ShieldBan className="h-4 w-4 text-muted-foreground" />
            </div>
            {topBlocked.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No blocked domains</p>
            ) : (
              <HorizontalBarChart
                data={topBlocked.slice(0, 8).map((d) => ({
                  label: d.domain,
                  value: d.count,
                  color: "var(--chart-2)",
                }))}
                onBarClick={(label) => {
                  window.location.href = `/logs?search=${encodeURIComponent(label)}&status=blocked`;
                }}
              />
            )}
          </Card>
        </motion.div>
      </div>

      {/* Recent Flagged + Device Status */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.45 }}
        >
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold">Recent Flagged</h2>
                <p className="text-xs text-muted-foreground">High-priority risk events</p>
              </div>
              <Link
                href="/tags"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {!recentFlagged || recentFlagged.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-[var(--status-allowed)]/10 flex items-center justify-center mb-3">
                  <ShieldBan className="h-5 w-5" style={{ color: "var(--status-allowed)" }} />
                </div>
                <p className="text-sm font-medium">All clear</p>
                <p className="text-xs text-muted-foreground mt-1">No flagged activity detected</p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentFlagged.slice(0, 6).map((item) => (
                  <div key={item.id} className="flex items-start gap-3 py-2 border-b last:border-0">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" style={{ color: "var(--status-flagged)" }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-mono font-medium truncate">{item.domain}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(item.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </span>
                        {item.device && (
                          <span className="text-[10px] text-muted-foreground truncate">{item.device.name}</span>
                        )}
                        {item.flagReason && (
                          <span
                            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium status-flagged border"
                          >
                            {item.flagReason}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.5 }}
        >
          <Card className="p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-sm font-semibold">Device Status</h2>
                <p className="text-xs text-muted-foreground">{stats.deviceCount} monitored</p>
              </div>
              <Link
                href="/people"
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Manage <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {!deviceBreakdown?.length ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <MonitorSmartphone className="h-8 w-8 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">No devices discovered yet</p>
              </div>
            ) : (
              <div className="space-y-1">
                {deviceBreakdown.slice(0, 6).map((d) => (
                  <div key={d.deviceId ?? d.name} className="flex items-center justify-between py-1.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <MonitorSmartphone className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="text-sm truncate">{d.name}</span>
                      {d.person && (
                        <span className="text-xs text-muted-foreground truncate hidden sm:inline">
                          · {d.person.name}
                        </span>
                      )}
                    </div>
                    <span className="tabular-nums text-sm font-medium shrink-0">{d.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </motion.div>
      </div>
    </div>
  );
}
