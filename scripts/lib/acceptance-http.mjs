import { acceptanceTestRunId } from "./acceptance-config.mjs";

export const ACCEPTANCE_HEADERS = {
  "X-Tokfai-Acceptance": "manual",
  "X-Tokfai-Test-Run": acceptanceTestRunId(),
  "User-Agent": "Tokfai-Acceptance/1.0",
};

/** Curl -H flags for live shell probes (one-line safe). */
export const ACCEPTANCE_CURL_HEADER_FLAGS = `-H "X-Tokfai-Acceptance: manual" -H "X-Tokfai-Test-Run: ${acceptanceTestRunId()}" -H "User-Agent: Tokfai-Acceptance/1.0"`;

export function mergeAcceptanceHeaders(headers = {}) {
  return { ...ACCEPTANCE_HEADERS, ...headers };
}

export async function acceptanceFetch(url, options = {}) {
  const headers = mergeAcceptanceHeaders(options.headers ?? {});
  const timeoutMs = options.timeoutMs ?? 120_000;

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.body,
    signal: AbortSignal.timeout(timeoutMs),
  });

  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { _raw: text };
  }

  return { res, body, text };
}
