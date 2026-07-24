/**
 * Upstream chat fetch with stream=true, idle-timeout drain, assemble JSON.
 *
 * Narrow helper for gemini-2.5-flash /v1/chat/completions stream=false
 * fallback — does not change Cherry synthesis or client stream paths.
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

/**
 * POST upstream with stream:true, reset idle timer on each chunk, drain SSE,
 * assemble a standard chat.completion object.
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
        publicMessage: "Upstream provider failed.",
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
        publicMessage: "Upstream provider failed.",
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
        publicMessage: "Upstream provider failed.",
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
