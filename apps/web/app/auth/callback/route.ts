import { NextResponse } from "next/server";

import { authDebug } from "@/lib/auth/debug";
import { createRouteHandlerClient } from "@/lib/supabase/server";

/**
 * Supabase OAuth + email-confirmation callback.
 * Exchanges the `code` for a session and redirects into the dashboard.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;

  authDebug("callback_has_code", {
    hasCode: Boolean(code),
    origin,
  });

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", origin)
    );
  }

  const supabase = createRouteHandlerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    authDebug("callback_exchange_error", {
      message: error.message,
    });

    return NextResponse.redirect(
      new URL("/login?error=auth_callback_failed", origin)
    );
  }

  authDebug("callback_exchange_success", {
    redirectTo: "/dashboard",
    origin,
  });

  return NextResponse.redirect(new URL("/dashboard", origin));
}
