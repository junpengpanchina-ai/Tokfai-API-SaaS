/**
 * OpenAI-compatible STT adapter — POST {base}/audio/transcriptions
 * (base already includes /v1). Isolated from chat.
 */

import { ApiError } from "../../errors.js";
import { log } from "../../logger.js";
import type {
  AudioSttProvider,
  TranscribeAudioInput,
  TranscribeAudioResult,
} from "./types.js";

const GROQ_STT_HOST = "api.groq.com";
const GROQ_STT_PATH = "/openai/v1";

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

/**
 * Build Whisper-compatible transcription URL.
 * base already includes /v1 (or /openai/v1); never inserts a second /v1.
 */
export function buildSttTranscriptionUrl(baseUrl: string): string {
  return `${normalizeBase(baseUrl)}/audio/transcriptions`;
}

/** True when baseUrl is Groq's OpenAI-compatible STT root. */
export function isGroqOpenaiV1Base(baseUrl: string): boolean {
  try {
    const u = new URL(String(baseUrl || "").trim());
    if (u.hostname.toLowerCase() !== GROQ_STT_HOST) return false;
    const path = (u.pathname || "").replace(/\/+$/, "") || "";
    return path === GROQ_STT_PATH || path.endsWith(GROQ_STT_PATH);
  } catch {
    return false;
  }
}

/**
 * True when base looks like an OpenAI-compatible root ending in /v1
 * (e.g. https://grsaiapi.com/v1). Used by grsai_whisper_compatible.
 */
