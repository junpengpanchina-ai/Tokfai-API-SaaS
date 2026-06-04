"use client";

import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createCheckoutSession, DmitApiError, type BillingRechargePlan } from "@/lib/dmit/client";
import { userMessageForDmitError } from "@/lib/dmit-messages";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";
import { formatCny, formatPlanCredits } from "@/lib/billing/recharge-plans";
import { formatImageModelPriceExample } from "@/lib/model-pricing-display";
import { createClient } from "@/lib/supabase/client";

export function CreditsTopUpClient({
  plans,
  plansError,
}: {
  plans: BillingRechargePlan[];
  plansError: string | null;
}) {
  const { t, locale } = useI18n();
  const exampleModelPrice = formatImageModelPriceExample("nano-banana", locale);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRecharge(plan: BillingRechargePlan) {
    if (loadingPlanId != null || !plan.enabled) return;

    setLoadingPlanId(plan.plan_id);
    setError(null);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setError(t("dashboard.credits.loadErrorAuthDesc"));
        setLoadingPlanId(null);
        return;
      }

      const session = await createCheckoutSession({
        plan_id: plan.plan_id,
        accessToken,
      });
      window.location.assign(session.url);
    } catch (err) {
      setError(checkoutErrorMessage(err, t));
      setLoadingPlanId(null);
    }
  }

  return (
    <Card id="recharge-credits">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>{t("dashboard.credits.rechargeCredits")}</CardTitle>
          <Badge variant="secondary">Stripe Checkout</Badge>
        </div>
        <CardDescription>{t("dashboard.credits.rechargeDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="rounded-lg border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">
            {t("dashboard.credits.rechargeStarterPlan")}
          </p>
          <p className="mt-1">{t("dashboard.credits.rechargeImageBillingNote")}</p>
          <p className="mt-1">
            {formatMessage(t("dashboard.credits.rechargeImageExample"), {
              example: exampleModelPrice,
            })}
          </p>
        </div>

        {plansError ? (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{plansError}</p>
          </div>
        ) : null}

        {plans.length === 0 && !plansError ? (
          <p className="text-sm text-muted-foreground">
            {t("dashboard.credits.noRechargePlans")}
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {plans.map((plan) => {
              const isLoading = loadingPlanId === plan.plan_id;
              const isDisabled = loadingPlanId != null || !plan.enabled;
              const amountLabel = formatCny(plan.amount_cents);
              return (
                <div
                  key={plan.plan_id}
                  className="flex flex-col gap-4 rounded-lg border bg-card p-4"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="font-semibold">{plan.name}</h3>
                      <div className="flex items-center gap-1">
                        {plan.badge ? (
                          <Badge variant="secondary" className="text-[10px]">
                            {plan.badge}
                          </Badge>
                        ) : null}
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {plan.plan_id}
                        </Badge>
                      </div>
                    </div>
                    <p className="mt-2 text-3xl font-semibold tracking-tight">
                      {amountLabel}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {formatMessage(t("dashboard.credits.baseCreditsLine"), {
                        credits: formatPlanCredits(plan.base_credits),
                      })}
                    </p>
                    {plan.bonus_credits > 0 ? (
                      <p className="text-xs font-medium text-primary">
                        {formatMessage(t("dashboard.credits.bonusCreditsLine"), {
                          bonus: formatPlanCredits(plan.bonus_credits),
                        })}
                      </p>
                    ) : null}
                    <p className="text-sm font-medium text-foreground">
                      {formatMessage(t("dashboard.credits.finalCreditsLine"), {
                        credits: formatPlanCredits(plan.credits),
                      })}
                    </p>
                  </div>

                  <Button
                    type="button"
                    variant={plan.enabled ? "default" : "outline"}
                    disabled={isDisabled}
                    onClick={() => handleRecharge(plan)}
                    aria-label={`${t("dashboard.credits.rechargeCredits")} ${plan.name}`}
                    className="mt-auto"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : null}
                    {plan.enabled
                      ? t("dashboard.credits.buyPlan")
                      : t("dashboard.credits.comingSoon")}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        {error ? <CheckoutError message={error} /> : null}

        <p className="text-xs text-muted-foreground">
          {t("dashboard.credits.billingNote")}
        </p>
      </CardContent>
    </Card>
  );
}

function checkoutErrorMessage(
  err: unknown,
  t: (key: string) => string
): string {
  if (err instanceof DmitApiError) {
    if (
      err.status >= 500 ||
      err.status === 502 ||
      err.status === 503 ||
      err.status === 504
    ) {
      return t("dashboard.credits.checkoutUnavailable");
    }
    return userMessageForDmitError(err.status, err.code, err.message);
  }
  return t("dashboard.credits.checkoutUnavailable");
}

function CheckoutError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

