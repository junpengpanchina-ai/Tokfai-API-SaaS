/**
 * Null-safe formatting for Usage / Credits dashboard tables.
 * Top-level function declarations only — safe for client bundles.
 */

import { DASHBOARD_CATALOG_MODELS } from "@/lib/model-catalog";
import { formatInt } from "@/lib/format";

const CREDITS_DECIMAL = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
});

const MODEL_DISPLAY_BY_ID = new Map(
  DASHBOARD_CATALOG_MODELS.map((entry) => [entry.id, entry.displayName])
);

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

/** Decimal credits amount for table cells (no suffix). */
export function formatCredits(
  value: number | string | null | undefined
): string {
  const n = safeNumber(value);
  if (n == null) return "—";
  return CREDITS_DECIMAL.format(n);
}

/** Decimal credits with " credits" suffix for summaries. */
export function formatCreditsWithSuffix(
  value: number | string | null | undefined
): string {
  const amount = formatCredits(value);
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
  return MODEL_DISPLAY_BY_ID.get(raw) ?? raw;
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
