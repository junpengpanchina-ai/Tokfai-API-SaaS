import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import WebSocket from "ws";

import { env } from "./env.js";

if (typeof globalThis.WebSocket === "undefined") {
  (globalThis as any).WebSocket = WebSocket;
}

/**
 * The DMIT-side Supabase client. Uses service_role — bypasses RLS.
 *
 * This client is the ONLY way DMIT writes to user-owned tables. Never expose
 * it through any HTTP body, log it, or import it into apps/web.
 */
let _client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!_client) {
    _client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
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
    });
  }
  return _client;
}
