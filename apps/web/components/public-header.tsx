"use client";

import Link from "next/link";

import {
  PublicHeaderDesktopNav,
  PublicHeaderMobileNav,
  PublicHeaderToolbar,
} from "@/components/public-header-actions";
import { useTenant } from "@/components/tenant-provider";

export function PublicHeader() {
  const tenant = useTenant();
  const brand = tenant.name || "Tokfai";
  const initial = brand.trim().charAt(0).toUpperCase() || "T";

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          {tenant.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={tenant.logo_url}
              alt={brand}
              className="h-8 w-8 rounded-md object-cover"
            />
          ) : (
            <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground font-bold">
              {initial}
            </div>
          )}
          <span className="text-base font-semibold tracking-tight">{brand}</span>
        </Link>

        <PublicHeaderDesktopNav />
        <PublicHeaderToolbar />
      </div>

      <PublicHeaderMobileNav />
    </header>
  );
}

