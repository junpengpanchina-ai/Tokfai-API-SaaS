import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { authDebug } from "@/lib/auth/debug";
import { copySupabaseCookies } from "@/lib/supabase/cookies";

/**
 * Refreshes the Supabase session cookie on every request, and gates routes
 * that require authentication.
 *
 * Uses anon key only. See AGENTS.md.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  const pathname = request.nextUrl.pathname;
  const isAuthCallback = pathname === "/auth/callback";
  const isAuthFlow = pathname.startsWith("/auth/");
  const isDashboard = pathname.startsWith("/dashboard");
  const isAuthPage = pathname === "/login" || pathname === "/signup";

  authDebug("middleware_path", {
    path: pathname,
    isAuthCallback,
    isDashboard,
  });

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return supabaseResponse;
  }

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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  authDebug("middleware_has_user", {
    path: pathname,
    hasUser: Boolean(user),
  });

  if (isAuthCallback || isAuthFlow) {
    return supabaseResponse;
  }

  if (!user && isDashboard) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("redirected", "1");
    url.searchParams.set("redirect", pathname);

    authDebug("middleware_redirect_reason", {
      reason: "unauthenticated_dashboard",
      path: pathname,
      hasUser: false,
    });

    const redirectResponse = NextResponse.redirect(url);
    copySupabaseCookies(supabaseResponse, redirectResponse);
    return redirectResponse;
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";

    authDebug("middleware_redirect_reason", {
      reason: "authenticated_auth_page",
      path: pathname,
      hasUser: true,
    });

    const redirectResponse = NextResponse.redirect(url);
    copySupabaseCookies(supabaseResponse, redirectResponse);
    return redirectResponse;
  }

  return supabaseResponse;
}
