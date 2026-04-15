"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Download,
  EyeOff,
  Fingerprint,
  Globe,
  Lock,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  Unlock,
  X,
  Eye,
  Radio,
} from "lucide-react";

import { useDashboardStore } from "@/stores/dashboard-store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

interface LogEntry {
  id: number;
  timestamp: string;
  domain: string;
  rootDomain: string | null;
  tracker: string | null;
  status: "default" | "blocked" | "allowed" | "relayed" | "error";
  queryType: string | null;
  dnssec: boolean | null;
  encrypted: boolean;
  protocol: string;
  clientIp: string;
  clientName: string | null;
  isFlagged: boolean;
  flagReason: string | null;
  reasons: { id?: string; name: string }[] | null;
  deviceId: string | null;
  device: { id?: string; name: string | null; model?: string | null; localIp?: string | null } | null;
  group?: { id?: string; name: string; color?: string | null } | null;
  person?: { id?: string; name: string; color?: string | null } | null;
  tags?: Array<{
    id: string;
    name: string;
    slug: string;
    listId: string;
    listName: string;
    matchedDomain: string;
  }>;
}

interface DeviceFilterOption {
  id: string;
  name: string;
  model: string | null;
  group?: { id?: string; name: string; color?: string | null } | null;
}

interface TagFilterOption {
  id: string;
  name: string;
  slug: string;
  color?: string | null;
}

type MetricTone = "default" | "blocked" | "allowed" | "flagged" | "error";

const toneColor: Record<MetricTone, string> = {
  default: "var(--status-default)",
  blocked: "var(--status-blocked)",
  allowed: "var(--status-allowed)",
  flagged: "var(--status-flagged)",
  error: "var(--status-error)",
};

function formatDateTime(timestamp: string) {
  const date = new Date(timestamp);

  return {
    time: date.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }),
    date: date.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    }),
    full: date.toLocaleString(),
  };
}

