"use client";

import { Card } from "@/components/ui/card";
import { AreaChart } from "@/components/charts/area-chart";

interface ActivityChartProps {
  data: { hour: string; total: number; blocked: number; allowed: number }[];
}

const CHART_SERIES = [
  { key: "total", color: "var(--chart-1)", label: "Total" },
  { key: "blocked", color: "var(--chart-2)", label: "Blocked" },
  { key: "allowed", color: "var(--chart-3)", label: "Allowed" },
];

export function ActivityChart({ data }: ActivityChartProps) {
  const chartData = data.map((d) => ({
    hour: `${d.hour}:00`,
    total: d.total,
    blocked: d.blocked,
    allowed: d.allowed,
  }));

  return (
    <Card className="p-6">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">DNS Activity (24h)</h2>
      </div>
      <AreaChart
        data={chartData}
        index="hour"
        series={CHART_SERIES}
        height={272}
      />
    </Card>
  );
}
