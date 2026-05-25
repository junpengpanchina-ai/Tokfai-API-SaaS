import Link from "next/link";

import {
  PublicHeaderDesktopNav,
  PublicHeaderMobileNav,
  PublicHeaderToolbar,
} from "@/components/public-header-actions";
import { createClient } from "@/lib/supabase/server";

export async function PublicHeader() {
  const user = await getCurrentUser();

  return (
    <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-md bg-primary text-primary-foreground font-bold">
            T
          </div>
          <span className="text-base font-semibold tracking-tight">Tokfai</span>
        </Link>

        <PublicHeaderDesktopNav user={!!user} />
        <PublicHeaderToolbar user={!!user} />
      </div>

      <PublicHeaderMobileNav user={!!user} />
    </header>
  );
}

async function getCurrentUser() {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return null;
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}
