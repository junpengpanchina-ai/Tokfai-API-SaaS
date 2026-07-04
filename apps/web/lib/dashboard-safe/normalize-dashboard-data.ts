/** Client-safe fail-open normalizers for dashboard DTOs. */

import type {
  AnnouncementType,
  PublicAnnouncement,
} from "./dtos/announcements";
import type {
  DashboardOverviewActivity,
  DashboardOverviewData,
} from "./dtos/overview";
import { EMPTY_DASHBOARD_OVERVIEW as EMPTY_OVERVIEW } from "./dtos/overview";
import type { CreditsPageData } from "./dtos/credits";
import type { UsagePageLog, UsagePageState } from "./dtos/usage";
import type { DashboardShellCredits } from "./shell-credits";
import { EMPTY_SHELL_CREDITS } from "./shell-credits";

const EMPTY_USAGE_PAGE_STATE: UsagePageState = { status: "error" };

const EMPTY_CREDITS_PAGE_DATA: CreditsPageData = {
  balance: {
    balance: 0,
    balanceFromProfile: false,
    lastChangeAt: null,
    todayConsumed: 0,
    last7DaysConsumed: 0,
    showNoLedgerHint: false,
  },
  ledger: [],
  orders: [],
  error: "temporary",
};

export function safeDashboardNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function safeDashboardString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function safeDashboardBoolean(value: unknown): boolean {
  return value === true;
}

