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
}

export type UsagePageState =
  | { status: "ready"; stats: UsagePageStats; logs: UsagePageLog[] }
  | { status: "error" };
