"use client";

import Link from "next/link";

import { useI18n } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

const API_REFERENCE_HREF = "/dashboard/docs";

export function ApiReferenceLink({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  const { t } = useI18n();

  return (
    <Link
      href={API_REFERENCE_HREF}
      className={cn("transition-colors hover:text-foreground", className)}
    >
      {children ?? t("common.apiReference")}
    </Link>
  );
}

export { API_REFERENCE_HREF };
