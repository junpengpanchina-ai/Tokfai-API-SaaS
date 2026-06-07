"use client";

import Link from "next/link";
import { ArrowRight, ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { TOKFAI_API_BASE_URL } from "@/lib/tokfai-api";

const COMPAT_CLIENTS = [
  "compatCursor",
  "compatCherryStudio",
  "compatOpenAiSdk",
  "compatCustomApp",
] as const;

export function HomeHero() {
  const { t } = useI18n();

  return (
    <section className="container py-20 md:py-28">
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-primary">
          Tokfai
        </p>
        <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
          {t("home.headline")}
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
          {t("home.description")}
        </p>
        <div className="mx-auto mt-8 max-w-2xl">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t("home.compatLabel")}
          </p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {COMPAT_CLIENTS.map((key) => (
              <span
                key={key}
                className="rounded-full border bg-background px-3 py-1 text-xs font-medium text-foreground"
              >
                {t(`home.${key}`)}
              </span>
            ))}
          </div>
          <p className="mt-4 font-mono text-xs text-muted-foreground">
            {TOKFAI_API_BASE_URL}
          </p>
        </div>
        <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <Button asChild size="lg" className="w-full sm:w-auto">
            <Link href="/dashboard/credits">
              {t("home.startWithCredits")}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link href="/dashboard/image-playground">
              {t("home.tryImagePlayground")}
              <ImageIcon className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link href="/pricing">{t("home.viewPricing")}</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
            <Link href="/dashboard/docs">{t("home.readDocs")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
