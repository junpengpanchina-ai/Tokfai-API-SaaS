"use client";

import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function AdminModelsPageIntro() {
  const { t } = useI18n();

  return (
    <div>
      <Badge variant="secondary">{t("admin.common.adminTools")}</Badge>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight">
        {t("admin.models.title")}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("admin.models.subtitle")}</p>
    </div>
  );
}