function formatDateTimeLocal(date: Date) {
  const pad = (value: number) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join("-") + `T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseLocalDateTime(input: string) {
  if (!input) return null;

  const date = new Date(input);
  if (Number.isNaN(date.valueOf())) {
    return null;
  }

  return date.toISOString();
}

function getPresetWindow(preset: "1h" | "24h" | "7d") {
  const now = new Date();
  const hours = preset === "1h" ? 1 : preset === "24h" ? 24 : 24 * 7;
  const from = new Date(now.getTime() - hours * 60 * 60 * 1000);

  return {
    from: formatDateTimeLocal(from),
    to: formatDateTimeLocal(now),
  };
}

function getRowStyle(log: LogEntry, isExpanded: boolean): CSSProperties {
  if (log.status === "blocked") {
    return {
      boxShadow: "inset 3px 0 0 var(--status-blocked)",
      ...(!isExpanded && {
        backgroundColor: "color-mix(in oklch, var(--status-blocked) 7%, transparent)",
      }),
    };
  }

  if (log.status === "error") {
    return {
      boxShadow: "inset 3px 0 0 var(--status-error)",
      ...(!isExpanded && {
        backgroundColor: "color-mix(in oklch, var(--status-error) 6%, transparent)",
      }),
    };
  }

  if (log.isFlagged) {
    return {
      boxShadow: "inset 3px 0 0 var(--status-flagged)",
      ...(!isExpanded && {
        backgroundColor: "color-mix(in oklch, var(--status-flagged) 7%, transparent)",
      }),
    };
  }

  if (log.tracker) {
    return {
      boxShadow: "inset 3px 0 0 var(--status-default)",
      ...(!isExpanded && {
        backgroundColor: "color-mix(in oklch, var(--status-default) 5%, transparent)",
      }),
    };
  }

  return {};
}

function MetaPill({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: MetricTone;
}) {
  const color = toneColor[tone];

  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium"
      style={{
        color,
        borderColor: `color-mix(in oklch, ${color} 32%, var(--border))`,
        backgroundColor: `color-mix(in oklch, ${color} 10%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

function MetricCard({
  label,
  value,
  helper,
  tone = "default",
}: {
  label: string;
  value: string;
  helper: string;
  tone?: MetricTone;
}) {
  const color = toneColor[tone];

  return (
    <Card
      size="sm"
      className="gap-2 border-none bg-card/90 ring-1"
      style={{
        boxShadow: `inset 0 1px 0 color-mix(in oklch, ${color} 20%, transparent)`,
        borderColor: `color-mix(in oklch, ${color} 20%, transparent)`,
      }}
    >
      <CardContent className="space-y-1 px-4 py-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <p className="text-xs text-muted-foreground">{helper}</p>
      </CardContent>
    </Card>
  );
}

function DetailBlock({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="space-y-1 rounded-2xl border border-border/60 bg-background/60 p-3">
      <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </p>
      <div className={cn("text-sm text-foreground", mono && "font-mono text-xs")}>{value}</div>
    </div>
  );
}

function ExpandedRow({ log }: { log: LogEntry }) {
  const formatted = formatDateTime(log.timestamp);

  return (
    <motion.div
      initial={{ height: 0, opacity: 0 }}
      animate={{ height: "auto", opacity: 1 }}
      exit={{ height: 0, opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="overflow-hidden"
    >
      <div className="border-t border-border/70 bg-[linear-gradient(180deg,color-mix(in_oklch,var(--status-default)_6%,transparent),transparent_55%),radial-gradient(circle_at_top_right,color-mix(in_oklch,var(--status-flagged)_12%,transparent),transparent_35%)] px-4 py-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DetailBlock label="Timestamp" value={formatted.full} mono />
          <DetailBlock label="Domain" value={log.domain} mono />
          <DetailBlock label="Root Domain" value={log.rootDomain || "—"} mono />
          <DetailBlock label="Query Type" value={log.queryType || "—"} mono />
          <DetailBlock label="Client App" value={log.clientName || "—"} />
          <DetailBlock label="Public IP" value={log.clientIp || "—"} mono />
          <DetailBlock label="Device" value={log.device?.name || "Unidentified device"} />
          <DetailBlock label="Local IP" value={log.device?.localIp || "—"} mono />
          <DetailBlock label="Device Model" value={log.device?.model || "—"} />
          <DetailBlock label="Protocol" value={log.protocol || "—"} mono />
          <DetailBlock
            label="Security"
            value={
              <div className="flex flex-wrap gap-1.5">
                <MetaPill tone={log.encrypted ? "allowed" : "default"}>
                  {log.encrypted ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                  {log.encrypted ? "Encrypted" : "Plain"}
                </MetaPill>
                <MetaPill tone={log.dnssec ? "allowed" : "default"}>
                  <Fingerprint className="h-3 w-3" />
                  {log.dnssec ? "DNSSEC" : "No DNSSEC"}
                </MetaPill>
              </div>
            }
          />
          <DetailBlock
            label="Resolution"
            value={
              <div className="flex flex-wrap gap-1.5">
                <StatusBadge status={log.status} />
                {log.isFlagged && <MetaPill tone="flagged">Flagged</MetaPill>}
                {log.tracker && <MetaPill>Tracker: {log.tracker}</MetaPill>}
              </div>
            }
          />
        </div>

        {(log.reasons?.length || log.flagReason) && (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {log.reasons && log.reasons.length > 0 && (
              <DetailBlock
                label="Reasons"
                value={
                  <div className="flex flex-wrap gap-1.5">
                    {log.reasons.map((reason, index) => (
                      <Badge key={`${reason.name}-${index}`} variant="outline" className="rounded-full text-[10px]">
                        {reason.name}
                      </Badge>
                    ))}
                  </div>
                }
              />
            )}

            {log.flagReason && (
              <DetailBlock
                label="Flag Reason"
                value={
                  <MetaPill tone="flagged">
                    <AlertTriangle className="h-3 w-3" />
                    {log.flagReason}
                  </MetaPill>
                }
              />
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function LogRow({
  log,
  isExpanded,
  onToggle,
}: {
  log: LogEntry;
  isExpanded: boolean;
  onToggle: () => void;
}) {
  const formatted = formatDateTime(log.timestamp);

  return (
    <>
      <TableRow
        aria-expanded={isExpanded}
        className={cn("cursor-pointer align-top transition-colors", isExpanded && "bg-accent/25")}
        style={getRowStyle(log, isExpanded)}
        onClick={onToggle}
      >
        <TableCell className="py-3 align-top">
          <div className="space-y-0.5">
            <p className="font-mono text-xs text-foreground">{formatted.time}</p>
            <p className="text-[11px] text-muted-foreground">{formatted.date}</p>
          </div>
        </TableCell>

        <TableCell className="py-3 align-top">
          <div className="min-w-60 space-y-2">
            <div className="flex items-start gap-2">
              {log.isFlagged && (
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--status-flagged)" }} />
              )}
              <div className="min-w-0 flex-1">
                <p
                  className="truncate font-mono text-xs leading-5"
                  title={log.domain}
                  style={{
                    color:
                      log.status === "blocked"
                        ? "var(--status-blocked)"
                        : log.status === "error"
                          ? "var(--status-error)"
                          : log.isFlagged
                            ? "var(--status-flagged)"
                            : undefined,
                  }}
                >
                  {log.domain}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {log.queryType && <MetaPill>{log.queryType}</MetaPill>}
                  {log.rootDomain && <MetaPill tone="default">root: {log.rootDomain}</MetaPill>}
                  {log.tracker && (
                    <MetaPill tone="default">
                      <EyeOff className="h-3 w-3" />
                      {log.tracker}
                    </MetaPill>
                  )}
                  {log.tags?.slice(0, 2).map((tag) => (
                    <MetaPill key={`${tag.id}:${tag.listId}`} tone="flagged">
                      {tag.name}
                    </MetaPill>
                  ))}
                  {log.tags && log.tags.length > 2 && <MetaPill tone="flagged">+{log.tags.length - 2} tags</MetaPill>}
                </div>
              </div>
            </div>
          </div>
        </TableCell>

        <TableCell className="py-3 align-top">
          <div className="min-w-45 space-y-1.5">
            <p className="truncate text-xs font-medium text-foreground">
              {log.device?.name || "Unidentified device"}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(log.group?.name || log.person?.name) && (
                <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: log.group?.color || log.person?.color || "var(--status-default)" }}
                  />
                  {log.group?.name || log.person?.name}
                </span>
              )}
              {log.clientName && <MetaPill tone="default">client: {log.clientName}</MetaPill>}
              {log.device?.model && <MetaPill tone="default">{log.device.model}</MetaPill>}
              {log.device?.localIp && <MetaPill tone="default">{log.device.localIp}</MetaPill>}
            </div>
          </div>
        </TableCell>

        <TableCell className="py-3 align-top">
          <div className="min-w-40 space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <StatusBadge status={log.status} />
              {log.isFlagged && <MetaPill tone="flagged">flagged</MetaPill>}
            </div>
            {log.reasons && log.reasons.length > 0 ? (
              <p className="line-clamp-2 text-[11px] text-muted-foreground">
                {log.reasons.slice(0, 2).map((reason) => reason.name).join(" • ")}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                {log.flagReason ? `Reason: ${log.flagReason}` : "No explicit resolver reason"}
              </p>
            )}
          </div>
        </TableCell>

        <TableCell className="py-3 align-top">
          <div className="min-w-45 space-y-1.5">
            <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
              <Globe className="h-3.5 w-3.5 text-muted-foreground" />
              {log.protocol}
            </p>
            <div className="flex flex-wrap gap-1.5">
              <MetaPill tone={log.encrypted ? "allowed" : "default"}>
                {log.encrypted ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                {log.encrypted ? "Encrypted" : "Plain"}
              </MetaPill>
              <MetaPill tone={log.dnssec ? "allowed" : "default"}>
                <Fingerprint className="h-3 w-3" />
                {log.dnssec ? "DNSSEC" : "No DNSSEC"}
              </MetaPill>
            </div>
          </div>
        </TableCell>

        <TableCell className="py-3 align-top">
          <div className="flex justify-end">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
        </TableCell>
      </TableRow>

      <AnimatePresence>
        {isExpanded && (
          <TableRow key={`${log.id}-expanded`} className="hover:bg-transparent">
            <TableCell colSpan={6} className="p-0">
              <ExpandedRow log={log} />
            </TableCell>
          </TableRow>
        )}
      </AnimatePresence>
    </>
  );
}

function LogsContent() {
  const { activeProfileId, selectedGroupId, setSelectedGroup, groups } = useDashboardStore();
  const searchParams = useSearchParams();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [devices, setDevices] = useState<DeviceFilterOption[]>([]);
  const [tags, setTags] = useState<TagFilterOption[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get("status") || "all");
  const [flaggedOnly, setFlaggedOnly] = useState(searchParams.get("flagged") === "true");
  const [hideTrackers, setHideTrackers] = useState(false);
  const [deviceFilter, setDeviceFilter] = useState(searchParams.get("deviceId") || "all");
  const [tagFilter, setTagFilter] = useState(searchParams.get("tagId") || "all");
  const [sortBy, setSortBy] = useState(searchParams.get("sortBy") || "timestamp");
  const [sortDir, setSortDir] = useState(searchParams.get("sortDir") || searchParams.get("sort") || "desc");
  const [fromInput, setFromInput] = useState("");
  const [toInput, setToInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [liveMode, setLiveMode] = useState(false);
  const [liveInterval, setLiveInterval] = useState("5000");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const limit = 50;

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [search]);

  const loadFilterOptions = useCallback(async () => {
    if (!activeProfileId) {
      setDevices([]);
      setTags([]);
      return;
    }

    try {
      const [devicesResponse, tagsResponse] = await Promise.all([
        fetch(`/api/devices?profileId=${activeProfileId}`),
        fetch("/api/tags"),
      ]);

      const [devicesData, tagsData] = await Promise.all([
        devicesResponse.json(),
        tagsResponse.json(),
      ]);

      setDevices(devicesData.devices || []);
      setTags(tagsData.tags || []);
    } catch (error) {
      console.error("Failed to load log filters:", error);
    }
  }, [activeProfileId]);

  useEffect(() => {
    void loadFilterOptions();
  }, [loadFilterOptions]);

  const fetchLogs = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    if (!activeProfileId) {
      setLogs([]);
      setTotal(0);
      setLoading(false);
      setRefreshing(false);
      return;
    }

    if (background) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    const params = new URLSearchParams({
      profileId: activeProfileId,
      page: String(page),
      limit: String(limit),
      sortBy,
      sortDir,
    });

    if (statusFilter !== "all") params.set("status", statusFilter);
    if (flaggedOnly) params.set("flagged", "true");
    if (hideTrackers) params.set("hideTrackers", "true");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (selectedGroupId) params.set("groupId", selectedGroupId);
    if (deviceFilter !== "all") params.set("deviceId", deviceFilter);
    if (tagFilter !== "all") params.set("tagId", tagFilter);

    const from = parseLocalDateTime(fromInput);
    const to = parseLocalDateTime(toInput);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    try {
      const response = await fetch(`/api/logs?${params.toString()}`);
      const data = await response.json();
      setLogs(data.logs || []);
      setTotal(data.total || 0);
    } catch (error) {
      console.error("Failed to fetch logs:", error);
    } finally {
      setLastUpdatedAt(new Date().toISOString());
      if (background) {
        setRefreshing(false);
      } else {
        setLoading(false);
      }
    }
  }, [
    activeProfileId,
    debouncedSearch,
    deviceFilter,
    flaggedOnly,
    fromInput,
    hideTrackers,
    page,
    selectedGroupId,
    sortBy,
    sortDir,
    statusFilter,
    tagFilter,
    toInput,
  ]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  useEffect(() => {
    if (!liveMode || !activeProfileId) {
      return;
    }

    const interval = window.setInterval(() => {
      void fetchLogs({ background: true });
    }, Number(liveInterval));

    return () => window.clearInterval(interval);
  }, [activeProfileId, fetchLogs, liveInterval, liveMode]);

  const totalPages = Math.max(1, Math.ceil(total / limit));
  const selectedGroup = selectedGroupId
    ? groups.find((g) => g.id === selectedGroupId) ?? null
    : null;
  const selectedDevice = deviceFilter !== "all"
    ? devices.find((device) => device.id === deviceFilter) ?? null
    : null;
  const selectedTag = tagFilter !== "all"
    ? tags.find((tag) => tag.id === tagFilter) ?? null
    : null;

  const blockedCount = logs.filter((log) => log.status === "blocked").length;
  const errorCount = logs.filter((log) => log.status === "error").length;
  const flaggedCount = logs.filter((log) => log.isFlagged).length;
  const taggedCount = logs.filter((log) => (log.tags?.length || 0) > 0).length;

  const lastUpdatedLabel = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : null;

  const handleExport = () => {
    if (!activeProfileId) return;

    const params = new URLSearchParams({ profileId: activeProfileId, sortBy, sortDir });
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (flaggedOnly) params.set("flagged", "true");
    if (hideTrackers) params.set("hideTrackers", "true");
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (selectedGroupId) params.set("groupId", selectedGroupId);
    if (deviceFilter !== "all") params.set("deviceId", deviceFilter);
    if (tagFilter !== "all") params.set("tagId", tagFilter);

    const from = parseLocalDateTime(fromInput);
    const to = parseLocalDateTime(toInput);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    window.open(`/api/logs/export?${params.toString()}`, "_blank");
  };

  const applyPresetWindow = (preset: "1h" | "24h" | "7d") => {
    const nextWindow = getPresetWindow(preset);
    setFromInput(nextWindow.from);
    setToInput(nextWindow.to);
    setPage(1);
  };

  const clearLocalFilters = () => {
    setSearch("");
    setDebouncedSearch("");
    setStatusFilter("all");
    setFlaggedOnly(false);
    setHideTrackers(false);
    setDeviceFilter("all");
    setTagFilter("all");
    setSortBy("timestamp");
    setSortDir("desc");
    setFromInput("");
    setToInput("");
    setPage(1);
  };

  const toggleLiveMode = () => {
    setExpandedId(null);
    setPage(1);
    setLiveMode((current) => !current);
  };

  const activeFilters: { label: string; onRemove: () => void }[] = [];
  if (statusFilter !== "all") {
    activeFilters.push({ label: `status: ${statusFilter}`, onRemove: () => setStatusFilter("all") });
  }
  if (flaggedOnly) {
    activeFilters.push({ label: "flagged only", onRemove: () => setFlaggedOnly(false) });
  }
  if (hideTrackers) {
    activeFilters.push({ label: "trackers hidden", onRemove: () => setHideTrackers(false) });
  }
  if (debouncedSearch) {
    activeFilters.push({
      label: `search: ${debouncedSearch}`,
      onRemove: () => {
        setSearch("");
        setDebouncedSearch("");
      },
    });
  }
  if (selectedGroup) {
    activeFilters.push({
      label: `group: ${selectedGroup.name}`,
      onRemove: () => setSelectedGroup(null),
    });
  }
  if (selectedDevice) {
    activeFilters.push({
      label: `device: ${selectedDevice.name}`,
      onRemove: () => setDeviceFilter("all"),
    });
  }
  if (selectedTag) {
    activeFilters.push({
      label: `tag: ${selectedTag.name}`,
      onRemove: () => setTagFilter("all"),
    });
  }
  if (fromInput || toInput) {
    activeFilters.push({
      label: `window: ${fromInput ? new Date(fromInput).toLocaleString() : "start"} -> ${toInput ? new Date(toInput).toLocaleString() : "now"}`,
      onRemove: () => {
        setFromInput("");
        setToInput("");
      },
    });
  }
  if (sortBy !== "timestamp" || sortDir !== "desc") {
    activeFilters.push({
      label: `sort: ${sortBy} ${sortDir}`,
      onRemove: () => {
        setSortBy("timestamp");
        setSortDir("desc");
      },
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card px-4 py-3 ring-1 ring-foreground/6">
        <div className="flex items-center gap-3 min-w-0">
          <ShieldCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold tracking-tight">Query Ledger</h1>
            <div className="hidden sm:flex items-center gap-1.5 text-muted-foreground">
            <span className="text-[10px] uppercase tracking-wider">
              {total.toLocaleString()} records
            </span>
            {logs.length > 0 && (
              <span className="text-[10px]">· {logs.length} visible</span>
            )}
              {lastUpdatedLabel && (
                <span className="text-[10px]">· synced {lastUpdatedLabel}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => void fetchLogs({ background: false })} disabled={!activeProfileId || refreshing}>
            <RefreshCw className={cn("mr-1 h-3.5 w-3.5", refreshing && "animate-spin")} />
            Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={!activeProfileId}>
            <Download className="mr-1 h-3.5 w-3.5" />
            Export
          </Button>
          <Button
            variant={liveMode ? "default" : "outline"}
            size="sm"
            onClick={toggleLiveMode}
            aria-label="Toggle live mode"
          >
            <Radio className={cn("mr-1 h-3.5 w-3.5", liveMode ? "text-emerald-300" : "text-emerald-500")} />
            <span className="hidden sm:inline">{liveMode ? "Live Table On" : "Live Table"}</span>
          </Button>
          <Select value={liveInterval} onValueChange={(value) => setLiveInterval(value ?? "5000")}>
            <SelectTrigger className="h-9 w-24 rounded-xl border-border/70 bg-background" disabled={!liveMode}>
              <SelectValue placeholder="5s" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5000">5s</SelectItem>
              <SelectItem value="10000">10s</SelectItem>
              <SelectItem value="30000">30s</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="border-none ring-1 ring-foreground/8">
        <CardHeader className="gap-1 border-b border-border/70 pb-4">
          <CardTitle>Filters</CardTitle>
          <CardDescription>
            Search domain, root, client app, query type, tracker, IP, device details, tag matches, and time windows.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 pt-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-70 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search domains, devices, client app, query type, IPs..."
                className="h-10 rounded-xl border-border/70 bg-background pl-9"
              />
            </div>

            <Select value={statusFilter} onValueChange={(value) => {
              setStatusFilter(value ?? "all");
              setPage(1);
            }}>
              <SelectTrigger className="h-10 w-37.5 rounded-xl border-border/70 bg-background">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="blocked">Blocked</SelectItem>
                <SelectItem value="allowed">Allowed</SelectItem>
                <SelectItem value="relayed">Relayed</SelectItem>
                <SelectItem value="error">Error</SelectItem>
              </SelectContent>
            </Select>

            <Select value={deviceFilter} onValueChange={(value) => {
              setDeviceFilter(value ?? "all");
              setPage(1);
            }}>
              <SelectTrigger className="h-10 w-45 rounded-xl border-border/70 bg-background">
                <SelectValue placeholder="Device" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All devices</SelectItem>
                {devices.map((device) => (
                  <SelectItem key={device.id} value={device.id}>
                    {device.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={tagFilter} onValueChange={(value) => {
              setTagFilter(value ?? "all");
              setPage(1);
            }}>
              <SelectTrigger className="h-10 w-45 rounded-xl border-border/70 bg-background">
                <SelectValue placeholder="Tag" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All tags</SelectItem>
                {tags.map((tag) => (
                  <SelectItem key={tag.id} value={tag.id}>
                    {tag.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button
              variant={flaggedOnly ? "default" : "outline"}
              size="lg"
              onClick={() => {
                setFlaggedOnly(!flaggedOnly);
                setPage(1);
              }}
            >
              <AlertTriangle className="mr-1.5 h-4 w-4" />
              Flagged only
            </Button>

            <Button
              variant={hideTrackers ? "default" : "outline"}
              size="lg"
              onClick={() => {
                setHideTrackers(!hideTrackers);
                setPage(1);
              }}
            >
              {hideTrackers ? <EyeOff className="mr-1.5 h-4 w-4" /> : <Eye className="mr-1.5 h-4 w-4" />}
              {hideTrackers ? "Trackers hidden" : "Hide trackers"}
            </Button>

            <Button variant="ghost" size="lg" onClick={clearLocalFilters}>
              Clear local filters
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_180px_160px]">
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">From</p>
              <Input
                type="datetime-local"
                value={fromInput}
                onChange={(event) => {
                  setFromInput(event.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-xl border-border/70 bg-background"
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">To</p>
              <Input
                type="datetime-local"
                value={toInput}
                onChange={(event) => {
                  setToInput(event.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-xl border-border/70 bg-background"
              />
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Sort by</p>
              <Select value={sortBy} onValueChange={(value) => {
                setSortBy(value ?? "timestamp");
                setPage(1);
              }}>
                <SelectTrigger className="h-10 rounded-xl border-border/70 bg-background">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="timestamp">Timestamp</SelectItem>
                  <SelectItem value="domain">Domain</SelectItem>
                  <SelectItem value="status">Status</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">Direction</p>
              <Select value={sortDir} onValueChange={(value) => {
                setSortDir(value ?? "desc");
                setPage(1);
              }}>
                <SelectTrigger className="h-10 rounded-xl border-border/70 bg-background">
                  <SelectValue placeholder="Direction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">Newest first</SelectItem>
                  <SelectItem value="asc">Oldest first</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {([
              ["1h", "Last hour"],
              ["24h", "Today"],
              ["7d", "7 days"],
            ] as const).map(([value, label]) => (
              <Button key={value} variant="outline" size="sm" onClick={() => applyPresetWindow(value)}>
                {label}
              </Button>
            ))}
            {(fromInput || toInput) && (
              <Button variant="ghost" size="sm" onClick={() => {
                setFromInput("");
                setToInput("");
                setPage(1);
              }}>
                Clear time window
              </Button>
            )}
            {liveMode && (
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <Radio className="h-3 w-3" />
                Table refreshes in place every {Number(liveInterval) / 1000}s
              </span>
            )}
          </div>

          {activeFilters.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {activeFilters.map((filter) => (
                <button
                  key={filter.label}
                  type="button"
                  onClick={filter.onRemove}
                  className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/50 px-3 py-1 text-xs font-medium text-muted-foreground transition-colors cursor-pointer hover:bg-accent hover:text-foreground"
                >
                  {filter.label}
                  <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Visible"
          value={logs.length.toLocaleString()}
          helper="Current page rows after filters"
          tone="default"
        />
        <MetricCard
          label="Blocked + Error"
          value={`${blockedCount + errorCount}`}
          helper={`${blockedCount} blocked, ${errorCount} resolver errors`}
          tone={errorCount > blockedCount ? "error" : "blocked"}
        />
        <MetricCard
          label="Flagged"
          value={flaggedCount.toLocaleString()}
          helper="Rows matched by your flagging rules"
          tone="flagged"
        />
        <MetricCard
          label="Tagged"
          value={taggedCount.toLocaleString()}
          helper="Rows with one or more matched tags"
          tone="allowed"
        />
      </div>

      <Card className="border-none overflow-hidden ring-1 ring-foreground/8">
        <CardHeader className="gap-1 border-b border-border/70 pb-4">
          <CardTitle>Raw Query Stream</CardTitle>
          <CardDescription>
            Each row is an exact query event. Live mode refreshes this table directly and keeps the newest page pinned.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                <TableHead className="w-24 px-4 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Time</TableHead>
                <TableHead className="min-w-65 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Query</TableHead>
                <TableHead className="min-w-55 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Source</TableHead>
                <TableHead className="min-w-45 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Resolution</TableHead>
                <TableHead className="min-w-47.5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Transport</TableHead>
                <TableHead className="w-12 px-4" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 8 }).map((_, rowIndex) => (
                  <TableRow key={rowIndex}>
                    {Array.from({ length: 6 }).map((_, cellIndex) => (
                      <TableCell key={cellIndex} className="px-4 py-4">
                        <Skeleton className="h-10 w-full rounded-xl" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="px-6 py-20 text-center">
                    <div className="mx-auto flex max-w-md flex-col items-center gap-3">
                      <div className="rounded-2xl border border-border/70 bg-muted/40 p-3">
                        <Shield className="h-7 w-7 text-muted-foreground" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-medium">No matching query rows</p>
                        <p className="text-sm text-muted-foreground">
                          {activeFilters.length > 0
                            ? "Try clearing a filter or broadening your search terms."
                            : "Raw ingestion may still be warming up, or there has not been any DNS activity yet."}
                        </p>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <LogRow
                    key={log.id}
                    log={log}
                    isExpanded={expandedId === log.id}
                    onToggle={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/80 px-4 py-3">
          <div className="space-y-0.5">
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Pagination</p>
            <p className="text-sm text-foreground">
              Showing {((page - 1) * limit + 1).toLocaleString()}-
              {Math.min(page * limit, total).toLocaleString()} of {total.toLocaleString()} query rows
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page <= 1 || liveMode}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-18 text-center text-sm font-medium tabular-nums">
              {page} / {totalPages}
            </div>
            <Button
              variant="outline"
              size="icon-sm"
              disabled={page >= totalPages || liveMode}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function LogsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <Skeleton className="h-36 rounded-3xl" />
          <Skeleton className="h-32 rounded-3xl" />
          <Skeleton className="h-96 rounded-3xl" />
        </div>
      }
    >
      <LogsContent />
    </Suspense>
  );
}
