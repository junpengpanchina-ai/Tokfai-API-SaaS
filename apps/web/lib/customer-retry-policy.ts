export const RETRYABLE_ERROR_CODES = [
  "too_many_requests",
  "too_many_concurrent_requests",
  "gateway_overloaded",
  "upstream_model_busy",
  "upstream_timeout",
  "upstream_error",
  "upstream_rate_limited",
] as const;

export const NON_RETRYABLE_ERROR_CODES = [
  "missing_token",
  "invalid_token",
  "insufficient_credits",
  "invalid_prompt",
  "invalid_request_error",
  "model_not_found",
  "model_not_available",
  "request_body_too_large",
  "invalid_image_url",
  "batch_cancelled",
] as const;

export type RetryableErrorCode = (typeof RETRYABLE_ERROR_CODES)[number];
export type NonRetryableErrorCode = (typeof NON_RETRYABLE_ERROR_CODES)[number];

export const DEFAULT_BACKOFF_SECONDS = [5, 15, 30] as const;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_JITTER_MAX_SECONDS = 3;

export const BATCH_POLL_INTERVAL_SECONDS = 5;
export const BATCH_MAX_POLL_ATTEMPTS = 60;

export type HttpRetryGuidance = {
  status: number;
  retry: boolean;
  noteKey: string;
};

export const HTTP_RETRY_GUIDANCE: HttpRetryGuidance[] = [
  { status: 401, retry: false, noteKey: "integration.safeRetry.http401" },
  { status: 402, retry: false, noteKey: "integration.safeRetry.http402" },
  { status: 400, retry: false, noteKey: "integration.safeRetry.http400" },
  { status: 413, retry: false, noteKey: "integration.safeRetry.http413" },
  { status: 429, retry: true, noteKey: "integration.safeRetry.http429" },
  { status: 503, retry: true, noteKey: "integration.safeRetry.http503" },
  { status: 504, retry: true, noteKey: "integration.safeRetry.http504" },
];

export function isRetryableErrorCode(code: string | undefined | null): boolean {
  if (!code) return false;
  return (RETRYABLE_ERROR_CODES as readonly string[]).includes(code);
}

export function isNonRetryableErrorCode(code: string | undefined | null): boolean {
  if (!code) return false;
  return (NON_RETRYABLE_ERROR_CODES as readonly string[]).includes(code);
}

export function shouldRetryHttpStatus(status: number, errorCode?: string | null): boolean {
  if (status === 401 || status === 402 || status === 400 || status === 413) return false;
  if (errorCode && isNonRetryableErrorCode(errorCode)) return false;
  if (status === 429 || status === 503 || status === 504) return true;
  if (status >= 500 && status < 600) {
    return errorCode ? isRetryableErrorCode(errorCode) : true;
  }
  return false;
}

export function backoffDelayMs(attemptIndex: number): number {
  const baseSeconds =
    DEFAULT_BACKOFF_SECONDS[Math.min(attemptIndex, DEFAULT_BACKOFF_SECONDS.length - 1)] ??
    DEFAULT_BACKOFF_SECONDS[DEFAULT_BACKOFF_SECONDS.length - 1];
  const jitterMs = Math.floor(Math.random() * DEFAULT_JITTER_MAX_SECONDS * 1000);
  return baseSeconds * 1000 + jitterMs;
}
