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

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}

function mapUpstreamSttError(
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
  providerId: "openai_compatible" | "groq_whisper_compatible";
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

      const url = `${base}/audio/transcriptions`;
      const started = Date.now();
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
          },
          body: form,
          signal: AbortSignal.timeout(input.timeoutMs),
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
      if (!text) {
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
