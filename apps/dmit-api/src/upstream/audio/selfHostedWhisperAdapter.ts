/**
 * Self-hosted Whisper STT worker adapter (P1079 / P1079R2).
 *
 * Gateway → POST {workerBaseUrl}/v1/audio/transcriptions (multipart).
 * Does NOT run inference on HKG. Does NOT transcode audio. Does NOT
 * base64-encode the file into JSON.
 *
 * Memory (proven class C — multiple full buffers along the path):
 * 1) bounded ingress Buffer (file + multipart overhead)
 * 2) Uint8Array file bytes after FormData parse
 * 3) Blob constructed for outbound FormData (Node may copy into Blob store)
 * 4) undici fetch may serialize another wire copy when sending
 * Worker JSON response is capped (not a second audio body).
 */

import { ApiError } from "../../errors.js";
import { log } from "../../logger.js";
import type {
  AudioSttProvider,
  TranscribeAudioInput,
  TranscribeAudioResult,
} from "./types.js";

function normalizeWorkerBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/\/v1$/i, "");
}

function redactForLog(value: unknown): string {
  if (typeof value !== "string") return "";
  // Never echo bearer tokens, worker URLs with credentials, or long secrets.
  return value
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/https?:\/\/[^\s"'\\]+/gi, "[REDACTED_URL]")
    .slice(0, 120);
}

async function readWorkerTextCapped(
  res: Response,
  maxBytes: number
): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value?.byteLength) continue;
    const remain = maxBytes - total;
    if (remain <= 0) {
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      break;
    }
    if (value.byteLength > remain) {
      chunks.push(value.subarray(0, remain));
      total = maxBytes;
      try {
        await reader.cancel();
      } catch {
        // ignore
      }
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  return Buffer.concat(chunks).toString("utf8");
}

function mapWorkerHttpError(status: number, bodyText: string): ApiError {
  const lower = bodyText.toLowerCase();
  if (status === 401 || status === 403) {
    return new ApiError({
      status: 502,
      message: `stt_worker_auth status=${status}`,
      code: "worker_auth_error",
      type: "upstream_error",
      publicMessage: "Speech transcription worker authentication failed.",
      upstreamStatus: status,
    });
  }
  if (status === 429 || lower.includes("overload") || lower.includes("busy")) {
    return new ApiError({
      status: 429,
      message: `stt_worker_overloaded status=${status}`,
      code: "worker_overloaded",
      type: "rate_limit_error",
      publicMessage:
        "Speech transcription worker is overloaded. Please retry shortly.",
      upstreamStatus: status,
    });
  }
  if (
    status === 404 ||
    lower.includes("model_not_found") ||
    lower.includes("model not found") ||
    lower.includes("unknown model") ||
    lower.includes("unsupported model")
  ) {
    return new ApiError({
      status: 400,
      message: `stt_worker_model_unavailable status=${status}`,
      code: "worker_model_unavailable",
      type: "invalid_request_error",
      publicMessage: "Requested speech model is not available.",
      upstreamStatus: status,
    });
  }
  if (status === 400 || lower.includes("invalid")) {
    return new ApiError({
      status: 400,
      message: `stt_worker_invalid_request status=${status}`,
      code: "invalid_request_error",
      type: "invalid_request_error",
      publicMessage: "Invalid audio transcription request.",
      upstreamStatus: status,
    });
  }
  if (status >= 500) {
    return new ApiError({
      status: 502,
      message: `stt_worker_upstream status=${status}`,
      code: "worker_unreachable",
      type: "upstream_error",
      publicMessage: "Speech transcription worker is unavailable.",
      upstreamStatus: status,
    });
  }
  return new ApiError({
    status: 502,
    message: `stt_worker_error status=${status}`,
    code: "worker_unreachable",
    type: "upstream_error",
    publicMessage: "Speech transcription worker is unavailable.",
    upstreamStatus: status,
  });
}

/**
 * Build multipart for the worker from gateway-buffered bytes.
 * Uses Blob over the same Uint8Array — no base64 JSON body.
 */
export function buildSelfHostedWorkerForm(
  input: TranscribeAudioInput
): FormData {
  const form = new FormData();
  const blob = new Blob([input.bytes], {
    type: input.mimeType || "application/octet-stream",
  });
  form.append("file", blob, input.filename || "audio.wav");
  form.append("model", input.model);
  if (input.language) form.append("language", input.language);
  if (input.prompt) form.append("prompt", input.prompt);
  if (input.responseFormat) form.append("response_format", input.responseFormat);
  if (input.temperature != null && Number.isFinite(input.temperature)) {
    form.append("temperature", String(input.temperature));
  }
  return form;
}

