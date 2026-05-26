"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { formatInt } from "@/lib/format";

export type AdminModelsSummaryStats = {
  total: number;
  chat: number;
  image: number;
  available: number;
  comingSoon: number;
};

export function AdminModelsSummary({ stats }: { stats: AdminModelsSummaryStats }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <SummaryCard label="Total models" value={stats.total} />
      <SummaryCard label="Chat models" value={stats.chat} />
      <SummaryCard label="Image models" value={stats.image} />
      <SummaryCard label="Available models" value={stats.available} />
      <SummaryCard label="Coming soon models" value={stats.comingSoon} />
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-semibold tracking-tight">
          {formatInt(value)}
        </div>
      </CardContent>
    </Card>
  );
}
