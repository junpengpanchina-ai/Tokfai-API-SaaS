"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  ADMIN_NAV_ITEMS,
  isAdminNavActive,
} from "@/lib/admin-nav";
import {
  DASHBOARD_NAV_ITEMS,
  isDashboardNavActive,
} from "@/lib/dashboard-nav";
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

export function DashboardMobileNav() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { items, isAdminRoute } = useShellNav(pathname);
  const ariaLabelKey = isAdminRoute ? "admin.nav.sections" : "nav.dashboard";

  return (
    <nav
      aria-label={t(ariaLabelKey)}
      className="sticky top-[4.75rem] z-20 shrink-0 border-b bg-muted/40 backdrop-blur scrollbar-thin-x md:hidden sm:top-16"
    >
      <div className="flex gap-1 overflow-x-auto p-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => {
          const active = isNavItemActive(pathname, item, isAdminRoute);
          const Icon = item.icon;
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
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function DashboardSidebar() {
  const pathname = usePathname();
  const { t } = useI18n();
  const { items, isAdminRoute } = useShellNav(pathname);
  const ariaLabelKey = isAdminRoute ? "admin.nav.sections" : "nav.dashboard";

  return (
    <aside className="hidden md:sticky md:top-0 md:flex md:h-svh md:w-60 md:shrink-0 md:flex-col md:self-start border-r bg-muted/30">
      <div className="flex h-16 shrink-0 items-center gap-2 border-b px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground font-bold text-sm">
            T
          </div>
          <span className="text-sm font-semibold tracking-tight">Tokfai</span>
        </Link>
      </div>

      <nav
        aria-label={t(ariaLabelKey)}
        className="min-h-0 flex-1 overflow-y-auto p-3"
      >
        <div className="flex flex-col gap-1">
          {items.map((item) => {
            const active = isNavItemActive(pathname, item, isAdminRoute);
            const Icon = item.icon;

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
                      : undefined
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {t(item.labelKey)}
                </Link>
              </div>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
