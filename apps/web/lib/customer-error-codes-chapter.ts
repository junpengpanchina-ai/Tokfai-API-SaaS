/** Customer-facing error codes for /dashboard/docs#error-codes — aligned with DMIT API envelopes. */

export const CUSTOMER_DOC_ERROR_CODES = [
  "missing_token",
  "invalid_token",
  "insufficient_credits",
  "invalid_request_error",
  "invalid_prompt",
  "invalid_image_url",
  "model_not_found",
  "model_not_available",
  "upstream_model_busy",
  "upstream_timeout",
  "upstream_error",
  "request_body_too_large",
  "too_many_requests",
  "too_many_concurrent_requests",
  "gateway_overloaded",
  "batch_cancelled",
] as const;

export type CustomerDocErrorCode = (typeof CUSTOMER_DOC_ERROR_CODES)[number];

/** Typical HTTP status returned with each error.code (batch_cancelled is item-level). */
export const CUSTOMER_ERROR_CODE_HTTP: Record<CustomerDocErrorCode, string> = {
  missing_token: "401",
  invalid_token: "401",
  insufficient_credits: "402",
  invalid_request_error: "400",
  invalid_prompt: "400",
  invalid_image_url: "400",
  model_not_found: "404",
  model_not_available: "503",
  upstream_model_busy: "503",
  upstream_timeout: "504",
  upstream_error: "502",
  request_body_too_large: "413",
  too_many_requests: "429",
  too_many_concurrent_requests: "429",
  gateway_overloaded: "503",
  batch_cancelled: "—",
};

export const CUSTOMER_ERROR_RESPONSE_EXAMPLES: {
  id: string;
  code: CustomerDocErrorCode;
  labelKey: string;
  body: string;
}[] = [
  {
    id: "missing-token",
    code: "missing_token",
    labelKey: "integration.errorExampleMissingToken",
    body: JSON.stringify(
      {
        error: {
          message: "Missing Bearer token.",
          code: "missing_token",
          type: "auth_error",
        },
      },
      null,
      2
    ),
  },
  {
    id: "invalid-token",
    code: "invalid_token",
    labelKey: "integration.errorExampleInvalidToken",
    body: JSON.stringify(
      {
        error: {
          message: "API key not recognised.",
          code: "invalid_token",
          type: "auth_error",
        },
      },
      null,
      2
    ),
  },
  {
    id: "insufficient-credits",
    code: "insufficient_credits",
    labelKey: "integration.errorExampleInsufficientCredits",
    body: JSON.stringify(
      {
        error: {
          message: "Insufficient credits.",
          code: "insufficient_credits",
          type: "billing_error",
        },
      },
      null,
      2
    ),
  },
  {
    id: "upstream-model-busy",
    code: "upstream_model_busy",
    labelKey: "integration.errorExampleUpstreamBusy",
    body: JSON.stringify(
      {
        error: {
          message: "Upstream model is busy.",
          code: "upstream_model_busy",
          type: "upstream_error",
        },
        request_id: "req_example_upstream_busy",
      },
      null,
      2
    ),
  },
];

/** @deprecated Use CUSTOMER_DOC_ERROR_CODES — kept for legacy imports. */
export const CUSTOMER_INTEGRATION_ERROR_CODES = CUSTOMER_DOC_ERROR_CODES;

export type CustomerIntegrationErrorCode = CustomerDocErrorCode;
