/**
 * Upstream chat fetch helpers for gemini-2.5-flash /v1/chat/completions.
 *
 * Policy for client stream=false (non-stream requests):
 *   1. Prefer native non-stream upstream JSON (`stream: false`).
 *   2. NEVER default to stream assemble.
 *   3. Stream assemble only when native non-stream is unavailable or fails
 *      with an eligible upstream error — then drain stream=true and assemble.
 *
 * `providerFetchChatStreamAssembled` is the FALLBACK drain helper only.
 * Callers of ordinary non-stream traffic must use
 * `providerFetchChatPreferNativeNonStream` (or equivalent native-first logic).
 *
 * Does not change Cherry synthesis, alias routing, billing, or image paths.
 */

import { env } from "../env.js";
import { ApiError } from "../errors.js";
import {
  assembleChatCompletionFromUpstreamSse,
  type AssembledChatCompletion,
} from "../lib/assembleChatCompletionFromUpstreamSse.js";
import { log } from "../logger.js";
import {
  mapUpstreamError,
  providerFetch,
  type UpstreamFetchOptions,
  type UpstreamLogContext,
} from "./grsai.js";
import type { UpstreamProvider } from "./providers.js";

function buildProviderUrl(provider: UpstreamProvider, path: string): string {
  const base = provider.baseUrl.replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

function providerUpstreamTarget(
  provider: UpstreamProvider,
  path: string
): { host: string; path: string } {
  const url = new URL(buildProviderUrl(provider, path));
  return { host: url.host, path: url.pathname };
}

function truncateUpstreamMessage(text: string, max = 200): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}

function parseUpstreamErrorBody(bodyText: string): {
  message: string;
  type: string;
  code: string;
} {
  try {
    const json = JSON.parse(bodyText) as {
      error?: { message?: unknown; type?: unknown; code?: unknown };
      message?: unknown;
      type?: unknown;
      code?: unknown;
    };
    const err = json.error ?? json;
    return {
      message:
        typeof err?.message === "string"
          ? err.message
          : truncateUpstreamMessage(bodyText),
      type: typeof err?.type === "string" ? err.type : "",
      code: typeof err?.code === "string" ? err.code : "",
    };
  } catch {
    return {
      message: truncateUpstreamMessage(bodyText),
      type: "",
      code: "",
    };
  }
}

function isAbortTimeout(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "TimeoutError" || err.name === "AbortError";
}

export type PreferNativeChatFetchResult<T = AssembledChatCompletion> = {
  data: T;
  upstreamId: string | null;
  /** True only when the response was recovered via stream assemble fallback. */
  viaStreamAssemble: boolean;
};

export type PreferNativeChatFetchOptions = UpstreamFetchOptions & {
  json: Record<string, unknown>;
  /** Wall-clock budget for the native non-stream attempt. */
  timeoutMs: number;
  /**
   * When false, skip native non-stream and use stream assemble only.
   * Set only when the provider truly has no usable non-stream capability
   * (e.g. client stream=true and non-stream circuit already open).
   * Default true — ordinary non-stream requests must always try native first.
   */
  nativeNonStreamAvailable?: boolean;
  /** After native failure, attempt stream assemble. Default true. */
  allowStreamAssembleFallback?: boolean;
  /** Decide if a native failure may use stream assemble. */
  isStreamAssembleEligible?: (err: ApiError) => boolean;
  /** Wall-clock cap for stream drain (in addition to idle). */
  streamAssembleTimeoutMs: number;
  /** Abort stream drain when no bytes arrive for this long. */
  streamAssembleIdleTimeoutMs: number;
};

/**
 * Prefer native non-stream upstream. Stream assemble is FALLBACK ONLY.
 *
 * Non-stream client requests must call this (or equivalent) — never jump
 * straight to `providerFetchChatStreamAssembled`.
 */
