import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  BookOpen,
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

export type AdminNavGroup = "ops" | "catalog" | "content" | "system";

export interface AdminNavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  exact?: boolean;
  prefetch?: boolean;
  /** Shown in the sidebar only — excluded from the horizontal tab bar. */
  backLink?: boolean;
  /** Sidebar group for public-beta ops navigation. */
  group?: AdminNavGroup;
}

export const ADMIN_NAV_GROUP_ORDER: AdminNavGroup[] = [
  "ops",
  "catalog",
  "content",
  "system",
];

export const ADMIN_NAV_GROUP_LABEL_KEYS: Record<AdminNavGroup, string> = {
  ops: "admin.nav.groupOps",
  catalog: "admin.nav.groupCatalog",
  content: "admin.nav.groupContent",
  system: "admin.nav.groupSystem",
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  // 运营
  {
    href: "/admin/overview",
    labelKey: "admin.nav.overview",
    icon: LayoutDashboard,
    exact: true,
    prefetch: true,
    group: "ops",
  },
  {
    href: "/admin/users",
    labelKey: "admin.nav.users",
    icon: Users,
    prefetch: true,
    group: "ops",
  },
  {
    href: "/admin/api-keys",
    labelKey: "admin.nav.apiKeys",
    icon: KeyRound,
    prefetch: true,
    group: "ops",
  },
  {
    href: "/admin/usage",
    labelKey: "admin.nav.usageLogs",
    icon: Gauge,
    prefetch: true,
    group: "ops",
  },
  {
    href: "/admin/credit-orders",
    labelKey: "admin.nav.creditOrders",
    icon: Receipt,
    prefetch: true,
    group: "ops",
  },
  {
    href: "/admin/logs",
    labelKey: "admin.nav.errorLogs",
    icon: FileWarning,
    prefetch: true,
    group: "ops",
  },
  {
    href: "/admin/credits",
    labelKey: "admin.nav.creditsLedger",
    icon: Coins,
    prefetch: false,
    group: "ops",
  },
  {
    href: "/admin/credits-adjust",
    labelKey: "admin.nav.creditsAdjust",
    icon: Coins,
    prefetch: false,
    group: "ops",
  },
  // 商品
  {
    href: "/admin/models",
    labelKey: "admin.nav.models",
    icon: Cpu,
    prefetch: true,
    group: "catalog",
  },
  {
    href: "/admin/pricing",
    labelKey: "admin.nav.pricing",
    icon: Tags,
    prefetch: true,
    group: "catalog",
  },
  {
    href: "/admin/recharge-plans",
    labelKey: "admin.nav.rechargePlans",
    icon: Package,
    prefetch: true,
    group: "catalog",
  },
  // 内容
  {
    href: "/admin/announcements",
    labelKey: "admin.nav.announcements",
    icon: Megaphone,
    prefetch: true,
    group: "content",
  },
  {
    href: "/admin/docs",
    labelKey: "admin.nav.docs",
    icon: BookOpen,
    prefetch: true,
    group: "content",
  },
  // 系统
  {
    href: "/admin/channels",
    labelKey: "admin.nav.channels",
    icon: Radio,
    prefetch: true,
    group: "system",
  },
  {
    href: "/admin/settings",
    labelKey: "admin.nav.settings",
    icon: Settings,
    prefetch: true,
    group: "system",
  },
  {
    href: "/dashboard",
    labelKey: "admin.nav.backToDashboard",
    icon: ArrowLeft,
    prefetch: true,
    backLink: true,
  },
];

/** Compact top tabs — one representative strip across groups (no back link). */
export const ADMIN_TAB_ITEMS = ADMIN_NAV_ITEMS.filter(
  (item) =>
    !item.backLink &&
    [
      "/admin/overview",
      "/admin/users",
      "/admin/models",
      "/admin/pricing",
      "/admin/recharge-plans",
      "/admin/announcements",
      "/admin/docs",
      "/admin/channels",
      "/admin/settings",
    ].includes(item.href)
);

export function adminNavItemsByGroup(): Array<{
  group: AdminNavGroup;
  labelKey: string;
  items: AdminNavItem[];
}> {
  return ADMIN_NAV_GROUP_ORDER.map((group) => ({
    group,
    labelKey: ADMIN_NAV_GROUP_LABEL_KEYS[group],
    items: ADMIN_NAV_ITEMS.filter((item) => item.group === group),
  }));
}

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
