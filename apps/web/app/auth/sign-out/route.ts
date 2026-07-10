import { NextResponse } from "next/server";

import { createRouteHandlerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const supabase = createRouteHandlerClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  return NextResponse.redirect(new URL("/", origin), { status: 303 });
}
