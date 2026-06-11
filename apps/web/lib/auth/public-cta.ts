import { loginPathWithNext } from "@/lib/auth/login-redirect";

/** Dashboard deep link; unauthenticated visitors go to login with `next` preserved. */
export function dashboardCtaHref(
  dashboardPath: string,
  isLoggedIn: boolean
): string {
  return isLoggedIn ? dashboardPath : loginPathWithNext(dashboardPath);
}
