/**
 * POST /v1/audio/transcriptions — OpenAI-compatible STT ingress (P1072 / P1079R2).
 *
 * Hermes → Tokfai → isolated audio provider adapter → STT upstream.
 * Does NOT call executeChatCompletion. Never fakes a transcript.
 *
 * Memory boundary (P1079R2):
 * - Configurable TOKFAI_STT_MAX_UPLOAD_BYTES (default 25MiB)
 * - Content-Length early 413 before buffering when present
 * - Streamed body hard-cap for chunked / missing Content-Length
 * - Reject oversize before worker fetch
 */

import { Hono } from "hono";

import { env } from "../env.js";
import { ApiError } from "../errors.js";
import {
  AUDIO_TRANSCRIPTION_ENDPOINT,
  AUDIO_TRANSCRIPTION_USAGE_TYPE,
  recordAudioTranscriptionFailure,
  recordAudioTranscriptionSuccess,
} from "../lib/audioTranscriptionUsage.js";
import { log } from "../logger.js";
import {
  getChatCaller,
  requireApiKeyOrSupabaseJwt,
} from "../middleware/chatAuth.js";
import { chatGatewayMiddleware } from "../middleware/chatGateway.js";
import { respondApiError } from "../middleware/error.js";
import {
  DEFAULT_STT_MAX_UPLOAD_BYTES,
  readMultipartAudioWithLimit,
  resolveSttMaxUploadBytes,
} from "../upstream/audio/readMultipartAudioWithLimit.js";
import {
  resolveAudioSttConfig,
  resolveAudioSttProvider,
  resolveSttUpstreamModel,
} from "../upstream/audio/resolveAudioProvider.js";

const ALLOWED_EXT = new Set([
  ".mp3",
  ".mp4",
  ".mpeg",
  ".mpga",
  ".m4a",
  ".wav",
  ".webm",
  ".ogg",
  ".oga",
  ".opus",
  ".aac",
  ".flac",
]);

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

function sttMaxUploadBytes(): number {
  const live = process.env.TOKFAI_STT_MAX_UPLOAD_BYTES;
  if (typeof live === "string" && live.trim()) {
    return resolveSttMaxUploadBytes(live, DEFAULT_STT_MAX_UPLOAD_BYTES);
  }
  return env.TOKFAI_STT_MAX_UPLOAD_BYTES ?? DEFAULT_STT_MAX_UPLOAD_BYTES;
}

export const audioRoutes = new Hono();

audioRoutes.use("/v1/audio/transcriptions", requireApiKeyOrSupabaseJwt);
/** RPM / IP / tenant / concurrency — abuse guard when STT is not_billable. */
audioRoutes.use("/v1/audio/transcriptions", chatGatewayMiddleware);

