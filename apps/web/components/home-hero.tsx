"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { dashboardCtaHref } from "@/lib/auth/public-cta";
import { useAuth } from "@/lib/auth/auth-provider";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { creditsPurchaseHref } from "@/lib/billing/recharge-plans";
import { TOKFAI_API_ORIGIN } from "@/lib/tokfai-api";

export function HomeHero() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const isLoggedIn = Boolean(user);

  const rechargeHref = creditsPurchaseHref(isLoggedIn);
  const docsHref = isLoggedIn ? "/dashboard/docs" : "/docs";
  const dashboardHref = dashboardCtaHref("/dashboard", isLoggedIn);

  return (
    <section className="container min-w-0 overflow-x-hidden py-20 md:py-28">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Tokfai
        </p>
        <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
          {t("home.headline")}
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-balance text-lg font-medium text-foreground/90">
          {t("home.tagline")}
        </p>
        <p className="mx-auto mt-4 max-w-2xl text-balance text-base text-muted-foreground sm:text-lg">
          {t("home.description")}
        </p>
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          {TOKFAI_API_ORIGIN}
        </p>
        <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Button
            asChild
            size="lg"
            className="w-full sm:w-auto"
            disabled={loading}
          >
            <Link href={rechargeHref}>
              {t("home.startWithCredits")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={loading}
          >
            <Link href={docsHref}>{t("home.readDocs")}</Link>
          </Button>
          {isLoggedIn ? (
            <Button
              asChild
              size="lg"
              variant="outline"
              className="w-full sm:w-auto"
            >
              <Link href={dashboardHref}>{t("nav.dashboard")}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
