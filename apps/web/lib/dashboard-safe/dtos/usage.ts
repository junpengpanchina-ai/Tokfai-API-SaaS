/** Plain JSON DTOs for /dashboard/usage client islands. */

export interface UsagePageStats {
  requestsLast24Hours: number;
  requestsLast7Days: number;
  tokensLast7Days: number;
  creditsLast7Days: number;
}

export interface UsagePageLog {
  id: string;
  created_at: string;
  model: string | null;
  status: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  credits_charged: number | null;
  request_id: string | null;
  error_code: string | null;
  /** P983 — charged | not_billable | … */
  billing_status: string | null;
  /**
   * P1084 — client inbound path from usage_logs.endpoint
   * (e.g. /v1/responses). Null on legacy rows.
   */
  endpoint: string | null;
  /** P1084 — preferred display alias of endpoint when present. */
  client_route: string | null;
  /** P1084 — upstream forward path when auditable / differs. */
  upstream_route: string | null;
  /** P1084 — responses | chat_completions | images | other */
  wire_api: string | null;
  /** P1084 — responses | chat_compat */
  billing_token_schema: string | null;
}

export type UsagePageState =
  | { status: "ready"; stats: UsagePageStats; logs: UsagePageLog[] }
  | { status: "error" };
