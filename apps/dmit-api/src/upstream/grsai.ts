import { env } from "../env.js";
import { ApiError } from "../errors.js";

/**
 * GRSAI is OpenAI-compatible — we passthrough the body to its
 * /v1/chat/completions endpoint, then layer on billing + logging.
 *
 */

const BASE = env.GRSAI_BASE_URL.replace(/\/+$/, "");

export interface UpstreamFetchOptions extends Omit<RequestInit, "body"> {
  json?: unknown;
}

export async function grsaiFetch<T = unknown>(
  path: string,
  options: UpstreamFetchOptions = {}
): Promise<{ data: T; upstreamId: string | null }> {
  const { json, headers, ...init } = options;

  const finalHeaders = new Headers(headers);
  finalHeaders.set("Authorization", `Bearer ${env.GRSAI_API_KEY}`);
  if (json !== undefined) {
    finalHeaders.set("Content-Type", "application/json");
  }

  const res = await fetch(`${BASE}${path.startsWith("/") ? path : `/${path}`}`, {
    ...init,
    headers: finalHeaders,
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });

  const upstreamId =
    res.headers.get("x-request-id") ?? res.headers.get("x-upstream-id");

  if (!res.ok) {
    await res.text();
    const mapped = mapUpstreamError(res.status);
    throw new ApiError({
      status: mapped.status,
      message: `GRSAI returned ${res.status}.`,
      code: mapped.code,
      type: mapped.type,
      publicMessage: mapped.publicMessage,
    });
  }

  const data = (await res.json()) as T;
  return { data, upstreamId };
}

function mapUpstreamError(status: number): {
  status: number;
  code: string;
  type: "auth_error" | "rate_limit_error" | "upstream_error";
  publicMessage?: string;
} {
  if (status === 401 || status === 403) {
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
