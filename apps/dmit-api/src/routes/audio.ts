/**
 * POST /v1/audio/transcriptions — OpenAI-compatible STT ingress (P1072).
 *
 * Hermes → Tokfai → isolated audio provider adapter → STT upstream.
 * Does NOT call executeChatCompletion. Never fakes a transcript.
 */

import { Hono } from "hono";

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
  resolveAudioSttConfig,
  resolveAudioSttProvider,
  resolveSttUpstreamModel,
} from "../upstream/audio/resolveAudioProvider.js";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
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

function basenameOnly(name: string): string {
  const cleaned = name.replace(/\\/g, "/").split("/").pop() || "audio.wav";
  return cleaned.slice(0, 128);
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
  let filename = "audio.wav";
  let mimeType = "application/octet-stream";
  let bytes: Uint8Array | null = null;

  try {
    const form = await c.req.parseBody({ all: true });
    const modelField = form.model;
    if (typeof modelField === "string" && modelField.trim()) {
      model = modelField.trim();
    }
    const langField = form.language;
    if (typeof langField === "string" && langField.trim()) {
      language = langField.trim();
    }
    const fileField = form.file;
    if (fileField instanceof File) {
      filename = basenameOnly(fileField.name || "audio.wav");
      mimeType = fileField.type || mimeType;
      const ab = await fileField.arrayBuffer();
      bytes = new Uint8Array(ab);
    } else if (typeof fileField === "string" && fileField.length > 0) {
      bytes = new Uint8Array(Buffer.from(fileField));
      filename = "audio.wav";
    }
  } catch (err) {
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

  if (bytes.byteLength > MAX_AUDIO_BYTES) {
    return respondApiError(
      c,
      ApiError.badRequest(
        "Audio file exceeds the 25MB size limit.",
        "request_body_too_large"
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
  const priceProbe = cfg.priceCredits;
  if (!(typeof priceProbe === "number" && priceProbe > 0)) {
    log.info("audio_transcription_not_billable_guard", {
      request_id: requestId,
      route: AUDIO_TRANSCRIPTION_ENDPOINT,
      provider: cfg.providerId,
      billing_status: "not_billable",
      guard: "chat_gateway_rpm_concurrency",
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
      timeoutMs: cfg.timeoutMs,
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
