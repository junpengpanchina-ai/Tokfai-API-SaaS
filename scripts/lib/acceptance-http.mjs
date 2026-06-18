import { acceptanceTestRunId } from "./acceptance-config.mjs";

export function getAcceptanceHeaders() {
  return {
    "X-Tokfai-Acceptance": "manual",
    "X-Tokfai-Test-Run": acceptanceTestRunId(),
    "User-Agent": "Tokfai-Acceptance/1.0",
  };
}

/** Curl -H flags for live shell probes (one-line safe). */
export function acceptanceCurlHeaderFlags() {
  const run = acceptanceTestRunId();
  return `-H "X-Tokfai-Acceptance: manual" -H "X-Tokfai-Test-Run: ${run}" -H "User-Agent: Tokfai-Acceptance/1.0"`;
}

/** @deprecated use getAcceptanceHeaders() — kept for importers that read at call time */
export const ACCEPTANCE_HEADERS = getAcceptanceHeaders();

/** @deprecated use acceptanceCurlHeaderFlags() */
export const ACCEPTANCE_CURL_HEADER_FLAGS = acceptanceCurlHeaderFlags();

export function mergeAcceptanceHeaders(headers = {}) {
  return { ...getAcceptanceHeaders(), ...headers };
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
