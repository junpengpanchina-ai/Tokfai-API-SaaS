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
import { PricingBuyButton } from "@/components/pricing-buy-button";
import {
  type BillingRechargePlan,
  formatCny,
  formatPlanCredits,
} from "@/lib/billing/recharge-plans";
import { dashboardCtaHref } from "@/lib/auth/public-cta";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";
import {
  TOKFAI_API_BASE_URL,
  TOKFAI_API_KEY_FORMAT,
  TOKFAI_BILLING_POLICY,
} from "@/lib/tokfai-api";

const CREDIT_PLAN_IDS = new Set([
  "credit_10",
  "credit_20",
  "credit_49",
  "credit_99",
  "credit_499",
  "credit_999",
]);

const PLAN_DESCRIPTION_KEYS: Record<string, string> = {
  credit_10: "pricing.planDescCredit10",
  credit_20: "pricing.planDescCredit20",
  credit_49: "pricing.planDescCredit49",
  credit_99: "pricing.planDescCredit99",
  credit_499: "pricing.planDescCredit499",
  credit_999: "pricing.planDescCredit999",
};

const PLAN_AUDIENCE_KEYS: Record<string, string> = {
  credit_10: "pricing.planAudienceCredit10",
  credit_20: "pricing.planAudienceCredit20",
  credit_49: "pricing.planAudienceCredit49",
  credit_99: "pricing.planAudienceCredit99",
  credit_499: "pricing.planAudienceCredit499",
  credit_999: "pricing.planAudienceCredit999",
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
  const zh = locale === "zh";
  const dashHref = (path: string) => dashboardCtaHref(path, isLoggedIn);
  const visiblePlans = plans.filter((plan) => CREDIT_PLAN_IDS.has(plan.plan_id));

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
            href={dashHref("/dashboard/usage")}
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
            href={dashHref("/dashboard/credits")}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t("nav.credits")}
          </Link>
          {t("pricing.ledgerInSuffix")}
        </>
      ),
    },
  ];

  const splitLinks = [
    {
      href: dashHref("/dashboard/models"),
      title: zh ? "模型能力" : "Model capabilities",
      desc: zh
        ? "模型 ID、适合场景、Stream / Responses / 图片输入能力"
        : "Model ids, use cases, Stream / Responses / image-input support",
    },
    {
      href: isLoggedIn ? "/dashboard/docs" : "/docs",
      title: zh ? "接入文档" : "Integration docs",
      desc: zh
        ? "Quickstart、Chat、Responses、Image、Cherry Studio 示例"
        : "Quickstart, Chat, Responses, Image, and Cherry Studio examples",
    },
  ];

  return (
    <>
      <section className="container min-w-0 overflow-x-hidden py-12 sm:py-20 md:py-28">
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            {t("pricing.heroTitle")}
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
            {t("pricing.heroDesc")}
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-balance text-sm text-muted-foreground">
            {zh
              ? "本页只讲价格与扣费。模型能力请看模型页，接入示例请看文档页。"
              : "This page covers pricing only. Capabilities live on Models; curl examples live on Docs."}
          </p>
          <p className="mx-auto mt-3 max-w-2xl text-balance text-sm text-muted-foreground">
            {t("pricing.budgetNote")}
          </p>
        </div>

        {purchaseDisabled ? (
          <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-destructive">
            {t("pricing.plansUnavailable")}
          </p>
        ) : null}

        <div className="mx-auto mt-10 grid max-w-5xl min-w-0 grid-cols-1 gap-6 overflow-x-hidden sm:mt-16 md:grid-cols-3">
          {visiblePlans.map((plan) => {
            const descriptionKey = PLAN_DESCRIPTION_KEYS[plan.plan_id];
            const audienceKey = PLAN_AUDIENCE_KEYS[plan.plan_id];
            const canPurchase = plan.enabled && !purchaseDisabled;
            const isHighlight = plan.plan_id === "credit_20";

            return (
              <Card
                key={plan.plan_id}
                className={
                  isHighlight
                    ? "flex flex-col border-primary shadow-md ring-1 ring-primary/20"
                    : "flex flex-col"
                }
              >
                <CardHeader className="flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle>{plan.name}</CardTitle>
                    {plan.badge ? (
                      <span className="rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        {plan.badge}
                      </span>
                    ) : null}
                  </div>
                  {audienceKey ? (
                    <p className="text-xs font-medium text-primary">
                      {t(audienceKey)}
                    </p>
                  ) : null}
                  <CardDescription className="text-sm leading-relaxed">
                    {plan.description ?? (descriptionKey ? t(descriptionKey) : null)}
                  </CardDescription>
                  <p className="text-sm text-muted-foreground">
                    {t("pricing.planCreditsUse")}
                  </p>
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
                <CardContent className="pt-0">
                  {canPurchase ? (
                    <PricingBuyButton
                      planId={plan.plan_id}
                      planName={plan.name}
                      isLoggedIn={isLoggedIn}
                    />
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

        <p className="mx-auto mt-6 max-w-2xl text-center text-sm text-muted-foreground">
          {t("pricing.paymentMethods")}
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-center text-sm text-muted-foreground">
          {t("pricing.afterPurchaseTip")}
        </p>
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
              {zh ? "相关页面" : "Related pages"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {zh
                ? "定价页不混入接入教程。请按需要跳转到模型或文档。"
                : "Pricing stays separate from integration tutorials. Jump to Models or Docs as needed."}
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {splitLinks.map((item) => (
                <Card key={item.href}>
                  <CardHeader>
                    <CardTitle className="text-base">{item.title}</CardTitle>
                    <CardDescription>{item.desc}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild size="sm" variant="outline">
                      <Link href={item.href}>
                        {zh ? "打开" : "Open"}
                        <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="mt-6 text-xs text-muted-foreground">
              Base URL: <code>{TOKFAI_API_BASE_URL}</code> · Key:{" "}
              <code>{TOKFAI_API_KEY_FORMAT}</code> · {TOKFAI_BILLING_POLICY}
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
