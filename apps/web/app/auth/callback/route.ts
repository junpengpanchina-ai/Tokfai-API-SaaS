import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

/**
 * Supabase OAuth + email-confirmation callback.
 * Exchanges the `code` for a session and redirects into the dashboard.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const redirectParam = url.searchParams.get("redirect");
  const redirectPath =
    redirectParam && redirectParam.startsWith("/") ? redirectParam : "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/login?error=missing_code", url));
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const failUrl = new URL("/login", url);
    failUrl.searchParams.set("error", error.message);
    return NextResponse.redirect(failUrl);
  }

  return NextResponse.redirect(new URL(redirectPath, url));
}
