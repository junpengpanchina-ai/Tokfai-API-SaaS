/**
 * Tokfai compute-credit unit (算力积分).
 *
 * Billing DB fields remain named `credits_*`; customer-facing Chinese copy uses
 * 「算力积分」. Canonical retail conversion: ¥1 = 10,000 compute credits.
 */

export const CREDITS_PER_YUAN = 10_000;
export const YUAN_PER_CREDIT = 1 / CREDITS_PER_YUAN;

/** Convert compute credits → CNY at the retail base rate. */
export function creditsToYuan(credits: number): number {
  if (!Number.isFinite(credits)) return 0;
  return credits * YUAN_PER_CREDIT;
}

/** Convert CNY → compute credits at the retail base rate. */
export function yuanToCredits(yuan: number): number {
  if (!Number.isFinite(yuan)) return 0;
  return yuan * CREDITS_PER_YUAN;
}

/**
 * If a stored rate looks like a fractional CNY price (&lt; 1), convert to
 * compute credits. Integer gateway-scale rates (tens–tens of thousands) pass
 * through unchanged — e.g. gemini-2.5-flash input 45, nano-banana 1400.
 */
export function normalizeCreditsAmount(
  value: number | null | undefined
): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value <= 0) return value;
  if (value > 0 && value < 1) {
    return value * CREDITS_PER_YUAN;
  }
  return value;
}

export function formatYuanAmount(yuan: number): string {
  if (!Number.isFinite(yuan) || yuan <= 0) return "0";
  if (yuan >= 100) return yuan.toFixed(0);
  if (yuan >= 10) return yuan.toFixed(1);
  if (yuan >= 1) return yuan.toFixed(2);
  if (yuan >= 0.1) return yuan.toFixed(2);
  return yuan.toFixed(2);
}

/** e.g. `约 ¥0.57` / `~¥0.57` from compute credits. */
export function formatApproxYuanFromCredits(
  credits: number,
  locale: "en" | "zh" = "zh"
): string {
  if (!Number.isFinite(credits) || credits <= 0) return "—";
  const yuan = creditsToYuan(credits);
  const amount = formatYuanAmount(yuan);
  return locale === "zh" ? `约 ¥${amount}` : `~¥${amount}`;
}

export function formatCreditsWithYuan(
  credits: number,
  locale: "en" | "zh",
  unitZh: string,
  unitEn: string
): string {
  const amount = credits.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
  const yuan = formatApproxYuanFromCredits(credits, locale);
  if (locale === "zh") {
    return `${amount} ${unitZh}（${yuan}）`;
  }
  return `${amount} ${unitEn} (${yuan})`;
}
