import { NextResponse, type NextRequest } from "next/server";

import { createRouteHandlerClient } from "@/lib/supabase/route-handler";

export async function POST(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const { supabase, redirectWithCookies } = createRouteHandlerClient(request);

  await supabase.auth.signOut();

  return redirectWithCookies(new URL("/", origin), { status: 303 });
}
