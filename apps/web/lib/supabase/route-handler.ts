import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { copySupabaseCookies } from "@/lib/supabase/cookies";

/**
 * Supabase client for Route Handlers where auth cookies must be copied onto
 * the final redirect response (exchangeCodeForSession / signOut).
 */
export function createRouteHandlerClient(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => {
            if (value) {
              request.cookies.set(name, value);
            } else {
              request.cookies.delete(name);
            }
          });

          supabaseResponse = NextResponse.next({
            request: { headers: request.headers },
          });

          cookiesToSet.forEach(({ name, value, options }) => {
            if (value) {
              supabaseResponse.cookies.set(name, value, options);
            } else {
              supabaseResponse.cookies.delete(name);
            }
          });
        },
      },
    }
  );

  function redirectWithCookies(url: URL | string, init?: number | ResponseInit) {
    const redirectResponse = NextResponse.redirect(url, init);
    copySupabaseCookies(supabaseResponse, redirectResponse);
    return redirectResponse;
  }

  return { supabase, supabaseResponse, redirectWithCookies };
}