audioRoutes.post("/v1/audio/transcriptions", async (c) => {
  const caller = getChatCaller(c);
  const requestId = c.get("requestId" as never) as string;
  const startedAt = Date.now();
  const contentType = c.req.header("content-type") ?? "";
  const maxUploadBytes = sttMaxUploadBytes();
  const clientAbort = c.req.raw.signal;

  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return respondApiError(
      c,
      ApiError.badRequest(
        "Audio transcription requires multipart/form-data with a file field.",
        "invalid_request_error"
      ),
      requestId
    );
  }

  let model = "";
  let language: string | undefined;
  let prompt: string | undefined;
  let responseFormat: string | undefined;
  let temperature: number | undefined;
  let filename = "audio.wav";
  let mimeType = "application/octet-stream";
  let bytes: Uint8Array | null = null;
  let rawBodyBytes = 0;
  let contentLengthChecked = false;

  try {
    const parsed = await readMultipartAudioWithLimit({
      contentType,
      contentLengthHeader: c.req.header("content-length"),
      body: c.req.raw.body,
      maxFileBytes: maxUploadBytes,
      abortSignal: clientAbort,
    });
    model = parsed.model;
    language = parsed.language;
    prompt = parsed.prompt;
    responseFormat = parsed.responseFormat;
    temperature = parsed.temperature;
    filename = parsed.filename;
    mimeType = parsed.mimeType;
    bytes = parsed.bytes;
    rawBodyBytes = parsed.rawBodyBytes;
    contentLengthChecked = parsed.contentLengthChecked;
  } catch (err) {
    if (err instanceof ApiError) {
      if (
        err.code === "request_body_too_large" ||
        err.code === "client_aborted"
      ) {
        // Oversize / abort: never call worker; failure usage is not_billable.
        await safeFailUsage({
          caller,
          requestId,
          resolvedModel: model || "whisper-1",
          startedAt,
          errorCode: err.code ?? "request_body_too_large",
          errorMessage: err.message,
        });
      }
      return respondApiError(c, err, requestId);
    }
    log.warn("audio_transcriptions_multipart_parse_failed", {
      request_id: requestId,
      api_key_id: caller.apiKeyId,
      err_name: err instanceof Error ? err.name : "Error",
    });
    return respondApiError(
      c,
      ApiError.badRequest(
        "Invalid multipart audio transcription request.",
        "invalid_request_error"
      ),
      requestId
    );
  }

  if (!bytes || bytes.byteLength === 0) {
    return respondApiError(
      c,
      ApiError.badRequest(
        "Audio file is required in multipart field `file`.",
        "invalid_request_error"
      ),
      requestId
    );
  }

  const ext = extOf(filename);
  if (ext && !ALLOWED_EXT.has(ext)) {
    return respondApiError(
      c,
      ApiError.badRequest(
        "Unsupported audio format.",
        "invalid_request_error"
      ),
      requestId
    );
  }

  const cfg = await resolveAudioSttConfig();
  const { clientModel: resolvedModel, upstreamModel } = resolveSttUpstreamModel(
    model,
    cfg
  );
  const provider = await resolveAudioSttProvider();

  log.info("audio_transcriptions_request", {
    request_id: requestId,
    api_key_id: caller.apiKeyId,
    user_id: caller.userId,
    route: AUDIO_TRANSCRIPTION_ENDPOINT,
    provider: cfg.providerId,
    stt_source: cfg.source,
    channel_id: cfg.channelId,
    model: resolvedModel,
    upstream_model: upstreamModel,
    bytes: bytes.byteLength,
    raw_body_bytes: rawBodyBytes,
    content_length_checked: contentLengthChecked,
    max_upload_bytes: maxUploadBytes,
    mime_type: mimeType,
    // basename only — never full paths
    filename_ext: ext || null,
  });

  if (!provider.available || cfg.providerId === "unavailable") {
    await safeFailUsage({
      caller,
      requestId,
      resolvedModel,
      startedAt,
      errorCode: "audio_transcription_not_available",
      errorMessage: "STT upstream not configured",
    });
    return respondApiError(
      c,
      ApiError.notImplemented(
        "Audio transcription is not available on Tokfai yet. Chat/Responses continue to use Base URL + API Key + Model only.",
        "audio_transcription_not_available"
      ),
      requestId
    );
  }

  // Billing: flat TOKFAI_STT_PRICE_CREDITS only — never chat tokens.
  // Unpriced → not_billable; chatGatewayMiddleware still enforces RPM/concurrency.
  // Future seam: self_hosted_stt_cost accounting (infra/GPU minutes) — do NOT
  // double-debit here; still a single recordAudioTranscriptionSuccess path.
  const priceProbe = cfg.priceCredits;
  if (!(typeof priceProbe === "number" && priceProbe > 0)) {
    log.info("audio_transcription_not_billable_guard", {
      request_id: requestId,
      route: AUDIO_TRANSCRIPTION_ENDPOINT,
      provider: cfg.providerId,
      billing_status: "not_billable",
      guard: "chat_gateway_rpm_concurrency",
      self_hosted_stt_cost_seam: "future_not_charged",
    });
  }

  let upstream;
  try {
    upstream = await provider.transcribeAudio({
      requestId,
      model: upstreamModel,
      bytes,
      mimeType,
      filename,
      language,
      prompt,
      responseFormat,
      temperature,
      timeoutMs: cfg.timeoutMs,
      abortSignal: clientAbort,
    });
  } catch (err) {
    const apiErr =
      err instanceof ApiError
        ? err
        : new ApiError({
            status: 502,
            message: "stt_provider_failed",
            code: "upstream_error",
            type: "upstream_error",
            publicMessage: "Provider connection failed.",
          });
    await safeFailUsage({
      caller,
      requestId,
      resolvedModel,
      startedAt,
      errorCode: apiErr.code ?? "upstream_error",
      errorMessage: apiErr.message,
      upstreamStatus: apiErr.upstreamStatus ?? apiErr.status,
    });
    return respondApiError(c, apiErr, requestId);
  }

  const latencyMs = Date.now() - startedAt;
  const price = cfg.priceCredits;
  const billable = typeof price === "number" && price > 0;
  const creditsCharged = billable ? price : 0;

  let billingStatus = "not_billable";
  try {
    const billed = await recordAudioTranscriptionSuccess({
      billable,
      entry: {
        user_id: caller.userId,
        api_key_id: caller.apiKeyId,
        tenant_id: caller.tenantId,
        model: resolvedModel,
        status: "succeeded",
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        credits_charged: creditsCharged,
        request_id: requestId,
        upstream_id: null,
        error_code: null,
        error_message: null,
        latency_ms: latencyMs,
        billable,
        finish_reason: "stop",
        upstream_status: upstream.upstreamStatus,
        upstream_error_code: null,
        safety_reason: `usage_type=${AUDIO_TRANSCRIPTION_USAGE_TYPE}`,
        billing_status: billable ? "charged" : "not_billable",
        endpoint: AUDIO_TRANSCRIPTION_ENDPOINT,
      },
      responseSnapshot: {
        object: "audio.transcription",
        model: resolvedModel,
      },
    });
    billingStatus = billed.billingStatus;
  } catch (err) {
    log.warn("audio_transcription_billing_failed", {
      request_id: requestId,
      route: AUDIO_TRANSCRIPTION_ENDPOINT,
      message: err instanceof Error ? err.message : String(err),
    });
    billingStatus = "not_billable";
  }

  log.info("audio_transcriptions_ok", {
    request_id: requestId,
    route: AUDIO_TRANSCRIPTION_ENDPOINT,
    provider: upstream.providerId,
    stt_source: cfg.source,
    channel_id: cfg.channelId,
    model: resolvedModel,
    upstream_model: upstream.upstreamModel || upstreamModel,
    bytes: bytes.byteLength,
    mime_type: mimeType,
    latency_ms: latencyMs,
    status: 200,
    billing_status: billingStatus,
    transcript_chars: upstream.text.length,
  });

  c.header("X-Request-Id", requestId);
  return c.json({
    text: upstream.text,
    request_id: requestId,
    credits_charged: billable ? creditsCharged : 0,
    tokfai: {
      request_id: requestId,
      credits_charged: billable ? creditsCharged : 0,
      billing_status: billingStatus,
      // Consumer-facing model only — never require Groq/upstream model names.
      requested_model: model || resolvedModel,
      resolved_model: resolvedModel,
      provider: upstream.providerId,
      usage_type: AUDIO_TRANSCRIPTION_USAGE_TYPE,
      stt_source: cfg.source,
    },
  });
});

async function safeFailUsage(args: {
  caller: ReturnType<typeof getChatCaller>;
  requestId: string;
  resolvedModel: string;
  startedAt: number;
  errorCode: string;
  errorMessage: string;
  upstreamStatus?: number;
}): Promise<void> {
  try {
    await recordAudioTranscriptionFailure({
      user_id: args.caller.userId,
      api_key_id: args.caller.apiKeyId,
      tenant_id: args.caller.tenantId,
      model: args.resolvedModel,
      status: "failed",
      request_id: args.requestId,
      error_code: args.errorCode,
      error_message: args.errorMessage.slice(0, 200),
      latency_ms: Date.now() - args.startedAt,
      upstream_status: args.upstreamStatus ?? null,
      upstream_error_code: args.errorCode,
      billing_status: "not_billable",
      endpoint: AUDIO_TRANSCRIPTION_ENDPOINT,
    });
  } catch {
    // never block error response
  }
}
