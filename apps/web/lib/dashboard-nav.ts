import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CreditCard,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Terminal,
} from "lucide-react";

export interface DashboardNavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  exact?: boolean;
  prefetch?: boolean;
}

export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: LayoutDashboard,
    exact: true,
    prefetch: true,
  },
  {
    href: "/dashboard/api-keys",
    label: "API Keys",
    icon: KeyRound,
    prefetch: false,
  },
  {
    href: "/dashboard/playground",
    label: "Playground",
    icon: Terminal,
    prefetch: false,
  },
  { href: "/dashboard/usage", label: "Usage", icon: Gauge, prefetch: true },
  {
    href: "/dashboard/credits",
    label: "Credits",
    icon: CreditCard,
    prefetch: false,
  },
  { href: "/dashboard/docs", label: "Docs", icon: BookOpen, prefetch: true },
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
