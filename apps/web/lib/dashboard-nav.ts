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

export interface DashboardNavSection {
  id: string;
  labelKey: string;
  items: DashboardNavItem[];
}

export const DASHBOARD_NAV_SECTIONS: DashboardNavSection[] = [
  {
    id: "workspace",
    labelKey: "nav.sectionWorkspace",
    items: [
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
    ],
  },
  {
    id: "metering",
    labelKey: "nav.sectionMetering",
    items: [
      {
        href: "/dashboard/models",
        labelKey: "nav.models",
        icon: Boxes,
        prefetch: true,
      },
      { href: "/dashboard/usage", labelKey: "nav.usage", icon: Gauge, prefetch: true },
      {
        href: "/dashboard/credits",
        labelKey: "nav.credits",
        icon: CreditCard,
        prefetch: false,
      },
    ],
  },
  {
    id: "service",
    labelKey: "nav.sectionService",
    items: [
      { href: "/dashboard/docs", labelKey: "nav.docs", icon: BookOpen, prefetch: true },
      {
        href: "/dashboard/announcements",
        labelKey: "nav.announcements",
        icon: Megaphone,
        prefetch: true,
      },
    ],
  },
];

/** Flat list for mobile tab bar and other consumers that need a single sequence. */
export const DASHBOARD_NAV_ITEMS: DashboardNavItem[] = DASHBOARD_NAV_SECTIONS.flatMap(
  (section) => section.items
);

export function isDashboardNavActive(
  pathname: string,
  item: DashboardNavItem
): boolean {
  if (item.exact) {
    return pathname === item.href;
  }
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}
