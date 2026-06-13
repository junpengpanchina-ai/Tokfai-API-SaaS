/** Error codes eligible for one batch-item retry (see TOKFAI_BATCH_ITEM_MAX_RETRIES). */
export const RETRYABLE_BATCH_ERROR_CODES = new Set([
  "upstream_timeout",
  "upstream_model_busy",
  "gateway_overloaded",
]);

export const BATCH_ITEM_TIMEOUT_CODE = "batch_item_timeout";
export const BATCH_CANCELLED_BY_TIMEOUT_CODE = "cancelled_by_timeout";
export const BATCH_CANCELLED_CODE = "batch_cancelled";
