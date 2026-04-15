"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useDashboardStore } from "@/stores/dashboard-store";
import { toast } from "sonner";
import {
  AlertTriangle,
  Clock,
  Globe,
  Group,
  Link2,
  MonitorSmartphone,
  Pencil,
  Plus,
  RefreshCw,
  Tags,
  Trash2,
  Ungroup,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

interface Tag {
  id: string;
  name: string;
  slug: string;
  color?: string | null;
}

interface DomainList {
  id: string;
  name: string;
  sourceType: string;
  sourceUrl: string | null;
  isSystem: boolean;
  isActive: boolean;
  lastFetchedAt: string | null;
  lastFetchStatus: "idle" | "success" | "error";
  lastFetchError: string | null;
  entryCount: number;
  tag: Tag;
}

interface TagMatch {
  id: number;
  timestamp: string;
  domain: string;
  status: string;
  flagReason: string | null;
  deviceId: string | null;
  device?: { name: string; model?: string } | null;
  group?: { name: string; color?: string } | null;
  tags: Array<{
    id: string;
    name: string;
    slug: string;
    listId: string;
    listName: string;
    matchedDomain: string;
  }>;
}

interface TagActivitySummary {
  total: number;
  today: number;
  topDevice?: { id: string; name: string; count: number } | null;
  topDomain?: { domain: string; count: number } | null;
}

const RANGES = [
  { label: "Last hour", value: "1h" },
  { label: "Today", value: "24h" },
  { label: "7 days", value: "7d" },
  { label: "30 days", value: "30d" },
];

function TagChip({
  tag,
  active,
  onClick,
}: {
  tag: Tag;
  active?: boolean;
  onClick?: () => void;
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
      <span className="mr-1.5 h-2 w-2 rounded-full" style={{ backgroundColor: tag.color || "var(--primary)" }} />
      {tag.name}
    </button>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-xl font-bold tabular-nums">{value}</p>
      </div>
    </Card>
  );
}

function GroupedMatchList({ matches }: { matches: TagMatch[] }) {
  const grouped = new Map<
    string,
    {
      domain: string;
      count: number;
      tags: Map<string, { name: string; listName: string; matchedDomain: string }>;
      latestTimestamp: string;
      devices: Set<string>;
    }
  >();

  for (const match of matches) {
    const existing = grouped.get(match.domain);
    const tagMap = new Map<string, { name: string; listName: string; matchedDomain: string }>();

    if (existing) {
      existing.count += 1;
      if (match.timestamp > existing.latestTimestamp) {
        existing.latestTimestamp = match.timestamp;
      }
      if (match.device?.name) {
        existing.devices.add(match.device.name);
      }
      for (const tag of match.tags) {
        const key = `${tag.name}:${tag.listName}:${tag.matchedDomain}`;
        if (!existing.tags.has(key)) {
          existing.tags.set(key, {
            name: tag.name,
            listName: tag.listName,
            matchedDomain: tag.matchedDomain,
          });
        }
      }
      continue;
    }

    for (const tag of match.tags) {
      const key = `${tag.name}:${tag.listName}:${tag.matchedDomain}`;
      tagMap.set(key, { name: tag.name, listName: tag.listName, matchedDomain: tag.matchedDomain });
    }

    grouped.set(match.domain, {
      domain: match.domain,
      count: 1,
      tags: tagMap,
      latestTimestamp: match.timestamp,
      devices: new Set(match.device?.name ? [match.device.name] : []),
    });
  }

  const entries = [...grouped.values()].sort((left, right) => right.count - left.count);

  return (
    <div className="space-y-3">
      {entries.map((entry) => (
        <Card key={entry.domain} className="p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "var(--status-flagged)" }} />
                <span className="break-all font-mono text-sm font-medium">{entry.domain}</span>
                <Badge variant="outline" className="text-[10px]">
                  {entry.count} hit{entry.count !== 1 ? "s" : ""}
                </Badge>
              </div>

              {entry.tags.size > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {[...entry.tags.values()].map((tag) => (
                    <span
                      key={`${tag.name}:${tag.listName}:${tag.matchedDomain}`}
                      className="inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium status-flagged"
                    >
                      {tag.name}
                      <span className="ml-1 text-[10px] opacity-80">via {tag.listName}</span>
                    </span>
                  ))}
                </div>
              ) : null}

              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span>Last: {new Date(entry.latestTimestamp).toLocaleString()}</span>
                {entry.devices.size > 0 ? <span>{[...entry.devices].join(", ")}</span> : null}
              </div>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

export default function TagsPage() {
  const { activeProfileId, selectedGroupId } = useDashboardStore();
  const [tags, setTags] = useState<Tag[]>([]);
  const [lists, setLists] = useState<DomainList[]>([]);
  const [matches, setMatches] = useState<TagMatch[]>([]);
  const [summary, setSummary] = useState<TagActivitySummary | null>(null);
  const [activityLoading, setActivityLoading] = useState(true);
  const [configLoading, setConfigLoading] = useState(true);
  const [range, setRange] = useState("24h");
  const [selectedTagId, setSelectedTagId] = useState<string>("all");
  const [tagDialogOpen, setTagDialogOpen] = useState(false);
  const [listDialogOpen, setListDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<Tag | null>(null);
  const [editingList, setEditingList] = useState<DomainList | null>(null);
  const [tagForm, setTagForm] = useState({ name: "", color: "#ef4444" });
  const [listForm, setListForm] = useState({ name: "", tagId: "", sourceUrl: "" });
  const [grouped, setGrouped] = useState(false);
  const [submittingTag, setSubmittingTag] = useState(false);
  const [submittingList, setSubmittingList] = useState(false);
  const [refreshingListId, setRefreshingListId] = useState<string | null>(null);
  const [deletingTagId, setDeletingTagId] = useState<string | null>(null);
  const [deletingListId, setDeletingListId] = useState<string | null>(null);

  const systemTagIds = useMemo(
    () => new Set(lists.filter((list) => list.isSystem).map((list) => list.tag.id)),
    [lists]
  );

  const loadConfig = useCallback(async () => {
    setConfigLoading(true);
    try {
      const [tagsResponse, listsResponse] = await Promise.all([
        fetch("/api/tags").then((response) => response.json()),
        fetch("/api/domain-lists").then((response) => response.json()),
      ]);

      setTags(tagsResponse.tags || []);
      setLists(listsResponse.lists || []);
    } catch {
      toast.error("Failed to load tags and lists");
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const loadActivity = useCallback(async () => {
    if (!activeProfileId) {
      setMatches([]);
      setSummary(null);
      setActivityLoading(false);
      return;
    }

    setActivityLoading(true);
    const params = new URLSearchParams({ profileId: activeProfileId, range });
    if (selectedGroupId) {
      params.set("groupId", selectedGroupId);
    }
    if (selectedTagId !== "all") {
      params.set("tagId", selectedTagId);
    }
    if (grouped) {
      params.set("groupByDomain", "true");
    }

    try {
      const response = await fetch(`/api/tags/activity?${params.toString()}`);
      const data = await response.json();
      setMatches(data.matches || []);
      setSummary(data.summary || null);
    } catch {
      setMatches([]);
      setSummary(null);
      toast.error("Failed to load tagged activity");
    } finally {
      setActivityLoading(false);
    }
  }, [activeProfileId, grouped, range, selectedGroupId, selectedTagId]);

  useEffect(() => {
    loadConfig().catch(() => {
      toast.error("Failed to load tag configuration");
    });
  }, [loadConfig]);

  useEffect(() => {
    loadActivity().catch(() => {
      toast.error("Failed to load tagged activity");
    });
  }, [loadActivity]);

  const openCreateTagDialog = () => {
    setEditingTag(null);
    setTagForm({ name: "", color: "#ef4444" });
    setTagDialogOpen(true);
  };

  const openEditTagDialog = (tag: Tag) => {
    setEditingTag(tag);
    setTagForm({ name: tag.name, color: tag.color || "#ef4444" });
    setTagDialogOpen(true);
  };

  const submitTag = async () => {
    setSubmittingTag(true);
    try {
      const response = await fetch(editingTag ? `/api/tags/${editingTag.id}` : "/api/tags", {
        method: editingTag ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: tagForm.name,
          color: tagForm.color || null,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save tag");
      }

      setTagDialogOpen(false);
      await loadConfig();
      await loadActivity();
      toast.success(editingTag ? "Tag updated" : "Tag created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save tag");
    } finally {
      setSubmittingTag(false);
    }
  };

  const deleteTag = async (tagId: string) => {
    setDeletingTagId(tagId);
    try {
      const response = await fetch(`/api/tags/${tagId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete tag");
      }

      if (selectedTagId === tagId) {
        setSelectedTagId("all");
      }
      await loadConfig();
      await loadActivity();
      toast.success("Tag deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete tag");
    } finally {
      setDeletingTagId(null);
    }
  };

  const openCreateListDialog = () => {
    setEditingList(null);
    setListForm({ name: "", tagId: tags[0]?.id || "", sourceUrl: "" });
    setListDialogOpen(true);
  };

  const openEditListDialog = (list: DomainList) => {
    setEditingList(list);
    setListForm({
      name: list.name,
      tagId: list.tag.id,
      sourceUrl: list.sourceUrl || "",
    });
    setListDialogOpen(true);
  };

  const submitList = async () => {
    setSubmittingList(true);
    try {
      const response = await fetch(editingList ? `/api/domain-lists/${editingList.id}` : "/api/domain-lists", {
        method: editingList ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: listForm.name,
          tagId: listForm.tagId,
          sourceUrl: listForm.sourceUrl,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to save domain list");
      }

      setListDialogOpen(false);
      await loadConfig();
      await loadActivity();
      toast.success(editingList ? "Domain list updated" : "Domain list created");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save domain list");
    } finally {
      setSubmittingList(false);
    }
  };

  const refreshList = async (listId: string) => {
    setRefreshingListId(listId);
    try {
      const response = await fetch(`/api/domain-lists/${listId}/refresh`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to refresh domain list");
      }

      await loadConfig();
      await loadActivity();
      toast.success("Domain list refreshed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to refresh domain list");
    } finally {
      setRefreshingListId(null);
    }
  };

  const deleteList = async (listId: string) => {
    setDeletingListId(listId);
    try {
      const response = await fetch(`/api/domain-lists/${listId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to delete domain list");
      }

      await loadConfig();
      await loadActivity();
      toast.success("Domain list deleted");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete domain list");
    } finally {
      setDeletingListId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tags</h1>
          <p className="text-sm text-muted-foreground">
            Manage reusable tags, attach domain lists, and review tagged DNS activity.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={openCreateTagDialog}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            New Tag
          </Button>
          <Button onClick={openCreateListDialog} disabled={tags.length === 0}>
            <Link2 className="mr-1.5 h-3.5 w-3.5" />
            New Domain List
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Tags</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Assign a reusable tag to one or more downloaded domain lists.
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {tags.length} total
            </Badge>
          </div>

          {configLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, index) => (
                <Skeleton key={index} className="h-14" />
              ))}
            </div>
          ) : tags.length > 0 ? (
            <div className="space-y-2">
              {tags.map((tag) => {
                const isSystem = systemTagIds.has(tag.id);
                return (
                  <div key={tag.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <TagChip tag={tag} active />
                        {isSystem ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Built in
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">{tag.slug}</p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEditTagDialog(tag)}
                        aria-label={`Edit ${tag.name}`}
                        disabled={isSystem || deletingTagId === tag.id}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => deleteTag(tag.id)}
                        aria-label={`Delete ${tag.name}`}
                        disabled={isSystem || deletingTagId === tag.id}
                      >
                        {deletingTagId === tag.id ? (
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed px-4 py-8 text-center">
              <p className="text-sm font-medium">No tags yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Create a tag first, then attach one or more downloaded domain lists to it.
              </p>
            </div>
          )}
        </Card>

        <Card className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">Domain Lists</h2>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Each list downloads from a raw URL, is assigned a tag, and retags history when refreshed.
              </p>
            </div>
            <Badge variant="outline" className="text-[10px]">
              {lists.length} sources
            </Badge>
          </div>

          {configLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24" />
              ))}
            </div>
          ) : lists.length > 0 ? (
            <div className="space-y-3">
              {lists.map((list) => (
                <div key={list.id} className="space-y-3 rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium">{list.name}</p>
                        <TagChip tag={list.tag} active />
                        {list.isSystem ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Built in
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
                        {list.sourceUrl || "No source URL"}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => refreshList(list.id)}
                        aria-label={`Refresh ${list.name}`}
                        disabled={refreshingListId === list.id || deletingListId === list.id}
                      >
                        <RefreshCw className={cn("h-3.5 w-3.5", refreshingListId === list.id && "animate-spin")} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => openEditListDialog(list)}
                        aria-label={`Edit ${list.name}`}
                        disabled={list.isSystem || deletingListId === list.id || refreshingListId === list.id}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        onClick={() => deleteList(list.id)}
                        aria-label={`Delete ${list.name}`}
                        disabled={list.isSystem || deletingListId === list.id || refreshingListId === list.id}
                      >
                        {deletingListId === list.id ? (
                          <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-destructive border-t-transparent" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center rounded-md border px-2 py-1">
                      {list.entryCount.toLocaleString()} domains
                    </span>
                    <span className="inline-flex items-center rounded-md border px-2 py-1">
                      {list.lastFetchStatus}
                    </span>
                    <span className="inline-flex items-center rounded-md border px-2 py-1">
                      {list.lastFetchedAt ? new Date(list.lastFetchedAt).toLocaleString() : "Never fetched"}
                    </span>
                  </div>

                  {list.lastFetchError ? <p className="text-xs text-destructive">{list.lastFetchError}</p> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-dashed px-4 py-8 text-center">
              <p className="text-sm font-medium">No domain lists configured</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add a raw GitHub-style list URL, name it, and bind it to one of your tags.
              </p>
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">Tagged Activity</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tagged matches are materialized from the tag-list system and can be filtered by tag.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg border p-1">
              {RANGES.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setRange(option.value)}
                  className={cn(
                    "rounded-md px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer",
                    range === option.value
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <Select value={selectedTagId} onValueChange={(value) => setSelectedTagId(value ?? "all")}>
              <SelectTrigger className="min-w-40">
                <SelectValue placeholder="All tags" />
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
              variant={grouped ? "default" : "outline"}
              size="sm"
              onClick={() => setGrouped((prev) => !prev)}
              disabled={matches.length === 0}
            >
              {grouped ? <Ungroup className="mr-1.5 h-3.5 w-3.5" /> : <Group className="mr-1.5 h-3.5 w-3.5" />}
              {grouped ? "Ungroup" : "Group by Domain"}
            </Button>
          </div>
        </div>

        {(summary || !activityLoading) && activeProfileId ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryCard label="Total Hits" value={summary?.total ?? matches.length} icon={Tags} />
            <SummaryCard label="Hits Today" value={summary?.today ?? 0} icon={Clock} />
            <SummaryCard label="Top Device" value={summary?.topDevice?.name ?? "-"} icon={MonitorSmartphone} />
            <SummaryCard label="Top Domain" value={summary?.topDomain?.domain ?? "-"} icon={Globe} />
          </div>
        ) : null}

        {!activeProfileId ? (
          <Card className="p-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Tags className="h-7 w-7 text-primary" />
            </div>
            <h3 className="mb-1 text-lg font-semibold">Select a profile</h3>
            <p className="mx-auto max-w-sm text-sm text-muted-foreground">
              Tag and list management is global, but the tagged activity feed needs a selected profile from the top bar.
            </p>
          </Card>
        ) : activityLoading ? (
          <Card className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-16" />
            ))}
          </Card>
        ) : matches.length === 0 ? (
          <Card className="p-16 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-(--status-allowed)/10">
              <Tags className="h-7 w-7" style={{ color: "var(--status-allowed)" }} />
            </div>
            <h3 className="mb-1 text-lg font-semibold">Nothing matched</h3>
            <p className="mx-auto max-w-md text-sm text-muted-foreground">
              No tagged domains matched the selected profile in this time range. Add more lists or widen the range if you expect results.
            </p>
          </Card>
        ) : grouped ? (
          <GroupedMatchList matches={matches} />
        ) : (
          <div className="space-y-3">
            {matches.map((match) => (
              <Card key={match.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "var(--status-flagged)" }} />
                      <span className="break-all font-mono text-sm font-medium">{match.domain}</span>
                      <StatusBadge status={match.status as "default" | "blocked" | "allowed" | "relayed" | "error"} />
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {match.tags.map((tag) => (
                        <span
                          key={`${tag.id}:${tag.listId}:${tag.matchedDomain}`}
                          className="inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium status-flagged"
                        >
                          {tag.name}
                          <span className="ml-1 text-[10px] opacity-80">via {tag.listName}</span>
                        </span>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      <span>{new Date(match.timestamp).toLocaleString()}</span>
                      <span>{match.device?.name || "Unknown device"}</span>
                      <span>{match.group?.name || "Unassigned group"}</span>
                      <span>{match.flagReason || "Tagged match"}</span>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={tagDialogOpen} onOpenChange={setTagDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingTag ? "Edit Tag" : "Create Tag"}</DialogTitle>
            <DialogDescription>Tags are used to group one or more downloaded domain lists.</DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={tagForm.name}
                onChange={(event) => setTagForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Cron jobs"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <Input
                value={tagForm.color}
                onChange={(event) => setTagForm((prev) => ({ ...prev, color: event.target.value }))}
                placeholder="#ef4444"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTagDialogOpen(false)} disabled={submittingTag}>
              Cancel
            </Button>
            <Button onClick={submitTag} disabled={submittingTag || !tagForm.name.trim()}>
              {submittingTag ? "Saving..." : "Save Tag"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={listDialogOpen} onOpenChange={setListDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingList ? "Edit Domain List" : "Create Domain List"}</DialogTitle>
            <DialogDescription>
              Provide a raw URL, assign a tag, and the backend will download the list and retag matching domains.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input
                value={listForm.name}
                onChange={(event) => setListForm((prev) => ({ ...prev, name: event.target.value }))}
                placeholder="Cron endpoints"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Assigned tag</Label>
              <Select value={listForm.tagId} onValueChange={(value) => setListForm((prev) => ({ ...prev, tagId: value ?? "" }))}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a tag" />
                </SelectTrigger>
                <SelectContent>
                  {tags.map((tag) => (
                    <SelectItem key={tag.id} value={tag.id}>
                      {tag.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Raw list URL</Label>
              <Input
                value={listForm.sourceUrl}
                onChange={(event) => setListForm((prev) => ({ ...prev, sourceUrl: event.target.value }))}
                placeholder="https://example.com/file.txt"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setListDialogOpen(false)} disabled={submittingList}>
              Cancel
            </Button>
            <Button
              onClick={submitList}
              disabled={submittingList || !listForm.name.trim() || !listForm.tagId || !listForm.sourceUrl.trim()}
            >
              {submittingList ? "Saving..." : "Save List"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}