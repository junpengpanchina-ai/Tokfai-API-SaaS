import { env } from "../env.js";
import { ApiError } from "../errors.js";

/**
 * GRSAI is OpenAI-compatible — we passthrough the body to its
 * /v1/chat/completions endpoint, then layer on billing + logging.
 *
 * This file is a skeleton. The actual call is wired in D5.
 */

const BASE = env.GRSAI_API_BASE.replace(/\/+$/, "");

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
    const text = await res.text();
    throw new ApiError({
      status: res.status >= 500 ? 502 : res.status,
      message: `GRSAI returned ${res.status}.`,
      code: "upstream_error",
      type: "upstream_error",
      publicMessage:
        res.status >= 500
          ? "Upstream provider is having a moment."
          : truncate(text, 200),
    });
  }

  const data = (await res.json()) as T;
  return { data, upstreamId };
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n)}…` : s;
}
