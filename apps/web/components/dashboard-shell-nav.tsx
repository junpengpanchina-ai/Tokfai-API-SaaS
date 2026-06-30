"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  DashboardSidebarCreditsSummary,
} from "@/components/dashboard-credits-balance";
import { DashboardLanguageSwitcher } from "@/lib/dashboard-safe/language-switcher";
import { useDashboardLabels } from "@/lib/dashboard-safe/use-dashboard-labels";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-provider";
import {
  DASHBOARD_NAV_ITEMS,
  DASHBOARD_NAV_SECTIONS,
  isDashboardNavActive,
  type DashboardNavItem,
} from "@/lib/dashboard-safe/nav";
import type { DashboardShellCredits } from "@/lib/dashboard-safe/shell-credits";
import { cn } from "@/lib/dashboard-safe/classnames";

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
  sessionUnavailable = false,
}: {
  email: string;
  credits: DashboardShellCredits;
  sessionUnavailable?: boolean;
}) {
  const pathname = usePathname();
  const { t } = useDashboardLabels();
  const displayEmail = email
    ? truncateEmail(email)
    : sessionUnavailable
      ? "Unknown"
      : "";

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
          <DashboardLanguageSwitcher dropUp />
          <DashboardSidebarSignOut compact />
        </div>
      </div>
      {displayEmail ? (
        <p
          className="truncate border-b border-border/50 px-4 pb-2 text-xs text-muted-foreground"
          title={email || displayEmail}
        >
          {t("common.signedInAs")}{" "}
          <span className="font-medium text-foreground">{displayEmail}</span>
        </p>
      ) : null}
      <nav
        aria-label={t("nav.dashboard")}
        className="scrollbar-thin-x overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex gap-1 p-2">
          {DASHBOARD_NAV_ITEMS.map((item) => {
            const active = isDashboardNavActive(pathname, item);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={false}
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
  sessionUnavailable = false,
}: {
  email: string;
  credits: DashboardShellCredits;
  sessionUnavailable?: boolean;
}) {
  const pathname = usePathname();
  const { t } = useDashboardLabels();
  const displayEmail = email
    ? truncateEmail(email)
    : sessionUnavailable
      ? "Unknown"
      : "";

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
        aria-label={t("nav.dashboard")}
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-3 py-3"
      >
        <div className="flex flex-col gap-3">
          {DASHBOARD_NAV_SECTIONS.map((section) => (
            <div key={section.id}>
              <p
                className="px-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70"
              >
                {t(section.labelKey)}
              </p>
              <div className="flex flex-col gap-0.5">
                {section.items.map((item) => (
                  <DashboardNavLink
                    key={item.href}
                    item={item}
                    active={isDashboardNavActive(pathname, item)}
                    t={t}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </nav>

      <div className="shrink-0 border-t bg-muted/30">
        <div className="p-3 pb-2">
          <DashboardSidebarCreditsSummary credits={credits} />
        </div>
        <DashboardSidebarAccount
          email={displayEmail}
          fullEmail={email || displayEmail}
        />
      </div>
    </div>
  );
}

function DashboardNavLink({
  item,
  active,
  t,
}: {
  item: DashboardNavItem;
  active: boolean;
  t: (key: string) => string;
}) {
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      prefetch={false}
      className={cn(
        "flex h-9 items-center gap-2.5 rounded-md px-3 text-sm transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
      )}
      aria-current={active ? "page" : undefined}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 truncate">{t(item.labelKey)}</span>
    </Link>
  );
}

function DashboardSidebarAccount({
  email,
  fullEmail,
}: {
  email: string;
  fullEmail: string;
}) {
  const { t } = useDashboardLabels();

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
        <DashboardLanguageSwitcher dropUp className="w-full sm:w-auto" />
        <DashboardSidebarSignOut />
      </div>
    </div>
  );
}

function DashboardSidebarSignOut({ compact = false }: { compact?: boolean }) {
  const { t } = useDashboardLabels();
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
