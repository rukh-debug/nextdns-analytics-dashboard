"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Clock,
  Globe,
  Pencil,
  Plus,
  Power,
  PowerOff,
  Trash2,
  Webhook,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

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
  tags?: Tag[];
  tagIds?: string[];
  lastTriggeredAt?: string | null;
  createdAt?: string | null;
}

const WEBHOOK_TRIGGERS = [
  { id: "flagged", label: "Flagged domains" },
  { id: "new_device", label: "New device" },
  { id: "volume_spike", label: "Volume spike" },
] as const;

const COOLDOWN_PRESETS = [
  { label: "Off", value: 0 },
  { label: "5 min", value: 5 },
  { label: "15 min", value: 15 },
  { label: "30 min", value: 30 },
  { label: "1 hr", value: 60 },
  { label: "Custom", value: -1 },
];

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
        "inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors",
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
};

const emptyForm: WebhookFormData = {
  name: "",
  url: "",
  secret: "",
  triggers: ["flagged"],
  tagIds: [],
  cooldownMinutes: 5,
};

export default function WebhooksPage() {
  const [webhooks, setWebhooks] = useState<WebhookEntry[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<WebhookFormData>({ ...emptyForm });
  const [customCooldown, setCustomCooldown] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadData = async () => {
    const [wRes, tRes] = await Promise.all([
      fetch("/api/webhooks"),
      fetch("/api/tags"),
    ]);
    const wData = await wRes.json();
    const tData = await tRes.json();
    setWebhooks(wData.webhooks || []);
    setTags(tData.tags || []);
  };

  useEffect(() => {
    loadData().catch(() => toast.error("Failed to load webhooks"));
  }, []);

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

  const openCreate = () => {
    setForm({ ...emptyForm });
    setCustomCooldown(false);
    setEditingId(null);
    setCreateOpen(true);
    setEditOpen(false);
  };

  const openEdit = (webhook: WebhookEntry) => {
    setForm({
      name: webhook.name,
      url: webhook.url,
      secret: webhook.secret ?? "",
      triggers: [...webhook.triggers],
      tagIds: webhook.tagIds ?? [],
      cooldownMinutes: webhook.cooldownMinutes ?? 5,
    });
    const isPreset = COOLDOWN_PRESETS.some(
      (p) => p.value === (webhook.cooldownMinutes ?? 5) && p.value > 0
    );
    setCustomCooldown(!isPreset && (webhook.cooldownMinutes ?? 5) > 0);
    setEditingId(webhook.id);
    setCreateOpen(false);
    setEditOpen(true);
  };

  const createWebhook = async () => {
    try {
      const res = await fetch("/api/webhooks", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          url: form.url,
          secret: form.secret.trim() || null,
          triggers: form.triggers,
          tagIds: form.tagIds,
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
    }
  };

  const updateWebhook = async () => {
    if (!editingId) return;
    try {
      const res = await fetch(`/api/webhooks/${editingId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          url: form.url,
          secret: form.secret.trim() || null,
          triggers: form.triggers,
          tagIds: form.tagIds,
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

  const renderForm = () => (
    <div className="space-y-4 mt-2">
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
      <div className="space-y-2">
        <Label>Triggers</Label>
        <div className="flex gap-2 flex-wrap">
          {WEBHOOK_TRIGGERS.map((trigger) => (
            <TagChip
              key={trigger.id}
              label={trigger.label}
              active={form.triggers.includes(trigger.id)}
              onClick={() => toggleTrigger(trigger.id)}
            />
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Flagged-event tags</Label>
        <p className="text-xs text-muted-foreground">
          Leave empty to receive all flagged events. Selected tags only apply to the `flagged` trigger.
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
        <div className="flex items-center justify-between">
          <Label>Cooldown</Label>
          <span className="text-xs text-muted-foreground">
            Deduplicate by root domain
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          Skip duplicate webhooks for the same root domain within this window. Set to 0 to send every alert.
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
  );

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Webhooks</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Send selected alert events to Slack, Discord, or any HTTP endpoint.
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
                        "mt-1 flex h-8 w-8 items-center justify-center rounded-lg shrink-0 transition-colors",
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
                            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium border status-default"
                          >
                            {trigger}
                          </span>
                        ))}
                      </div>

                      {webhook.tags?.length ? (
                        <div className="flex gap-1 flex-wrap">
                          {webhook.tags.map((tag) => (
                            <TagChip key={tag.id} label={tag.name} active color={tag.color} />
                          ))}
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">Applies to all tags for flagged events.</p>
                      )}

                      {/* Metadata row: cooldown + last triggered */}
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          Cooldown: {formatCooldown(webhook.cooldownMinutes)}
                        </span>
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
            Create a webhook to receive tagged alerts and operational events.
          </p>
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Webhook</DialogTitle>
            <DialogDescription>
              Choose the events to send and optionally limit flagged events to specific tags.
            </DialogDescription>
          </DialogHeader>
          {renderForm()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button
              onClick={createWebhook}
              disabled={!form.name.trim() || !form.url.trim() || form.triggers.length === 0}
            >
              Create Webhook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Webhook</DialogTitle>
            <DialogDescription>
              Update the endpoint, triggers, and cooldown settings.
            </DialogDescription>
          </DialogHeader>
          {renderForm()}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button
              onClick={updateWebhook}
              disabled={!form.name.trim() || !form.url.trim() || form.triggers.length === 0}
            >
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
