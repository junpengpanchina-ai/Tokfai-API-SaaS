"use client";

import Link from "next/link";

import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";

const FOOTER_LINKS = [
  { href: "/pricing", labelKey: "nav.pricing" },
  { href: "/docs", labelKey: "nav.docs" },
  { href: "/use-cases/openai-compatible-api", labelKey: "common.footerUseCases" },
  { href: "/terms", labelKey: "common.footerTerms" },
  { href: "/privacy", labelKey: "common.footerPrivacy" },
  { href: "/dashboard", labelKey: "nav.dashboard" },
] as const;

export function PublicFooter() {
  const { t } = useI18n();

  return (
    <footer className="border-t">
      <div className="container flex flex-col gap-4 py-6 text-xs text-muted-foreground sm:h-auto sm:flex-row sm:items-center sm:justify-between sm:py-4">
        <span>
          {formatMessage(t("common.copyright"), {
            year: String(new Date().getFullYear()),
          })}
        </span>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {FOOTER_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="hover:text-foreground"
            >
              {t(link.labelKey)}
            </Link>
          ))}
        </nav>
      </div>
    </footer>
  );
}
