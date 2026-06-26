/** Client-safe dashboard overview types — no server or display-helper imports. */

export interface DashboardOverviewActivity {
  id: string;
  created_at: string;
  model: string | null;
  status: string | null;
  total_tokens: number | null;
  credits_charged: number | null;
}

export interface DashboardOverviewData {
  creditsBalance: number;
  activeApiKeyCount: number;
  requestsLast7Days: number;
  creditsConsumedLast7Days: number;
  hasActiveApiKey: boolean;
  hasChatPlaygroundSuccess: boolean;
  hasImagePlaygroundSuccess: boolean;
  recentActivity: DashboardOverviewActivity[];
  profileMissing: boolean;
}
