/**
 * Non-production auth flow diagnostics. Never log tokens or secrets.
 */
export function authDebug(
  event: string,
  data?: Record<string, string | boolean | number | null | undefined>
) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.log(`[auth] ${event}`, data ?? {});
}
