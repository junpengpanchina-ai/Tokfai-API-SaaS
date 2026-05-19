/**
 * User-facing DMIT / API error copy (web only).
 * Maps HTTP status + error code to consistent product messages.
 */
export function userMessageForDmitError(
  status: number,
  code?: string | null,
  fallback?: string
): string {
  const normalized = code?.toLowerCase() ?? "";

  if (status === 401 || normalized === "invalid_token") {
    return "Invalid token";
  }

  if (status === 402 || normalized === "insufficient_credits") {
    return "Not enough credits";
  }

  if (
    status >= 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    normalized === "upstream_error" ||
    normalized === "upstream_auth_error" ||
    normalized === "upstream_rate_limited"
  ) {
    return "Model temporarily unavailable";
  }

  if (status === 401 || status === 403) {
    return "Please sign in again";
  }

  if (fallback?.trim()) {
    return fallback.trim();
  }

  return "Something went wrong. Please try again.";
}

/** Dashboard mutations (API keys, billing UI) — session/auth oriented copy. */
export function userMessageForDashboardError(
  status: number,
  code?: string | null,
  fallback?: string
): string {
  const normalized = code?.toLowerCase() ?? "";

  if (status === 401 || status === 403) {
    return "Please sign in again";
  }

  if (status === 409 && normalized === "api_key_name_exists") {
    return "Active key with this name already exists.";
  }

  if (
    status >= 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return "Unable to process right now. Please try again later.";
  }

  return userMessageForDmitError(status, code, fallback);
}
