"use client";

import { useDashboardStore } from "@/stores/dashboard-store";
import { useEffect, useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  UserPlus,
  Unlink,
  Link2,
  Smartphone,
  Laptop,
  Tablet,
  Tv,
  Router,
  MonitorSmartphone,
  ChevronDown,
  BarChart2,
  Trash2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusDot } from "@/components/ui/status-dot";
import { AreaChart } from "@/components/charts/area-chart";
import { HorizontalBarChart } from "@/components/charts/bar-chart";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

interface Person {
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
  personId: string | null;
  isActive?: boolean;
  lastSeen?: string | null;
}

interface PersonAnalytics {
  stats?: { total: number; blocked: number };
  topDomains?: { domain: string; count: number }[];
  hourlyActivity?: { bucket: string; total: number }[];
  peakHours?: { hour: string; count: number }[];
  activityStreak?: { active: boolean; durationMinutes: number } | number;
  flaggedCount?: number;
}

const DEVICE_ICONS: Record<string, React.ElementType> = {
  smartphone: Smartphone,
  phone: Smartphone,
  laptop: Laptop,
  tv: Tv,
  router: Router,
  tablet: Tablet,
};

function DeviceIcon({ model, className }: { model?: string | null; className?: string }) {
  const key = Object.keys(DEVICE_ICONS).find((k) => model?.toLowerCase().includes(k));
  const Icon = key ? DEVICE_ICONS[key] : MonitorSmartphone;
  return <Icon className={cn("h-4 w-4", className)} />;
}

const PALETTE = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#14b8a6"];

function PersonAvatar({ person, size = "md" }: { person: Person; size?: "sm" | "md" | "lg" }) {
  const dims = { sm: "w-8 h-8 text-sm", md: "w-10 h-10 text-base", lg: "w-14 h-14 text-xl" };
  return (
    <div
      className={cn("rounded-full flex items-center justify-center font-bold text-white shrink-0", dims[size])}
      style={{ backgroundColor: person.color || "#6366f1" }}
    >
      {person.icon || person.name[0].toUpperCase()}
    </div>
  );
}

