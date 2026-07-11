import { loginPathWithNext } from "@/lib/auth/login-redirect";
import {
  listBillingRechargePlans,
  type BillingRechargePlan,
} from "@/lib/dmit/server";

export type { BillingRechargePlan };

/**
 * Matches production recharge_plans when DMIT is unreachable.
 * Retail rule: ¥1 = 10,000 算力积分 (compute credits).
 */
export const FALLBACK_RECHARGE_PLANS: BillingRechargePlan[] = [
  {
    plan_id: "credit_10",
    name: "¥10",
    amount_cents: 1000,
    currency: "cny",
    base_credits: 100_000,
    bonus_credits: 0,
    credits: 100_000,
    enabled: true,
    visible: true,
    sort_order: 100,
    badge: null,
    description: "¥10 → 100,000 compute credits",
  },
  {
    plan_id: "credit_20",
    name: "¥20",
    amount_cents: 2000,
    currency: "cny",
    base_credits: 200_000,
    bonus_credits: 20_000,
    credits: 220_000,
    enabled: true,
    visible: true,
    sort_order: 200,
    badge: "Popular",
    description: "¥20 → 220,000 compute credits (+10%)",
  },
  {
    plan_id: "credit_49",
    name: "¥49",
    amount_cents: 4900,
    currency: "cny",
    base_credits: 490_000,
    bonus_credits: 73_500,
    credits: 563_500,
    enabled: true,
    visible: true,
    sort_order: 300,
    badge: null,
    description: "¥49 → 563,500 compute credits (+15%)",
  },
  {
    plan_id: "credit_99",
    name: "¥99",
    amount_cents: 9900,
    currency: "cny",
    base_credits: 990_000,
    bonus_credits: 198_000,
    credits: 1_188_000,
    enabled: true,
    visible: true,
    sort_order: 400,
    badge: null,
    description: "¥99 → 1,188,000 compute credits (+20%)",
  },
  {
    plan_id: "credit_499",
    name: "¥499",
    amount_cents: 49_900,
    currency: "cny",
    base_credits: 4_990_000,
    bonus_credits: 998_000,
    credits: 5_988_000,
    enabled: true,
    visible: true,
    sort_order: 500,
    badge: null,
    description: "¥499 → 5,988,000 compute credits (+20%)",
  },
  {
    plan_id: "credit_999",
    name: "¥999",
    amount_cents: 99_900,
    currency: "cny",
    base_credits: 9_990_000,
    bonus_credits: 1_998_000,
    credits: 11_988_000,
    enabled: true,
    visible: true,
    sort_order: 600,
    badge: null,
    description: "¥999 → 11,988,000 compute credits (+20%)",
  },
];

export type PricingPlansLoadResult = {
  plans: BillingRechargePlan[];
  source: "api" | "fallback";
  /** True when an authenticated DMIT fetch failed — disable purchase CTAs. */
  purchaseDisabled: boolean;
};

export function filterVisibleRechargePlans(
  plans: BillingRechargePlan[]
): BillingRechargePlan[] {
  return plans
    .filter((plan) => plan.enabled && plan.visible)
    .sort(
      (a, b) =>
        a.sort_order - b.sort_order || a.plan_id.localeCompare(b.plan_id)
    );
}

export { formatCny, formatPlanCredits } from "./money-format";

/** Post-login / CTA target for buying credits — plan selection lives on /pricing. */
export function creditsPurchaseHref(isLoggedIn: boolean): string {
  return isLoggedIn ? "/pricing" : loginPathWithNext("/pricing");
}

/**
 * Load visible recharge plans for the public pricing page.
 * Uses public DMIT GET /v1/billing/plans (no auth).
 */
export async function fetchBillingPlansForPricing(): Promise<PricingPlansLoadResult> {
  try {
    const plans = await listBillingRechargePlans();
    return {
      plans: filterVisibleRechargePlans(plans),
      source: "api",
      purchaseDisabled: false,
    };
  } catch {
    return {
      plans: filterVisibleRechargePlans(FALLBACK_RECHARGE_PLANS),
      source: "fallback",
      purchaseDisabled: false,
    };
  }
}
