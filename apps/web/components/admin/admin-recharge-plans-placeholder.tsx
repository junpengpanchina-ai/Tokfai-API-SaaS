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
import { formatInt } from "@/lib/format";

const RECHARGE_PLANS = [
  {
    nameKey: "admin.credits.planStarter",
    price: "¥29",
    credits: 10_000,
  },
  {
    nameKey: "admin.credits.planPro",
    price: "¥99",
    credits: 50_000,
  },
  {
    nameKey: "admin.credits.planBusiness",
    price: "¥299",
    credits: 200_000,
  },
] as const;

export function AdminRechargePlansPlaceholder() {
  const { t } = useI18n();

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{t("admin.credits.rechargePlansTitle")}</CardTitle>
          <Badge variant="secondary">{t("admin.common.readOnlyPhase")}</Badge>
        </div>
        <CardDescription>{t("admin.credits.rechargePlansDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>{t("admin.credits.stripeSourceOfTruth")}</li>
          <li>{t("admin.credits.ledgerAfterPayment")}</li>
        </ul>

        <div className="grid gap-3 sm:grid-cols-3">
          {RECHARGE_PLANS.map((plan) => (
            <div
              key={plan.nameKey}
              className="rounded-lg border bg-muted/20 p-4"
            >
              <div className="font-medium">{t(plan.nameKey)}</div>
              <div className="mt-1 text-2xl font-semibold tracking-tight">
                {plan.price}
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {formatInt(plan.credits)} credits
              </div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {(
            [
              "admin.credits.editPlan",
              "admin.credits.editCredits",
              "admin.credits.editStripePrice",
            ] as const
          ).map((labelKey) => (
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
