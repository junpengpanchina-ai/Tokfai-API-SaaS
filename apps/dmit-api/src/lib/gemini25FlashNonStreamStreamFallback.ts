/**
 * Narrow gate for gemini-2.5-flash /v1/chat/completions:
 *
 * Client stream=false: prefer native non-stream upstream first. Stream
 * assemble is FALLBACK ONLY after native failure / no non-stream capability
 * — never the default path.
 *
 * Client stream=true: same non-stream-first policy, then synthesize OpenAI
 * SSE for the client; may skip a doomed non-stream attempt when the
 * non-stream circuit is already open.
 *
 * Enabled only for /v1/chat/completions so /v1/responses and gemini-3-pro
 * stream paths stay untouched. Does not touch aliases, Cherry, or image.
 */

import type { ApiError } from "../errors.js";

export const GEMINI_25_FLASH_NONSTREAM_STREAM_FALLBACK_MODEL =
  "gemini-2.5-flash" as const;

export function isGemini25FlashNonStreamStreamFallbackPath(args: {
  clientStream: boolean;
  attemptModel: string;
  requestedModel: string;
  route?: string;
}): boolean {
  if (
    args.attemptModel !== GEMINI_25_FLASH_NONSTREAM_STREAM_FALLBACK_MODEL ||
    args.requestedModel !== GEMINI_25_FLASH_NONSTREAM_STREAM_FALLBACK_MODEL
  ) {
    return false;
  }
  const route = args.route ?? "/v1/chat/completions";
  if (route !== "/v1/chat/completions") {
    return false;
  }
  // clientStream true|false — both use non-stream-first + optional stream assemble.
  return true;
}

/** Errors that may retry via upstream stream assemble (same model). */
export function isGemini25FlashStreamFallbackEligible(err: ApiError): boolean {
  const code = err.code;
  if (!code) return false;
  if (
    code === "upstream_timeout" ||
    code === "upstream_model_busy" ||
    code === "upstream_model_unavailable" ||
    code === "model_not_available" ||
    code === "all_upstreams_unavailable"
  ) {
    return true;
  }
  if (code === "upstream_error") {
    return (err.upstreamStatus ?? 502) >= 500;
  }
  return false;
}
