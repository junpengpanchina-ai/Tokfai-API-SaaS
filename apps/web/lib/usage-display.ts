import { formatInt, type SemanticTone } from "@/lib/format";
import { isAvailableImageModel } from "@/lib/model-catalog";
import {
  formatCreditsWithSuffix,
  formatTokens,
  safeNumber,
} from "@/lib/usage-safe-display";

export interface UsageLogDisplayRow {
  status: string | null;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  credits_charged: number | string | null;
}

export type UsageKind = "chat" | "image";

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

export function usageStatusLabel(
  status: string | null | undefined,
  t: (key: string) => string
): string {
  if (!status || status.trim() === "") {
    return "unknown";
  }
  const tone = usageStatusTone(status);
  if (tone === "success") {
    return t("dashboard.usage.statusSucceeded");
  }
  if (tone === "muted") {
    return t("dashboard.usage.statusPending");
  }
  return t("dashboard.usage.statusFailed");
}

export function usageStatusTone(
  status: string | null | undefined
): SemanticTone {
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

export function resolveUsageRoute(
  model: string | null | undefined
): string {
  if (model && isAvailableImageModel(model)) {
    return "/v1/images/generations";
  }
  return "/v1/chat/completions";
}

export function getUsageKind(
  model: string | null | undefined
): UsageKind {
  if (model && isAvailableImageModel(model)) {
    return "image";
  }
  return "chat";
}

export function usageKindLabel(kind: UsageKind): string {
  return kind === "image" ? "Image" : "Chat";
}

export function formatUsageCredits(
  row: UsageLogDisplayRow,
  _kind: UsageKind
): string {
  const n = safeNumber(row.credits_charged);
  if (n == null) return "—";
  return formatCreditsWithSuffix(n);
}

export function formatUsageTokenCell(
  kind: UsageKind,
  value: number | null | undefined,
  field: "prompt" | "completion" | "total"
): string {
  if (kind === "image") {
    if (field === "total") return "image generation";
    return "—";
  }

  return formatTokens(value);
}
