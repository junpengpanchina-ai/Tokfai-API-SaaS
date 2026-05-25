import { NextResponse } from "next/server";

/** Copy Supabase session cookies onto another NextResponse (redirects). */
export function copySupabaseCookies(
  from: NextResponse,
  to: NextResponse
): NextResponse {
  from.cookies.getAll().forEach(({ name, value, ...options }) => {
    if (value) {
      to.cookies.set(name, value, options);
    } else {
      to.cookies.delete(name);
    }
  });
  return to;
}
