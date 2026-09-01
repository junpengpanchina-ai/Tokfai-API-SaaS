"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-provider";
import { loginPathWithNext } from "@/lib/auth/login-redirect";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { TOKFAI_API_ORIGIN } from "@/lib/tokfai-api";

const PRICING_99_HREF = "/pricing#plan-credit_99";

export function HomeHero() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const isLoggedIn = Boolean(user);

  const experienceHref = isLoggedIn
    ? PRICING_99_HREF
    : loginPathWithNext(PRICING_99_HREF);
  const docsHref = isLoggedIn ? "/dashboard/docs" : "/docs";
  const cherryHref = isLoggedIn
    ? "/dashboard/docs#client-config"
    : "/docs#client-config";

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
            <Link href={experienceHref}>
              {t("home.ctaExperience99")}
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
          <Button
            asChild
            size="lg"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={loading}
          >
            <Link href={cherryHref}>{t("home.ctaCherryStudio")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
