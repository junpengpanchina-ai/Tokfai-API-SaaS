"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ADMIN_TAB_ITEMS, isAdminNavActive } from "@/lib/admin-nav";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

export function AdminNav() {
  const pathname = usePathname();
  const { t } = useI18n();

  return (
    <nav
      aria-label={t("admin.nav.sections")}
      className="flex flex-wrap gap-1 rounded-lg border bg-muted/30 p-1"
    >
      {ADMIN_TAB_ITEMS.map((item) => {
        const isActive = isAdminNavActive(pathname, item);

        return (
          <Link
            key={item.href}
            href={item.href}
            prefetch={item.prefetch}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:bg-background/60 hover:text-foreground"
            )}
            aria-current={isActive ? "page" : undefined}
          >
            {t(item.labelKey)}
          </Link>
        );
      })}
    </nav>
  );
}
