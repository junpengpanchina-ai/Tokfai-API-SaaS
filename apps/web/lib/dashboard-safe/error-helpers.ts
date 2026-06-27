export function extractRequestIdSafe(body: unknown): string | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }

  const record = body as Record<string, unknown>;
  if (typeof record.request_id === "string" && record.request_id.trim()) {
    return record.request_id.trim();
  }

  const error = record.error;
  if (error && typeof error === "object") {
    const nested = error as Record<string, unknown>;
    if (typeof nested.request_id === "string" && nested.request_id.trim()) {
      return nested.request_id.trim();
    }
  }

  return undefined;
}

export function userMessageForDmitErrorSafe(
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
