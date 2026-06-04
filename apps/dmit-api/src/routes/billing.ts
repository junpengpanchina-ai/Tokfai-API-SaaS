import { Hono, type Context } from "hono";
import Stripe from "stripe";

import { ApiError } from "../errors.js";
import { requireSupabaseJwt } from "../middleware/supabaseJwt.js";
import {
  listBillingRechargePlans,
  loadCheckoutRechargePlan,
  type AdminRechargePlanListItem,
} from "./adminRechargePlans.js";
import { supabase } from "../supabase.js";
import type { AuthedUser } from "../types.js";

const FORBIDDEN_CHECKOUT_FIELDS = [
  "amount",
  "amount_cents",
  "amount_cny",
  "credits",
  "bonus_credits",
  "total_credits",
  "stripe_price_id",
  "currency",
] as const;

let _billingStripe: Stripe | null = null;

function authedUser(c: { get: (key: never) => unknown }): AuthedUser {
  return c.get("user" as never) as AuthedUser;
}

const csv = (raw: string) =>
  raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

function allowedRedirectOrigins(): string[] {
  return csv(
    process.env.BILLING_ALLOWED_REDIRECT_ORIGINS ??
      "https://tokfai.com,http://localhost:3000"
  );
}

function billingStripe(): Stripe {
  if (_billingStripe) return _billingStripe;

  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) {
    throw ApiError.internal(
      "STRIPE_SECRET_KEY is not configured for billing checkout.",
      "stripe_not_configured"
    );
  }

  _billingStripe = new Stripe(secretKey, {
    apiVersion: "2025-02-24.acacia",
    typescript: true,
    maxNetworkRetries: 2,
    appInfo: {
      name: "tokfai-dmit-api",
      version: "0.1.0",
    },
  });
  return _billingStripe;
}

function assertNoClientPricingFields(body: Record<string, unknown>): void {
  for (const field of FORBIDDEN_CHECKOUT_FIELDS) {
    if (body[field] !== undefined) {
      throw ApiError.badRequest(
        `Field "${field}" is not accepted. Send plan_id only.`,
        "forbidden_checkout_field"
      );
    }
  }
}

function parsePlanId(body: unknown): string {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw ApiError.badRequest("Request body must be a JSON object.", "invalid_body");
  }

  const bodyObj = body as Record<string, unknown>;
  assertNoClientPricingFields(bodyObj);

  const rawPlanId = bodyObj.plan_id ?? bodyObj.package_code;
  if (typeof rawPlanId !== "string" || !rawPlanId.trim()) {
    throw ApiError.badRequest("plan_id is required.", "missing_plan_id");
  }

  return rawPlanId.trim();
}

function allowedRedirectUrl(raw: unknown, fallbackPath: string): string {
  if (raw !== undefined && typeof raw !== "string") {
    throw ApiError.badRequest("Redirect URL must be a string.", "invalid_redirect_url");
  }

  const origins = allowedRedirectOrigins();
  const fallbackOrigin = origins[0] ?? "https://tokfai.com";
  const value = raw?.trim() || `${fallbackOrigin}${fallbackPath}`;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw ApiError.badRequest("Redirect URL must be absolute.", "invalid_redirect_url");
  }

  if (!origins.includes(url.origin)) {
    throw ApiError.badRequest(
      "Redirect URL origin is not allowed.",
      "redirect_origin_not_allowed"
    );
  }

  return url.toString();
}

function assertCheckoutPlanAvailable(
  planId: string,
  plan: AdminRechargePlanListItem | null
): AdminRechargePlanListItem {
  if (!plan) {
    throw ApiError.notFound("Recharge plan not found.", "recharge_plan_not_found");
  }
  if (!plan.visible) {
    throw ApiError.badRequest(
      `The ${planId} plan is not visible for checkout.`,
      "plan_not_visible"
    );
  }
  if (!plan.enabled) {
    throw ApiError.badRequest(
      `The ${planId} plan is not available for purchase yet.`,
      "plan_not_available"
    );
  }
  if (plan.amount_cents <= 0 || plan.credits <= 0) {
    throw ApiError.badRequest(
      `The ${planId} plan has invalid pricing configuration.`,
      "invalid_plan_pricing"
    );
  }
  return plan;
}

const STRIPE_PRICE_ENV_BY_PLAN: Record<string, string> = {
  starter: "STRIPE_PRICE_STARTER",
  pro: "STRIPE_PRICE_PRO",
  business: "STRIPE_PRICE_BUSINESS",
};

function resolveStripePriceId(plan: AdminRechargePlanListItem): string | null {
  const fromDb = plan.stripe_price_id?.trim();
  if (fromDb) return fromDb;

  const envKey = STRIPE_PRICE_ENV_BY_PLAN[plan.id];
  if (!envKey) return null;

  const fromEnv = process.env[envKey]?.trim();
  if (fromEnv && /^price_[A-Za-z0-9]+$/.test(fromEnv)) {
    return fromEnv;
  }
  return null;
}

function buildCheckoutLineItem(
  plan: AdminRechargePlanListItem
): Stripe.Checkout.SessionCreateParams.LineItem {
  const stripePriceId = resolveStripePriceId(plan);
  if (stripePriceId) {
    return {
      quantity: 1,
      price: stripePriceId,
    };
  }

  return {
    quantity: 1,
    price_data: {
      currency: plan.currency,
      unit_amount: plan.amount_cents,
      product_data: {
        name: `Tokfai ${plan.name} Credits`,
        description: `${plan.credits} Tokfai credits`,
      },
    },
  };
}