const ANNOUNCEMENT_TYPES = new Set<AnnouncementType>([
  "notice",
  "maintenance",
  "billing",
  "model",
  "promotion",
  "docs",
]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizeDashboardOverviewActivity(
  raw: unknown,
  index: number
): DashboardOverviewActivity {
  const row = asRecord(raw);
  const totalTokens = Number(row.total_tokens);
  const creditsCharged = Number(row.credits_charged);

  return {
    id: safeDashboardString(row.id) || `activity-${index}`,
    created_at: safeDashboardString(row.created_at),
    model:
      typeof row.model === "string"
        ? row.model
        : row.model == null
          ? null
          : safeDashboardString(row.model) || null,
    status:
      typeof row.status === "string"
        ? row.status
        : row.status == null
          ? null
          : safeDashboardString(row.status) || null,
    total_tokens: Number.isFinite(totalTokens) ? totalTokens : null,
    credits_charged: Number.isFinite(creditsCharged) ? creditsCharged : null,
  };
}

export function normalizeDashboardOverview(
  overview: DashboardOverviewData | null | undefined
): DashboardOverviewData {
  if (!overview || typeof overview !== "object") {
    return { ...EMPTY_OVERVIEW };
  }

  const recentActivity = (Array.isArray(overview.recentActivity)
    ? overview.recentActivity
    : []
  ).map(normalizeDashboardOverviewActivity);

  return {
    creditsBalance: safeDashboardNumber(overview.creditsBalance),
    activeApiKeyCount: safeDashboardNumber(overview.activeApiKeyCount),
    requestsLast7Days: safeDashboardNumber(overview.requestsLast7Days),
    creditsConsumedLast7Days: safeDashboardNumber(
      overview.creditsConsumedLast7Days
    ),
    hasActiveApiKey: safeDashboardBoolean(overview.hasActiveApiKey),
    hasChatPlaygroundSuccess: safeDashboardBoolean(
      overview.hasChatPlaygroundSuccess
    ),
    hasImagePlaygroundSuccess: safeDashboardBoolean(
      overview.hasImagePlaygroundSuccess
    ),
    recentActivity,
    profileMissing: overview.profileMissing !== false,
  };
}

export function normalizePublicAnnouncements(
  announcements: unknown
): PublicAnnouncement[] {
  if (!Array.isArray(announcements)) {
    return [];
  }

  return announcements.map((raw, index) => {
    const item = asRecord(raw);
    const typeRaw = safeDashboardString(item.type);
    const type: AnnouncementType = ANNOUNCEMENT_TYPES.has(
      typeRaw as AnnouncementType
    )
      ? (typeRaw as AnnouncementType)
      : "notice";

    return {
      id: safeDashboardString(item.id) || `announcement-${index}`,
      title: safeDashboardString(item.title) || "—",
      slug: typeof item.slug === "string" ? item.slug : null,
      summary: typeof item.summary === "string" ? item.summary : null,
      content: safeDashboardString(item.content),
      type,
      priority: safeDashboardNumber(item.priority),
      pinned: item.pinned === true,
      created_at: safeDashboardString(item.created_at),
      updated_at: safeDashboardString(item.updated_at),
    };
  });
}

export function normalizeShellCredits(
  credits: DashboardShellCredits | null | undefined
): DashboardShellCredits {
  if (!credits || typeof credits !== "object") {
    return { ...EMPTY_SHELL_CREDITS };
  }

  const balanceRaw = credits.balance;
  const balance =
    balanceRaw == null
      ? null
      : Number.isFinite(Number(balanceRaw))
        ? Number(balanceRaw)
        : null;

  return {
    loaded: credits.loaded === true,
    balance,
  };
}

export function normalizeUsagePageState(
  state: UsagePageState | null | undefined
): UsagePageState {
  if (!state || typeof state !== "object") {
    return EMPTY_USAGE_PAGE_STATE;
  }

  if (state.status !== "ready") {
    return EMPTY_USAGE_PAGE_STATE;
  }

  const statsRaw = asRecord(state.stats);

  return {
    status: "ready",
    stats: {
      requestsLast24Hours: safeDashboardNumber(statsRaw.requestsLast24Hours),
      requestsLast7Days: safeDashboardNumber(statsRaw.requestsLast7Days),
      tokensLast7Days: safeDashboardNumber(statsRaw.tokensLast7Days),
      creditsLast7Days: safeDashboardNumber(statsRaw.creditsLast7Days),
    },
    logs: (Array.isArray(state.logs) ? state.logs : []).map((raw, index) =>
      normalizeUsagePageLog(raw, index)
    ),
  };
}

function normalizeUsagePageLog(raw: unknown, index: number): UsagePageLog {
  const row = asRecord(raw);
  const promptTokens = Number(row.prompt_tokens);
  const completionTokens = Number(row.completion_tokens);
  const totalTokens = Number(row.total_tokens);
  const creditsCharged = Number(row.credits_charged);

  return {
    id: safeDashboardString(row.id) || `usage-log-${index}`,
    created_at: safeDashboardString(row.created_at),
    model:
      typeof row.model === "string"
        ? row.model
        : row.model == null
          ? null
          : safeDashboardString(row.model) || null,
    status: safeDashboardString(row.status),
    prompt_tokens: Number.isFinite(promptTokens) ? promptTokens : null,
    completion_tokens: Number.isFinite(completionTokens)
      ? completionTokens
      : null,
    total_tokens: Number.isFinite(totalTokens) ? totalTokens : null,
    credits_charged: Number.isFinite(creditsCharged) ? creditsCharged : null,
    request_id:
      typeof row.request_id === "string"
        ? row.request_id
        : row.request_id == null
          ? null
          : safeDashboardString(row.request_id) || null,
    error_code:
      typeof row.error_code === "string"
        ? row.error_code
        : row.error_code == null
          ? null
          : safeDashboardString(row.error_code) || null,
  };
}

export function normalizeCreditsPageData(
  data: CreditsPageData | null | undefined
): CreditsPageData {
  if (!data || typeof data !== "object") {
    return { ...EMPTY_CREDITS_PAGE_DATA };
  }

  const balanceRaw = asRecord(data.balance);

  return {
    balance: {
      balance: safeDashboardNumber(balanceRaw.balance),
      balanceFromProfile: balanceRaw.balanceFromProfile === true,
      lastChangeAt:
        typeof balanceRaw.lastChangeAt === "string"
          ? balanceRaw.lastChangeAt
          : null,
      todayConsumed: safeDashboardNumber(balanceRaw.todayConsumed),
      last7DaysConsumed: safeDashboardNumber(balanceRaw.last7DaysConsumed),
      showNoLedgerHint: balanceRaw.showNoLedgerHint === true,
    },
    ledger: Array.isArray(data.ledger) ? data.ledger : [],
    orders: Array.isArray(data.orders) ? data.orders : [],
    error:
      data.error === "auth" || data.error === "temporary" ? data.error : null,
  };
}