export async function providerFetchChatPreferNativeNonStream<T = AssembledChatCompletion>(
  provider: UpstreamProvider,
  path: string,
  options: PreferNativeChatFetchOptions,
  logContext: UpstreamLogContext = {}
): Promise<PreferNativeChatFetchResult<T>> {
  const {
    json,
    headers,
    timeoutMs,
    nativeNonStreamAvailable = true,
    allowStreamAssembleFallback = true,
    isStreamAssembleEligible,
    streamAssembleTimeoutMs,
    streamAssembleIdleTimeoutMs,
    ...init
  } = options;

  const runAssemble = async (reason: string, priorErr?: ApiError) => {
    log.warn("chat_prefer_native_stream_assemble_fallback", {
      requestId: logContext.requestId,
      route: logContext.route,
      model: logContext.model,
      requestedModel: logContext.requestedModel,
      resolvedModel: logContext.resolvedModel ?? logContext.model,
      providerId: provider.id,
      reason,
      nativeNonStreamAvailable,
      upstreamStatus: priorErr?.upstreamStatus ?? null,
      upstreamErrorCode: priorErr?.code ?? null,
      billing_status: "not_billable",
      streamAssemble: true,
    });
    const assembled = await providerFetchChatStreamAssembled(
      provider,
      path,
      {
        ...init,
        headers,
        json,
        timeoutMs: streamAssembleTimeoutMs,
        idleTimeoutMs: streamAssembleIdleTimeoutMs,
      },
      logContext
    );
    return {
      data: assembled.data as T,
      upstreamId: assembled.upstreamId,
      viaStreamAssemble: true as const,
    };
  };

  // No usable non-stream capability → assemble fallback only.
  if (!nativeNonStreamAvailable) {
    if (!allowStreamAssembleFallback) {
      throw (
        ApiError.requestTimeout(
          "Upstream non-stream unavailable and stream assemble disabled.",
          "上游模型响应超时，请稍后重试或切换模型。"
        )
      );
    }
    try {
      return await runAssemble("native_nonstream_unavailable");
    } catch (streamErr) {
      if (
        streamErr instanceof ApiError &&
        streamErr.code === "upstream_timeout"
      ) {
        return await runAssemble("stream_assemble_retry", streamErr);
      }
      throw streamErr;
    }
  }

  // Prefer native non-stream JSON (force stream:false — never default assemble).
  const nonStreamJson: Record<string, unknown> = { ...json, stream: false };
  try {
    const fetched = await providerFetch<T>(
      provider,
      path,
      {
        ...init,
        headers,
        json: nonStreamJson,
        timeoutMs,
        // Do not pass idleTimeoutMs — that would override the non-stream wall.
      },
      logContext
    );
    return {
      data: fetched.data,
      upstreamId: fetched.upstreamId,
      viaStreamAssemble: false,
    };
  } catch (nonStreamErr) {
    if (!(nonStreamErr instanceof ApiError) || !allowStreamAssembleFallback) {
      throw nonStreamErr;
    }
    const eligible =
      typeof isStreamAssembleEligible === "function"
        ? isStreamAssembleEligible(nonStreamErr)
        : false;
    if (!eligible) {
      throw nonStreamErr;
    }
    try {
      return await runAssemble(
        nonStreamErr.code ?? "upstream_error",
        nonStreamErr
      );
    } catch (streamErr) {
      if (
        streamErr instanceof ApiError &&
        streamErr.code === "upstream_timeout"
      ) {
        return await runAssemble("stream_assemble_retry", streamErr);
      }
      throw streamErr;
    }
  }
}

/**
 * POST upstream with stream:true, reset idle timer on each chunk, drain SSE,
 * assemble a standard chat.completion object.
 *
 * FALLBACK ONLY — do not call this as the default path for client stream=false.
 * Prefer `providerFetchChatPreferNativeNonStream`.
 */