function buildCreditOrderInsert(args: {
  userId: string;
  email: string | null;
  plan: AdminRechargePlanListItem;
}): Record<string, unknown> {
  const amountCny = Math.max(1, Math.round(args.plan.amount_cents / 100));

  return {
    user_id: args.userId,
    email: args.email,
    plan_id: args.plan.id,
    package_code: args.plan.id,
    status: "pending",
    currency: args.plan.currency,
    amount_cny: amountCny,
    amount_cents: args.plan.amount_cents,
    credits: args.plan.credits,
  };
}

function buildCheckoutMetadata(args: {
  orderId: string;
  userId: string;
  plan: AdminRechargePlanListItem;
}): Record<string, string> {
  return {
    credit_order_id: args.orderId,
    user_id: args.userId,
    tokfai_user_id: args.userId,
    plan_id: args.plan.id,
    package_code: args.plan.id,
    credits: String(args.plan.credits),
    base_credits: String(args.plan.base_credits),
    bonus_credits: String(args.plan.bonus_credits),
  };
}

async function listBillingPlans(c: Context) {
  const plans = await listBillingRechargePlans();
  return c.json({ data: plans });
}

async function createCheckoutSession(c: Context) {
  const user = authedUser(c);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw ApiError.badRequest("Invalid JSON body.", "invalid_json");
  }

  const bodyObj = body as Record<string, unknown>;
  const planId = parsePlanId(body);
  const plan = assertCheckoutPlanAvailable(
    planId,
    await loadCheckoutRechargePlan(planId)
  );

  const successUrl = allowedRedirectUrl(
    bodyObj.success_url,
    "/dashboard/credits?status=success&session_id={CHECKOUT_SESSION_ID}"
  );
  const cancelUrl = allowedRedirectUrl(
    bodyObj.cancel_url,
    "/dashboard/credits?status=cancelled"
  );

  const sb = supabase();
  const stripe = billingStripe();

  const { data: profile, error: profileError } = await sb
    .from("profiles")
    .select("id, email, stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    throw ApiError.internal(
      `Failed to load billing profile: ${profileError.message}`,
      "billing_profile_load_failed"
    );
  }
  if (!profile) {
    throw ApiError.notFound("Profile not found.", "profile_not_found");
  }

  let stripeCustomerId = (profile as { stripe_customer_id?: string | null })
    .stripe_customer_id;
  if (!stripeCustomerId) {
    let customer: Stripe.Customer;
    try {
      customer = await stripe.customers.create({
        email: user.email ?? (profile as { email?: string | null }).email ?? undefined,
        metadata: {
          tokfai_user_id: user.id,
        },
      });
    } catch (err) {
      throw stripeCheckoutError(err, "stripe_customer_create_failed");
    }
    stripeCustomerId = customer.id;

    const { error: updateError } = await sb
      .from("profiles")
      .update({
        stripe_customer_id: stripeCustomerId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id);

    if (updateError) {
      throw ApiError.internal(
        `Failed to save Stripe customer id: ${updateError.message}`,
        "billing_customer_save_failed"
      );
    }
  }

  const profileEmail =
    user.email ?? (profile as { email?: string | null }).email ?? null;

  const { data: order, error: orderError } = await sb
    .from("credit_orders")
    .insert(
      buildCreditOrderInsert({
        userId: user.id,
        email: profileEmail,
        plan,
      })
    )
    .select("id")
    .single();

  if (orderError || !order) {
    throw ApiError.internal(
      `Failed to create credit order: ${orderError?.message ?? "missing order"}`,
      "credit_order_create_failed"
    );
  }

  const orderId = (order as { id: string }).id;
  const metadata = buildCheckoutMetadata({
    orderId,
    userId: user.id,
    plan,
  });

  let session: Stripe.Checkout.Session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: stripeCustomerId,
      client_reference_id: user.id,
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [buildCheckoutLineItem(plan)],
      metadata,
      payment_intent_data: {
        metadata,
      },
    });
  } catch (err) {
    throw stripeCheckoutError(err, "stripe_checkout_create_failed");
  }

  if (!session.url) {
    throw ApiError.internal("Stripe Checkout did not return a URL.", "checkout_url_missing");
  }

  const { error: updateOrderError } = await sb
    .from("credit_orders")
    .update({
      stripe_checkout_session_id: session.id,
    })
    .eq("id", orderId);

  if (updateOrderError) {
    throw ApiError.internal(
      `Failed to save checkout session id: ${updateOrderError.message}`,
      "checkout_session_save_failed"
    );
  }

  return c.json({
    url: session.url,
    session_id: session.id,
    order_id: orderId,
    plan_id: plan.id,
    amount_cents: plan.amount_cents,
    credits: plan.credits,
  });
}

function stripeCheckoutError(err: unknown, code: string): ApiError {
  if (err instanceof ApiError) {
    return err;
  }

  if (err instanceof Stripe.errors.StripeError) {
    return ApiError.internal(`Stripe checkout failed: ${err.message}`, code);
  }

  return ApiError.internal(
    `Unhandled billing checkout error: ${
      err instanceof Error ? err.message : String(err)
    }`,
    "billing_checkout_failed"
  );
}

/**
 * Dashboard-initiated billing actions. Auth is the user's Supabase JWT.
 */
export const billingRoutes = new Hono();

billingRoutes.use("/billing/*", requireSupabaseJwt);
billingRoutes.use("/v1/billing/*", requireSupabaseJwt);

billingRoutes.get("/v1/billing/plans", listBillingPlans);
billingRoutes.post("/v1/billing/checkout", createCheckoutSession);
billingRoutes.post("/billing/create-checkout-session", createCheckoutSession);
