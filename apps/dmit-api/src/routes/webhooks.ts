import { Hono, type Context } from "hono";
import Stripe from "stripe";

import { env } from "../env.js";
import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import { stripe } from "../stripe.js";
import { supabase } from "../supabase.js";

type CheckoutMetadata = {
  orderId?: string;
  userId: string;
  credits: number;
  planId: string;
};

function asCheckoutSession(event: Stripe.Event): Stripe.Checkout.Session {
  return event.data.object as Stripe.Checkout.Session;
}

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  const value = session.payment_intent;
  if (!value) return null;
  return typeof value === "string" ? value : value.id;
}

function metadataValue(
  metadata: Stripe.Metadata | null | undefined,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = metadata?.[key]?.trim();
    if (value) return value;
  }
  return undefined;
}

function parsePositiveCredits(raw: string | undefined): number {
  const credits = Number(raw);
  if (!Number.isFinite(credits) || credits <= 0) {
    throw ApiError.badRequest(
      "Checkout session credits metadata is invalid.",
      "invalid_checkout_credits"
    );
  }
  return credits;
}

function parseCheckoutMetadata(session: Stripe.Checkout.Session): CheckoutMetadata {
  const userId =
    metadataValue(session.metadata, "user_id", "tokfai_user_id") ??
    session.client_reference_id?.trim();
  const planId = metadataValue(session.metadata, "plan_id", "package_id");

  if (!userId || !planId) {
    throw ApiError.badRequest("Checkout session metadata is missing.", "missing_checkout_metadata");
  }

  return {
    orderId: metadataValue(session.metadata, "credit_order_id", "order_id"),
    userId,
    credits: parsePositiveCredits(metadataValue(session.metadata, "credits")),
    planId,
  };
}

function amountCny(session: Stripe.Checkout.Session): number {
  const amountTotal = session.amount_total;
  if (!amountTotal || amountTotal <= 0 || amountTotal % 100 !== 0) {
    throw ApiError.badRequest("Checkout session amount is invalid.", "invalid_checkout_amount");
  }
  return amountTotal / 100;
}

async function ensureCreditOrder(session: Stripe.Checkout.Session, metadata: CheckoutMetadata) {
  const sb = supabase();

  if (metadata.orderId) {
    return metadata.orderId;
  }

  const { data: existingOrder, error: existingError } = await sb
    .from("credit_orders")
    .select("id")
    .eq("stripe_checkout_session_id", session.id)
    .maybeSingle();

  if (existingError) {
    throw ApiError.internal(
      `Failed to load credit order by checkout session: ${existingError.message}`,
      "credit_order_lookup_failed"
    );
  }
  if (existingOrder) {
    return (existingOrder as { id: string }).id;
  }

  const currency = (session.currency ?? "cny").toLowerCase();
  const { data: createdOrder, error: createError } = await sb
    .from("credit_orders")
    .insert({
      user_id: metadata.userId,
      plan_id: metadata.planId,
      status: "pending",
      currency,
      amount_cny: amountCny(session),
      credits: metadata.credits,
      stripe_customer_id:
        typeof session.customer === "string"
          ? session.customer
          : session.customer?.id ?? null,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id: paymentIntentId(session),
    })
    .select("id")
    .single();

  if (createError || !createdOrder) {
    throw ApiError.internal(
      `Failed to create credit order from webhook: ${createError?.message ?? "missing order"}`,
      "credit_order_create_failed"
    );
  }

  return (createdOrder as { id: string }).id;
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
  const metadata = parseCheckoutMetadata(session);

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
    return c.json({ received: true, already_processed: true });
  }

  const orderId = await ensureCreditOrder(session, metadata);
  const { data: balanceAfter, error: completeError } = await sb.rpc(
    "complete_credit_order",
    {
      p_order_id: orderId,
      p_user_id: metadata.userId,
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
    already_processed: false,
    balance_after: balanceAfter,
  });
}

/**
 * Stripe-signed webhook. Auth is the `Stripe-Signature` header, verified with
 * STRIPE_WEBHOOK_SECRET. Never JWT or sk-tokfai.
 */
export const stripeWebhookRoutes = new Hono();

stripeWebhookRoutes.post("/stripe/webhook", handleStripeWebhook);
stripeWebhookRoutes.post("/v1/webhooks/stripe", handleStripeWebhook);
