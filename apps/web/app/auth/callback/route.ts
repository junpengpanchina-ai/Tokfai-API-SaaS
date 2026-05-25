import { NextResponse, type NextRequest } from "next/server";

import { authDebug } from "@/lib/auth/debug";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

/**
 * Supabase OAuth + email-confirmation callback.
 * Exchanges the `code` for a session and redirects into the dashboard.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const origin = request.nextUrl.origin;

  authDebug("callback_has_code", {
    hasCode: Boolean(code),
    origin,
  });

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", origin)
    );
  }

  const { supabase, redirectWithCookies } = createRouteHandlerClient(request);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    authDebug("callback_exchange_error", {
      message: error.message,
    });

    return redirectWithCookies(
      new URL("/login?error=auth_callback_failed", origin)
    );
  }

  authDebug("callback_exchange_success", {
    redirectTo: "/dashboard",
    origin,
  });

  return redirectWithCookies(new URL("/dashboard", origin));
}
