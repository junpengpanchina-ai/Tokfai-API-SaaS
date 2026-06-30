import Link from "next/link";

import { dashboardLabel } from "@/lib/dashboard-safe/labels";
import {
  DASHBOARD_NAV_ITEMS,
  DASHBOARD_NAV_SECTIONS,
  type DashboardNavItem,
} from "@/lib/dashboard-safe/nav";

const LOCALE: "en" = "en";

function t(key: string): string {
  return dashboardLabel(key, LOCALE);
}

function StaticNavLink({ item }: { item: DashboardNavItem }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      prefetch={false}
      className="flex h-9 items-center gap-2.5 rounded-md px-3 text-sm text-muted-foreground"
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{t(item.labelKey)}</span>
    </Link>
  );
}

function StaticMobileNavLink({ item }: { item: DashboardNavItem }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      prefetch={false}
      className="flex shrink-0 items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="whitespace-nowrap">{t(item.labelKey)}</span>
    </Link>
  );
}

export function DashboardShellStaticFallback({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <aside className="fixed left-0 top-0 z-30 hidden h-svh w-60 border-r bg-muted/30 md:flex md:flex-col">
        <div className="flex h-full w-full min-w-0 flex-col overflow-x-hidden">
          <div className="shrink-0 border-b px-4 py-4">
            <Link href="/" className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                T
              </div>
              <span className="text-sm font-semibold tracking-tight">Tokfai</span>
            </Link>
            <p className="mt-2 text-xs leading-snug text-muted-foreground">
              {t("dashboard.shell.productTagline")}
            </p>
          </div>

          <nav
            aria-label={t("nav.dashboard")}
            className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3"
          >
            <div className="flex flex-col gap-3">
              {DASHBOARD_NAV_SECTIONS.map((section) => (
                <div key={section.id}>
                  <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70">
                    {t(section.labelKey)}
                  </p>
                  <div className="flex flex-col gap-0.5">
                    {section.items.map((item) => (
                      <StaticNavLink key={item.href} item={item} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </nav>

          <div className="shrink-0 border-t bg-muted/30 p-3">
            <div className="rounded-md border bg-background/80 p-3 text-sm shadow-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("dashboard.shell.sidebarCreditsLabel")}
              </p>
              <p className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">
                —
              </p>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-col md:pl-60">
        <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur md:hidden">
          <div className="flex h-12 items-center justify-between gap-2 px-4">
            <Link href="/" className="flex shrink-0 items-center gap-2">
              <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
                T
              </div>
              <span className="text-sm font-semibold tracking-tight">Tokfai</span>
            </Link>
          </div>
          <nav
            aria-label={t("nav.dashboard")}
            className="scrollbar-thin-x overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <div className="flex gap-1 p-2">
              {DASHBOARD_NAV_ITEMS.map((item) => (
                <StaticMobileNavLink key={item.href} item={item} />
              ))}
            </div>
          </nav>
        </div>

        <main className="min-h-svh min-w-0 flex-1 px-4 py-6 sm:px-6 md:py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>

        <footer className="border-t px-4 py-4 text-xs text-muted-foreground sm:px-6">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>{t("common.footerTagline")}</span>
            <Link
              href="/dashboard/docs"
              className="transition-colors hover:text-foreground"
            >
              {t("common.apiReference")}
            </Link>
          </div>
        </footer>
      </div>
    </>
  );
}