export function isOpenaiCompatV1Base(baseUrl: string): boolean {
  try {
    const u = new URL(String(baseUrl || "").trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    const path = (u.pathname || "").replace(/\/+$/, "") || "";
    return path === "/v1" || path.endsWith("/v1");
  } catch {
    return false;
  }
}

/**
 * P1085R2 — groq_whisper_compatible must point at api.groq.com/openai/v1.
 * P1104 — grsai_whisper_compatible must NOT use Groq base; expects /v1 root.
 * Never treat GRSai chat base/key as Groq STT.
 */
export function detectSttProviderBaseMismatch(
  provider: string,
  baseUrl: string
): { mismatch: boolean; code: "provider_base_mismatch" | null; hint: string | null } {
  const p = String(provider || "").trim().toLowerCase();
  if (p === "groq_whisper_compatible" || p === "groq") {
    if (isGroqOpenaiV1Base(baseUrl)) {
      return { mismatch: false, code: null, hint: null };
    }
    return {
      mismatch: true,
      code: "provider_base_mismatch",
      hint:
        "provider_base_mismatch: groq_whisper_compatible expects https://api.groq.com/openai/v1 (not a chat/GRSai base).",
    };
  }
  if (p === "grsai_whisper_compatible" || p === "grsai") {
    // Never allow Groq host under the GrsAI provider label.
    if (isGroqOpenaiV1Base(baseUrl)) {
      return {
        mismatch: true,
        code: "provider_base_mismatch",
        hint:
          "provider_base_mismatch: grsai_whisper_compatible expects a GrsAI OpenAI-compatible /v1 base (e.g. https://grsaiapi.com/v1), not api.groq.com.",
      };
    }
    if (!isOpenaiCompatV1Base(baseUrl)) {
      return {
        mismatch: true,
        code: "provider_base_mismatch",
        hint:
          "provider_base_mismatch: grsai_whisper_compatible expects base_url ending with /v1 (e.g. https://grsaiapi.com/v1).",
      };
    }
    return { mismatch: false, code: null, hint: null };
  }
  return { mismatch: false, code: null, hint: null };
}

/**
 * Map upstream STT HTTP failures. 404 must not look like auth failure —
 * GRSai (and others) often lack /audio/transcriptions.
 */
export function mapUpstreamSttError(
  status: number,
  bodyText: string
): ApiError {
  const lower = bodyText.toLowerCase();
  if (status === 401 || status === 403) {
    return new ApiError({
      status: 502,
      message: `stt_upstream_auth status=${status}`,
      code: "upstream_auth_error",
      type: "upstream_error",
      publicMessage: "Provider authentication failed.",
      upstreamStatus: status,
    });
  }
  // 404 before body keyword heuristics — never disguise as auth / invalid_request.
  if (status === 404) {
    return new ApiError({
      status: 502,
      message: `stt_upstream_not_found status=${status}`,
      code: "upstream_not_found",
      type: "upstream_error",
      publicMessage:
        "STT upstream endpoint was not found (endpoint_not_found).",
      upstreamStatus: status,
    });
  }
  if (status === 429) {
    return new ApiError({
      status: 429,
      message: `stt_upstream_rate_limited status=${status}`,
      code: "upstream_rate_limited",
      type: "rate_limit_error",
      publicMessage: "Provider is rate limiting requests. Please retry shortly.",
      upstreamStatus: status,
    });
  }
  if (
    status === 400 ||
    lower.includes("invalid") ||
    lower.includes("unsupported")
  ) {
    return new ApiError({
      status: 400,
      message: `stt_upstream_invalid status=${status}`,
      code: "invalid_request_error",
      type: "invalid_request_error",
      publicMessage: "Invalid audio transcription request.",
      upstreamStatus: status,
    });
  }
  if (status === 503 || status === 502) {
    return new ApiError({
      status: 503,
      message: `stt_upstream_unavailable status=${status}`,
      code: "all_upstreams_unavailable",
      type: "upstream_error",
      publicMessage:
        "All providers are unavailable. Please retry shortly or choose another Tokfai model.",
      upstreamStatus: status,
    });
  }
  return new ApiError({
    status: 502,
    message: `stt_upstream_error status=${status}`,
    code: "upstream_error",
    type: "upstream_error",
    publicMessage: "Provider connection failed.",
    upstreamStatus: status,
  });
}

export function createOpenaiCompatSttAdapter(args: {
  providerId:
    | "openai_compatible"
    | "groq_whisper_compatible"
    | "grsai_whisper_compatible";
  baseUrl: string;
  apiKey: string;
}): AudioSttProvider {
  const base = normalizeBase(args.baseUrl);
  const key = args.apiKey.trim();
  return {
    id: args.providerId,
    available: Boolean(base && key),
    async transcribeAudio(
      input: TranscribeAudioInput
    ): Promise<TranscribeAudioResult> {
      if (!base || !key) {
        throw ApiError.notImplemented(
          "Audio transcription upstream is not configured.",
          "audio_transcription_not_available"
        );
      }

      const form = new FormData();
      const blob = new Blob([input.bytes], {
        type: input.mimeType || "application/octet-stream",
      });
      form.append("file", blob, input.filename || "audio.wav");
      form.append("model", input.model);
      if (input.language) form.append("language", input.language);

      const url = buildSttTranscriptionUrl(base);
      const started = Date.now();
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
          },
          body: form,
          signal:
            input.abortSignal && typeof AbortSignal.any === "function"
              ? AbortSignal.any([
                  AbortSignal.timeout(input.timeoutMs),
                  input.abortSignal,
                ])
              : AbortSignal.timeout(input.timeoutMs),
        });
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        log.warn("audio_stt_transport_failed", {
          request_id: input.requestId,
          provider: args.providerId,
          model: input.model,
          bytes: input.bytes.byteLength,
          mime_type: input.mimeType,
          err_name: name,
        });
        if (input.abortSignal?.aborted) {
          throw new ApiError({
            status: 499,
            message: "stt_client_aborted",
            code: "client_aborted",
            type: "invalid_request_error",
            publicMessage: "Client closed the request.",
          });
        }
        if (name === "TimeoutError" || name === "AbortError") {
          throw new ApiError({
            status: 504,
            message: "stt_upstream_timeout",
            code: "upstream_timeout",
            type: "upstream_error",
            publicMessage: "Upstream timed out. Please retry after a short wait.",
          });
        }
        throw new ApiError({
          status: 502,
          message: "stt_upstream_transport_failed",
          code: "upstream_transport_error",
          type: "upstream_error",
          publicMessage: "Provider connection failed.",
        });
      }

      const latencyMs = Date.now() - started;
      const bodyText = await res.text().catch(() => "");

      if (!res.ok) {
        log.warn("audio_stt_upstream_http_error", {
          request_id: input.requestId,
          provider: args.providerId,
          model: input.model,
          upstream_status: res.status,
          bytes: input.bytes.byteLength,
          mime_type: input.mimeType,
          latency_ms: latencyMs,
        });
        throw mapUpstreamSttError(res.status, bodyText);
      }

      let text = "";
      try {
        const parsed = JSON.parse(bodyText) as { text?: unknown };
        if (typeof parsed.text === "string") text = parsed.text.trim();
      } catch {
        text = bodyText.trim();
      }
      if (!text && !input.allowEmptyTranscript) {
        throw new ApiError({
          status: 502,
          message: "stt_upstream_empty_transcript",
          code: "upstream_error",
          type: "upstream_error",
          publicMessage: "Provider connection failed.",
        });
      }

      log.info("audio_stt_upstream_ok", {
        request_id: input.requestId,
        provider: args.providerId,
        model: input.model,
        upstream_status: res.status,
        bytes: input.bytes.byteLength,
        mime_type: input.mimeType,
        latency_ms: latencyMs,
        transcript_chars: text.length,
      });

      return {
        text,
        providerId: args.providerId,
        upstreamModel: input.model,
        upstreamStatus: res.status,
        latencyMs,
      };
    },
  };
}

export function createUnavailableSttAdapter(): AudioSttProvider {
  return {
    id: "unavailable",
    available: false,
    async transcribeAudio() {
      throw ApiError.notImplemented(
        "Audio transcription is not available on Tokfai yet.",
        "audio_transcription_not_available"
      );
    },
  };
}
