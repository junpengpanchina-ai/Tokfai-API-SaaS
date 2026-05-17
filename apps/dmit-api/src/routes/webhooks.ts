import { Hono, type Context } from "hono";
import Stripe from "stripe";

import { env } from "../env.js";
import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import { stripe } from "../stripe.js";
import { supabase } from "../supabase.js";

function asCheckoutSession(event: Stripe.Event): Stripe.Checkout.Session {
  return event.data.object as Stripe.Checkout.Session;
}

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  const value = session.payment_intent;
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

async function handleStripeWebhook(c: Context) {
  const signature = c.req.header("stripe-signature");
  if (!signature) {
    throw ApiError.badRequest("Missing Stripe-Signature header.", "missing_stripe_signature");
  }

  const rawBody = await c.req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(
      rawBody,
      signature,
      env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    log.warn("stripe_webhook_signature_failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    throw ApiError.badRequest("Invalid Stripe signature.", "invalid_stripe_signature");
  }

  if (event.type !== "checkout.session.completed") {
    return c.json({ received: true, ignored: true });
  }

  const session = asCheckoutSession(event);
  const orderId = session.metadata?.credit_order_id;
  const userId = session.metadata?.tokfai_user_id ?? session.client_reference_id;

  if (!orderId || !userId) {
    throw ApiError.badRequest("Checkout session metadata is missing.", "missing_checkout_metadata");
  }

  const sb = supabase();
  const { data: existingOrder, error: existingError } = await sb
    .from("credit_orders")
    .select("id, status")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();

  if (existingError) {
    throw ApiError.internal(
      `Failed to check credit order idempotency: ${existingError.message}`,
      "credit_order_idempotency_check_failed"
    );
  }

  if ((existingOrder as { status?: string } | null)?.status === "paid") {
    log.info("stripe_checkout_already_paid", {
      eventId: event.id,
      sessionId: session.id,
    });
    return c.json({ received: true, duplicate: true });
  }

  const { data: balanceAfter, error: completeError } = await sb.rpc(
    "complete_credit_order",
    {
      p_order_id: orderId,
      p_user_id: userId,
      p_stripe_checkout_session_id: session.id,
      p_stripe_payment_intent_id: paymentIntentId(session),
    }
  );

  if (completeError) {
    throw ApiError.internal(
      `Failed to complete credit order: ${completeError.message}`,
      "credit_order_complete_failed"
    );
  }

  log.info("stripe_checkout_completed", {
    eventId: event.id,
    sessionId: session.id,
    orderId,
  });

  return c.json({
    received: true,
    balance_after: balanceAfter,
  });
}

/**
 * Stripe-signed webhook. Auth is the `Stripe-Signature` header, verified with
 * STRIPE_WEBHOOK_SECRET. Never JWT or sk-tokfai.
 */
export const stripeWebhookRoutes = new Hono();

stripeWebhookRoutes.post("/webhook", handleStripeWebhook);
