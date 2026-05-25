"use client";

import Link from "next/link";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { href: "/", labelKey: "nav.home" },
  { href: "/pricing", labelKey: "nav.pricing" },
  { href: "/docs", labelKey: "nav.docs" },
] as const;

export function PublicHeaderDesktopNav({ user }: { user: boolean }) {
  const { t } = useI18n();

  return (
    <nav className="hidden items-center gap-6 md:flex">
      {NAV_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {t(link.labelKey)}
        </Link>
      ))}
      {user ? (
        <Link
          href="/dashboard"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("nav.dashboard")}
        </Link>
      ) : null}
    </nav>
  );
}

export function PublicHeaderToolbar({ user }: { user: boolean }) {
  const { t } = useI18n();

  return (
    <div className="flex shrink-0 items-center gap-2">
      <LanguageSwitcher />
      {user ? (
        <Button asChild size="sm">
          <Link href="/dashboard">{t("nav.dashboard")}</Link>
        </Button>
      ) : (
        <>
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
          >
            <Link href="/login">{t("common.logIn")}</Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/signup">{t("common.signUp")}</Link>
          </Button>
        </>
      )}
    </div>
  );
}

export function PublicHeaderMobileNav({ user }: { user: boolean }) {
  const { t } = useI18n();

  return (
    <nav
      aria-label="Site"
      className="container flex gap-4 overflow-x-auto border-t py-2 text-sm md:hidden"
    >
      {NAV_LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={cn(
            "shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          )}
        >
          {t(link.labelKey)}
        </Link>
      ))}
      {user ? (
        <Link
          href="/dashboard"
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("nav.dashboard")}
        </Link>
      ) : (
        <Link
          href="/login"
          className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
        >
          {t("common.logIn")}
        </Link>
      )}
    </nav>
  );
}
