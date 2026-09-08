/**
 * Hermes / OpenAI-client audio compatibility log helpers (Audio P3).
 *
 * Grep pm2 logs for `hermes_audio_compat` to see whether the client hit
 * Tokfai `/v1/audio/*`. Absence of these lines while the UI shows OpenAI 401
 * means the client still calls api.openai.com (not a Tokfai STT failure).
 *
 * Never log TOKFAI_STT_API_KEY / TOKFAI_TTS_API_KEY / upstream secrets.
 */

import type { Context } from "hono";

export type HermesAudioOutcome =
  | "ingress"
  | "stt_ok"
  | "stt_worker_failed"
  | "stt_upstream_unavailable"
  | "tts_ok"
  | "tts_unavailable"
  | "tts_upstream_failed";

export function audioClientHint(c: Context): {
  user_agent: string | null;
  likely_hermes: boolean;
} {
  const raw = c.req.header("user-agent") ?? c.req.header("User-Agent") ?? "";
  const ua = raw.trim() ? raw.trim().slice(0, 160) : null;
  const lower = (ua || "").toLowerCase();
  return {
    user_agent: ua,
    likely_hermes:
      /hermes|nousresearch|nous-hermes|electron/i.test(lower) ||
      /tokfai-hermes/i.test(lower),
  };
}

/**
 * Classify STT failures for ops: local worker vs missing/unreachable capability.
 */
export function classifySttFailure(args: {
  code?: string;
  providerId?: string;
  baseUrl?: string | null;
  source?: string;
}): "stt_worker_failed" | "stt_upstream_unavailable" {
  const code = String(args.code || "");
  const base = String(args.baseUrl || "").toLowerCase();
  const localWorker =
    base.includes("127.0.0.1") ||
    base.includes("localhost") ||
    base.includes("[::1]");

  if (
    !args.providerId ||
    args.providerId === "unavailable" ||
    args.source === "unavailable" ||
    code === "audio_transcription_not_available"
  ) {
    return "stt_upstream_unavailable";
  }

  if (
    localWorker &&
    (code.startsWith("worker_") ||
      code === "upstream_transport_error" ||
      code === "upstream_timeout" ||
      code === "upstream_error" ||
      code === "upstream_auth_error")
  ) {
    return "stt_worker_failed";
  }

  if (
    code === "upstream_not_found" ||
    code === "endpoint_not_found" ||
    code === "GRSAI_STT_ENDPOINT_NOT_FOUND" ||
    code === "all_upstreams_unavailable"
  ) {
    return "stt_upstream_unavailable";
  }

  return localWorker ? "stt_worker_failed" : "stt_upstream_unavailable";
}

export function hermesAudioCompatFields(args: {
  requestId: string;
  route: "/v1/audio/transcriptions" | "/v1/audio/speech";
  outcome: HermesAudioOutcome;
  client: { user_agent: string | null; likely_hermes: boolean };
  provider?: string | null;
  stt_source?: string | null;
  error_code?: string | null;
  status?: number;
}): Record<string, unknown> {
  return {
    // Stable grep marker for Hermes Audio P3 acceptance.
    hermes_audio_compat: true,
    hits_tokfai_audio: true,
    // If this log is missing while Hermes shows OpenAI 401 → client still uses api.openai.com.
    openai_direct_not_observed_on_tokfai: true,
    request_id: args.requestId,
    route: args.route,
    outcome: args.outcome,
    likely_hermes: args.client.likely_hermes,
    user_agent: args.client.user_agent,
    provider: args.provider ?? null,
    stt_source: args.stt_source ?? null,
    error_code: args.error_code ?? null,
    status: args.status ?? null,
  };
}
