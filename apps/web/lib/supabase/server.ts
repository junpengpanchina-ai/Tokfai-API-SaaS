import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

/**
 * Server-side Supabase client for RSC, Route Handlers, and Server Actions.
 * Uses the public anon key + the user's session cookies. RLS is enforced.
 *
 * The frontend MUST NEVER hold SUPABASE_SERVICE_ROLE_KEY. See AGENTS.md.
 */
export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              if (value) {
                cookieStore.set(name, value, options);
              } else {
                cookieStore.delete(name);
              }
            });
          } catch {
            // Called from a Server Component — middleware handles refresh.
          }
        },
      },
    }
  );
}
