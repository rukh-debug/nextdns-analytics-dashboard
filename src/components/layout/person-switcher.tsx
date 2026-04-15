"use client";

import { useDashboardStore, type Group } from "@/stores/dashboard-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Users } from "lucide-react";
import { StatusDot } from "@/components/ui/status-dot";
import { cn } from "@/lib/utils";

function GroupAvatar({ group, size = "sm" }: { group: Group; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "w-5 h-5 text-[10px]" : "w-7 h-7 text-xs";
  return (
    <span
      className={cn("inline-flex items-center justify-center rounded-full font-bold text-white shrink-0", dim)}
      style={{ backgroundColor: group.color || "#6366f1" }}
    >
      {group.icon || group.name[0].toUpperCase()}
    </span>
  );
}

export function PersonSwitcher() {
  const { groups, selectedGroupId, setSelectedGroup } = useDashboardStore();

  if (groups.length === 0) return null;

  const selected = groups.find((g) => g.id === selectedGroupId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium hover:bg-accent transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {selected ? (
          <>
            <GroupAvatar group={selected} />
            <span className="max-w-[120px] truncate">{selected.name}</span>
          </>
        ) : (
          <>
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">All Groups</span>
          </>
        )}
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          onClick={() => setSelectedGroup(null)}
          className={cn("gap-2", !selectedGroupId && "bg-accent")}
        >
          <Users className="h-4 w-4 text-muted-foreground" />
          <span>All Groups</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {groups.map((group) => (
          <DropdownMenuItem
            key={group.id}
            onClick={() => setSelectedGroup(group.id)}
            className={cn("gap-2", group.id === selectedGroupId && "bg-accent")}
          >
            <GroupAvatar group={group} />
            <span className="flex-1 truncate">{group.name}</span>
            <StatusDot active={group.isActive ?? false} size="sm" />
            {group.deviceCount !== undefined && (
              <span className="text-xs text-muted-foreground">{group.deviceCount}</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
