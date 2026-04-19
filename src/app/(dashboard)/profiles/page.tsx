"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, Globe, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDashboardStore } from "@/stores/dashboard-store";

interface Profile {
  id: string;
  name: string;
  fingerprint?: string | null;
  isActive: boolean;
}

export default function ProfilesPage() {
  const { activeProfileId, hasHydrated, setActiveProfile } = useDashboardStore();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [discoverFeedback, setDiscoverFeedback] = useState<string | null>(null);
  const [profileToDelete, setProfileToDelete] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const profileCountLabel = useMemo(() => {
    if (profiles.length === 1) return "1 profile connected";
    return `${profiles.length} profiles connected`;
  }, [profiles.length]);

  const refreshProfiles = async () => {
    const res = await fetch("/api/profiles");
    const data = await res.json();
    const next = data.profiles || [];
    setProfiles(next);
    if (!hasHydrated) {
      return next as Profile[];
    }

    if (activeProfileId && !next.some((p: Profile) => p.id === activeProfileId)) {
      setActiveProfile(next[0]?.id ?? null);
    }
    window.dispatchEvent(new Event("profiles:updated"));
    return next as Profile[];
  };

  useEffect(() => {
    refreshProfiles().catch(() => toast.error("Failed to load profiles"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasHydrated]);

  const discoverProfiles = async () => {
    setDiscovering(true);
    setDiscoverFeedback(null);
    try {
      const res = await fetch("/api/profiles/discover", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to sync profiles");
      await refreshProfiles();
      if ((data.summary?.created ?? 0) === 0) {
        setDiscoverFeedback("No new profiles found");
      } else {
        setDiscoverFeedback(`Added ${data.summary.created} new profile${data.summary.created === 1 ? "" : "s"}`);
      }
      window.setTimeout(() => setDiscoverFeedback(null), 3000);
      toast.success("Profiles synced from NextDNS");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to sync profiles");
    } finally {
      setDiscovering(false);
    }
  };

  const confirmDeleteProfile = async () => {
    if (!profileToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/profiles/${profileToDelete.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete profile");
      setProfileToDelete(null);
      await refreshProfiles();
      toast.success(`Deleted ${profileToDelete.name} and its stored data`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete profile");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Profiles</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Manage NextDNS profiles connected to this instance.
        </p>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-sm font-semibold mb-0.5">Fetch profiles from NextDNS</h3>
            <p className="text-xs text-muted-foreground">
              Profile discovery runs on the backend using your configured API key.
            </p>
          </div>
          <Badge variant="outline" className="text-[10px]">{profileCountLabel}</Badge>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button onClick={discoverProfiles} disabled={discovering} className="shrink-0 min-w-56 justify-center">
            <ExternalLink className="h-3.5 w-3.5 mr-1.5" />
            {discovering ? "Fetching profiles..." : discoverFeedback || "Fetch Profiles From NextDNS"}
          </Button>
          <p className="text-xs text-muted-foreground">
            If the same profiles are returned, the button will indicate no new profiles were found.
          </p>
        </div>
      </Card>

      {profiles.length > 0 ? (
        <Card className="p-0 overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <h3 className="text-sm font-semibold">Configured Profiles</h3>
          </div>
          <div className="divide-y">
            {profiles.map((profile) => (
              <div key={profile.id} className="flex items-center justify-between px-4 py-3 gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Globe className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{profile.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{profile.id}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {profile.id === activeProfileId && (
                    <Badge variant="outline" className="text-[10px] gap-1 status-allowed border">
                      <CheckCircle2 className="h-2.5 w-2.5" />
                      Selected
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setProfileToDelete(profile)}
                    aria-label={`Delete ${profile.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-dashed">
          <Globe className="h-8 w-8 text-muted-foreground mb-3" />
          <p className="text-sm font-medium">No profiles connected</p>
          <p className="text-xs text-muted-foreground mt-1">
            Use the fetch button above to import profiles from your NextDNS account.
          </p>
        </div>
      )}

      <Dialog open={Boolean(profileToDelete)} onOpenChange={(open) => !open && setProfileToDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete profile?</DialogTitle>
            <DialogDescription>
              {profileToDelete
                ? `This will remove ${profileToDelete.name}, its ingested logs, devices, and derived analytics from the backend.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileToDelete(null)} disabled={deleting}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDeleteProfile} disabled={deleting}>
              {deleting ? "Deleting..." : "Delete Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
