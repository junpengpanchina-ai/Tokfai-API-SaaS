import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Boxes,
  CreditCard,
  Gauge,
  ImageIcon,
  KeyRound,
  LayoutDashboard,
  Megaphone,
  Terminal,
} from "lucide-react";

export interface DashboardNavItem {
  href: string;
  labelKey: string;
  icon: LucideIcon;
  exact?: boolean;
  prefetch?: boolean;
}

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  {
    href: "/dashboard",
    labelKey: "nav.overview",
    icon: LayoutDashboard,
    exact: true,
    prefetch: true,
  },
  {
    href: "/dashboard/api-keys",
    labelKey: "nav.apiKeys",
    icon: KeyRound,
    prefetch: false,
  },
  {
    href: "/dashboard/playground",
    labelKey: "nav.playground",
    icon: Terminal,
    prefetch: false,
  },
  {
    href: "/dashboard/image-playground",
    labelKey: "nav.imagePlayground",
    icon: ImageIcon,
    prefetch: false,
  },
  {
    href: "/dashboard/models",
    labelKey: "nav.models",
    icon: Boxes,
    prefetch: true,
  },
  {
    href: "/dashboard/announcements",
    labelKey: "nav.announcements",
    icon: Megaphone,
    prefetch: true,
  },
  { href: "/dashboard/usage", labelKey: "nav.usage", icon: Gauge, prefetch: true },
  {
    href: "/dashboard/credits",
    labelKey: "nav.credits",
    icon: CreditCard,
    prefetch: false,
  },
  { href: "/dashboard/docs", labelKey: "nav.docs", icon: BookOpen, prefetch: true },
];

export function isDashboardNavActive(
  pathname: string,
  item: DashboardNavItem
): boolean {
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
