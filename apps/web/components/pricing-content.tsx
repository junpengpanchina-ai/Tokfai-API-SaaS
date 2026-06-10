"use client";

import Link from "next/link";
import {
  ArrowRight,
  Code2,
  Gauge,
  ImageIcon,
  Info,
  MessageSquare,
  Wallet,
} from "lucide-react";

import { ModelPricingTables } from "@/components/model-pricing-table";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type BillingRechargePlan,
  creditsPurchaseHref,
  formatCny,
  formatPlanCredits,
} from "@/lib/billing/recharge-plans";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";
import {
  TOKFAI_API_BASE_URL,
  TOKFAI_API_KEY_FORMAT,
  TOKFAI_BILLING_POLICY,
  TOKFAI_PLAYGROUND_POLICY,
  TOKFAI_STARTER_PLAN,
} from "@/lib/tokfai-api";

const PLAN_DESCRIPTION_KEYS: Record<string, string> = {
  starter: "pricing.planDescStarter",
  pro: "pricing.planDescPro",
  business: "pricing.planDescBusiness",
};

export function PricingContent({
  plans,
  purchaseDisabled = false,
  isLoggedIn = false,
}: {
  plans: BillingRechargePlan[];
  purchaseDisabled?: boolean;
  isLoggedIn?: boolean;
}) {
  const { t, locale } = useI18n();
  const purchaseHref = creditsPurchaseHref(isLoggedIn);

  const usagePoints = [
    { id: "starter-plan", icon: Wallet, text: t("pricing.starterPlanLine") },
    {
      id: "starter-use",
      icon: Gauge,
      text: t("pricing.starterUse"),
    },
    {
      id: "billing-success",
      icon: MessageSquare,
      text: t("pricing.billingSuccessCalls"),
    },
    {
      id: "billing-failed",
      icon: ImageIcon,
      text: t("pricing.billingFailedCalls"),
    },
    {
      id: "chat-billing",
      icon: MessageSquare,
      text: t("pricing.chatBillingSummary"),
    },
    {
      id: "image-billing",
      icon: ImageIcon,
      text: t("pricing.imageBillingSummary"),
    },
    {
      id: "usage-dashboard",
      icon: ArrowRight,
      text: (
        <>
          {t("pricing.monitorUsagePrefix")}{" "}
          <Link
            href="/dashboard/usage"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t("nav.usage")}
          </Link>
          {t("pricing.monitorUsageSuffix")}
        </>
      ),
    },
    {
      id: "credits-ledger",
      icon: Code2,
      text: (
        <>
          {t("pricing.ledgerInPrefix")}{" "}
          <Link
            href="/dashboard/credits"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t("nav.credits")}
          </Link>
          {t("pricing.ledgerInSuffix")}
        </>
      ),
    },
  ];

  const devItems = [
    { label: t("pricing.devLabelBaseUrl"), value: TOKFAI_API_BASE_URL },
    { label: t("pricing.devLabelApiKeyFormat"), value: TOKFAI_API_KEY_FORMAT },
    { label: t("pricing.devLabelStarter"), value: TOKFAI_STARTER_PLAN },
    { label: t("pricing.devLabelBilling"), value: TOKFAI_BILLING_POLICY },
    { label: t("pricing.devLabelPlayground"), value: TOKFAI_PLAYGROUND_POLICY },
    {
      label: t("pricing.devLabelModels"),
      value: "/dashboard/models",
      href: "/dashboard/models",
    },
    {
      label: t("pricing.devLabelChatPlayground"),
      value: "/dashboard/playground",
      href: "/dashboard/playground",
    },
    {
      label: t("pricing.devLabelImagePlayground"),
      value: "/dashboard/image-playground",
      href: "/dashboard/image-playground",
    },
    {
      label: t("pricing.devLabelApiKeys"),
      value: "/dashboard/api-keys",
      href: "/dashboard/api-keys",
    },
    {
      label: t("pricing.devLabelDocs"),
      value: "/dashboard/docs",
      href: "/dashboard/docs",
    },
  ] as const;

  return (
    <>
      <section className="container py-20 md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
            {t("pricing.heroTitle")}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-lg text-muted-foreground">
            {t("pricing.heroDesc")}
          </p>
        </div>

        {purchaseDisabled ? (
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-destructive">
            {t("pricing.plansUnavailable")}
          </p>
        ) : null}

        <div className="mx-auto mt-16 grid max-w-5xl gap-6 md:grid-cols-3">
          {plans.map((plan) => {
            const descriptionKey = PLAN_DESCRIPTION_KEYS[plan.plan_id];
            const canPurchase = plan.enabled && !purchaseDisabled;
            const isHighlight = plan.plan_id === "pro";

            return (
              <Card
                key={plan.plan_id}
                className={
                  isHighlight
                    ? "border-primary shadow-md ring-1 ring-primary/20"
                    : ""
                }
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{plan.name}</CardTitle>
                    {plan.badge ? (
                      <span className="rounded-md bg-secondary px-2 py-0.5 text-[10px] font-medium">
                        {plan.badge}
                      </span>
                    ) : null}
                  </div>
                  <CardDescription>
                    {plan.description ?? (descriptionKey ? t(descriptionKey) : null)}
                    {plan.plan_id === "starter" ? (
                      <span className="mt-2 block text-muted-foreground">
                        {t("pricing.starterUse")}
                      </span>
                    ) : null}
                  </CardDescription>
                  <div className="pt-4">
                    <div className="text-3xl font-semibold tracking-tight">
                      {formatCny(plan.amount_cents)}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {formatMessage(t("pricing.baseCreditsLine"), {
                        credits: formatPlanCredits(plan.base_credits),
                      })}
                    </div>
                    {plan.bonus_credits > 0 ? (
                      <div className="mt-1 text-xs font-medium text-primary">
                        {formatMessage(t("pricing.bonusCreditsLine"), {
                          bonus: formatPlanCredits(plan.bonus_credits),
                        })}
                      </div>
                    ) : null}
                    <div className="mt-1 text-sm font-medium text-foreground">
                      {formatMessage(t("pricing.finalCreditsLine"), {
                        credits: formatPlanCredits(plan.credits),
                      })}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {canPurchase ? (
                    <Button asChild className="w-full">
                      <Link href={purchaseHref}>
                        {formatMessage(t("pricing.buyPlan"), { name: plan.name })}
                      </Link>
                    </Button>
                  ) : (
                    <Button className="w-full" disabled variant="outline">
                      {t("pricing.comingSoon")}
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="border-t bg-muted/30">
        <div className="container py-16 md:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              {t("pricing.usageTitle")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("pricing.usageDesc")}
            </p>
          </div>
          <ul className="mx-auto mt-10 grid max-w-2xl gap-4">
            {usagePoints.map((point) => {
              const Icon = point.icon;
              return (
                <li
                  key={point.id}
                  className="flex items-start gap-3 rounded-lg border bg-background px-4 py-3 text-sm text-muted-foreground"
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <span>{point.text}</span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <section className="container py-16 md:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="max-w-2xl">
            <h2 className="text-2xl font-semibold tracking-tight">
              {t("pricing.modelRatesTitle")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("pricing.modelRatesDesc")}
            </p>
          </div>

          <Card className="mt-6 border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30">
            <CardContent className="flex items-start gap-3 px-5 py-4 text-sm text-amber-900/90 dark:text-amber-100/90">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <p>{t("pricing.disclaimer")}</p>
            </CardContent>
          </Card>

          <div className="mt-8">
            <ModelPricingTables
              locale={locale}
              t={t}
              labels={{
                chatTitle: t("pricing.chatModelsTitle"),
                imageTitle: t("pricing.imageModelsTitle"),
                imageIntro: t("pricing.imageModelsIntro"),
                colModel: t("pricing.colModel"),
                colModelId: t("pricing.colModelId"),
                colInput: t("pricing.colInput"),
                colOutput: t("pricing.colOutput"),
                colCreditsPrice: t("pricing.colCreditsPrice"),
                colReferencePrice: t("pricing.colReferencePrice"),
                colPrice: t("pricing.colPrice"),
                colBillingUnit: t("pricing.colBillingUnit"),
                colUseCase: t("pricing.colUseCase"),
                colTags: t("pricing.colTags"),
                comingSoon: t("pricing.comingSoon"),
              }}
            />
          </div>
        </div>
      </section>

      <section className="border-t bg-muted/30">
        <div className="container py-16 md:py-20">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-semibold tracking-tight">
              {t("pricing.forDevelopersTitle")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("pricing.forDevelopersDesc")}
            </p>
            <Card className="mt-8">
              <CardContent className="divide-y p-0">
                {devItems.map((item) => (
                  <div
                    key={item.label}
                    className="flex flex-col gap-1 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {item.label}
                    </span>
                    {"href" in item && item.href ? (
                      <Link
                        href={item.href}
                        className="break-all font-mono text-sm text-primary underline-offset-4 hover:underline sm:text-right"
                      >
                        {item.value}
                      </Link>
                    ) : (
                      <code className="break-all font-mono text-sm text-muted-foreground sm:text-right">
                        {item.value}
                      </code>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>
      </section>
    </>
  );
}
