/**
 * Shared consumer-docs leak helpers.
 *
 * Bare `grsaiapi.com` is allowed only inside known wrong-provider diagnostic
 * phrases. `https://grsaiapi.com` must never appear as an integration host.
 */

/** Phrases that may mention grsaiapi.com as a wrong-provider signal. */
export const ALLOWED_WRONG_PROVIDER_DIAGNOSTICS = [
  "如果出现 grsaiapi.com，说明没有走 Tokfai",
  "如果错误详情里出现 grsaiapi.com，说明没有走 Tokfai",
  "并且请求路径是 grsaiapi.com",
  "请求路径是 grsaiapi.com",
  "请求路径出现 grsaiapi.com",
  "错误详情请求路径是 grsaiapi.com",
  "如果请求路径不是 api.tokfai.com（例如 grsaiapi.com、openai.com、googleapis.com）",
  "如果请求路径不是 api.tokfai.com（grsaiapi.com / openai.com / googleapis.com / generativelanguage.googleapis.com）",
  "如果请求路径不是 api.tokfai.com（例如 grsaiapi.com / openai.com / googleapis.com）",
  "请求路径是 grsaiapi.com / openai.com / googleapis.com / generativelanguage.googleapis.com",
  "If error details show grsaiapi.com, the request did not go through Tokfai",
  "and the request path is grsaiapi.com",
  "request path shows grsaiapi.com",
  "Request path is grsaiapi.com",
  "Error path is grsaiapi.com",
  "If the request path is not api.tokfai.com (e.g. grsaiapi.com, openai.com, googleapis.com)",
  "If the request path is not api.tokfai.com (grsaiapi.com / openai.com / googleapis.com / generativelanguage.googleapis.com)",
  "If the request path is not api.tokfai.com (e.g. grsaiapi.com / openai.com / googleapis.com)",
  "Request path is grsaiapi.com / openai.com / googleapis.com / generativelanguage.googleapis.com",
];

/**
 * Brand / path leak after stripping allowed diagnostics.
 * - forbids https://grsaiapi.com (integration URL form)
 * - forbids grsai / garsai brand tokens (not inside grsaiapi.com)
 */
export const CONSUMER_LEAK_RE =
  /https?:\/\/grsaiapi\.com|(?<![\w.])grsai(?!api\.com)|(?<![\w.])garsai|https?:\/\/v1\/api\/generate|["'`]\/v1\/api\/generate["'`]|上游供应商|upstream\s+provider|provider\s+name/i;

export function stripAllowedWrongProviderDiagnostics(src) {
  let out = String(src);
  for (const phrase of ALLOWED_WRONG_PROVIDER_DIAGNOSTICS) {
    out = out.split(phrase).join("");
  }
  return out;
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
