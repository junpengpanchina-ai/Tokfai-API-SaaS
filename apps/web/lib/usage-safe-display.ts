/**
 * Null-safe Usage / Credits display helpers.
 * Pure module — no React, no model-catalog, no circular imports.
 */

import { formatInt, type SemanticTone } from "@/lib/format";

const CREDITS_DECIMAL = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
});

/** Image model ids seen in usage logs (subset of catalog — no catalog import). */
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

export interface UsageLogDisplayRow {
  status: string | null;
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  credits_charged: number | string | null;
}

export type UsageKind = "chat" | "image";

export function safeText(
  value: string | null | undefined,
  fallback = "—"
): string {
  if (value == null) return fallback;
  const trimmed = String(value).trim();
  return trimmed === "" ? fallback : trimmed;
}

export function safeNumber(
  value: number | string | null | undefined
): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function formatCreditsDecimal(
  value: number | string | null | undefined
): string {
  const n = safeNumber(value);
  if (n == null) return "—";
  return CREDITS_DECIMAL.format(n);
}

/** Decimal credits amount for table cells (no suffix). */
export function formatCredits(
  value: number | string | null | undefined
): string {
  return formatCreditsDecimal(value);
}

/** Decimal credits with " credits" suffix for summaries. */
export function formatCreditsWithSuffix(
  value: number | string | null | undefined
): string {
  const amount = formatCreditsDecimal(value);
  return amount === "—" ? "—" : `${amount} credits`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function shortRequestId(requestId: string | null | undefined): string {
  const id = safeText(requestId, "");
  if (!id) return "—";
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
}

export function getModelLabel(model: string | null | undefined): string {
  const raw = safeText(model, "");
  if (!raw) return "—";
  return raw;
}

export function formatTokens(value: number | null | undefined): string {
  if (value == null) return "—";
  return formatInt(value);
}

export function normalizeUsageStatus(
  status: string | null | undefined
): string {
  return safeText(status, "unknown");
}

export function isUsageImageModel(modelId: string): boolean {
  if (USAGE_IMAGE_MODEL_IDS.has(modelId)) return true;
  if (modelId.startsWith("nano-banana")) return true;
  if (modelId.startsWith("gpt-image")) return true;
  return false;
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

export function resolveUsageRoute(
  model: string | null | undefined
): string {
  if (model && isUsageImageModel(model)) {
    return "/v1/images/generations";
  }
  return "/v1/chat/completions";
}

export function getUsageKind(
  model: string | null | undefined
): UsageKind {
  if (model && isUsageImageModel(model)) {
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
