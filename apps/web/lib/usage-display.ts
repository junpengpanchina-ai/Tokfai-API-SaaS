import {
  formatCreditsPrecise,
  formatInt,
  type SemanticTone,
} from "@/lib/format";
import { isAvailableImageModel } from "@/lib/model-catalog";

export interface UsageLogDisplayRow {
  status: string;
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
]);

export function usageStatusTone(
  status: string | null | undefined
): SemanticTone {
  if (!status) return "muted";
  const normalized = status.toLowerCase();
  if (USAGE_SUCCESS_STATUSES.has(normalized)) return "success";
  if (USAGE_PENDING_STATUSES.has(normalized)) return "muted";
  if (
    USAGE_ERROR_STATUSES.has(normalized) ||
    normalized.includes("error") ||
    normalized.includes("fail")
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
  kind: UsageKind
): string {
  if (usageStatusTone(row.status) !== "success") return "—";

  const value = row.credits_charged;
  if (value == null || value === "") return "—";

  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return "—";

  if (kind === "image") {
    return n === 1 ? "1 credit" : `${formatInt(n)} credits`;
  }

  return formatCreditsPrecise(n);
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

  if (value == null) return "—";
  return formatInt(value);
}
