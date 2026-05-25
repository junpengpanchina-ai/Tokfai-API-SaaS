import { NextResponse, type NextRequest } from "next/server";

import { getServerSiteOrigin } from "@/lib/auth/site-url";
import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

export async function POST(request: NextRequest) {
  const siteOrigin = getServerSiteOrigin(request);
  const { supabase, applyCookiesTo } = createRouteHandlerClient(request);

  await supabase.auth.signOut();

  const redirectResponse = NextResponse.redirect(new URL("/", siteOrigin), {
    status: 303,
  });
  return applyCookiesTo(redirectResponse);
}
