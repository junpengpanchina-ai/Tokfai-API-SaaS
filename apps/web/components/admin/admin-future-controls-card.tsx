"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function AdminFutureControlsCard({
  titleKey,
  descriptionKey,
  controlLabelKeys,
}: {
  titleKey: string;
  descriptionKey: string;
  controlLabelKeys: string[];
}) {
  const { t } = useI18n();

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{t(titleKey)}</CardTitle>
          <Badge variant="secondary">{t("admin.common.readOnlyPhase")}</Badge>
        </div>
        <CardDescription>{t(descriptionKey)}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-2">
          {controlLabelKeys.map((labelKey) => (
            <Button key={labelKey} type="button" variant="outline" size="sm" disabled>
              {t(labelKey)}
              <span className="ml-2 text-xs text-muted-foreground">
                ({t("admin.common.comingSoon")})
              </span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
