import { loginPathWithNext } from "@/lib/auth/login-redirect";
import {
  listBillingRechargePlans,
  type BillingRechargePlan,
} from "@/lib/dmit/server";

export type { BillingRechargePlan };

/** Matches production recharge_plans when DMIT is unreachable or user is logged out. */
export const FALLBACK_RECHARGE_PLANS: BillingRechargePlan[] = [
  {
    plan_id: "starter",
    name: "Starter",
    amount_cents: 2990,
    currency: "cny",
    base_credits: 10_000,
    bonus_credits: 0,
    credits: 10_000,
    enabled: true,
    visible: true,
    sort_order: 100,
    badge: null,
    description: "For testing and personal use",
  },
  {
    plan_id: "pro",
    name: "Pro",
    amount_cents: 9990,
    currency: "cny",
    base_credits: 50_000,
    bonus_credits: 10_000,
    credits: 60_000,
    enabled: true,
    visible: true,
    sort_order: 200,
    badge: "Popular",
    description: "For builders and small apps",
  },
  {
    plan_id: "business",
    name: "Business",
    amount_cents: 29_900,
    currency: "cny",
    base_credits: 200_000,
    bonus_credits: 60_000,
    credits: 260_000,
    enabled: true,
    visible: true,
    sort_order: 300,
    badge: null,
    description: "For teams and higher usage",
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

export function creditsPurchaseHref(isLoggedIn: boolean): string {
  return isLoggedIn
    ? "/dashboard/credits"
    : loginPathWithNext("/dashboard/credits");
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
