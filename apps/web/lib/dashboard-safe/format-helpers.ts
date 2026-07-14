/** Zero-dependency dashboard formatting — no React, i18n, catalog, or format.ts. */

type DashboardSemanticTone = "success" | "destructive" | "warning" | "muted";

const INTEGER = new Intl.NumberFormat("en-US");
const CREDITS_DECIMAL = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 6,
});

const SUCCESS_STATUSES = new Set(["succeeded", "success", "ok"]);
const PENDING_STATUSES = new Set(["pending", "unknown", "in_progress", "queued"]);
const ERROR_STATUSES = new Set([
  "failed",
  "error",
  "upstream_error",
  "rate_limited",
  "upstream_timeout",
]);

export function formatCreditsSafe(
  value: number | string | null | undefined
): string {
  if (value == null || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return CREDITS_DECIMAL.format(n);
}

const SSR_DATE_TIME_OPTS: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "UTC",
};

/** Deterministic UTC formatting — identical on server and client hydration. */
export function formatIsoDateTimeUtc(
  iso: string | null | undefined,
  invalidFallback?: string
): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    return invalidFallback ?? iso;
  }
  return d.toLocaleString("en-US", SSR_DATE_TIME_OPTS);
}

export function formatDateTimeSafe(iso: string | null | undefined): string {
  if (!iso) return "—";
  return formatIsoDateTimeUtc(iso, iso);
}

export function truncateRequestIdSafe(
  requestId: string | null | undefined
): string {
  const id = requestId?.trim() ?? "";
  if (!id) return "—";
  if (id.length <= 16) return id;
  return `${id.slice(0, 8)}...${id.slice(-6)}`;
}

export function getModelDisplayNameSafe(model: string | null | undefined): string {
  const raw = model?.trim() ?? "";
  return raw || "—";
}

export function getStatusToneSafe(
  status: string | null | undefined
): DashboardSemanticTone {
  if (!status || status.trim() === "") return "muted";
  const normalized = status.toLowerCase();
  if (SUCCESS_STATUSES.has(normalized)) return "success";
  if (PENDING_STATUSES.has(normalized)) return "muted";
  if (
    ERROR_STATUSES.has(normalized) ||
    normalized.includes("error") ||
    normalized.includes("fail") ||
    normalized.includes("timeout") ||
    normalized.includes("rate")
  ) {
    return "destructive";
  }
  return "destructive";
}

export function formatIntSafe(value: number | null | undefined): string {
  return INTEGER.format(value ?? 0);
}

export function formatCreditsWithSuffixSafe(
  value: number | string | null | undefined,
  locale: "en" | "zh" = "en"
): string {
  const amount = formatCreditsSafe(value);
  if (amount === "—") return "—";
  const unit = locale === "zh" ? "算力积分" : "compute credits";
  return `${amount} ${unit}`;
}
