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
}

export interface GrsaiLogContext {
  requestId?: string;
  route?: string;
  model?: string;
}

function buildUpstreamUrl(path: string): string {
  return `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

function truncateUpstreamMessage(text: string, max = 200): string {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}

export async function grsaiFetch<T = unknown>(
  path: string,
  options: UpstreamFetchOptions = {},
  logContext: GrsaiLogContext = {}
): Promise<{ data: T; upstreamId: string | null }> {
  const { json, headers, ...init } = options;
  const upstreamUrl = buildUpstreamUrl(path);
  const { host, path: upstreamPath } = grsaiUpstreamTarget(path);
  const startedAt = Date.now();

  const finalHeaders = new Headers(headers);
  finalHeaders.set("Authorization", `Bearer ${env.GRSAI_API_KEY}`);
  if (json !== undefined) {
    finalHeaders.set("Content-Type", "application/json");
  }

  const res = await fetch(upstreamUrl, {
    ...init,
    headers: finalHeaders,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });

  const upstreamId =
    res.headers.get("x-request-id") ?? res.headers.get("x-upstream-id");
  const latencyMs = Date.now() - startedAt;

  if (!res.ok) {
    const bodyText = await res.text();
    const mapped = mapUpstreamError(res.status, bodyText);
    const upstreamErrorMessage = truncateUpstreamMessage(bodyText);

    log.warn("grsai_upstream_failed", {
      requestId: logContext.requestId,
      route: logContext.route,
      model: logContext.model,
      upstreamHost: host,
      upstreamPath,
      upstreamStatus: res.status,
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
  bodyText: string
): {
  status: number;
  code: string;
  type: "auth_error" | "rate_limit_error" | "upstream_error";
  publicMessage?: string;
} {
  const bodyLower = bodyText.toLowerCase();

  if (
    status === 401 ||
    status === 403 ||
    (status === 400 && bodyLower.includes("apikey"))
  ) {
    return {
      status: 502,
      code: "upstream_auth_error",
      type: "upstream_error",
      publicMessage: "Upstream authentication failed.",
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
