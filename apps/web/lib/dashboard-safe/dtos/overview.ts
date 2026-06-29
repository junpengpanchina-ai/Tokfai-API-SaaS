/** Plain JSON DTOs for /dashboard overview client islands. */

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
