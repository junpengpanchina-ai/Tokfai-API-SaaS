"use client";

import { ApiReferenceLink } from "@/components/api-reference-link";
import { useDashboardLabels } from "@/lib/dashboard-safe/use-dashboard-labels";

export function DashboardFooter() {
  const { t } = useDashboardLabels();

  return (
    <footer className="border-t px-4 py-4 text-xs text-muted-foreground sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>{t("common.footerTagline")}</span>
        <ApiReferenceLink />
      </div>
    </footer>
  );
}
