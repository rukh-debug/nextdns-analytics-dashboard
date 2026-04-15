"use client";

import { cn } from "@/lib/utils";

type Status = "default" | "blocked" | "allowed" | "relayed" | "flagged" | "error";

const STATUS_COLOR: Record<Status, string> = {
  default: "var(--status-default)",
  blocked: "var(--status-blocked)",
  allowed: "var(--status-allowed)",
  relayed: "var(--status-default)",
  flagged: "var(--status-flagged)",
  error: "var(--status-error)",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const color = STATUS_COLOR[status as Status] ?? STATUS_COLOR.default;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium leading-none capitalize",
        className
      )}
      style={{
        color,
        borderColor: `color-mix(in oklch, ${color} 35%, var(--border))`,
        backgroundColor: `color-mix(in oklch, ${color} 12%, transparent)`,
      }}
    >
      {status}
    </span>
  );
}
