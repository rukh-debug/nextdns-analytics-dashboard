"use client";

import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { useDashboardStore } from "@/stores/dashboard-store";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed, toggleSidebar, activeProfileId, setGroups } = useDashboardStore();

  useEffect(() => {
    fetch("/api/ingestion/start", { method: "POST" }).catch(() => {});
  }, []);

  // Load groups whenever profile changes
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
    <>
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
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
    </>
  );
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <DashboardShell>{children}</DashboardShell>
    </ThemeProvider>
  );
}
