import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  Coins,
  Cpu,
  FileWarning,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  Package,
  Radio,
  Receipt,
  Settings,
  Tags,
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
  /** Secondary items appear after primary in the sidebar; tabs show primary only. */
  section?: "primary" | "secondary";
}

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    href: "/admin/overview",
    labelKey: "admin.nav.overview",
    icon: LayoutDashboard,
    exact: true,
    prefetch: true,
    section: "primary",
  },
  {
    href: "/admin/users",
    labelKey: "admin.nav.users",
    icon: Users,
    prefetch: true,
    section: "primary",
  },
  {
    href: "/admin/api-keys",
    labelKey: "admin.nav.apiKeys",
    icon: KeyRound,
    prefetch: true,
    section: "primary",
  },
  {
    href: "/admin/models",
    labelKey: "admin.nav.models",
    icon: Cpu,
    prefetch: true,
    section: "primary",
  },
  {
    href: "/admin/channels",
    labelKey: "admin.nav.channels",
    icon: Radio,
    prefetch: true,
    section: "primary",
  },
  {
    href: "/admin/pricing",
    labelKey: "admin.nav.pricing",
    icon: Tags,
    prefetch: true,
    section: "primary",
  },
  {
    href: "/admin/usage",
    labelKey: "admin.nav.usageLogs",
    icon: Gauge,
    prefetch: true,
    section: "primary",
  },
  {
    href: "/admin/credit-orders",
    labelKey: "admin.nav.creditOrders",
    icon: Receipt,
    prefetch: true,
    section: "primary",
  },
  {
    href: "/admin/logs",
    labelKey: "admin.nav.errorLogs",
    icon: FileWarning,
    prefetch: true,
    section: "primary",
  },
  {
    href: "/admin/settings",
    labelKey: "admin.nav.settings",
    icon: Settings,
    prefetch: true,
    section: "primary",
  },
  {
    href: "/admin/announcements",
    labelKey: "admin.nav.announcements",
    icon: Megaphone,
    prefetch: true,
    section: "secondary",
  },
  {
    href: "/admin/recharge-plans",
    labelKey: "admin.nav.rechargePlans",
    icon: Package,
    prefetch: true,
    section: "secondary",
  },
  {
    href: "/admin/credits",
    labelKey: "admin.nav.creditsLedger",
    icon: Coins,
    prefetch: false,
    section: "secondary",
  },
  {
    href: "/admin/credits-adjust",
    labelKey: "admin.nav.creditsAdjust",
    icon: Coins,
    prefetch: false,
    section: "secondary",
  },
  {
    href: "/dashboard",
    labelKey: "admin.nav.backToDashboard",
    icon: ArrowLeft,
    prefetch: true,
    backLink: true,
  },
];

export const ADMIN_TAB_ITEMS = ADMIN_NAV_ITEMS.filter(
  (item) => !item.backLink && item.section === "primary"
);

export function isAdminNavActive(
  pathname: string,
  item: AdminNavItem
): boolean {
  if (item.backLink) {
    return false;
  }

  if (pathname === "/admin" && item.href === "/admin/overview") {
    return true;
  }

  if (item.exact) {
    return pathname === item.href;
  }

  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
