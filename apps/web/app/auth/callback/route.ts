import { NextResponse } from "next/server";

import { AUTH_SUCCESS_COOKIE } from "@/lib/auth/auth-success-flash";
import { loginPathWithError, resolvePostLoginPath } from "@/lib/auth/login-redirect";
import { authDebug } from "@/lib/auth/debug";
import { createRouteHandlerClient } from "@/lib/supabase/server";

/**
 * Supabase OAuth + email-confirmation callback.
 * Exchanges the `code` for a session and redirects to `next` or /dashboard.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const origin = requestUrl.origin;
  const nextPath = resolvePostLoginPath(requestUrl.searchParams.get("next"));

  const oauthError = requestUrl.searchParams.get("error");
  if (oauthError) {
    authDebug("callback_oauth_error", {
      error: oauthError,
      nextPath,
    });

    return NextResponse.redirect(
      new URL(loginPathWithError("oauth_callback_failed", nextPath), origin)
    );
  }

  authDebug("callback_has_code", {
    hasCode: Boolean(code),
    origin,
    nextPath,
  });

  if (!code) {
    return NextResponse.redirect(
      new URL(loginPathWithError("missing_code", nextPath), origin)
    );
  }

  const supabase = createRouteHandlerClient();
  if (!supabase) {
    return NextResponse.redirect(
      new URL(loginPathWithError("auth_callback_failed", nextPath), origin)
    );
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    authDebug("callback_exchange_error", {
      message: error.message,
    });

    return NextResponse.redirect(
      new URL(loginPathWithError("auth_callback_failed", nextPath), origin)
    );
  }

  authDebug("callback_exchange_success", {
    redirectTo: nextPath,
    origin,
  });

  const response = NextResponse.redirect(new URL(nextPath, origin));
  response.cookies.set(AUTH_SUCCESS_COOKIE, "login", {
    maxAge: 120,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
