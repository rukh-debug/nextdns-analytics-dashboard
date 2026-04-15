"use client";

import { Card } from "@/components/ui/card";
import { Activity, ShieldAlert, Wifi, AlertTriangle } from "lucide-react";

interface StatCardsProps {
  stats: {
    totalToday: number;
    blockedToday: number;
    deviceCount: number;
    flaggedToday: number;
  };
}

export function StatCards({ stats }: StatCardsProps) {
  const cards = [
    {
      label: "Total Queries",
      value: stats.totalToday.toLocaleString(),
      icon: Activity,
      color: "text-blue-500",
    },
    {
      label: "Blocked Today",
      value: stats.blockedToday.toLocaleString(),
      icon: ShieldAlert,
      color: "text-red-500",
    },
    {
      label: "Devices",
      value: stats.deviceCount.toString(),
      icon: Wifi,
      color: "text-green-500",
    },
    {
      label: "Flagged Queries",
      value: stats.flaggedToday.toLocaleString(),
      icon: AlertTriangle,
      color: "text-amber-500",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {cards.map((card) => (
        <Card key={card.label} className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{card.label}</p>
              <p className="text-2xl font-bold mt-1">{card.value}</p>
            </div>
            <card.icon className={`h-8 w-8 ${card.color}`} />
          </div>
        </Card>
      ))}
    </div>
  );
}
