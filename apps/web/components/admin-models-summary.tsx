"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import { formatInt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

export type AdminModelsSummaryStats = {
  total: number;
  chat: number;
  image: number;
  available: number;
  comingSoon: number;
};

export function AdminModelsSummary({ stats }: { stats: AdminModelsSummaryStats }) {
  const { t } = useI18n();

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
      <SummaryCard label={t("admin.models.summaryTotal")} value={stats.total} />
      <SummaryCard label={t("admin.models.summaryChat")} value={stats.chat} />
      <SummaryCard label={t("admin.models.summaryImage")} value={stats.image} />
      <SummaryCard label={t("admin.models.summaryAvailable")} value={stats.available} />
      <SummaryCard label={t("admin.models.summaryComingSoon")} value={stats.comingSoon} />
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
