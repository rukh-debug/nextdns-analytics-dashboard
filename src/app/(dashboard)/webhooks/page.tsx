"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Clock,
  Globe,
  Monitor,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2,
  Webhook,
  Wifi,
  WifiOff,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/stores/dashboard-store";

interface Tag {
  id: string;
  name: string;
  slug: string;
  color?: string | null;
}

interface WebhookEntry {
  id: string;
  name: string;
  url: string;
  secret?: string | null;
  triggers: string[];
  isActive?: boolean | null;
  cooldownMinutes?: number | null;
  deviceGapSeconds?: number | null;
  tags?: Tag[];
  tagIds?: string[];
  deviceIds?: string[];
  lastTriggeredAt?: string | null;
  createdAt?: string | null;
}

interface WebhookDevice {
  id: string;
  name: string;
  model: string | null;
  localIp: string | null;
  status: string;
}

const ALERT_TRIGGERS = [
  { id: "flagged", label: "Flagged domains" },
  { id: "new_device", label: "New device" },
  { id: "volume_spike", label: "Volume spike" },
] as const;

const DEVICE_TRIGGERS = [
  { id: "device_online", label: "Device online" },
  { id: "device_offline", label: "Device offline" },
] as const;

const TRIGGER_LABEL: Record<string, string> = {
  flagged: "Flagged domains",
  new_device: "New device",
  volume_spike: "Volume spike",
  device_online: "Device online",
  device_offline: "Device offline",
};

