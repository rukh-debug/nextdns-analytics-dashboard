"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { ProfileSwitcher } from "./profile-switcher";
import { PersonSwitcher } from "./person-switcher";
import { useDashboardStore } from "@/stores/dashboard-store";
import { cn } from "@/lib/utils";

export function Topbar() {
  const { theme, setTheme } = useTheme();
  const { sidebarCollapsed } = useDashboardStore();

  return (
    <header
      className={cn(
        "fixed top-0 right-0 z-40 flex h-14 items-center gap-3 border-b bg-card/95 backdrop-blur px-4 transition-all duration-300",
        sidebarCollapsed ? "left-16" : "left-60"
      )}
    >
      <div className="flex-1 flex items-center gap-3 min-w-0">
        <ProfileSwitcher />
        <PersonSwitcher />
      </div>

      {/* Theme toggle */}
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        aria-label="Toggle theme"
        className="rounded-lg p-2 cursor-pointer text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors relative"
      >
        <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute top-2 left-2 h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </button>
    </header>
  );
}