export function createSelfHostedWhisperAdapter(args: {
  baseUrl: string;
  /** Optional internal bearer secret — omit Authorization when empty. */
  apiKey?: string | null;
}): AudioSttProvider {
  const base = normalizeWorkerBase(args.baseUrl);
  const key = (args.apiKey ?? "").trim();
  return {
    id: "self_hosted_whisper",
    available: Boolean(base),
    async transcribeAudio(
      input: TranscribeAudioInput
    ): Promise<TranscribeAudioResult> {
      if (!base) {
        throw ApiError.notImplemented(
          "Self-hosted speech worker is not configured.",
          "audio_transcription_not_available"
        );
      }

      const form = buildSelfHostedWorkerForm(input);
      const url = `${base}/v1/audio/transcriptions`;
      const headers: Record<string, string> = {};
      if (key) {
        headers.Authorization = `Bearer ${key}`;
      }

      const timeoutSignal = AbortSignal.timeout(input.timeoutMs);
      const signal =
        input.abortSignal && typeof AbortSignal.any === "function"
          ? AbortSignal.any([timeoutSignal, input.abortSignal])
          : timeoutSignal;

      const started = Date.now();
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers,
          body: form,
          signal,
        });
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        const msg = err instanceof Error ? err.message : String(err);
        log.warn("audio_stt_worker_transport_failed", {
          request_id: input.requestId,
          provider: "self_hosted_whisper",
          model: input.model,
          bytes: input.bytes.byteLength,
          mime_type: input.mimeType,
          err_name: name,
          // Redacted — never log worker URL or secret.
          err_hint: redactForLog(msg),
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
            message: "stt_worker_timeout",
            code: "worker_timeout",
            type: "upstream_error",
            publicMessage:
              "Speech transcription worker timed out. Please retry after a short wait.",
          });
        }
        throw new ApiError({
          status: 502,
          message: "stt_worker_unreachable",
          code: "worker_unreachable",
          type: "upstream_error",
          publicMessage: "Speech transcription worker is unavailable.",
        });
      }

      const latencyMs = Date.now() - started;
      // Cap worker response body — never buffer a second large audio-sized body.
      const bodyText = await readWorkerTextCapped(res, 64 * 1024);

      if (!res.ok) {
        log.warn("audio_stt_worker_http_error", {
          request_id: input.requestId,
          provider: "self_hosted_whisper",
          model: input.model,
          upstream_status: res.status,
          bytes: input.bytes.byteLength,
          mime_type: input.mimeType,
          latency_ms: latencyMs,
        });
        throw mapWorkerHttpError(res.status, bodyText);
      }

      let text = "";
      try {
        const parsed = JSON.parse(bodyText) as { text?: unknown };
        if (typeof parsed.text === "string") text = parsed.text.trim();
        else {
          throw new ApiError({
            status: 502,
            message: "stt_worker_invalid_response",
            code: "worker_invalid_response",
            type: "upstream_error",
            publicMessage: "Speech transcription worker returned an invalid response.",
          });
        }
      } catch (err) {
        if (err instanceof ApiError) throw err;
        throw new ApiError({
          status: 502,
          message: "stt_worker_invalid_response",
          code: "worker_invalid_response",
          type: "upstream_error",
          publicMessage: "Speech transcription worker returned an invalid response.",
        });
      }

      if (!text) {
        throw new ApiError({
          status: 502,
          message: "stt_worker_empty_transcript",
          code: "worker_invalid_response",
          type: "upstream_error",
          publicMessage: "Speech transcription worker returned an empty transcript.",
        });
      }

      log.info("audio_stt_worker_ok", {
        request_id: input.requestId,
        provider: "self_hosted_whisper",
        model: input.model,
        upstream_status: res.status,
        bytes: input.bytes.byteLength,
        mime_type: input.mimeType,
        latency_ms: latencyMs,
        transcript_chars: text.length,
        // Billing seam marker for future self-host cost accounting (no debit here).
        billing_seam: "self_hosted_stt_cost_future",
      });

      return {
        text,
        providerId: "self_hosted_whisper",
        upstreamModel: input.model,
        upstreamStatus: res.status,
        latencyMs,
      };
    },
  };
}
