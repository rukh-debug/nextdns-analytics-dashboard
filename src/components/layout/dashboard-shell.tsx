"use client";

import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useDashboardStore } from "@/stores/dashboard-store";

interface DashboardShellProps {
  children: React.ReactNode;
  authEnabled: boolean;
}

export function DashboardShell({ children, authEnabled }: DashboardShellProps) {
  const { sidebarCollapsed, toggleSidebar, activeProfileId, setGroups } = useDashboardStore();

  useEffect(() => {
    fetch("/api/ingestion/start", { method: "POST" }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!activeProfileId) {
      setGroups([]);
      return;
    }

    fetch(`/api/groups?profileId=${activeProfileId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.groups) setGroups(d.groups);
      })
      .catch(() => {});
  }, [activeProfileId, setGroups]);

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
      storageKey="ndns-theme"
    >
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={toggleSidebar}
        authEnabled={authEnabled}
      />
      <Topbar />
      <main
        className={cn(
          "pt-14 min-h-screen transition-all duration-300",
          sidebarCollapsed ? "pl-16" : "pl-60"
        )}
      >
        <div className="p-6">{children}</div>
      </main>
      <Toaster />
    </ThemeProvider>
  );
}
