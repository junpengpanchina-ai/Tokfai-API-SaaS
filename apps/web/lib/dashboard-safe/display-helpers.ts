/** Dashboard display helpers — dashboard-safe contract layer. */

import { formatIsoDateTimeUtc } from "./format-helpers";


type DashboardSemanticTone = "success" | "destructive" | "warning" | "muted";

const INTEGER = new Intl.NumberFormat("en-US");
/** Usage / ledger amounts — up to 6 decimal places, trim trailing zeros. */
const CREDITS_DECIMAL = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
});
/** Balance cards — up to 2 decimal places. */
const CREDITS_BALANCE = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

function creditsUnitForLocale(locale: "en" | "zh"): string {
  return locale === "zh" ? "算力积分" : "compute credits";
}

const USAGE_IMAGE_MODEL_IDS = new Set([
  "gpt-image-2",
  "gpt-image-2-vip",
  "nano-banana-fast",
  "nano-banana",
  "nano-banana-pro",
  "nano-banana-2",
  "nano-banana-pro-vt",
  "nano-banana-2-cl",
  "nano-banana-2-4k-cl",
  "nano-banana-pro-cl",
  "nano-banana-pro-vip",
  "nano-banana-pro-4k-vip",
]);

const USAGE_SUCCESS_STATUSES = new Set(["succeeded", "success", "ok"]);
const USAGE_PENDING_STATUSES = new Set([
  "pending",
  "unknown",
  "in_progress",
  "queued",
]);
const USAGE_ERROR_STATUSES = new Set([
  "failed",
  "error",
  "upstream_error",
  "rate_limited",
  "upstream_timeout",
]);

export interface DashboardUsageLogRow {
  status: string | null;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  credits_charged: number | string | null;
}

export type DashboardUsageKind = "chat" | "image";

export function dashboardSafeText(
  value: string | null | undefined,
  fallback = "—"
): string {
  if (value == null) return fallback;
  const trimmed = String(value).trim();
  return trimmed === "" ? fallback : trimmed;
}

export function dashboardSafeNumber(
  value: number | string | null | undefined
): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function dashboardFormatInt(value: number | null | undefined): string {
  return INTEGER.format(value ?? 0);
}

function dashboardFormatCreditsDecimal(
  value: number | string | null | undefined
): string {
  const n = dashboardSafeNumber(value);
  if (n == null) return "—";
  return CREDITS_DECIMAL.format(n);
}

/** Rounded credits for sidebar and shell UI (max 2 decimal places). */
export function dashboardFormatCreditBalanceDisplay(
  value: number | null | undefined
): string {
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value ?? 0);
}

export function dashboardFormatCny(amountCents: number): string {
  const yuan = amountCents / 100;
  const hasFraction = amountCents % 100 !== 0;
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: hasFraction ? 1 : 0,
    maximumFractionDigits: 2,
  }).format(yuan);
}

export function dashboardFormatDateTime(iso: string | null | undefined): string {
  return formatIsoDateTimeUtc(iso, iso ?? "—");
}

/** Balance / summary cards — max 2 decimal places + locale unit. */
export function dashboardFormatBalanceCredits(
  value: number | null | undefined,
  locale: "en" | "zh" = "en"
): string {
  const amount = CREDITS_BALANCE.format(value ?? 0);
  return `${amount} ${creditsUnitForLocale(locale)}`;
}

/** Usage / charged amounts — max 6 decimal places + locale unit. */
export function dashboardFormatCreditsWithSuffix(
  value: number | string | null | undefined,
  locale: "en" | "zh" = "en"
): string {
  const amount = dashboardFormatCreditsDecimal(value);
  if (amount === "—") return "—";
  return `${amount} ${creditsUnitForLocale(locale)}`;
}

export function dashboardFormatDate(iso: string | null | undefined): string {
  return formatIsoDateTimeUtc(iso);
}

export function dashboardShortRequestId(
  requestId: string | null | undefined
): string {
  const id = dashboardSafeText(requestId, "");
  if (!id) return "—";
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
}

export function dashboardGetModelLabel(model: string | null | undefined): string {
  const raw = dashboardSafeText(model, "");
  if (!raw) return "—";
  return raw;
}

export function dashboardFormatTokens(value: number | null | undefined): string {
  if (value == null) return "—";
  return dashboardFormatInt(value);
}

function dashboardIsUsageImageModel(modelId: string): boolean {
  if (USAGE_IMAGE_MODEL_IDS.has(modelId)) return true;
  if (modelId.startsWith("nano-banana")) return true;
  if (modelId.startsWith("gpt-image")) return true;
  return false;
}

export function dashboardUsageStatusTone(
  status: string | null | undefined
): DashboardSemanticTone {
  if (!status || status.trim() === "") return "muted";
  const normalized = status.toLowerCase();
  if (USAGE_SUCCESS_STATUSES.has(normalized)) return "success";
  if (USAGE_PENDING_STATUSES.has(normalized)) return "muted";
  if (
    USAGE_ERROR_STATUSES.has(normalized) ||
    normalized.includes("error") ||
    normalized.includes("fail") ||
    normalized.includes("timeout") ||
    normalized.includes("rate")
  ) {
    return "destructive";
  }
  return "destructive";
}

export function dashboardUsageStatusLabel(
  status: string | null | undefined,
  t: (key: string) => string
): string {
  if (!status || status.trim() === "") {
    return "unknown";
  }
  const tone = dashboardUsageStatusTone(status);
  if (tone === "success") {
    return t("dashboard.usage.statusSucceeded");
  }
  if (tone === "muted") {
    return t("dashboard.usage.statusPending");
  }
  return t("dashboard.usage.statusFailed");
}

export function dashboardResolveUsageRoute(
  model: string | null | undefined
): string {
  if (model && dashboardIsUsageImageModel(model)) {
    return "/v1/images/generations";
  }
  return "/v1/chat/completions";
}

export function dashboardGetUsageKind(
  model: string | null | undefined
): DashboardUsageKind {
  if (model && dashboardIsUsageImageModel(model)) {
    return "image";
  }
  return "chat";
}

export function dashboardFormatUsageCredits(
  row: DashboardUsageLogRow,
  _kind: DashboardUsageKind,
  locale: "en" | "zh" = "en"
): string {
  const n = dashboardSafeNumber(row.credits_charged);
  if (n == null) return "—";
  return dashboardFormatCreditsWithSuffix(n, locale);
}

export function dashboardFormatUsageTokenCell(
  kind: DashboardUsageKind,
  value: number | null | undefined,
  field: "prompt" | "completion" | "total"
): string {
  if (kind === "image") {
    if (field === "total") return "image generation";
    return "—";
  }
  return dashboardFormatTokens(value);
}