export async function providerFetchChatStreamAssembled(
  provider: UpstreamProvider,
  path: string,
  options: UpstreamFetchOptions & {
    json: Record<string, unknown>;
    /** Wall-clock cap for the whole stream drain (in addition to idle). */
    timeoutMs?: number;
    /** Abort when no bytes arrive for this long. */
    idleTimeoutMs: number;
  },
  logContext: UpstreamLogContext = {}
): Promise<{ data: AssembledChatCompletion; upstreamId: string | null }> {
  const { json, headers, timeoutMs, idleTimeoutMs, ...init } = options;
  const upstreamUrl = buildProviderUrl(provider, path);
  const { host, path: upstreamPath } = providerUpstreamTarget(provider, path);
  const startedAt = Date.now();
  const wallMs =
    timeoutMs ??
    provider.timeoutMs ??
    env.TOKFAI_UPSTREAM_TIMEOUT_MS;
  const idleMs = Math.max(1_000, idleTimeoutMs);

  const streamJson: Record<string, unknown> = { ...json, stream: true };

  const finalHeaders = new Headers(headers);
  finalHeaders.set("Authorization", `Bearer ${provider.apiKey}`);
  finalHeaders.set("Content-Type", "application/json");
  finalHeaders.set("Accept", "text/event-stream");

  const wallController = new AbortController();
  const wallTimer = setTimeout(() => wallController.abort(), wallMs);

  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  const armIdle = () => {
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => wallController.abort(), idleMs);
  };

  try {
    armIdle();
    let res: Response;
    try {
      res = await fetch(upstreamUrl, {
        ...init,
        method: "POST",
        headers: finalHeaders,
        body: JSON.stringify(streamJson),
        signal: wallController.signal,
      });
    } catch (err) {
      const latencyMs = Date.now() - startedAt;
      if (isAbortTimeout(err) || wallController.signal.aborted) {
        log.warn("upstream_provider_timeout", {
          requestId: logContext.requestId,
          route: logContext.route,
          model: logContext.model,
          requestedModel: logContext.requestedModel,
          resolvedModel: logContext.resolvedModel ?? logContext.model,
          providerId: provider.id,
          upstreamHost: host,
          upstreamPath,
          upstreamStatus: 504,
          upstreamErrorCode: "upstream_timeout",
          latencyMs,
          timeoutMs: wallMs,
          idleTimeoutMs: idleMs,
          billing_status: "not_billable",
          fallbackSkippedReason: null,
          streamAssemble: true,
        });
        throw new ApiError({
          status: 504,
          message: "Upstream provider timed out.",
          code: "upstream_timeout",
          type: "upstream_error",
          publicMessage: "上游模型响应超时，请稍后重试或切换模型。",
          upstreamStatus: 504,
          upstreamErrorSnippet: "timeout",
        });
      }
      throw err;
    }

    const upstreamId =
      res.headers.get("x-request-id") ?? res.headers.get("x-upstream-id");
    const latencyMs = Date.now() - startedAt;

    if (!res.ok) {
      const bodyText = await res.text();
      const parsed = parseUpstreamErrorBody(bodyText);
      const mapped = mapUpstreamError(res.status, parsed, bodyText);
      const upstreamErrorMessage = truncateUpstreamMessage(
        parsed.message || bodyText
      );

      log.warn("upstream_provider_failed", {
        requestId: logContext.requestId,
        route: logContext.route,
        model: logContext.model,
        requestedModel: logContext.requestedModel,
        resolvedModel: logContext.resolvedModel ?? logContext.model,
        providerId: provider.id,
        upstreamHost: host,
        upstreamPath,
        upstreamStatus: res.status,
        upstreamCode: parsed.code || parsed.type || null,
        upstreamErrorCode: mapped.code,
        upstreamErrorMessage,
        latencyMs,
        timeoutMs: wallMs,
        billing_status: "not_billable",
        streamAssemble: true,
        message: `Upstream ${provider.id} HTTP ${res.status}`,
      });

      throw new ApiError({
        status: mapped.status,
        message: `Upstream ${provider.id} returned ${res.status}: ${upstreamErrorMessage || "(empty body)"}`,
        code: mapped.code,
        type: mapped.type,
        publicMessage: mapped.publicMessage,
        upstreamStatus: res.status,
        upstreamErrorSnippet: upstreamErrorMessage,
      });
    }

    if (!res.body) {
      throw new ApiError({
        status: 502,
        message: "Upstream stream returned empty body.",
        code: "upstream_error",
        type: "upstream_error",
        publicMessage: "Provider connection failed.",
        upstreamStatus: res.status,
        upstreamErrorSnippet: "empty_stream_body",
      });
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let raw = "";
    try {
      for (;;) {
        armIdle();
        const { done, value } = await reader.read();
        if (done) break;
        if (value?.byteLength) {
          raw += decoder.decode(value, { stream: true });
        }
      }
      raw += decoder.decode();
    } catch (err) {
      const drainLatencyMs = Date.now() - startedAt;
      if (isAbortTimeout(err) || wallController.signal.aborted) {
        log.warn("upstream_provider_timeout", {
          requestId: logContext.requestId,
          route: logContext.route,
          model: logContext.model,
          requestedModel: logContext.requestedModel,
          resolvedModel: logContext.resolvedModel ?? logContext.model,
          providerId: provider.id,
          upstreamHost: host,
          upstreamPath,
          upstreamStatus: 504,
          upstreamErrorCode: "upstream_timeout",
          latencyMs: drainLatencyMs,
          timeoutMs: wallMs,
          idleTimeoutMs: idleMs,
          billing_status: "not_billable",
          fallbackSkippedReason: null,
          streamAssemble: true,
        });
        throw new ApiError({
          status: 504,
          message: "Upstream provider timed out.",
          code: "upstream_timeout",
          type: "upstream_error",
          publicMessage: "上游模型响应超时，请稍后重试或切换模型。",
          upstreamStatus: 504,
          upstreamErrorSnippet: "timeout",
        });
      }
      throw err;
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      throw new ApiError({
        status: 502,
        message: "Upstream stream returned empty body.",
        code: "upstream_error",
        type: "upstream_error",
        publicMessage: "Provider connection failed.",
        upstreamStatus: res.status,
        upstreamErrorSnippet: "empty_stream_body",
      });
    }

    // Some gateways return a JSON error body with 200 + wrong content-type.
    if (trimmed.startsWith("{") && !trimmed.includes("data:")) {
      const parsed = parseUpstreamErrorBody(trimmed);
      if (parsed.message || parsed.code) {
        const mapped = mapUpstreamError(502, parsed, trimmed);
        throw new ApiError({
          status: mapped.status,
          message: `Upstream ${provider.id} stream error: ${parsed.message || "(empty)"}`,
          code: mapped.code,
          type: mapped.type,
          publicMessage: mapped.publicMessage,
          upstreamStatus: 502,
          upstreamErrorSnippet: truncateUpstreamMessage(parsed.message),
        });
      }
    }

    const data = assembleChatCompletionFromUpstreamSse(
      raw,
      typeof streamJson.model === "string" ? streamJson.model : "gemini-2.5-flash"
    );
    if (!data || !Array.isArray(data.choices) || data.choices.length === 0) {
      throw new ApiError({
        status: 502,
        message: "Upstream stream could not be assembled into chat.completion.",
        code: "upstream_error",
        type: "upstream_error",
        publicMessage: "Provider connection failed.",
        upstreamStatus: res.status,
        upstreamErrorSnippet: "stream_assemble_failed",
      });
    }

    return { data, upstreamId };
  } finally {
    clearTimeout(wallTimer);
    if (idleTimer) clearTimeout(idleTimer);
  }
}
