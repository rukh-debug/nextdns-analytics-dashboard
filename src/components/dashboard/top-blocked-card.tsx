"use client";

import { Card } from "@/components/ui/card";
import { HorizontalBarChart } from "@/components/charts/bar-chart";

interface TopBlockedCardProps {
  domains: { domain: string; count: number }[];
}

export function TopBlockedCard({ domains }: TopBlockedCardProps) {
  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold mb-4">Top Blocked Domains</h2>
      {domains.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No blocked domains</p>
      ) : (
        <HorizontalBarChart
          data={domains.slice(0, 8).map((d) => ({ label: d.domain, value: d.count, color: "var(--chart-2)" }))}
        />
      )}
    </Card>
  );
}
