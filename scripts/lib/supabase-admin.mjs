import { createClient } from "../../apps/dmit-api/node_modules/@supabase/supabase-js/dist/index.mjs";
import WebSocket from "../../apps/dmit-api/node_modules/ws/wrapper.mjs";

/**
 * Normalize SUPABASE_URL to the project root (https://xxx.supabase.co).
 * Strips trailing slashes and common API path suffixes.
 */
export function normalizeSupabaseUrl(raw) {
  if (!raw || typeof raw !== "string") return null;

  let url = raw.trim();
  if (!url.startsWith("http")) return null;

  url = url.replace(/\/+$/, "");
  url = url.replace(/\/rest\/v1\/?$/i, "");
  url = url.replace(/\/realtime\/v1\/?$/i, "");
  return url;
}

export function requireSupabaseAdminEnv() {
  const rawUrl = process.env.SUPABASE_URL ?? "";
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  const url = normalizeSupabaseUrl(rawUrl);

  if (!url) {
    console.error("Set SUPABASE_URL before running this script.");
    console.error(
      "Use the project root URL (e.g. https://xxx.supabase.co), not /rest/v1/."
    );
    process.exit(1);
  }

  if (!serviceRoleKey || serviceRoleKey.length < 20) {
    console.error("Set SUPABASE_SERVICE_ROLE_KEY before running this script.");
    process.exit(1);
  }

  return { url, serviceRoleKey };
}

export function createSupabaseAdminClient() {
  const { url, serviceRoleKey } = requireSupabaseAdminEnv();

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket },
  });
}
