"use client";

import { useDashboardStore } from "@/stores/dashboard-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Wifi } from "lucide-react";
import { useEffect, useState } from "react";

interface Profile {
  id: string;
  name: string;
  isActive: boolean;
}

export function ProfileSwitcher() {
  const { activeProfileId, setActiveProfile } = useDashboardStore();
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    const loadProfiles = () => {
      fetch("/api/profiles")
        .then((r) => r.json())
        .then((data) => {
          const nextProfiles = data.profiles || [];
          setProfiles(nextProfiles);

          if (nextProfiles.length === 0) {
            setActiveProfile(null);
            return;
          }

          if (activeProfileId && nextProfiles.some((profile: Profile) => profile.id === activeProfileId)) {
            return;
          }

          setActiveProfile(
            nextProfiles.find((profile: Profile) => profile.isActive)?.id || nextProfiles[0].id
          );
        })
        .catch(() => {});
    };

    loadProfiles();
    window.addEventListener("profiles:updated", loadProfiles);
    return () => window.removeEventListener("profiles:updated", loadProfiles);
  }, [activeProfileId, setActiveProfile]);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  if (profiles.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent transition-colors">
        <Wifi className="h-4 w-4 text-primary" />
        <span className="max-w-[200px] truncate">
          {activeProfile?.name || "Select Profile"}
        </span>
        {profiles.length > 1 && (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </DropdownMenuTrigger>
      {profiles.length > 1 && (
        <DropdownMenuContent align="center">
          {profiles.map((profile) => (
            <DropdownMenuItem
              key={profile.id}
              onClick={() => setActiveProfile(profile.id)}
              className={
                profile.id === activeProfileId ? "bg-accent" : ""
              }
            >
              {profile.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}
