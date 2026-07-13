"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/i18n-provider";

/**
 * Explicit read-only banner for admin surfaces that are snapshot / deploy-config
 * only. Prefer this over disabled fake Save / Toggle buttons.
 */
export function AdminReadonlyNotice({
  titleKey,
  bodyKey,
}: {
  titleKey: string;
  bodyKey: string;
}) {
  const { t } = useI18n();

  return (
    <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{t("admin.common.readOnlySnapshot")}</Badge>
        <p className="text-sm font-medium text-foreground">{t(titleKey)}</p>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{t(bodyKey)}</p>
    </div>
  );
}
