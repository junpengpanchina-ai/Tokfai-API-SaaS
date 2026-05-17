/**
 * Small formatting helpers reused across dashboard pages. No date libs.
 */

const USD_2DP = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const USD_PRECISE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 6,
});

const INTEGER = new Intl.NumberFormat("en-US");
const CREDITS = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
});

/** $X.XX with cents — for balances and large totals. */
export function formatUsd(value: number | null | undefined): string {
  return USD_2DP.format(value ?? 0);
}

/** $0.000123 — for per-request charges. */
export function formatCreditsPrecise(
  value: number | null | undefined
): string {
  return USD_PRECISE.format(value ?? 0);
}

export function formatInt(value: number | null | undefined): string {
  return INTEGER.format(value ?? 0);
}

export function formatCredits(value: number | null | undefined): string {
  return `${CREDITS.format(value ?? 0)} credits`;
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SUCCESS_STATUSES = new Set(["succeeded", "success", "ok"]);
const PENDING_STATUSES = new Set(["pending", "in_progress", "queued"]);

export type SemanticTone = "success" | "destructive" | "warning" | "muted";

export function toneForStatus(
  status: string | null | undefined
): SemanticTone {
  if (!status) return "muted";
  const s = status.toLowerCase();
  if (SUCCESS_STATUSES.has(s)) return "success";
  if (PENDING_STATUSES.has(s)) return "warning";
  return "destructive";
}
