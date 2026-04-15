"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

interface DonutChartProps {
  data: DonutSlice[];
  size?: number;
  innerRadius?: number;
  centerLabel?: string;
  centerValue?: string | number;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { name: string; value: number; payload: DonutSlice }[];
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  const label = item.payload.label ?? item.name;
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-md text-sm">
      <div className="flex items-center gap-2">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: item.payload.color }}
        />
        <span className="capitalize font-medium">{label}</span>
      </div>
      <p className="tabular-nums font-mono mt-0.5">{item.value.toLocaleString()}</p>
    </div>
  );
}

export function DonutChart({
  data,
  size = 160,
  innerRadius = 55,
  centerLabel,
  centerValue,
}: DonutChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={innerRadius}
            outerRadius={size / 2 - 4}
            strokeWidth={0}
            paddingAngle={2}
            dataKey="value"
            nameKey="label"
          >
            {data.map((entry, i) => (
              <Cell key={i} fill={entry.color} fillOpacity={0.9} />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>
      {(centerLabel || centerValue !== undefined) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-bold tabular-nums">
            {centerValue ?? total.toLocaleString()}
          </span>
          {centerLabel && (
            <span className="text-xs text-muted-foreground mt-0.5">{centerLabel}</span>
          )}
        </div>
      )}
    </div>
  );
}
