"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { dashboardCtaHref } from "@/lib/auth/public-cta";
import { useAuth } from "@/lib/auth/auth-provider";
import { useI18n } from "@/lib/i18n/i18n-provider";
import {
  TOKFAI_API_BASE_URL,
  TOKFAI_API_KEY_FORMAT,
  TOKFAI_API_KEY_PLACEHOLDER,
  TOKFAI_BILLING_POLICY,
  TOKFAI_PLAYGROUND_POLICY,
  TOKFAI_STARTER_PLAN,
} from "@/lib/tokfai-api";

const STEP_KEYS = [
  { step: 1, titleKey: "home.step1Title", bodyKey: "home.step1Body" },
  { step: 2, titleKey: "home.step2Title", bodyKey: "home.step2Body" },
  { step: 3, titleKey: "home.step3Title", bodyKey: "home.step3Body" },
  { step: 4, titleKey: "home.step4Title", bodyKey: "home.step4Body" },
  { step: 5, titleKey: "home.step5Title", bodyKey: "home.step5Body" },
] as const;

const DEV_SNIPPET = [
  { labelKey: "home.devLabelBaseUrl", value: TOKFAI_API_BASE_URL },
  { labelKey: "home.devLabelApiKeyFormat", value: TOKFAI_API_KEY_FORMAT },
  { labelKey: "home.devLabelStarter", value: TOKFAI_STARTER_PLAN },
  { labelKey: "home.devLabelBilling", value: TOKFAI_BILLING_POLICY },
  { labelKey: "home.devLabelPlayground", value: TOKFAI_PLAYGROUND_POLICY },
  {
    labelKey: "home.devLabelAuthExample",
    value: `Bearer ${TOKFAI_API_KEY_PLACEHOLDER}`,
  },
] as const;

export function HomeExtraSections() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isLoggedIn = Boolean(user);
  const dashHref = (path: string) => dashboardCtaHref(path, isLoggedIn);

  return (
    <>
      <section className="border-t bg-muted/30">
        <div className="container py-16 md:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight">
              {t("home.howItWorksTitle")}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("home.howItWorksDesc")}
            </p>
          </div>
          <ol className="mx-auto mt-10 grid max-w-3xl gap-4">
            {STEP_KEYS.map((item) => (
              <li
                key={item.step}
                className="flex gap-4 rounded-lg border bg-background px-5 py-4"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                  {item.step}
                </span>
                <div className="min-w-0 text-left">
                  <p className="font-medium">{t(item.titleKey)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {t(item.bodyKey)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container py-16 md:py-20">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-2xl font-semibold tracking-tight">
            {t("home.devQuickRefTitle")}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("home.devQuickRefDesc")}
          </p>
          <Card className="mt-8">
            <CardContent className="divide-y p-0">
              {DEV_SNIPPET.map((row) => (
                <div
                  key={row.labelKey}
                  className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                >
                  <span className="text-sm font-medium text-foreground">
                    {t(row.labelKey)}
                  </span>
                  <code className="break-all font-mono text-sm text-muted-foreground sm:text-right">
                    {row.value}
                  </code>
                </div>
              ))}
              <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="text-sm font-medium text-foreground">
                  {t("home.devLabelModels")}
                </span>
                <Link
                  href={dashHref("/dashboard/models")}
                  className="font-mono text-sm text-primary underline-offset-4 hover:underline sm:text-right"
                >
                  /dashboard/models
                </Link>
              </div>
              <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="text-sm font-medium text-foreground">
                  {t("common.chatPlayground")}
                </span>
                <Link
                  href={dashHref("/dashboard/playground")}
                  className="font-mono text-sm text-primary underline-offset-4 hover:underline sm:text-right"
                >
                  /dashboard/playground
                </Link>
              </div>
              <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="text-sm font-medium text-foreground">
                  {t("common.imagePlayground")}
                </span>
                <Link
                  href={dashHref("/dashboard/image-playground")}
                  className="font-mono text-sm text-primary underline-offset-4 hover:underline sm:text-right"
                >
                  /dashboard/image-playground
                </Link>
              </div>
              <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <span className="text-sm font-medium text-foreground">
                  {t("home.devLabelImageApiDocs")}
                </span>
                <Link
                  href="/docs"
                  className="font-mono text-sm text-primary underline-offset-4 hover:underline sm:text-right"
                >
                  POST /v1/images/generations
                </Link>
              </div>
            </CardContent>
          </Card>
          <div className="mt-6 flex justify-center">
            <Button asChild variant="ghost" size="sm">
              <Link href={dashHref("/dashboard/docs")}>
                {t("home.fullApiReference")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </>
  );
}
