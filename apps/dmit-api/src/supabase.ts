import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

import { env } from "./env.js";
import { log } from "./logger.js";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WebSocket;
}

const CLIENT_OPTIONS = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: {
      "X-Client-Info": "tokfai-dmit-api/0.1",
    },
  },
};

function decodeJwtRole(key: string): string | null {
  try {
    const parts = key.split(".");
    if (parts.length !== 3) return null;
    const payloadPart = parts[1];
    if (!payloadPart) return null;
    const payload = JSON.parse(
      Buffer.from(payloadPart.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8"
      )
    );
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

export function isSupabaseAdminConfigured(): boolean {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  return Boolean(key && key.length >= 20);
}

let _adminClient: SupabaseClient | null = null;
let _authClient: SupabaseClient | null = null;
let _startupWarned = false;

/**
 * Log once at boot when service_role is missing or the JWT role is not service_role.
 */
export function warnSupabaseAdminConfig(): void {
  if (_startupWarned) return;
  _startupWarned = true;

  if (!isSupabaseAdminConfigured()) {
    log.warn("supabase_admin_config_missing", {
      code: "config_error",
      message:
        "SUPABASE_SERVICE_ROLE_KEY is missing or too short — server-side DB writes will fail.",
    });
    return;
  }

  const role = decodeJwtRole(env.SUPABASE_SERVICE_ROLE_KEY!);
  if (role && role !== "service_role") {
    log.warn("supabase_admin_config_role_mismatch", {
      code: "config_error",
      role,
      message: `SUPABASE_SERVICE_ROLE_KEY JWT role is "${role}", expected "service_role".`,
    });
  }
}

/**
 * Service-role Supabase client for server-side DB access (bypasses RLS).
 *
 * Never call `auth.getUser()` on this client — use `supabaseAuth()` instead so
 * PostgREST Authorization stays on the service_role JWT.
 */
export function supabaseAdmin(): SupabaseClient {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  if (!_adminClient) {
    _adminClient = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY!,
      CLIENT_OPTIONS
    );
  }
  return _adminClient;
}

/** Isolated client for Supabase Auth token verification only. */
export function supabaseAuth(): SupabaseClient {
  if (!isSupabaseAdminConfigured()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }
  if (!_authClient) {
    _authClient = createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY!,
      CLIENT_OPTIONS
    );
  }
  return _authClient;
}

/** Alias for `supabaseAdmin()` — DMIT DB writes use service_role only. */
export function supabase(): SupabaseClient {
  return supabaseAdmin();
}
