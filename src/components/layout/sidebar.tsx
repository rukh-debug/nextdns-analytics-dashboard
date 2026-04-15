"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ScrollText,
  Users,
  Tags,
  PanelLeftClose,
  PanelLeft,
  Radio,
  Webhook,
  UserCog,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/logs", label: "Logs", icon: ScrollText },
  { href: "/groups", label: "Groups", icon: Users },
  { href: "/tags", label: "Tags", icon: Tags },
  { href: "/profiles", label: "Profiles", icon: UserCog },
  { href: "/webhooks", label: "Webhooks", icon: Webhook },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 bottom-0 z-30 flex flex-col border-r transition-all duration-300",
        "bg-sidebar text-sidebar-foreground",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Brand */}
      <div className={cn("flex items-center h-14 border-b shrink-0", collapsed ? "px-3 justify-center" : "px-4 gap-2.5")}>
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-primary shrink-0">
          <Radio className="h-4 w-4 text-primary-foreground" />
        </div>
        {!collapsed && (
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold tracking-tight">NDNS</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Analytics</span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {navItems.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-all duration-150",
                collapsed ? "h-9 w-9 mx-auto justify-center" : "gap-3 px-3 py-2",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Toggle */}
      <div className="p-2 border-t shrink-0">
        <button
          onClick={onToggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className={cn(
            "flex items-center justify-center rounded-lg p-2 w-full text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors"
          )}
        >
          {collapsed ? (
            <PanelLeft className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </button>
      </div>
    </aside>
  );
}
