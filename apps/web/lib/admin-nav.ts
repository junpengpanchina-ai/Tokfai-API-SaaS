import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Coins,
  Cpu,
  Gauge,
  LayoutDashboard,
  Megaphone,
  Package,
  Users,
} from "lucide-react";

export interface AdminNavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  exact?: boolean;
  prefetch?: boolean;
  /** Shown in the sidebar only — excluded from the horizontal tab bar. */
  backLink?: boolean;
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    href: "/admin",
    labelKey: "admin.nav.overview",
    icon: LayoutDashboard,
    exact: true,
    prefetch: true,
  },
  {
    href: "/admin/models",
    labelKey: "admin.nav.modelPricing",
    icon: Cpu,
    prefetch: true,
  },
  {
    href: "/admin/announcements",
    labelKey: "admin.nav.announcements",
    icon: Megaphone,
    prefetch: true,
  },
  {
    href: "/admin/usage",
    labelKey: "admin.nav.usageLogs",
    icon: Gauge,
    prefetch: true,
  },
  {
    href: "/admin/recharge-plans",
    labelKey: "admin.nav.rechargePlans",
    icon: Package,
    prefetch: true,
  },
  {
    href: "/admin/credits",
    labelKey: "admin.nav.creditsLedger",
    icon: Coins,
    prefetch: false,
  },
  {
    href: "/admin/users",
    labelKey: "admin.nav.users",
    icon: Users,
    prefetch: true,
  },
  {
    href: "/dashboard",
    labelKey: "admin.nav.backToDashboard",
    icon: ArrowLeft,
    prefetch: true,
    backLink: true,
  },
];

export const ADMIN_TAB_ITEMS = ADMIN_NAV_ITEMS.filter((item) => !item.backLink);

export function isAdminNavActive(
  pathname: string,
  item: AdminNavItem
): boolean {
  if (item.backLink) {
    return false;
  }

  if (item.exact) {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
