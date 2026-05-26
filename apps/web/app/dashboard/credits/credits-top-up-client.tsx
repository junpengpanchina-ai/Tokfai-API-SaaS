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
import { createCheckoutSession, DmitApiError } from "@/lib/dmit/client";
import { userMessageForDmitError } from "@/lib/dmit-messages";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";
import { formatImageModelPriceExample } from "@/lib/model-pricing-display";
import { createClient } from "@/lib/supabase/client";

interface CreditPlan {
  package_code: "starter" | "pro" | "business";
  name: string;
  amount_cny: number;
  credits: number;
  enabled: boolean;
}

const CREDIT_PLANS: CreditPlan[] = [
  {
    package_code: "starter",
    name: "Starter",
    amount_cny: 29,
    credits: 10_000,
    enabled: true,
  },
  {
    package_code: "pro",
    name: "Pro",
    amount_cny: 99,
    credits: 50_000,
    enabled: false,
  },
  {
    package_code: "business",
    name: "Business",
    amount_cny: 299,
    credits: 200_000,
    enabled: false,
  },
];

export function CreditsTopUpClient() {
  const { t, locale } = useI18n();
  const exampleModelPrice = formatImageModelPriceExample("nano-banana", locale);
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRecharge(plan: CreditPlan) {
    if (loadingPlanId != null) return;

    setLoadingPlanId(plan.package_code);
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
        package_code: plan.package_code,
        accessToken,
      });
      window.location.assign(session.url);
    } catch (err) {
      setError(
        err instanceof DmitApiError
          ? userMessageForDmitError(err.status, err.code, err.message)
          : "Unable to start Stripe Checkout. Please try again."
      );
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

        <div className="grid gap-3 md:grid-cols-3">
          {CREDIT_PLANS.map((plan) => {
            const isLoading = loadingPlanId === plan.package_code;
            const isDisabled = loadingPlanId != null || !plan.enabled;
            return (
              <div
                key={plan.package_code}
                className="flex flex-col gap-4 rounded-lg border bg-card p-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">{plan.name}</h3>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {plan.package_code}
                    </Badge>
                  </div>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">
                    ¥{plan.amount_cny}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatCredits(plan.credits)} {t("dashboard.credits.creditsUnit")}
                  </p>
                </div>

                <Button
                  type="button"
                  variant={plan.package_code === "starter" ? "default" : "outline"}
                  disabled={isDisabled}
                  onClick={() => handleRecharge(plan)}
                  aria-label={`${t("dashboard.credits.rechargeCredits")} ${plan.name}`}
                  className="mt-auto"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {plan.enabled
                    ? t("dashboard.credits.buyStarter")
                    : t("dashboard.credits.comingSoon")}
                </Button>
              </div>
            );
          })}
        </div>

        {error ? <CheckoutError message={error} /> : null}

        <p className="text-xs text-muted-foreground">
          {t("dashboard.credits.billingNote")}
        </p>
      </CardContent>
    </Card>
  );
}

function CheckoutError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

function formatCredits(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