function PersonAnalyticsPanel({ person }: { person: Person }) {
  const [analytics, setAnalytics] = useState<PersonAnalytics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/persons/${person.id}/analytics`)
      .then((r) => r.json())
      .then((data) => {
        setAnalytics(data);
        setLoading(false);
      })
      .catch(() => {
        setAnalytics(null);
        setLoading(false);
      });
  }, [person.id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-40" />
        <Skeleton className="h-32" />
      </div>
    );
  }

  const hourlyData = (analytics?.hourlyActivity ?? []).map((d) => {
    const bucket = d.bucket ?? "";
    const label = bucket.length >= 13 ? `${bucket.slice(11)}:00` : bucket.slice(5) || bucket;
    return { hour: label, total: d.total };
  });

  return (
    <motion.div
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-5"
    >
      <div className="flex items-center gap-3">
        <PersonAvatar person={person} size="lg" />
        <div>
          <h3 className="font-bold text-lg">{person.name}</h3>
          <div className="flex items-center gap-2 mt-0.5">
            <StatusDot active={person.isActive ?? false} showLabel size="sm" />
          </div>
        </div>
      </div>

      {/* Mini stats */}
      {analytics && (
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Queries", value: analytics.stats?.total ?? 0 },
            { label: "Blocked", value: analytics.stats?.blocked ?? 0 },
            { label: "Flagged", value: analytics.flaggedCount ?? 0 },
          ].map((s) => (
            <div key={s.label} className="rounded-lg border p-3 text-center">
              <div className="text-xl font-bold tabular-nums">{s.value.toLocaleString()}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Activity chart */}
      {hourlyData.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">24h Activity</h4>
          <AreaChart
            data={hourlyData}
            index="hour"
            series={[{ key: "total", color: person.color || "var(--chart-1)", label: "Queries" }]}
            height={120}
            showLegend={false}
          />
        </div>
      )}

      {/* Top domains */}
      {analytics?.topDomains && analytics.topDomains.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Top Domains</h4>
          <HorizontalBarChart
            data={analytics.topDomains.slice(0, 5).map((d) => ({
              label: d.domain,
              value: d.count,
              color: person.color || "var(--chart-1)",
            }))}
          />
        </div>
      )}

      {analytics?.activityStreak && typeof analytics.activityStreak === "object" && analytics.activityStreak.active && (
        <p className="text-xs text-muted-foreground">
          Active — <span className="font-medium text-foreground">{Math.round(analytics.activityStreak.durationMinutes)}m</span> this session
        </p>
      )}
    </motion.div>
  );
}

export default function PeoplePage() {
  const { activeProfileId } = useDashboardStore();
  const [persons, setPersons] = useState<Person[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [creating, setCreating] = useState(false);

  const loadData = useCallback(async () => {
    if (!activeProfileId) return;
    try {
      const [pRes, dRes] = await Promise.all([
        fetch(`/api/persons?profileId=${activeProfileId}`),
        fetch(`/api/devices?profileId=${activeProfileId}`),
      ]);
      const pData = await pRes.json();
      const dData = await dRes.json();
      setPersons(pData.persons || []);
      setDevices(dData.devices || []);
    } catch {}
    setLoading(false);
  }, [activeProfileId]);

  useEffect(() => {
    if (!activeProfileId) {
      const t = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(t);
    }
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfileId]);

  const createPerson = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    await fetch("/api/persons", {
      method: "POST",
      body: JSON.stringify({ name: newName.trim(), color: newColor }),
      headers: { "Content-Type": "application/json" },
    });
    setNewName("");
    setNewColor(PALETTE[0]);
    setCreateOpen(false);
    setCreating(false);
    await loadData();
  };

  const deletePerson = async (id: string) => {
    await fetch(`/api/persons/${id}`, { method: "DELETE" });
    if (selectedPerson?.id === id) setSelectedPerson(null);
    await loadData();
  };

  const assignDevice = async (deviceId: string, personId: string | null) => {
    await fetch(`/api/devices/${deviceId}`, {
      method: "PATCH",
      body: JSON.stringify({ personId }),
      headers: { "Content-Type": "application/json" },
    });
    // Optimistic update
    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, personId } : d))
    );
  };

  const unassigned = devices.filter((d) => !d.personId);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-40" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36" />)}
        </div>
        <Skeleton className="h-48" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">People</h1>
          <p className="text-sm text-muted-foreground">{persons.length} people · {devices.length} devices</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger render={<Button />}>
            <UserPlus className="h-4 w-4 mr-2" />Add Person
          </DialogTrigger>
          <DialogContent className="max-w-sm">
            <DialogHeader><DialogTitle>Create Person</DialogTitle></DialogHeader>
            <div className="space-y-4 mt-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  placeholder="e.g. Kids, Work"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && createPerson()}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Color</Label>
                <div className="flex gap-2 flex-wrap">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      className={cn(
                        "w-7 h-7 rounded-full transition-all ring-offset-2 ring-offset-background",
                        newColor === c ? "ring-2 ring-ring scale-110" : "hover:scale-105"
                      )}
                      style={{ backgroundColor: c }}
                      onClick={() => setNewColor(c)}
                      aria-label={`Color ${c}`}
                    />
                  ))}
                </div>
              </div>
              {newName && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                    style={{ backgroundColor: newColor }}
                  >
                    {newName[0].toUpperCase()}
                  </div>
                  Preview: {newName}
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button onClick={createPerson} disabled={!newName.trim() || creating} className="flex-1">
                  {creating ? "Creating..." : "Create"}
                </Button>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Left: People + Devices */}
        <div className="xl:col-span-2 space-y-6">
          {/* People Grid */}
          {persons.length === 0 ? (
            <Card className="p-12 text-center">
              <UserPlus className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <h3 className="font-semibold mb-1">No people yet</h3>
              <p className="text-sm text-muted-foreground mb-4">Create a person to start grouping devices and tracking individual activity.</p>
              <Button onClick={() => setCreateOpen(true)}>Add First Person</Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {persons.map((person) => {
                const personDevices = devices.filter((d) => d.personId === person.id);
                const isSelected = selectedPerson?.id === person.id;
                return (
                  <motion.div
                    key={person.id}
                    whileHover={{ y: -2 }}
                    transition={{ duration: 0.15 }}
                  >
                    <Card
                      className={cn(
                        "p-4 cursor-pointer transition-all",
                        isSelected ? "ring-2 ring-primary" : "hover:shadow-md"
                      )}
                      onClick={() => setSelectedPerson(isSelected ? null : person)}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          <PersonAvatar person={person} />
                          <div>
                            <p className="font-semibold leading-tight">{person.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <StatusDot active={person.isActive ?? false} size="sm" />
                              <span className="text-xs text-muted-foreground">
                                {personDevices.length} device{personDevices.length !== 1 ? "s" : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={<Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100" onClick={(e) => e.stopPropagation()} />}
                          >
                            <ChevronDown className="h-3.5 w-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={(e) => { e.stopPropagation(); deletePerson(person.id); }}
                              className="text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-2" />
                              Delete person
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                      {personDevices.length > 0 && (
                        <div className="space-y-1">
                          {personDevices.slice(0, 3).map((d) => (
                            <div key={d.id} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                              <DeviceIcon model={d.model} className="text-muted-foreground shrink-0" />
                              <span className="truncate">{d.name}</span>
                            </div>
                          ))}
                          {personDevices.length > 3 && (
                            <p className="text-xs text-muted-foreground">+{personDevices.length - 3} more</p>
                          )}
                        </div>
                      )}
                    </Card>
                  </motion.div>
                );
              })}
            </div>
          )}

          {/* Device Pool */}
          <div>
            <h2 className="text-sm font-semibold mb-3">Device Pool</h2>

            {/* Assigned devices grouped by person */}
            {persons.map((person) => {
              const personDevices = devices.filter((d) => d.personId === person.id);
              if (personDevices.length === 0) return null;
              return (
                <div key={person.id} className="mb-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: person.color || "#6366f1" }} />
                    <span className="text-xs font-medium text-muted-foreground">{person.name}</span>
                  </div>
                  <div className="space-y-1">
                    {personDevices.map((device) => (
                      <DeviceRow
                        key={device.id}
                        device={device}
                        persons={persons}
                        onAssign={(personId) => assignDevice(device.id, personId)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {/* Unassigned */}
            {unassigned.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1.5">Unassigned</p>
                <div className="space-y-1">
                  {unassigned.map((device) => (
                    <DeviceRow
                      key={device.id}
                      device={device}
                      persons={persons}
                      onAssign={(personId) => assignDevice(device.id, personId)}
                    />
                  ))}
                </div>
              </div>
            )}

            {devices.length === 0 && (
              <Card className="p-8 text-center">
                <MonitorSmartphone className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No devices discovered yet. DNS queries will auto-register devices.</p>
              </Card>
            )}
          </div>
        </div>

        {/* Right: Analytics panel */}
        <div className="xl:col-span-1">
          <Card className="p-5 sticky top-20">
            {selectedPerson && activeProfileId ? (
              <PersonAnalyticsPanel person={selectedPerson} />
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <BarChart2 className="h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm font-medium">Select a person</p>
                <p className="text-xs text-muted-foreground mt-1">Click a person card to view their analytics</p>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function DeviceRow({
  device,
  persons,
  onAssign,
}: {
  device: Device;
  persons: Person[];
  onAssign: (personId: string | null) => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border px-3 py-2 bg-card hover:bg-accent/30 transition-colors">
      <DeviceIcon model={device.model} className="text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{device.name}</p>
        <div className="flex items-center gap-2">
          {device.localIp && (
            <span className="text-[10px] font-mono text-muted-foreground">{device.localIp}</span>
          )}
          {device.lastSeen && (
            <span className="text-[10px] text-muted-foreground">
              {new Date(device.lastSeen).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
        </div>
      </div>
      <StatusDot active={device.isActive ?? false} size="sm" />
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" />}>
          {device.personId ? (
            <>
              <Link2 className="h-3 w-3" />
              Reassign
            </>
          ) : (
            <>
              <Link2 className="h-3 w-3" />
              Assign
            </>
          )}
          <ChevronDown className="h-3 w-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {persons.map((p) => (
            <DropdownMenuItem
              key={p.id}
              onClick={() => onAssign(p.id)}
              className={cn("gap-2", device.personId === p.id && "bg-accent")}
            >
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color || "#6366f1" }} />
              {p.name}
            </DropdownMenuItem>
          ))}
          {device.personId && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onAssign(null)} className="text-destructive gap-2">
                <Unlink className="h-3.5 w-3.5" />
                Unassign
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
