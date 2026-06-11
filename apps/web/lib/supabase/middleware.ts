import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import {
  DEFAULT_POST_LOGIN_PATH,
  isProtectedDashboardPath,
  loginPathWithNext,
} from "@/lib/auth/login-redirect";

type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

function nextWithPathname(request: NextRequest, pathname: string) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", pathname);
  return NextResponse.next({
    request: { headers: requestHeaders },
  });
}

/**
 * Refreshes the Supabase session cookie on every request, and gates routes
 * that require authentication. Based on the Supabase Next.js SSR template.
 */
export async function updateSession(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return nextWithPathname(request, pathname);
  }

  let supabaseResponse = nextWithPathname(request, pathname);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          supabaseResponse = nextWithPathname(request, pathname);

          cookiesToSet.forEach(({ name, value, options }) => {
            supabaseResponse.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (pathname.startsWith("/auth/")) {
    return supabaseResponse;
  }

  if (!user && isProtectedDashboardPath(pathname)) {
    return NextResponse.redirect(
      new URL(loginPathWithNext(pathname), request.url)
    );
  }

  if (user && (pathname === "/login" || pathname === "/signup")) {
    const url = request.nextUrl.clone();
    url.pathname = DEFAULT_POST_LOGIN_PATH;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
