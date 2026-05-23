import { Hono, type Context } from "hono";
import Stripe from "stripe";

import { env } from "../env.js";
import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import { stripe } from "../stripe.js";
import { supabase } from "../supabase.js";

type CreditOrderRow = {
  id: string;
  user_id: string;
  credits: string | number;
  status: string;
};

type CreditOrder = {
  id: string;
  userId: string;
  credits: string | number;
  status: string;
};

function asCheckoutSession(event: Stripe.Event): Stripe.Checkout.Session {
  return event.data.object as Stripe.Checkout.Session;
}

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  const value = session.payment_intent;
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function toCreditOrder(row: CreditOrderRow): CreditOrder {
  return {
    id: row.id,
    userId: row.user_id,
    credits: row.credits,
    status: row.status,
  };
}

function creditOrderIdFromSession(session: Stripe.Checkout.Session): string | null {
  const raw = session.metadata?.credit_order_id;
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function loadCreditOrderByCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<{ order: CreditOrder | null; error: Error | null }> {
  const sb = supabase();
  const { data, error } = await sb
    .from("credit_orders")
    .select("id, user_id, credits, status")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();

  if (error) {
    return { order: null, error: new Error(error.message) };
  }
  if (!data) {
    return { order: null, error: null };
  }

  return { order: toCreditOrder(data as CreditOrderRow), error: null };
}

async function loadCreditOrderByMetadata(
  session: Stripe.Checkout.Session
): Promise<{ order: CreditOrder | null; error: Error | null }> {
  const orderId = creditOrderIdFromSession(session);
  if (!orderId) {
    return { order: null, error: null };
  }

  const sb = supabase();
  const { data, error } = await sb
    .from("credit_orders")
    .select("id, user_id, credits, status")
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    return { order: null, error: new Error(error.message) };
  }
  if (!data) {
    return { order: null, error: null };
  }

  return { order: toCreditOrder(data as CreditOrderRow), error: null };
}

async function resolveCreditOrder(
  session: Stripe.Checkout.Session
): Promise<{ order: CreditOrder | null; error: Error | null }> {
  const bySession = await loadCreditOrderByCheckoutSession(session);
  if (bySession.error || bySession.order) {
    return bySession;
  }

  return loadCreditOrderByMetadata(session);
}

async function handleCheckoutSessionCompleted(
  event: Stripe.Event,
  session: Stripe.Checkout.Session
) {
  const { order, error: lookupError } = await resolveCreditOrder(session);

  if (lookupError) {
    throw ApiError.internal(
      `Failed to load credit order for checkout session: ${lookupError.message}`,
      "credit_order_lookup_failed"
    );
  }

  if (!order) {
    log.warn("stripe_checkout_order_not_found", {
      route: "/v1/webhooks/stripe",
      status: 200,
      code: "credit_order_not_found",
      message: `Credit order not found for checkout session ${session.id} (event ${event.id}); skipping credit.`,
    });
    return { received: true as const };
  }

  if (order.status === "paid") {
    log.info("stripe_checkout_order_already_paid", {
      route: "/v1/webhooks/stripe",
      status: 200,
      code: "duplicated",
      message: `Credit order ${order.id} already paid for session ${session.id}; skipping credit.`,
    });
    return { received: true as const, duplicated: true as const };
  }

  if (order.status !== "pending") {
    log.warn("stripe_checkout_order_not_creditable", {
      route: "/v1/webhooks/stripe",
      status: 200,
      code: "credit_order_not_pending",
      message: `Credit order ${order.id} has status ${order.status}; skipping credit.`,
    });
    return { received: true as const };
  }

  const { error: completeError } = await supabase().rpc("complete_credit_order", {
    p_order_id: order.id,
    p_user_id: order.userId,
    p_stripe_checkout_session_id: session.id,
    p_stripe_payment_intent_id: paymentIntentId(session),
  });

  if (completeError) {
    throw ApiError.internal(
      `Failed to complete credit order: ${completeError.message}`,
      "credit_order_complete_failed"
    );
  }

  log.info("stripe_checkout_credited", {
    route: "/v1/webhooks/stripe",
    status: 200,
    code: "credited",
    message: `Credit order ${order.id} credited for session ${session.id}.`,
  });

  return { received: true as const, credited: true as const };
}

export async function handleStripeWebhook(c: Context) {
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    throw ApiError.badRequest("Missing Stripe-Signature header.", "missing_signature");
  }

  const rawBody = await c.req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    log.warn("stripe_webhook_signature_failed", {
      route: "/v1/webhooks/stripe",
      status: 400,
      code: "invalid_signature",
      message: "Invalid Stripe signature.",
    });
    throw ApiError.badRequest("Invalid Stripe signature.", "invalid_signature");
  }

  if (event.type !== "checkout.session.completed") {
    return c.json({ received: true, ignored: true });
  }

  const session = asCheckoutSession(event);
  const result = await handleCheckoutSessionCompleted(event, session);
  return c.json(result);
}

/**
 * Stripe-signed webhook. Auth is the `Stripe-Signature` header, verified with
 * STRIPE_WEBHOOK_SECRET. Never JWT or sk-tokfai.
 */
export const webhookRoutes = new Hono();
export const legacyStripeWebhookRoutes = new Hono();
export const stripeWebhookRoutes = webhookRoutes;

webhookRoutes.post("/stripe", handleStripeWebhook);
legacyStripeWebhookRoutes.post("/stripe/webhook", handleStripeWebhook);
