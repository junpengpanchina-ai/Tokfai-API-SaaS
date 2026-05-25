import { NextResponse, type NextRequest } from "next/server";

import { getServerSiteOrigin } from "@/lib/auth/site-url";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

/**
 * Supabase OAuth + email-confirmation callback.
 * Exchanges the `code` for a session and redirects into the dashboard.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const siteOrigin = getServerSiteOrigin(request);

  if (!code) {
    return NextResponse.redirect(
      new URL("/login?error=missing_code", siteOrigin)
    );
  }

  const { supabase, applyCookiesTo } = createRouteHandlerClient(request);
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=auth_callback_failed", siteOrigin)
    );
  }

  const redirectResponse = NextResponse.redirect(
    new URL("/dashboard", siteOrigin)
  );
  return applyCookiesTo(redirectResponse);
}
