const DEFAULT_ADMIN_EMAILS = ["junpengpanchina@gmail.com"];

/**
 * Email allowlist for the /admin UI shell (client-side route guard).
 * DMIT `/admin/*` auth uses JWT + server-side admin_users; see `lib/admin/client.ts`.
 */

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Admin allowlist from public env (browser-safe) or server-only env.
 * Never uses service role or other sensitive keys.
 */
export function getAdminEmailAllowlist(): string[] {
  const raw =
    process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? process.env.ADMIN_EMAILS ?? "";

  const fromEnv = raw
    .split(",")
    .map(normalizeEmail)
    .filter(Boolean);

  const combined = new Set([
    ...DEFAULT_ADMIN_EMAILS.map(normalizeEmail),
    ...fromEnv,
  ]);

  return Array.from(combined);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmailAllowlist().includes(normalizeEmail(email));
}
