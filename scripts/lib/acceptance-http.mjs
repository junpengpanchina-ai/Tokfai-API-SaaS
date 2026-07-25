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

/** AbortSignal.timeout / fetch abort — never leave as uncaught in smoke scripts. */
export function isAcceptanceTimeoutError(err) {
  if (!err || typeof err !== "object") return false;
  const name = typeof err.name === "string" ? err.name : "";
  return (
    name === "TimeoutError" ||
    name === "AbortError" ||
    err.code === "ABORT_ERR" ||
    err.code === "TIMEOUT"
  );
}

function timeoutProbeResult(timeoutMs) {
  const payload = {
    error: {
      message: `Client probe timed out after ${timeoutMs}ms waiting for API response.`,
      code: "network_timeout",
      type: "timeout_error",
    },
  };
  const text = JSON.stringify(payload);
  const res = new Response(text, {
    status: 504,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
  return {
    res,
    body: payload,
    text,
    timedOut: true,
    errorCode: "network_timeout",
    errorMessage: "TimeoutError",
  };
}

/**
 * @param {string} url
 * @param {{
 *   method?: string,
 *   headers?: Record<string, string>,
 *   body?: string,
 *   timeoutMs?: number,
 *   curlCompatible?: boolean,
 * }} [options]
 * curlCompatible: skip X-Tokfai-* acceptance headers (match plain curl).
 *
 * Timeout/Abort never throws — returns timedOut=true + network_timeout envelope
 * so LIVE smokes / release gate cannot die on uncaught DOMException.
 */
export async function acceptanceFetch(url, options = {}) {
  const headers = options.curlCompatible
    ? { ...(options.headers ?? {}) }
    : mergeAcceptanceHeaders(options.headers ?? {});
  const timeoutMs = options.timeoutMs ?? 120_000;

  let res;
  try {
    res = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      body: options.body,
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (err) {
    if (isAcceptanceTimeoutError(err)) {
      return timeoutProbeResult(timeoutMs);
    }
    throw err;
  }

  let text = "";
  try {
    text = await res.text();
  } catch (err) {
    if (isAcceptanceTimeoutError(err)) {
      return timeoutProbeResult(timeoutMs);
    }
    throw err;
  }

  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { _raw: text };
  }

  return { res, body, text };
}
