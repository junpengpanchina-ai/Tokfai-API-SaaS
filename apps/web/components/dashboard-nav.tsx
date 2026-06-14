"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  DashboardSidebarCreditsSummary,
  formatShellCreditsAmount,
} from "@/components/dashboard-credits-balance";
import {
  ADMIN_NAV_ITEMS,
  isAdminNavActive,
} from "@/lib/admin-nav";
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

export function DashboardMobileNav({
  credits,
}: {
  credits: DashboardShellCredits;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { items, isAdminRoute } = useShellNav(pathname);
  const ariaLabelKey = isAdminRoute ? "admin.nav.sections" : "nav.dashboard";
  const creditsAmount = formatShellCreditsAmount(credits);

  return (
    <nav
      aria-label={t(ariaLabelKey)}
      className="sticky top-14 z-20 shrink-0 border-b bg-muted/40 backdrop-blur scrollbar-thin-x md:hidden"
    >
      <div className="flex gap-1 overflow-x-auto p-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
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
  );
}

export function DashboardSidebar({
  credits,
}: {
  credits: DashboardShellCredits;
}) {
  const pathname = usePathname();
  const { t } = useI18n();
  const { items, isAdminRoute } = useShellNav(pathname);
  const ariaLabelKey = isAdminRoute ? "admin.nav.sections" : "nav.dashboard";
  const creditsAmount = formatShellCreditsAmount(credits);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground font-bold text-sm">
            T
          </div>
          <span className="text-sm font-semibold tracking-tight">Tokfai</span>
        </Link>
      </div>

      <nav
        aria-label={t(ariaLabelKey)}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-4"
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

      {!isAdminRoute ? (
        <div className="shrink-0 border-t bg-muted/30 p-3">
          <DashboardSidebarCreditsSummary credits={credits} />
        </div>
      ) : null}
    </div>
  );
}
