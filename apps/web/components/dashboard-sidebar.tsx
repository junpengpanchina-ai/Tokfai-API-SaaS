"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CreditCard,
  Gauge,
  KeyRound,
  LayoutDashboard,
  Terminal,
} from "lucide-react";

import { cn } from "@/lib/utils";

const NAV_ITEMS = [
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

export function DashboardSidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden w-60 shrink-0 border-r bg-muted/30 md:block">
      <div className="flex h-16 items-center gap-2 border-b px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground font-bold text-sm">
            T
          </div>
          <span className="text-sm font-semibold tracking-tight">Tokfai</span>
        </Link>
      </div>

      <nav className="flex flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => {
          const isActive = item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              prefetch={item.prefetch}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
