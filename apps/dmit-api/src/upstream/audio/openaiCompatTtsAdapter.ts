/**
 * OpenAI-compatible TTS adapter — POST {base}/audio/speech
 * (base already includes /v1). Isolated from chat.
 */

import { ApiError } from "../../errors.js";
import { log } from "../../logger.js";
import type {
  AudioTtsProvider,
  SynthesizeSpeechInput,
  SynthesizeSpeechResult,
} from "./types.js";

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

export function buildTtsSpeechUrl(baseUrl: string): string {
  return `${normalizeBase(baseUrl)}/audio/speech`;
}

/**
 * Map upstream TTS HTTP failures to Hermes-compatible capability / upstream codes.
 */
export function mapUpstreamTtsError(status: number, bodyText: string): ApiError {
  const lower = bodyText.toLowerCase();
  if (status === 401 || status === 403) {
    return new ApiError({
      status: 502,
      message: `tts_upstream_auth status=${status}`,
      code: "upstream_auth_error",
      type: "upstream_error",
      publicMessage: "Provider authentication failed.",
      upstreamStatus: status,
    });
  }
  if (status === 404) {
    const err = ApiError.audioCapabilityUnavailable(
      "Text-to-speech is not available on Tokfai yet.",
      "audio_speech_not_available"
    );
    return new ApiError({
      status: err.status,
      message: `tts_upstream_capability status=${status}`,
      publicMessage: err.publicMessage,
      code: err.code,
      type: err.type,
      upstreamStatus: status,
    });
  }
  if (status === 429) {
    return new ApiError({
      status: 429,
      message: `tts_upstream_rate_limited status=${status}`,
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
      message: `tts_upstream_invalid status=${status}`,
      code: "invalid_request_error",
      type: "invalid_request_error",
      publicMessage: "Invalid text-to-speech request.",
      upstreamStatus: status,
    });
  }
  return new ApiError({
    status: 502,
    message: `tts_upstream_error status=${status}`,
    code: "upstream_error",
    type: "upstream_error",
    publicMessage: "Provider connection failed.",
    upstreamStatus: status,
  });
}

export function createOpenaiCompatTtsAdapter(args: {
  baseUrl: string;
  apiKey: string;
}): AudioTtsProvider {
  const base = normalizeBase(args.baseUrl);
  const key = args.apiKey.trim();
  return {
    id: "openai_compatible",
    available: Boolean(base && key),
    async synthesizeSpeech(
      input: SynthesizeSpeechInput
    ): Promise<SynthesizeSpeechResult> {
      if (!base || !key) {
        throw ApiError.audioCapabilityUnavailable(
          "Text-to-speech is not available on Tokfai yet.",
          "audio_speech_not_available"
        );
      }

      const url = buildTtsSpeechUrl(base);
      const body: Record<string, unknown> = {
        model: input.model,
        input: input.input,
        voice: input.voice,
      };
      if (input.responseFormat) body.response_format = input.responseFormat;
      if (typeof input.speed === "number") body.speed = input.speed;

      const started = Date.now();
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
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
        log.warn("audio_tts_transport_failed", {
          request_id: input.requestId,
          provider: "openai_compatible",
          model: input.model,
          err_name: name,
        });
        if (input.abortSignal?.aborted) {
          throw new ApiError({
            status: 499,
            message: "tts_client_aborted",
            code: "client_aborted",
            type: "invalid_request_error",
            publicMessage: "Client closed the request.",
          });
        }
        if (name === "TimeoutError" || name === "AbortError") {
          throw new ApiError({
            status: 504,
            message: "tts_upstream_timeout",
            code: "upstream_timeout",
            type: "upstream_error",
            publicMessage: "Upstream timed out. Please retry after a short wait.",
          });
        }
        throw new ApiError({
          status: 502,
          message: "tts_upstream_transport_failed",
          code: "upstream_transport_error",
          type: "upstream_error",
          publicMessage: "Provider connection failed.",
        });
      }

      const latencyMs = Date.now() - started;
      if (!res.ok) {
        const bodyText = await res.text().catch(() => "");
        log.warn("audio_tts_upstream_http_error", {
          request_id: input.requestId,
          provider: "openai_compatible",
          model: input.model,
          upstream_status: res.status,
          latency_ms: latencyMs,
        });
        throw mapUpstreamTtsError(res.status, bodyText);
      }

      const buf = new Uint8Array(await res.arrayBuffer());
      const contentType =
        res.headers.get("content-type") || "audio/mpeg";

      log.info("audio_tts_upstream_ok", {
        request_id: input.requestId,
        provider: "openai_compatible",
        model: input.model,
        upstream_status: res.status,
        latency_ms: latencyMs,
        bytes: buf.byteLength,
      });

      return {
        audio: buf,
        contentType,
        providerId: "openai_compatible",
        upstreamModel: input.model,
        upstreamStatus: res.status,
        latencyMs,
      };
    },
  };
}

export function createUnavailableTtsAdapter(): AudioTtsProvider {
  return {
    id: "unavailable",
    available: false,
    async synthesizeSpeech() {
      throw ApiError.audioCapabilityUnavailable(
        "Text-to-speech is not available on Tokfai yet.",
        "audio_speech_not_available"
      );
    },
  };
}
