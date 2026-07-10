import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

/** Public anon env only — never log key values. */
export function hasSupabaseServerEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  );
}

function supabaseUrl(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_URL!.trim();
}

function supabaseAnonKey(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.trim();
}

/**
 * Fail-open server Supabase client for RSC / Server Actions.
 * Returns null when env is missing or client init fails — never throws.
 * Does not initialize at module load time.
 */
export function tryCreateServerClient(): SupabaseClient | null {
  if (!hasSupabaseServerEnv()) {
    return null;
  }

  try {
    const cookieStore = cookies();

    return createServerClient(supabaseUrl(), supabaseAnonKey(), {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Component — middleware refreshes the session cookie.
          }
        },
      },
    });
  } catch (error) {
    console.error("[dashboard-ssr]", "tryCreateServerClient_failed", {
      envPresent: true,
      message: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}

/**
 * Fail-open alias of tryCreateServerClient.
 * Callers that need a hard failure should use requireServerClient().
 */
export function createClient(): SupabaseClient | null {
  return tryCreateServerClient();
}

/**
 * Throws when Supabase is unavailable. Use only outside dashboard fail-open paths
 * (admin, auth routes that must not continue without a client).
 */
export function requireServerClient(): SupabaseClient {
  const client = tryCreateServerClient();
  if (!client) {
    throw new Error(
      "Supabase server client unavailable (missing NEXT_PUBLIC_SUPABASE_URL / ANON_KEY or init failure)"
    );
  }
  return client;
}

/**
 * Supabase client for Route Handlers (OAuth callback, sign-out).
 * Fail-open: returns null when env/init fails.
 */
export function createRouteHandlerClient(): SupabaseClient | null {
  if (!hasSupabaseServerEnv()) {
    return null;
  }

  try {
    const cookieStore = cookies();

    return createServerClient(supabaseUrl(), supabaseAnonKey(), {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    });
  } catch (error) {
    console.error("[dashboard-ssr]", "createRouteHandlerClient_failed", {
      envPresent: true,
      message: error instanceof Error ? error.message : "unknown",
    });
    return null;
  }
}
