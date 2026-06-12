import { env, grsaiUpstreamTarget } from "../env.js";
import { ApiError } from "../errors.js";
import { log } from "../logger.js";

/**
 * GRSAI is OpenAI-compatible — we passthrough the body to its
 * /v1/chat/completions endpoint, then layer on billing + logging.
 */

const BASE = env.GRSAI_BASE_URL.replace(/\/+$/, "");

export interface UpstreamFetchOptions extends Omit<RequestInit, "body"> {
  json?: unknown;
  timeoutMs?: number;
}

export interface GrsaiLogContext {
  requestId?: string;
  route?: string;
  model?: string;
  requestedModel?: string;
}

interface ParsedUpstreamError {
  message: string;
  type: string;
  code: string;
}

function buildUpstreamUrl(path: string): string {
  return `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
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

/** Whether auto-* aliases may try the next model in the chain. */
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
    "upstream_timeout",
    "upstream_rate_limited",
  ].includes(code);
}

export async function grsaiFetch<T = unknown>(
  path: string,
  options: UpstreamFetchOptions = {},
  logContext: GrsaiLogContext = {}
): Promise<{ data: T; upstreamId: string | null }> {
  const { json, headers, timeoutMs, ...init } = options;
  const upstreamUrl = buildUpstreamUrl(path);
  const { host, path: upstreamPath } = grsaiUpstreamTarget(path);
  const startedAt = Date.now();
  const effectiveTimeoutMs =
    timeoutMs ?? env.TOKFAI_UPSTREAM_TIMEOUT_MS ?? env.GRSAI_CHAT_TIMEOUT_MS;

  const finalHeaders = new Headers(headers);
  finalHeaders.set("Authorization", `Bearer ${env.GRSAI_API_KEY}`);
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
      log.warn("grsai_upstream_timeout", {
        requestId: logContext.requestId,
        route: logContext.route,
        model: logContext.model,
        requestedModel: logContext.requestedModel,
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

    log.warn("grsai_upstream_failed", {
      requestId: logContext.requestId,
      route: logContext.route,
      model: logContext.model,
      requestedModel: logContext.requestedModel,
      upstreamHost: host,
      upstreamPath,
      upstreamStatus: res.status,
      upstreamCode,
      upstreamErrorCode: mapped.code,
      upstreamErrorMessage,
      latencyMs,
    });

    throw new ApiError({
      status: mapped.status,
      message: `GRSAI returned ${res.status}: ${upstreamErrorMessage || "(empty body)"}`,
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

function mapUpstreamError(
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
    status === 401 ||
    status === 403 ||
    combined.includes("apikey")
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
      publicMessage: "当前模型负载较高，请稍后重试或切换推荐模型。",
    };
  }

  if (
    combined.includes("model not register") ||
    combined.includes("model not found") ||
    combined.includes("not registered")
  ) {
    return {
      status: 400,
      code: "model_not_available",
      type: "validation_error",
      publicMessage: "当前模型暂不可用或未注册，请切换推荐模型。",
    };
  }

  if (status === 429) {
    return {
      status: 429,
      code: "upstream_rate_limited",
      type: "rate_limit_error",
      publicMessage: "Upstream provider is rate limited.",
    };
  }

  return {
    status: 502,
    code: "upstream_error",
    type: "upstream_error",
    publicMessage: "Upstream provider failed.",
  };
}
