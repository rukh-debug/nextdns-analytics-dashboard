"use client";

import { useTheme } from "next-themes";
import { useState, useRef } from "react";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

interface HeatmapCell {
  day: number;
  hour: number;
  value: number;
}

interface TooltipState {
  day: number;
  hour: number;
  value: number;
  x: number;
  y: number;
}

interface ActivityHeatmapProps {
  data: HeatmapCell[];
}

function getColor(value: number, max: number, isDark: boolean): string {
  if (!value || max === 0) {
    return isDark ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.06)";
  }
  const ratio = Math.min(value / max, 1);
  // Scale from green-teal (low) to blue (high) using simple RGB
  if (isDark) {
    const alpha = 0.2 + ratio * 0.75;
    return `rgba(99, 102, 241, ${alpha.toFixed(2)})`; // indigo/blue
  } else {
    const alpha = 0.15 + ratio * 0.75;
    return `rgba(79, 70, 229, ${alpha.toFixed(2)})`;
  }
}

export function ActivityHeatmap({ data }: ActivityHeatmapProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const map = new Map<string, number>();
  data.forEach((d) => map.set(`${d.day}-${d.hour}`, d.value));
  const max = Math.max(...data.map((d) => d.value), 1);

  const handleMouseEnter = (e: React.MouseEvent, day: number, hour: number, value: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    const cellRect = (e.target as HTMLElement).getBoundingClientRect();
    if (!rect) return;
    setTooltip({
      day,
      hour,
      value,
      x: cellRect.left - rect.left + cellRect.width / 2,
      y: cellRect.top - rect.top,
    });
  };

  return (
    <div ref={containerRef} className="overflow-x-auto relative">
      <div className="min-w-max">
        {/* Hour labels */}
        <div className="flex ml-10 mb-1">
          {HOURS.map((h) => (
            <div
              key={h}
              className="w-6 shrink-0 text-center text-[10px] text-muted-foreground"
            >
              {h % 3 === 0 ? String(h).padStart(2, "0") : ""}
            </div>
          ))}
        </div>
        {/* Grid rows */}
        {DAYS.map((day, di) => (
          <div key={day} className="flex items-center mb-0.5">
            <div className="w-9 text-xs text-muted-foreground text-right pr-2 shrink-0">{day}</div>
            {HOURS.map((h) => {
              const val = map.get(`${di}-${h}`) ?? 0;
              return (
                <div
                  key={h}
                  className="w-6 h-5 shrink-0 rounded-sm mx-px cursor-default transition-opacity hover:opacity-80"
                  style={{ backgroundColor: getColor(val, max, isDark) }}
                  onMouseEnter={(e) => handleMouseEnter(e, di, h, val)}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            })}
          </div>
        ))}
      </div>

      {/* Floating tooltip — absolutely positioned, doesn't affect layout */}
      {tooltip && (
        <div
          className="absolute pointer-events-none z-10 rounded-lg border bg-popover px-2.5 py-1.5 shadow-md text-xs whitespace-nowrap -translate-x-1/2 -translate-y-full -mt-1"
          style={{ left: tooltip.x, top: tooltip.y - 6 }}
        >
          <span className="font-medium text-foreground">{DAYS[tooltip.day]}</span>
          <span className="text-muted-foreground ml-1">
            {String(tooltip.hour).padStart(2, "0")}:00
          </span>
          <span className="ml-2 font-mono tabular-nums font-semibold" style={{ color: "var(--chart-1)" }}>
            {tooltip.value.toLocaleString()} queries
          </span>
        </div>
      )}
    </div>
  );
}