const COOLDOWN_PRESETS = [
  { label: "Off", value: 0 },
  { label: "5 min", value: 5 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hr", value: 60 },
  { label: "Custom", value: -1 },
];

const GAP_PRESETS = [
  { label: "30 min", value: 1800 },
  { label: "1 hr", value: 3600 },
  { label: "2 hr", value: 7200 },
  { label: "6 hr", value: 21600 },
  { label: "12 hr", value: 43200 },
  { label: "24 hr", value: 86400 },
] as const;

function TagChip({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick?: () => void;
  color?: string | null;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors cursor-pointer",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      )}
    >
      {color ? <span className="mr-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: color }} /> : null}
      {label}
    </button>
  );
}

function formatCooldown(minutes: number | null | undefined): string {
  if (!minutes || minutes <= 0) return "Off";
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
}

function formatDurationSeconds(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "Off";
  if (seconds < 3_600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3_600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}

function hasFlaggedTrigger(triggers: string[]): boolean {
  return triggers.includes("flagged");
}

function hasDeviceTrigger(triggers: string[]): boolean {
  return triggers.includes("device_online") || triggers.includes("device_offline");
}

function getTriggerBadgeClass(trigger: string): string {
  if (trigger === "flagged") {
    return "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300";
  }
  if (trigger === "device_online") {
    return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (trigger === "device_offline") {
    return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  return "border-border bg-muted/50 text-foreground";
}

function formatLastTriggered(iso?: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  if (diffMs < 60_000) return "Just now";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

type WebhookFormData = {
  name: string;
  url: string;
  secret: string;
  triggers: string[];
  tagIds: string[];
  cooldownMinutes: number;
  deviceIds: string[];
  deviceGapSeconds: number;
};

const emptyForm: WebhookFormData = {
  name: "",
  url: "",
  secret: "",
  triggers: ["flagged"],
  tagIds: [],
  cooldownMinutes: 5,
  deviceIds: [],
  deviceGapSeconds: 1800,
};

export default function WebhooksPage() {
  const { activeProfileId } = useDashboardStore();
  const [webhooks, setWebhooks] = useState<WebhookEntry[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [devices, setDevices] = useState<WebhookDevice[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WebhookFormData>({ ...emptyForm });
  const [customCooldown, setCustomCooldown] = useState(false);
  const [customGap, setCustomGap] = useState(false);
  const [deviceQuery, setDeviceQuery] = useState("");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadData = async () => {
    const [wRes, tRes, dRes] = await Promise.all([
      fetch("/api/webhooks"),
      fetch("/api/tags"),
      activeProfileId
        ? fetch(`/api/devices?profileId=${encodeURIComponent(activeProfileId)}`)
        : Promise.resolve(null),
    ]);
    const wData = await wRes.json();
    const tData = await tRes.json();
    setWebhooks(wData.webhooks || []);
    setTags(tData.tags || []);
    if (!activeProfileId) {
      setDevices([]);
    } else if (dRes?.ok) {
      try {
        const devData = await dRes.json();
        setDevices(devData.devices || []);
      } catch { /* device list is optional */ }
    }
  };

  useEffect(() => {
    loadData().catch(() => toast.error("Failed to load webhooks"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProfileId]);

  const toggleTrigger = (trigger: string) => {
    setForm((prev) => ({
      ...prev,
      triggers: prev.triggers.includes(trigger)
        ? prev.triggers.filter((t) => t !== trigger)
        : [...prev.triggers, trigger],
    }));
  };

  const toggleTag = (tagId: string) => {
    setForm((prev) => ({
      ...prev,
      tagIds: prev.tagIds.includes(tagId)
        ? prev.tagIds.filter((t) => t !== tagId)
        : [...prev.tagIds, tagId],
    }));
  };

  const toggleDevice = (deviceId: string) => {
    setForm((prev) => ({
      ...prev,
      deviceIds: prev.deviceIds.includes(deviceId)
        ? prev.deviceIds.filter((id) => id !== deviceId)
        : [...prev.deviceIds, deviceId],
    }));
  };

  const openCreate = () => {
    setForm({ ...emptyForm });
    setCustomCooldown(false);
    setCustomGap(false);
    setDeviceQuery("");
    setEditingId(null);
    setCreateOpen(true);
    setEditOpen(false);
  };

  const openEdit = (webhook: WebhookEntry) => {
    const gapSeconds = webhook.deviceGapSeconds ?? 1800;
    setForm({
      name: webhook.name,
      url: webhook.url,
      secret: webhook.secret ?? "",
      triggers: [...webhook.triggers],
      tagIds: webhook.tagIds ?? [],
      cooldownMinutes: webhook.cooldownMinutes ?? 5,
      deviceIds: webhook.deviceIds ?? [],
      deviceGapSeconds: gapSeconds,
    });
    const isPreset = COOLDOWN_PRESETS.some(
      (p) => p.value === (webhook.cooldownMinutes ?? 5) && p.value > 0
    );
    setCustomCooldown(!isPreset && (webhook.cooldownMinutes ?? 5) > 0);
    const isGapPreset = GAP_PRESETS.some((p) => p.value === gapSeconds);
    setCustomGap(!isGapPreset);
    setDeviceQuery("");
    setEditingId(webhook.id);
    setCreateOpen(false);
    setEditOpen(true);
  };

  const createWebhook = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          url: form.url,
          secret: form.secret.trim() || null,
          triggers: form.triggers,
          tagIds: form.tagIds,
          deviceIds: form.deviceIds,
          deviceGapSeconds: form.deviceGapSeconds,
          cooldownMinutes: form.cooldownMinutes,
        }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create webhook");
      setCreateOpen(false);
      await loadData();
      toast.success("Webhook created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create webhook");
    } finally {
      setSaving(false);
    }
  };

  const updateWebhook = async () => {
    if (!editingId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/webhooks/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          url: form.url,
          secret: form.secret.trim() || null,
          triggers: form.triggers,
          tagIds: form.tagIds,
          deviceIds: form.deviceIds,
          deviceGapSeconds: form.deviceGapSeconds,
          cooldownMinutes: form.cooldownMinutes,
        }),
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update webhook");
      setEditOpen(false);
      setEditingId(null);
      await loadData();
      toast.success("Webhook updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update webhook");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (webhook: WebhookEntry) => {
    const next = !webhook.isActive;
    setTogglingId(webhook.id);
    try {
      const res = await fetch(`/api/webhooks/${webhook.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: next }),
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error("Failed to toggle webhook");
      setWebhooks((prev) =>
        prev.map((w) => (w.id === webhook.id ? { ...w, isActive: next } : w))
      );
      toast.success(next ? "Webhook enabled" : "Webhook disabled");
    } catch {
      toast.error("Failed to toggle webhook");
    } finally {
      setTogglingId(null);
    }
  };

  const deleteWebhook = async (id: string) => {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/webhooks/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete webhook");
      setWebhooks((prev) => prev.filter((w) => w.id !== id));
      toast.success("Webhook deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete webhook");
    } finally {
      setDeletingId(null);
    }
  };

  const renderForm = () => {
    const flaggedEnabled = hasFlaggedTrigger(form.triggers);
    const deviceEnabled = hasDeviceTrigger(form.triggers);
    const normalizedDeviceQuery = deviceQuery.trim().toLowerCase();
    const filteredDevices = devices.filter((device) => {
      if (!normalizedDeviceQuery) return true;
      return [device.name, device.model, device.localIp]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalizedDeviceQuery));
    });
    const selectedDevices = devices.filter((device) => form.deviceIds.includes(device.id));
    const allShownSelected =
      filteredDevices.length > 0 && filteredDevices.every((device) => form.deviceIds.includes(device.id));
    return (
      <ScrollArea className="max-h-[68vh] pr-3">
        <div className="space-y-4 mt-2 pb-1">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              placeholder="Slack alerts"
              className="h-9 text-sm"
              value={form.name}
              onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Endpoint URL</Label>
            <Input
              placeholder="https://..."
              className="h-9 text-sm font-mono"
              value={form.url}
              onChange={(e) => setForm((prev) => ({ ...prev, url: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Signing secret</Label>
            <Input
              placeholder="Optional HMAC secret"
              className="h-9 text-sm"
              value={form.secret}
              onChange={(e) => setForm((prev) => ({ ...prev, secret: e.target.value }))}
            />
          </div>

          {/* Triggers — two visual groups */}
          <div className="space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-3">
              <Label>Triggers</Label>
              <span className="text-xs text-muted-foreground">
                Choose one or combine multiple events
              </span>
            </div>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Alert events
                </p>
                <div className="flex gap-2 flex-wrap">
                  {ALERT_TRIGGERS.map((trigger) => (
                    <TagChip
                      key={trigger.id}
                      label={trigger.label}
                      active={form.triggers.includes(trigger.id)}
                      onClick={() => toggleTrigger(trigger.id)}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Device events
                </p>
                <div className="flex gap-2 flex-wrap">
                  {DEVICE_TRIGGERS.map((trigger) => (
                    <TagChip
                      key={trigger.id}
                      label={trigger.label}
                      active={form.triggers.includes(trigger.id)}
                      onClick={() => toggleTrigger(trigger.id)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          {flaggedEnabled ? (
            <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <Label>Flagged-domain settings</Label>
                  <p className="text-xs text-muted-foreground">
                    Scope flagged events with tags and control duplicate alerts by root domain.
                  </p>
                </div>
                <span className="rounded-full bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground">
                  Applies only to flagged domains
                </span>
              </div>

              <div className="space-y-2">
                <Label className="text-sm">Included tags</Label>
                <p className="text-xs text-muted-foreground">
                  Leave empty to receive every flagged event. Choose tags only if this endpoint should handle a narrower slice.
                </p>
                <div className="flex gap-2 flex-wrap">
                  {tags.map((tag) => (
                    <TagChip
                      key={tag.id}
                      label={tag.name}
                      active={form.tagIds.includes(tag.id)}
                      onClick={() => toggleTag(tag.id)}
                      color={tag.color}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm">Cooldown</Label>
                  <span className="text-xs text-muted-foreground">
                    Current: {formatCooldown(form.cooldownMinutes)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Skip duplicate webhooks for the same root domain within this window. Set to 0 to send every flagged alert.
                </p>
                <div className="flex gap-2 flex-wrap">
                  {COOLDOWN_PRESETS.map((preset) => (
                    <TagChip
                      key={preset.label}
                      label={preset.label}
                      active={
                        preset.value === -1
                          ? customCooldown
                          : !customCooldown && form.cooldownMinutes === preset.value
                      }
                      onClick={() => {
                        if (preset.value === -1) {
                          setCustomCooldown(true);
                          setForm((prev) => ({ ...prev, cooldownMinutes: 10 }));
                        } else {
                          setCustomCooldown(false);
                          setForm((prev) => ({ ...prev, cooldownMinutes: preset.value }));
                        }
                      }}
                    />
                  ))}
                </div>
                {customCooldown && (
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      type="number"
                      min={1}
                      max={1440}
                      value={form.cooldownMinutes}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          cooldownMinutes: Math.max(1, Math.min(1440, parseInt(e.target.value) || 1)),
                        }))
                      }
                      className="h-9 w-24 text-sm"
                    />
                    <span className="text-xs text-muted-foreground">minutes (1–1440)</span>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border/60 bg-muted/10 px-3 py-2.5">
              <p className="text-xs text-muted-foreground">
                Tag scoping and root-domain cooldown stay hidden until <span className="font-medium text-foreground">Flagged domains</span> is enabled.
              </p>
            </div>
          )}

          {deviceEnabled && (
            <div className="space-y-4 rounded-xl border border-border/60 bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5">
                    <Monitor className="h-3.5 w-3.5 text-muted-foreground" />
                    <Label>Device-state monitoring</Label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Leave the device list empty to watch every device in the active profile, or target only the devices this endpoint cares about.
                  </p>
                </div>
                <span className="rounded-full bg-background px-2 py-1 text-[10px] font-medium text-muted-foreground">
                  {form.deviceIds.length === 0 ? "All devices" : `${form.deviceIds.length} selected`}
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <Label className="text-sm">Monitored devices</Label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() =>
                        setForm((prev) => ({
                          ...prev,
                          deviceIds: Array.from(new Set([...prev.deviceIds, ...filteredDevices.map((device) => device.id)])),
                        }))
                      }
                      disabled={filteredDevices.length === 0 || allShownSelected}
                    >
                      Select shown
                    </button>
                    <button
                      type="button"
                      className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => setForm((prev) => ({ ...prev, deviceIds: [] }))}
                      disabled={form.deviceIds.length === 0}
                    >
                      Clear
                    </button>
                  </div>
                </div>

                {activeProfileId ? (
                  <>
                    <Input
                      placeholder="Filter devices by name, model, or IP"
                      className="h-9 text-sm"
                      value={deviceQuery}
                      onChange={(e) => setDeviceQuery(e.target.value)}
                    />
                    {selectedDevices.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        Selected: {selectedDevices.slice(0, 4).map((device) => device.name).join(", ")}
                        {selectedDevices.length > 4 ? ` +${selectedDevices.length - 4} more` : ""}
                      </p>
                    )}
                    {filteredDevices.length === 0 ? (
                      <p className="text-xs text-muted-foreground italic">
                        No devices match this filter.
                      </p>
                    ) : (
                      <div className="grid gap-2 sm:grid-cols-2">
                        {filteredDevices.map((device) => {
                          const active = form.deviceIds.includes(device.id);
                          return (
                            <button
                              key={device.id}
                              type="button"
                              onClick={() => toggleDevice(device.id)}
                              className={cn(
                                "flex min-w-0 flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-colors",
                                active
                                  ? "border-primary bg-primary/10 shadow-sm"
                                  : "border-border bg-background hover:border-border/80 hover:bg-muted/40"
                              )}
                            >
                              <span className="flex w-full items-center gap-2">
                                <span
                                  className={cn(
                                    "h-2.5 w-2.5 rounded-full shrink-0",
                                    device.status === "active" ? "bg-emerald-500" : "bg-amber-400"
                                  )}
                                />
                                <span className="truncate text-sm font-medium">{device.name}</span>
                              </span>
                              <span className="mt-1 w-full truncate text-[11px] text-muted-foreground">
                                {device.model ?? device.localIp ?? (device.status === "active" ? "Active now" : "Seen before")}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Pick an active profile before targeting specific devices.
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label className="text-sm">Offline gap</Label>
                  <span className="text-xs text-muted-foreground">
                    Current: {formatDurationSeconds(form.deviceGapSeconds)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  How long a device must stay quiet before it is considered offline. The same threshold is used to debounce the next online event.
                </p>
                <div className="flex gap-2 flex-wrap">
                  {GAP_PRESETS.map((preset) => (
                    <TagChip
                      key={preset.value}
                      label={preset.label}
                      active={!customGap && form.deviceGapSeconds === preset.value}
                      onClick={() => {
                        setCustomGap(false);
                        setForm((prev) => ({ ...prev, deviceGapSeconds: preset.value }));
                      }}
                    />
                  ))}
                  <TagChip
                    label="Custom"
                    active={customGap}
                    onClick={() => setCustomGap(true)}
                  />
                </div>
                {customGap && (
                  <div className="flex items-center gap-2 mt-2">
                    <Input
                      type="number"
                      min={60}
                      max={86400}
                      value={form.deviceGapSeconds}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          deviceGapSeconds: Math.max(60, Math.min(86400, parseInt(e.target.value) || 60)),
                        }))
                      }
                      className="h-9 w-28 text-sm"
                    />
                    <span className="text-xs text-muted-foreground">seconds (60–86400)</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    );
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Webhooks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Send alert and device-state events to Slack, Discord, or any HTTP endpoint.
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          Add Webhook
        </Button>
      </div>

      {webhooks.length > 0 ? (
        <Card className="p-0 overflow-hidden">
          <div className="divide-y">
            {webhooks.map((webhook) => {
              const isActive = webhook.isActive !== false;
              const isToggling = togglingId === webhook.id;
              const isDeleting = deletingId === webhook.id;
              const showsFlaggedDetails = hasFlaggedTrigger(webhook.triggers);
              const showsDeviceDetails = hasDeviceTrigger(webhook.triggers);
              const linkedDevices = (webhook.deviceIds ?? [])
                .map((deviceId) => devices.find((device) => device.id === deviceId)?.name)
                .filter((value): value is string => Boolean(value));
              const deviceGap = webhook.deviceGapSeconds ?? 1800;
              return (
                <div
                  key={webhook.id}
                  className={cn(
                    "flex items-start justify-between px-4 py-3 gap-3 transition-opacity",
                    !isActive && "opacity-60"
                  )}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {/* Enable/Disable toggle */}
                    <button
                      type="button"
                      onClick={() => toggleActive(webhook)}
                      disabled={isToggling}
                      className={cn(
                        "mt-1 flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-colors cursor-pointer disabled:cursor-not-allowed",
                        isActive
                          ? "bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20"
                          : "bg-muted text-muted-foreground hover:bg-muted/80"
                      )}
                      aria-label={isActive ? "Disable webhook" : "Enable webhook"}
                      title={isActive ? "Click to disable" : "Click to enable"}
                    >
                      {isToggling ? (
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : isActive ? (
                        <Power className="h-4 w-4" />
                      ) : (
                        <PowerOff className="h-4 w-4" />
                      )}
                    </button>

                    <div className="min-w-0 space-y-1.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium truncate">{webhook.name}</p>
                          <span
                            className={cn(
                              "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                              isActive
                                ? "bg-emerald-500/10 text-emerald-600"
                                : "bg-muted text-muted-foreground"
                            )}
                          >
                            {isActive ? "Active" : "Disabled"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground font-mono truncate max-w-[320px]">
                          {webhook.url}
                        </p>
                      </div>

                      <div className="flex gap-1 flex-wrap">
                        {webhook.triggers.map((trigger) => (
                          <span
                            key={trigger}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                              getTriggerBadgeClass(trigger)
                            )}
                          >
                            {trigger === "device_online" && <Wifi className="h-2.5 w-2.5" />}
                            {trigger === "device_offline" && <WifiOff className="h-2.5 w-2.5" />}
                            {TRIGGER_LABEL[trigger] ?? trigger}
                          </span>
                        ))}
                      </div>

                      {showsFlaggedDetails && webhook.tags?.length ? (
                        <div className="flex gap-1 flex-wrap">
                          {webhook.tags.map((tag) => (
                            <TagChip key={tag.id} label={tag.name} active color={tag.color} />
                          ))}
                        </div>
                      ) : null}

                      {showsFlaggedDetails && !webhook.tags?.length ? (
                        <p className="text-[11px] text-muted-foreground">Applies to all flagged tags.</p>
                      ) : null}

                      {/* Device info — only for webhooks with device triggers */}
                      {showsDeviceDetails && (
                        <div className="flex flex-col gap-0.5">
                          {linkedDevices.length > 0 ? (
                            <p className="text-[11px] text-muted-foreground">
                              Devices: {linkedDevices.slice(0, 4).join(", ")}
                              {linkedDevices.length > 4 ? ` +${linkedDevices.length - 4} more` : ""}
                            </p>
                          ) : (
                            <p className="text-[11px] text-muted-foreground">Devices: All devices in the active profile.</p>
                          )}
                        </div>
                      )}

                      {/* Metadata row: cooldown + gap (if device trigger) + last triggered */}
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                        {showsFlaggedDetails && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Cooldown: {formatCooldown(webhook.cooldownMinutes)}
                          </span>
                        )}
                        {showsDeviceDetails && (
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Gap: {formatDurationSeconds(deviceGap)}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1">
                          <Globe className="h-3 w-3" />
                          Last: {formatLastTriggered(webhook.lastTriggeredAt)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                      onClick={() => openEdit(webhook)}
                      aria-label="Edit webhook"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteWebhook(webhook.id)}
                      disabled={isDeleting}
                      aria-label="Delete webhook"
                    >
                      {isDeleting ? (
                        <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-dashed">
          <Webhook className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No webhooks configured</p>
          <p className="text-xs text-muted-foreground mt-1">
            Create a webhook to receive flagged alerts, new devices, and device state changes.
          </p>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>New Webhook</DialogTitle>
            <DialogDescription>
              Choose the events to send and scope flagged or device-state webhooks only when needed.
            </DialogDescription>
          </DialogHeader>
          {renderForm()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={saving}>Cancel</Button>
            <Button
              onClick={createWebhook}
              disabled={saving || !form.name.trim() || !form.url.trim() || form.triggers.length === 0}
            >
              {saving ? "Saving..." : "Create Webhook"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Webhook</DialogTitle>
            <DialogDescription>
              Update the endpoint, event mix, and any flagged-device scoping rules.
            </DialogDescription>
          </DialogHeader>
          {renderForm()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>Cancel</Button>
            <Button
              onClick={updateWebhook}
              disabled={saving || !form.name.trim() || !form.url.trim() || form.triggers.length === 0}
            >
              {saving ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
