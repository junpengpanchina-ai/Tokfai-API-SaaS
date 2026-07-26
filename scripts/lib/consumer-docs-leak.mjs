/**
 * Shared consumer-docs leak helpers (P950).
 *
 * Customer-visible surfaces must not expose:
 * - GRSAI / grsai / garsai brand tokens
 * - grsaiapi.com (any form — not even as a wrong-provider diagnostic)
 * - 上游供应商 / upstream provider
 * - upstreamModel (camelCase field / key leak)
 * - /v1/api/generate upstream path
 */

/** @deprecated P950 — bare grsaiapi.com is no longer allowed in consumer docs. */
export const ALLOWED_WRONG_PROVIDER_DIAGNOSTICS = [];

/**
 * Brand / path / field leaks in customer-visible copy.
 * - forbids grsaiapi.com in any form
 * - forbids grsai / garsai brand tokens
 * - forbids upstreamModel camelCase
 * - forbids 上游供应商 / upstream provider
 */
export const CONSUMER_LEAK_RE =
  /grsaiapi\.com|(?<![\w.])grsai(?!api\.com)|(?<![\w.])garsai|https?:\/\/v1\/api\/generate|["'`]\/v1\/api\/generate["'`]|上游供应商|upstream\s+provider|upstreamModel/i;

export function stripAllowedWrongProviderDiagnostics(src) {
  // P950: no allowlist — return as-is for findConsumerLeak.
  void ALLOWED_WRONG_PROVIDER_DIAGNOSTICS;
  return String(src);
}

export function findConsumerLeak(src) {
  const normalized = stripAllowedWrongProviderDiagnostics(src);
  return normalized.match(CONSUMER_LEAK_RE)?.[0] ?? null;
}

/** True when docs use grsaiapi.com as a Base URL / API Host value. */
export function findGrsaiapiAsIntegrationHost(src) {
  const m = String(src).match(
    /(?:Base URL|API Host|apiHost|接入地址|endpoint)\s*[：:=\-]\s*[`"']?https?:\/\/grsaiapi\.com/i
  );
  return m?.[0] ?? null;
}
