"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  DashboardSidebarCreditsSummary,
  formatShellCreditsAmount,
} from "@/components/dashboard-credits-balance";
import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import {
  ADMIN_NAV_ITEMS,
  isAdminNavActive,
} from "@/lib/admin-nav";
import { useAuth } from "@/lib/auth/auth-provider";
import {
  DASHBOARD_NAV_ITEMS,
  isDashboardNavActive,
} from "@/lib/dashboard-nav";
import type { DashboardShellCredits } from "@/lib/dashboard-shell-credits";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

function useShellNav(pathname: string) {
  const isAdminRoute = pathname.startsWith("/admin");

  if (isAdminRoute) {
    return {
      isAdminRoute: true as const,
      items: ADMIN_NAV_ITEMS,
    };
  }

  return {
    isAdminRoute: false as const,
    items: DASHBOARD_NAV_ITEMS,
  };
}

function isNavItemActive(
  pathname: string,
  item: (typeof ADMIN_NAV_ITEMS)[number] | (typeof DASHBOARD_NAV_ITEMS)[number],
  isAdminRoute: boolean
): boolean {
  if (isAdminRoute) {
    return isAdminNavActive(pathname, item as (typeof ADMIN_NAV_ITEMS)[number]);
  }

  return isDashboardNavActive(
    pathname,
    item as (typeof DASHBOARD_NAV_ITEMS)[number]
  );
}

function truncateEmail(email: string, maxLength = 32): string {
  if (email.length <= maxLength) return email;
  const at = email.indexOf("@");
  if (at <= 0) return `${email.slice(0, maxLength - 1)}…`;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length + domain.length <= maxLength) return email;
  const keepLocal = Math.max(4, maxLength - domain.length - 1);
  return `${local.slice(0, keepLocal)}…${domain}`;
}

export function DashboardMobileShell({
  email,
  credits,
}: {
  email: string;
  credits: DashboardShellCredits;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { items, isAdminRoute } = useShellNav(pathname);
  const ariaLabelKey = isAdminRoute ? "admin.nav.sections" : "nav.dashboard";
  const creditsAmount = formatShellCreditsAmount(credits);
  const displayEmail = truncateEmail(email);

  return (
    <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur md:hidden">
      <div className="flex h-12 items-center justify-between gap-2 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            T
          </div>
          <span className="text-sm font-semibold tracking-tight">Tokfai</span>
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          <LanguageSwitcher dropUp />
          <DashboardSidebarSignOut compact />
        </div>
      </div>
      {displayEmail ? (
        <p
          className="truncate border-b border-border/50 px-4 pb-2 text-xs text-muted-foreground"
          title={email}
        >
          {t("common.signedInAs")}{" "}
          <span className="font-medium text-foreground">{displayEmail}</span>
        </p>
      ) : null}
      <nav
        aria-label={t(ariaLabelKey)}
        className="scrollbar-thin-x overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex gap-1 p-2">
          {items.map((item) => {
            const active = isNavItemActive(pathname, item, isAdminRoute);
            const Icon = item.icon;
            const isCreditsItem =
              !isAdminRoute && item.href === "/dashboard/credits";

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={item.prefetch}
                className={cn(
                  "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium transition-colors",
                  active
                    ? "bg-muted text-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="whitespace-nowrap">{t(item.labelKey)}</span>
                {isCreditsItem ? (
                  <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
                    {creditsAmount}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export function DashboardSidebar({
  email,
  credits,
}: {
  email: string;
  credits: DashboardShellCredits;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { items, isAdminRoute } = useShellNav(pathname);
  const ariaLabelKey = isAdminRoute ? "admin.nav.sections" : "nav.dashboard";
  const creditsAmount = formatShellCreditsAmount(credits);
  const displayEmail = truncateEmail(email);

  return (
    <div className="flex h-full w-full min-w-0 flex-col overflow-x-hidden">
      <div className="shrink-0 border-b px-4 py-4">
        <Link href="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground font-bold text-sm">
            T
          </div>
          <span className="text-sm font-semibold tracking-tight">Tokfai</span>
        </Link>
        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          {t("dashboard.shell.productTagline")}
        </p>
      </div>

      <nav
        aria-label={t(ariaLabelKey)}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3"
      >
        <div className="flex flex-col gap-1">
          {items.map((item) => {
            const active = isNavItemActive(pathname, item, isAdminRoute);
            const Icon = item.icon;
            const isCreditsItem =
              !isAdminRoute && item.href === "/dashboard/credits";

            return (
              <div key={item.href}>
                {"backLink" in item && item.backLink ? (
                  <div className="my-2 border-t pt-2" />
                ) : null}
                <Link
                  href={item.href}
                  prefetch={item.prefetch}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                    active
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                    "backLink" in item && item.backLink
                      ? "text-muted-foreground"
                      : undefined,
                    isCreditsItem ? "items-start" : undefined
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isCreditsItem ? "mt-0.5" : undefined
                    )}
                  />
                  {isCreditsItem ? (
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span>{t(item.labelKey)}</span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {creditsAmount}
                      </span>
                    </span>
                  ) : (
                    t(item.labelKey)
                  )}
                </Link>
              </div>
            );
          })}
        </div>
      </nav>

      <div className="shrink-0 border-t bg-muted/30">
        {!isAdminRoute ? (
          <div className="p-3 pb-2">
            <DashboardSidebarCreditsSummary credits={credits} />
          </div>
        ) : null}
        <DashboardSidebarAccount email={displayEmail} fullEmail={email} />
      </div>
    </div>
  );
}

function DashboardSidebarAccount({
  email,
  fullEmail,
}: {
  email: string;
  fullEmail: string;
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-3 border-t border-border/60 px-3 py-3">
      {email ? (
        <div className="min-w-0 text-xs text-muted-foreground" title={fullEmail}>
          <span>{t("common.signedInAs")} </span>
          <span className="block truncate font-medium text-foreground">
            {email}
          </span>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <LanguageSwitcher dropUp className="w-full sm:w-auto" />
        <DashboardSidebarSignOut />
      </div>
    </div>
  );
}

function DashboardSidebarSignOut({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  async function handleSignOut() {
    if (signingOut) return;
    setSignOutError(null);
    setSigningOut(true);
    const { error } = await signOut();
    setSigningOut(false);
    if (error) setSignOutError(error);
  }

  return (
    <div className="flex min-w-0 flex-col items-stretch gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={cn(
          "h-8 justify-start px-2 text-xs sm:text-sm",
          compact ? "h-8 px-2" : "w-full"
        )}
        disabled={signingOut}
        onClick={handleSignOut}
      >
        {signingOut ? t("common.signingOut") : t("common.signOut")}
      </Button>
      {signOutError ? (
        <p className="truncate text-xs text-destructive" role="alert">
          {signOutError}
        </p>
      ) : null}
    </div>
  );
}
