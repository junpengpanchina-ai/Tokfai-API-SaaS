/** Plain JSON DTOs for /dashboard overview client islands. */

export interface DashboardOverviewActivity {
  id: string;
  created_at: string;
  model: string | null;
  status: string | null;
  total_tokens: number | null;
  credits_charged: number | null;
  request_id: string | null;
  kind: "chat" | "image";
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

export const EMPTY_DASHBOARD_OVERVIEW: DashboardOverviewData = {
  creditsBalance: 0,
  activeApiKeyCount: 0,
  requestsLast7Days: 0,
  creditsConsumedLast7Days: 0,
  hasActiveApiKey: false,
  hasChatPlaygroundSuccess: false,
  hasImagePlaygroundSuccess: false,
  recentActivity: [],
  profileMissing: true,
};
