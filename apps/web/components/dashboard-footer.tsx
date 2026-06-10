"use client";

import { ApiReferenceLink } from "@/components/api-reference-link";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function DashboardFooter() {
  const { t } = useI18n();

  return (
    <footer className="border-t px-4 py-4 text-xs text-muted-foreground sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <span>{t("common.footerTagline")}</span>
        <ApiReferenceLink />
      </div>
    </footer>
  );
}
