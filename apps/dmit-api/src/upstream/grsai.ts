import { env } from "../env.js";
import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import type { UpstreamProvider } from "./providers.js";
import { getProviderById } from "./providers.js";

/**
 * OpenAI-compatible upstream fetch — provider-agnostic transport layer.
 * Billing, model routing, and provider fallback live in executeChatCompletion.
 */

export interface UpstreamFetchOptions extends Omit<RequestInit, "body"> {
  json?: unknown;
  timeoutMs?: number;
}

export interface UpstreamLogContext {
  requestId?: string;
  route?: string;
  model?: string;
  requestedModel?: string;
  providerId?: string;
}

interface ParsedUpstreamError {
  message: string;
  type: string;
  code: string;
}

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

function parseUpstreamErrorBody(bodyText: string): ParsedUpstreamError {
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

function isTimeoutError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  return err.name === "TimeoutError" || err.name === "AbortError";
}

/** Whether alias model chain or provider pool may try the next target. */
export function isChatFallbackEligible(err: ApiError): boolean {
  const code = err.code;
  if (
    !code ||
    code === "upstream_auth_error" ||
    code === "insufficient_credits"
  ) {
    return false;
  }
  if (code === "upstream_error") {
    return (err.upstreamStatus ?? 502) >= 500;
  }
  return [
    "upstream_model_busy",
    "model_not_available",
    "model_not_supported",
    "upstream_timeout",
    "upstream_rate_limited",
  ].includes(code);
}

function extractUnregisteredModelHint(combinedLower: string): string | null {
  const match =
    /model\s+not\s+register(?:ed)?\s*:\s*([a-z0-9._-]+)/i.exec(combinedLower) ??
    /model\s+not\s+found\s*:\s*([a-z0-9._-]+)/i.exec(combinedLower);
  return match?.[1]?.trim() ?? null;
}

export function mapUpstreamError(
  status: number,
  parsed: ParsedUpstreamError,
  bodyText: string
): {
  status: number;
  code: string;
  type: "auth_error" | "rate_limit_error" | "upstream_error" | "validation_error";
  publicMessage: string;
} {
  const combined = `${parsed.message} ${parsed.type} ${parsed.code} ${bodyText}`.toLowerCase();

  if (
    combined.includes("<html") ||
    combined.includes("bad gateway") ||
    combined.includes("cloudflare")
  ) {
    return {
      status: 502,
      code: "upstream_error",
      type: "upstream_error",
      publicMessage: "Upstream provider failed.",
    };
  }

  if (
    status === 401 ||
    status === 403 ||
    combined.includes("apikey") ||
    combined.includes("api key") ||
    combined.includes("invalid key") ||
    combined.includes("unauthorized")
  ) {
    return {
      status: 502,
      code: "upstream_auth_error",
      type: "upstream_error",
      publicMessage: "Upstream provider authentication failed.",
    };
  }

  if (
    combined.includes("负载较高") ||
    combined.includes("load is too high") ||
    combined.includes("model load")
  ) {
    return {
      status: 503,
      code: "upstream_model_busy",
      type: "upstream_error",
      // Client vocabulary alias: upstream_busy (see docs / p914).
      publicMessage:
        "Model is busy on Tokfai. Please retry shortly or choose another Tokfai model.",
    };
  }

  if (
    combined.includes("model not register") ||
    combined.includes("model not found") ||
    combined.includes("not registered")
  ) {
    // Never leak upstream vendor "model not register" wording to clients.
    return {
      status: 400,
      code: "model_not_available",
      type: "validation_error",
      publicMessage:
        "This model is not available on Tokfai. Please refresh model list or choose another Tokfai model.",
    };
  }

  if (status === 429) {
    return {
      status: 429,
      code: "upstream_rate_limited",
      type: "rate_limit_error",
      // Client vocabulary alias: rate_limited (see docs / p914).
      publicMessage: "Rate limited. Please reduce request rate and retry.",
    };
  }

  return {
    status: 502,
    code: "upstream_error",
    type: "upstream_error",
    publicMessage: "Upstream provider failed.",
  };
}

export async function providerFetch<T = unknown>(
  provider: UpstreamProvider,
  path: string,
  options: UpstreamFetchOptions = {},
  logContext: UpstreamLogContext = {}
): Promise<{ data: T; upstreamId: string | null }> {
  const { json, headers, timeoutMs, ...init } = options;
  const upstreamUrl = buildProviderUrl(provider, path);
  const { host, path: upstreamPath } = providerUpstreamTarget(provider, path);
  const startedAt = Date.now();
  const effectiveTimeoutMs =
    timeoutMs ?? provider.timeoutMs ?? env.TOKFAI_UPSTREAM_TIMEOUT_MS;

  const finalHeaders = new Headers(headers);
  finalHeaders.set("Authorization", `Bearer ${provider.apiKey}`);
  if (json !== undefined) {
    finalHeaders.set("Content-Type", "application/json");
  }

  let res: Response;
  try {
    res = await fetch(upstreamUrl, {
      ...init,
      headers: finalHeaders,
      body: json !== undefined ? JSON.stringify(json) : undefined,
      signal: AbortSignal.timeout(effectiveTimeoutMs),
    });
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    if (isTimeoutError(err)) {
      log.warn("upstream_provider_timeout", {
        requestId: logContext.requestId,
        route: logContext.route,
        model: logContext.model,
        requestedModel: logContext.requestedModel,
        providerId: provider.id,
        upstreamHost: host,
        upstreamPath,
        upstreamStatus: 504,
        upstreamErrorCode: "upstream_timeout",
        latencyMs,
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
    const upstreamErrorMessage = truncateUpstreamMessage(parsed.message || bodyText);
    const upstreamCode = parsed.code || parsed.type || null;

    log.warn("upstream_provider_failed", {
      requestId: logContext.requestId,
      route: logContext.route,
      model: logContext.model,
      requestedModel: logContext.requestedModel,
      providerId: provider.id,
      upstreamHost: host,
      upstreamPath,
      upstreamStatus: res.status,
      upstreamCode: upstreamCode,
      upstreamErrorCode: mapped.code,
      upstreamErrorMessage,
      latencyMs,
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

  const data = (await res.json()) as T;
  return { data, upstreamId };
}

/** @deprecated Prefer providerFetch with resolveProviderAttempts(). */
export async function grsaiFetch<T = unknown>(
  path: string,
  options: UpstreamFetchOptions = {},
  logContext: GrsaiLogContext = {}
): Promise<{ data: T; upstreamId: string | null }> {
  const primary = getProviderById("grsai-primary");
  if (!primary) {
    throw new ApiError({
      status: 502,
      message: "Primary upstream provider is not configured.",
      code: "upstream_error",
      type: "upstream_error",
      publicMessage: "Upstream provider failed.",
    });
  }

  return providerFetch<T>(
    primary,
    path,
    options,
    logContext as UpstreamLogContext
  );
}

/** Legacy alias for upstream log context. */
export type GrsaiLogContext = UpstreamLogContext;
