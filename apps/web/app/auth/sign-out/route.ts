import { NextResponse } from "next/server";

import { createRouteHandlerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const supabase = createRouteHandlerClient();

  if (supabase) {
    await supabase.auth.signOut();
  }

  const response = NextResponse.redirect(new URL("/", origin), { status: 303 });
  // Drop httpOnly workbench key cache so secrets do not outlive the session.
  response.cookies.set("tokfai_wb_sk", "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return response;
}
