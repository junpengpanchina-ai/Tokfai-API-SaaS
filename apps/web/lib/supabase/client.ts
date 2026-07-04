"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Browser-side Supabase client. Uses the public anon key only.
 *
 * Never import service_role anywhere in apps/web. See AGENTS.md.
 */
let browserClient: SupabaseClient | undefined;

export function hasSupabaseBrowserEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  );
}

/** Returns null instead of throwing when public Supabase env is missing. */
export function createClient(): SupabaseClient | null {
  if (!hasSupabaseBrowserEnv()) {
    return null;
  }

  if (!browserClient) {
    browserClient = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  return browserClient;
}
