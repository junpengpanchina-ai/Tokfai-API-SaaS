import { Hono, type Context } from "hono";
import Stripe from "stripe";

import { ApiError } from "../errors.js";
import { requireSupabaseJwt } from "../middleware/supabaseJwt.js";
import {
  listBillingRechargePlans,
  loadCheckoutRechargePlan,
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

function amountCnyFromCents(amountCents: number): number {
  if (amountCents % 100 !== 0) {
    throw ApiError.internal(
      "Recharge plan amount_cents must be a whole-yuan value.",
      "invalid_plan_amount_cents"
    );
  }
  return amountCents / 100;
}

function buildCheckoutLineItem(
  plan: Awaited<ReturnType<typeof loadCheckoutRechargePlan>>
): Stripe.Checkout.SessionCreateParams.LineItem {
  if (!plan) {
    throw ApiError.internal("Missing recharge plan for checkout.", "plan_missing");
  }

  if (plan.stripe_price_id) {
    return {
      quantity: 1,
      price: plan.stripe_price_id,
    };
  }

  return {
    quantity: 1,
    price_data: {
      currency: "cny",
      unit_amount: plan.amount_cents,
      product_data: {
        name: plan.name,
        description: `${plan.total_credits.toLocaleString("en-US")} Tokfai credits`,
      },
    },
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

  try {
    const bodyObj = body as Record<string, unknown>;
    const planId = parsePlanId(body);
    const plan = await loadCheckoutRechargePlan(planId);

    if (!plan) {
      throw ApiError.badRequest("Unknown recharge plan.", "invalid_plan_id");
    }
    if (!plan.enabled) {
      throw ApiError.badRequest(
        `The ${planId} plan is not available for purchase yet.`,
        "plan_not_available"
      );
    }

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
    const totalCredits = plan.total_credits;
    const amountCny = amountCnyFromCents(plan.amount_cents);

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
      const customer = await stripe.customers.create({
        email: user.email ?? (profile as { email?: string | null }).email ?? undefined,
        metadata: {
          tokfai_user_id: user.id,
        },
      });
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

    const { data: order, error: orderError } = await sb
      .from("credit_orders")
      .insert({
        user_id: user.id,
        plan_id: plan.id,
        status: "pending",
        currency: "cny",
        amount_cny: amountCny,
        credits: totalCredits,
      })
      .select("id")
      .single();

    if (orderError || !order) {
      throw ApiError.internal(
        `Failed to create credit order: ${orderError?.message ?? "missing order"}`,
        "credit_order_create_failed"
      );
    }

    const orderId = (order as { id: string }).id;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: stripeCustomerId,
      client_reference_id: user.id,
      success_url: successUrl,
      cancel_url: cancelUrl,
      line_items: [buildCheckoutLineItem(plan)],
      metadata: {
        credit_order_id: orderId,
        tokfai_user_id: user.id,
        plan_id: plan.id,
        package_code: plan.id,
        credits: String(totalCredits),
      },
      payment_intent_data: {
        metadata: {
          credit_order_id: orderId,
          tokfai_user_id: user.id,
          plan_id: plan.id,
          package_code: plan.id,
        },
      },
    });

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
      credits: totalCredits,
    });
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw ApiError.internal(
      `Unhandled billing checkout error: ${
        err instanceof Error ? err.message : String(err)
      }`,
      "billing_checkout_failed"
    );
  }
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
