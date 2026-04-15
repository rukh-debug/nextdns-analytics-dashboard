"use client";

import { Card } from "@/components/ui/card";
import { HorizontalBarChart } from "@/components/charts/bar-chart";

interface TopDomainsCardProps {
  domains: { domain: string; count: number }[];
}

export function TopDomainsCard({ domains }: TopDomainsCardProps) {
  return (
    <Card className="p-6">
      <h2 className="text-sm font-semibold mb-4">Top Allowed Domains</h2>
      {domains.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No data</p>
      ) : (
        <HorizontalBarChart
          data={domains.slice(0, 8).map((d) => ({ label: d.domain, value: d.count, color: "var(--chart-3)" }))}
        />
      )}
    </Card>
  );
}
