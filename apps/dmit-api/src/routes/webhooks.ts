import { Hono, type Context } from "hono";
import Stripe from "stripe";

import { env } from "../env.js";
import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import { stripe } from "../stripe.js";
import { supabase } from "../supabase.js";

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

function checkoutLedgerReferenceId(sessionId: string): string {
  return `stripe_checkout:${sessionId}`;
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
  } catch (err) {
    log.warn("stripe_webhook_signature_failed", {
      message: err instanceof Error ? err.message : String(err),
    });
    throw ApiError.badRequest("Invalid Stripe signature.", "invalid_signature");
  }

  if (event.type !== "checkout.session.completed") {
    return c.json({ received: true, ignored: true });
  }

  const session = asCheckoutSession(event);
  const referenceId = checkoutLedgerReferenceId(session.id);

  const sb = supabase();
  const { data: existingLedger, error: ledgerError } = await sb
    .from("credit_ledger")
    .select("id")
    .eq("reference_id", referenceId)
    .maybeSingle();

  if (ledgerError) {
    throw ApiError.internal(
      `Failed to check credit ledger idempotency: ${ledgerError.message}`,
      "credit_ledger_idempotency_check_failed"
    );
  }

  if (existingLedger) {
    log.info("stripe_checkout_already_ledgered", {
      eventId: event.id,
      sessionId: session.id,
    });
    return c.json({ received: true, already_processed: true });
  }

  const { data: existingOrder, error: orderError } = await sb
    .from("credit_orders")
    .select("id, user_id, credits, status")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();

  if (orderError) {
    throw ApiError.internal(
      `Failed to load credit order by checkout session: ${orderError.message}`,
      "credit_order_lookup_failed"
    );
  }

  if (!existingOrder) {
    throw ApiError.internal(
      `Credit order not found for checkout session ${session.id}`,
      "credit_order_not_found"
    );
  }

  const order = {
    id: (existingOrder as { id: string }).id,
    userId: (existingOrder as { user_id: string }).user_id,
    credits: (existingOrder as { credits: string | number }).credits,
    status: (existingOrder as { status: string }).status,
  } satisfies CreditOrder;

  const { data: balanceAfter, error: completeError } = await sb.rpc(
    "complete_credit_order",
    {
      p_order_id: order.id,
      p_user_id: order.userId,
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
    orderId: order.id,
    orderStatus: order.status,
    credits: order.credits,
  });

  return c.json({
    received: true,
    already_processed: false,
    balance_after: balanceAfter,
  });
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
