"use client";

import { cn } from "@/lib/utils";

interface StatusDotProps {
  active: boolean;
  showLabel?: boolean;
  size?: "sm" | "md";
  className?: string;
}

export function StatusDot({ active, showLabel = false, size = "md", className }: StatusDotProps) {
  const dotSize = size === "sm" ? "w-1.5 h-1.5" : "w-2 h-2";

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative inline-flex">
        {active && (
          <span
            className={cn(
              "absolute inline-flex rounded-full",
              dotSize,
              "active-dot-pulse"
            )}
            style={{ backgroundColor: "var(--status-active)", opacity: 0.5 }}
          />
        )}
        <span
          className={cn("relative inline-flex rounded-full", dotSize)}
          style={{
            backgroundColor: active ? "var(--status-active)" : "var(--status-idle)",
          }}
        />
      </span>
      {showLabel && (
        <span className="text-xs font-medium" style={{ color: active ? "var(--status-active)" : "var(--status-idle)" }}>
          {active ? "Active" : "Idle"}
        </span>
      )}
    </span>
  );
}
