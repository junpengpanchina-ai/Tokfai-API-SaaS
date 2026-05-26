"use client";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function AdminDisabledWriteActions({
  actionKeys,
}: {
  actionKeys: string[];
}) {
  const { t } = useI18n();

  return (
    <div className="flex flex-wrap gap-2">
      {actionKeys.map((labelKey) => (
        <Button key={labelKey} type="button" variant="outline" size="sm" disabled>
          {t(labelKey)}
          <span className="ml-2 text-xs text-muted-foreground">
            ({t("admin.common.comingSoon")})
          </span>
        </Button>
      ))}
    </div>
  );
}
