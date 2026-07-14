import { Hono, type Context } from "hono";
import Stripe from "stripe";

import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import { requireSupabaseJwt } from "../middleware/supabaseJwt.js";
import {
  listBillingRechargePlans,
  loadCheckoutRechargePlan,
  type AdminRechargePlanListItem,
} from "./adminRechargePlans.js";
import { resolveTenantIdFromRequestHeaders } from "./adminTenants.js";
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

function requestIdOf(c: Context): string | undefined {
  return c.get("requestId" as never) as string | undefined;
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
  if (plan.archived_at) {
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
  tenantId?: string | null;
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
    tenant_id: args.tenantId ?? null,
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

type StripeErrFields = {
  stripeErrorCode?: string;
  stripeErrorType?: string;
  stripeErrorParam?: string;
  message?: string;
};

function stripeErrorFields(err: unknown): StripeErrFields {
  if (err instanceof Stripe.errors.StripeError) {
    return {
      stripeErrorCode: err.code ?? undefined,
      stripeErrorType: err.type ?? undefined,
      stripeErrorParam:
        typeof err.param === "string" && err.param.length > 0
          ? err.param
          : undefined,
      message: err.message,
    };
  }
  if (err instanceof Error) {
    return { message: err.message };
  }
  return { message: String(err) };
}

/** Stale / deleted / test-vs-live customer ids typically surface as resource_missing. */
function isInvalidStripeCustomerError(err: unknown): boolean {
  if (!(err instanceof Stripe.errors.StripeError)) return false;
  if (err.code === "resource_missing") return true;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("no such customer") ||
    (msg.includes("customer") && msg.includes("does not exist")) ||
    (err.param === "customer" && err.statusCode === 400)
  );
}

function logCheckoutFailure(
  msg: string,
  fields: {
    requestId?: string;
    userId: string;
    planId: string;
    orderId?: string;
    stripeCustomerId?: string | null;
    code: string;
    err?: unknown;
    recreatedCustomer?: boolean;
  }
): void {
  const stripeFields = stripeErrorFields(fields.err);
  log.error(msg, {
    requestId: fields.requestId,
    route: "POST /v1/billing/checkout",
    status: 500,
    userId: fields.userId,
    planId: fields.planId,
    orderId: fields.orderId,
    stripeCustomerId: fields.stripeCustomerId ?? undefined,
    code: fields.code,
    message: stripeFields.message ?? fields.code,
    stripeErrorCode: stripeFields.stripeErrorCode,
    stripeErrorType: stripeFields.stripeErrorType,
    stripeErrorParam: stripeFields.stripeErrorParam,
    recreatedCustomer: fields.recreatedCustomer,
  });
}

async function persistStripeCustomerId(
  userId: string,
  stripeCustomerId: string
): Promise<void> {
  const { error: updateError } = await supabase()
    .from("profiles")
    .update({
      stripe_customer_id: stripeCustomerId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (updateError) {
    throw ApiError.internal(
      `Failed to save Stripe customer id: ${updateError.message}`,
      "billing_customer_save_failed"
    );
  }
}

async function createAndPersistStripeCustomer(args: {
  stripe: Stripe;
  userId: string;
  email: string | undefined;
  requestId?: string;
  planId: string;
  previousCustomerId?: string | null;
}): Promise<string> {
  let customer: Stripe.Customer;
  try {
    customer = await args.stripe.customers.create({
      email: args.email,
      metadata: {
        tokfai_user_id: args.userId,
      },
    });
  } catch (err) {
    logCheckoutFailure("billing_checkout_failed", {
      requestId: args.requestId,
      userId: args.userId,
      planId: args.planId,
      stripeCustomerId: args.previousCustomerId,
      code: "stripe_customer_create_failed",
      err,
    });
    throw stripeCheckoutError(err, "stripe_customer_create_failed");
  }

  await persistStripeCustomerId(args.userId, customer.id);

  if (args.previousCustomerId) {
    log.info("billing_stripe_customer_recreated", {
      requestId: args.requestId,
      route: "POST /v1/billing/checkout",
      userId: args.userId,
      planId: args.planId,
      stripeCustomerId: customer.id,
      code: "stripe_customer_recreated",
      message: `Replaced invalid Stripe customer ${args.previousCustomerId} with ${customer.id}.`,
      recreatedCustomer: true,
    });
  }

  return customer.id;
}

/**
 * Resolve a usable Stripe customer for checkout. Creates one when missing;
 * if the stored id is gone or belongs to the wrong Stripe mode (test/live),
 * recreates and updates profiles.stripe_customer_id.
 */
async function ensureStripeCustomer(args: {
  stripe: Stripe;
  userId: string;
  email: string | undefined;
  storedCustomerId: string | null | undefined;
  requestId?: string;
  planId: string;
}): Promise<{ customerId: string; recreated: boolean }> {
  const stored = args.storedCustomerId?.trim() || null;

  if (stored) {
    try {
      const existing = await args.stripe.customers.retrieve(stored);
      if (!("deleted" in existing && existing.deleted)) {
        return { customerId: existing.id, recreated: false };
      }
    } catch (err) {
      if (!isInvalidStripeCustomerError(err)) {
        logCheckoutFailure("billing_checkout_failed", {
          requestId: args.requestId,
          userId: args.userId,
          planId: args.planId,
          stripeCustomerId: stored,
          code: "stripe_customer_retrieve_failed",
          err,
        });
        throw stripeCheckoutError(err, "stripe_customer_retrieve_failed");
      }
      log.warn("billing_stripe_customer_invalid", {
        requestId: args.requestId,
        route: "POST /v1/billing/checkout",
        userId: args.userId,
        planId: args.planId,
        stripeCustomerId: stored,
        code: "stripe_customer_invalid",
        message: stripeErrorFields(err).message ?? "Stored Stripe customer is invalid.",
        stripeErrorCode: stripeErrorFields(err).stripeErrorCode,
        stripeErrorType: stripeErrorFields(err).stripeErrorType,
      });
    }
  }

  const customerId = await createAndPersistStripeCustomer({
    stripe: args.stripe,
    userId: args.userId,
    email: args.email,
    requestId: args.requestId,
    planId: args.planId,
    previousCustomerId: stored,
  });

  return { customerId, recreated: Boolean(stored) };
}

async function createStripeCheckoutSession(args: {
  stripe: Stripe;
  customerId: string;
  userId: string;
  successUrl: string;
  cancelUrl: string;
  plan: AdminRechargePlanListItem;
  metadata: Record<string, string>;
}): Promise<Stripe.Checkout.Session> {
  return args.stripe.checkout.sessions.create({
    mode: "payment",
    customer: args.customerId,
    client_reference_id: args.userId,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    line_items: [buildCheckoutLineItem(args.plan)],
    metadata: args.metadata,
    payment_intent_data: {
      metadata: args.metadata,
    },
  });
}

async function listBillingPlans(c: Context) {
  const plans = await listBillingRechargePlans();
  return c.json({ data: plans });
}

async function createCheckoutSession(c: Context) {
  const user = authedUser(c);
  const requestId = requestIdOf(c);
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
    logCheckoutFailure("billing_checkout_failed", {
      requestId,
      userId: user.id,
      planId,
      code: "billing_profile_load_failed",
      err: new Error(profileError.message),
    });
    throw ApiError.internal(
      `Failed to load billing profile: ${profileError.message}`,
      "billing_profile_load_failed"
    );
  }
  if (!profile) {
    throw ApiError.notFound("Profile not found.", "profile_not_found");
  }

  const profileEmail =
    user.email ?? (profile as { email?: string | null }).email ?? null;
  const storedCustomerId = (profile as { stripe_customer_id?: string | null })
    .stripe_customer_id;

  let stripeCustomerId: string;
  let recreatedCustomer = false;
  try {
    const ensured = await ensureStripeCustomer({
      stripe,
      userId: user.id,
      email: profileEmail ?? undefined,
      storedCustomerId,
      requestId,
      planId,
    });
    stripeCustomerId = ensured.customerId;
    recreatedCustomer = ensured.recreated;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    logCheckoutFailure("billing_checkout_failed", {
      requestId,
      userId: user.id,
      planId,
      stripeCustomerId: storedCustomerId,
      code: "billing_checkout_failed",
      err,
    });
    throw stripeCheckoutError(err, "billing_checkout_failed");
  }

  const tenantId = await resolveTenantIdFromRequestHeaders({
    get: (name) => c.req.header(name),
  });

  const { data: order, error: orderError } = await sb
    .from("credit_orders")
    .insert(
      buildCreditOrderInsert({
        userId: user.id,
        email: profileEmail,
        plan,
        tenantId,
      })
    )
    .select("id")
    .single();

  if (orderError || !order) {
    logCheckoutFailure("billing_checkout_failed", {
      requestId,
      userId: user.id,
      planId,
      stripeCustomerId,
      code: "credit_order_create_failed",
      err: new Error(orderError?.message ?? "missing order"),
      recreatedCustomer,
    });
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
    session = await createStripeCheckoutSession({
      stripe,
      customerId: stripeCustomerId,
      userId: user.id,
      successUrl,
      cancelUrl,
      plan,
      metadata,
    });
  } catch (err) {
    if (isInvalidStripeCustomerError(err)) {
      log.warn("billing_stripe_customer_invalid", {
        requestId,
        route: "POST /v1/billing/checkout",
        userId: user.id,
        planId,
        orderId,
        stripeCustomerId,
        code: "stripe_customer_invalid",
        message:
          stripeErrorFields(err).message ??
          "Stripe rejected customer on checkout session create.",
        stripeErrorCode: stripeErrorFields(err).stripeErrorCode,
        stripeErrorType: stripeErrorFields(err).stripeErrorType,
      });

      try {
        stripeCustomerId = await createAndPersistStripeCustomer({
          stripe,
          userId: user.id,
          email: profileEmail ?? undefined,
          requestId,
          planId,
          previousCustomerId: stripeCustomerId,
        });
        recreatedCustomer = true;
        session = await createStripeCheckoutSession({
          stripe,
          customerId: stripeCustomerId,
          userId: user.id,
          successUrl,
          cancelUrl,
          plan,
          metadata,
        });
      } catch (retryErr) {
        logCheckoutFailure("billing_checkout_failed", {
          requestId,
          userId: user.id,
          planId,
          orderId,
          stripeCustomerId,
          code: "stripe_checkout_create_failed",
          err: retryErr,
          recreatedCustomer: true,
        });
        throw stripeCheckoutError(retryErr, "stripe_checkout_create_failed");
      }
    } else {
      logCheckoutFailure("billing_checkout_failed", {
        requestId,
        userId: user.id,
        planId,
        orderId,
        stripeCustomerId,
        code: "stripe_checkout_create_failed",
        err,
        recreatedCustomer,
      });
      throw stripeCheckoutError(err, "stripe_checkout_create_failed");
    }
  }

  if (!session.url) {
    logCheckoutFailure("billing_checkout_failed", {
      requestId,
      userId: user.id,
      planId,
      orderId,
      stripeCustomerId,
      code: "checkout_url_missing",
      err: new Error("Stripe Checkout did not return a URL."),
      recreatedCustomer,
    });
    throw ApiError.internal("Stripe Checkout did not return a URL.", "checkout_url_missing");
  }

  const { error: updateOrderError } = await sb
    .from("credit_orders")
    .update({
      stripe_checkout_session_id: session.id,
    })
    .eq("id", orderId);

  if (updateOrderError) {
    logCheckoutFailure("billing_checkout_failed", {
      requestId,
      userId: user.id,
      planId,
      orderId,
      stripeCustomerId,
      code: "checkout_session_save_failed",
      err: new Error(updateOrderError.message),
      recreatedCustomer,
    });
    throw ApiError.internal(
      `Failed to save checkout session id: ${updateOrderError.message}`,
      "checkout_session_save_failed"
    );
  }

  log.info("billing_checkout_session_created", {
    requestId,
    route: "POST /v1/billing/checkout",
    status: 200,
    userId: user.id,
    planId: plan.id,
    orderId,
    stripeCustomerId,
    code: "checkout_session_created",
    message: `Checkout session ${session.id} created for plan ${plan.id}.`,
    recreatedCustomer,
  });

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
 * Billing routes.
 * GET /v1/billing/plans is public (pricing / credits UI).
 * Checkout requires the user's Supabase JWT.
 */
export const billingRoutes = new Hono();

billingRoutes.get("/v1/billing/plans", listBillingPlans);
billingRoutes.post("/v1/billing/checkout", requireSupabaseJwt, createCheckoutSession);
billingRoutes.post(
  "/billing/create-checkout-session",
  requireSupabaseJwt,
  createCheckoutSession
);
