"use client";

import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useTheme } from "next-themes";

interface BarChartProps {
  data: { label: string; value: number; color?: string }[];
  color?: string;
  height?: number;
  layout?: "horizontal" | "vertical";
  onBarClick?: (label: string) => void;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-md text-sm">
      <p className="text-foreground font-medium mb-0.5 font-mono text-xs">{label}</p>
      <p className="tabular-nums font-medium">{payload[0].value.toLocaleString()}</p>
    </div>
  );
}

export function HorizontalBarChart({ data, color = "var(--chart-1)", height = 200, onBarClick }: BarChartProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const axisColor = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.35)";
  const maxVal = Math.max(...data.map((d) => d.value));

  return (
    <div className="space-y-1.5">
      {data.map((item) => (
        <div
          key={item.label}
          className="group flex items-center gap-2 cursor-default"
          onClick={() => onBarClick?.(item.label)}
          role={onBarClick ? "button" : undefined}
        >
          <div
            className="flex-1 min-w-0 text-xs font-mono text-foreground truncate"
            title={item.label}
          >
            {item.label}
          </div>
          <div className="flex items-center gap-2 w-48 shrink-0">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${(item.value / maxVal) * 100}%`,
                  backgroundColor: item.color || color,
                }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted-foreground w-12 text-right font-mono">
              {item.value >= 1000 ? `${(item.value / 1000).toFixed(1)}k` : item.value.toLocaleString()}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function BarChart({ data, color = "var(--chart-1)" }: Omit<BarChartProps, "height">) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const axisColor = isDark ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.35)";

  const chartData = data.map((d) => ({ name: d.label, value: d.value, color: d.color }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <RechartsBarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: axisColor }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: axisColor }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
        />
        <Tooltip content={<CustomTooltip />} />
        <Bar dataKey="value" radius={[3, 3, 0, 0]}>
          {chartData.map((entry, i) => (
            <Cell key={i} fill={entry.color || color} fillOpacity={0.85} />
          ))}
        </Bar>
      </RechartsBarChart>
    </ResponsiveContainer>
  );
}
