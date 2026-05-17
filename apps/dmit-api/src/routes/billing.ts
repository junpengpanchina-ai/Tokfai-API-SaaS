import { Hono, type Context } from "hono";

import { env } from "../env.js";
import { ApiError } from "../errors.js";
import { requireSupabaseJwt } from "../middleware/supabaseJwt.js";
import { stripe } from "../stripe.js";
import { supabase } from "../supabase.js";
import type { AuthedUser } from "../types.js";

type PlanId = "starter" | "pro" | "business";

interface CreditPlan {
  plan_id: PlanId;
  name: string;
  amount_cny: number;
  credits: number;
}

const CREDIT_PLANS: Record<PlanId, CreditPlan> = {
  starter: {
    plan_id: "starter",
    name: "Tokfai Starter Credits",
    amount_cny: 29,
    credits: 10_000,
  },
  pro: {
    plan_id: "pro",
    name: "Tokfai Pro Credits",
    amount_cny: 99,
    credits: 50_000,
  },
  business: {
    plan_id: "business",
    name: "Tokfai Business Credits",
    amount_cny: 299,
    credits: 200_000,
  },
};

function authedUser(c: { get: (key: never) => unknown }): AuthedUser {
  return c.get("user" as never) as AuthedUser;
}

function parsePlanId(body: unknown): PlanId {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw ApiError.badRequest("Request body must be a JSON object.", "invalid_body");
  }

  const planId = (body as Record<string, unknown>).plan_id;
  if (
    planId !== "starter" &&
    planId !== "pro" &&
    planId !== "business"
  ) {
    throw ApiError.badRequest(
      "plan_id must be one of starter, pro, or business.",
      "invalid_plan_id"
    );
  }

  return planId;
}

function allowedRedirectUrl(raw: unknown, fallbackPath: string): string {
  if (raw !== undefined && typeof raw !== "string") {
    throw ApiError.badRequest("Redirect URL must be a string.", "invalid_redirect_url");
  }

  const fallbackOrigin =
    env.BILLING_ALLOWED_REDIRECT_ORIGINS[0] ?? "https://tokfai.com";
  const value = raw?.trim() || `${fallbackOrigin}${fallbackPath}`;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw ApiError.badRequest("Redirect URL must be absolute.", "invalid_redirect_url");
  }

  if (!env.BILLING_ALLOWED_REDIRECT_ORIGINS.includes(url.origin)) {
    throw ApiError.badRequest(
      "Redirect URL origin is not allowed.",
      "redirect_origin_not_allowed"
    );
  }

  return url.toString();
}

async function createCheckoutSession(c: Context) {
  const user = authedUser(c);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw ApiError.badRequest("Invalid JSON body.", "invalid_json");
  }

  const plan = CREDIT_PLANS[parsePlanId(body)];
  const successUrl = allowedRedirectUrl(
    (body as Record<string, unknown>).success_url,
    "/dashboard/credits?status=success&session_id={CHECKOUT_SESSION_ID}"
  );
  const cancelUrl = allowedRedirectUrl(
    (body as Record<string, unknown>).cancel_url,
    "/dashboard/credits?status=cancelled"
  );
  const sb = supabase();

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
    const customer = await stripe().customers.create({
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
      plan_id: plan.plan_id,
      status: "pending",
      currency: "cny",
      amount_cny: plan.amount_cny,
      credits: plan.credits,
      stripe_customer_id: stripeCustomerId,
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
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer: stripeCustomerId,
    client_reference_id: user.id,
    success_url: successUrl,
    cancel_url: cancelUrl,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "cny",
          unit_amount: plan.amount_cny * 100,
          product_data: {
            name: plan.name,
            description: `${plan.credits.toLocaleString("en-US")} Tokfai credits`,
          },
        },
      },
    ],
    metadata: {
      credit_order_id: orderId,
      tokfai_user_id: user.id,
      plan_id: plan.plan_id,
      credits: String(plan.credits),
    },
    payment_intent_data: {
      metadata: {
        credit_order_id: orderId,
        tokfai_user_id: user.id,
        plan_id: plan.plan_id,
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
      updated_at: new Date().toISOString(),
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
    plan_id: plan.plan_id,
    amount_cny: plan.amount_cny,
    credits: plan.credits,
  });
}

/**
 * Dashboard-initiated billing actions. Auth is the user's Supabase JWT.
 */
export const billingRoutes = new Hono();

billingRoutes.use("/*", requireSupabaseJwt);

billingRoutes.post("/create-checkout-session", createCheckoutSession);
