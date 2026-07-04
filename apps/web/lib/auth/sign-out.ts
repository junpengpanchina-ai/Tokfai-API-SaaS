"use client";

import { createClient } from "@/lib/supabase/client";

/**
 * Clears the Supabase session in the browser (cookies + in-memory client state).
 * Does not touch unrelated localStorage keys such as tokfai-locale.
 */
export async function signOut(): Promise<{ error: Error | null }> {
  const supabase = createClient();
  if (!supabase) {
    return {
      error: new Error("Authentication is temporarily unavailable."),
    };
  }

  const { error } = await supabase.auth.signOut();
  return { error: error ?? null };
}
