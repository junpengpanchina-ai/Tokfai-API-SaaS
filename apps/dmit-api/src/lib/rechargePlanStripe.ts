import Stripe from "stripe";

import { ApiError } from "../errors.js";
import { stripe } from "../stripe.js";

export type RechargePlanStripeIds = {
  stripe_product_id: string | null;
  stripe_price_id: string | null;
};

function stripeRechargePlanError(err: unknown, code: string): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof Stripe.errors.StripeError) {
    return ApiError.internal(
      `Stripe recharge plan provisioning failed: ${err.message}`,
      code
    );
  }
  return ApiError.internal(
    `Stripe recharge plan provisioning failed: ${
      err instanceof Error ? err.message : String(err)
    }`,
    code
  );
}

export async function createRechargePlanStripeResources(args: {
  planId: string;
  name: string;
  amountCents: number;
  credits: number;
}): Promise<RechargePlanStripeIds> {
  const client = stripe();

  let product: Stripe.Product;
  try {
    product = await client.products.create({
      name: `Tokfai ${args.name} Credits`,
      description: `${args.credits} Tokfai credits`,
      metadata: {
        tokfai_plan_id: args.planId,
      },
    });
  } catch (err) {
    throw stripeRechargePlanError(err, "stripe_product_create_failed");
  }

  let price: Stripe.Price;
  try {
    price = await client.prices.create({
      product: product.id,
      currency: "cny",
      unit_amount: args.amountCents,
    });
  } catch (err) {
    throw stripeRechargePlanError(err, "stripe_price_create_failed");
  }

  return {
    stripe_product_id: product.id,
    stripe_price_id: price.id,
  };
}

export async function createRechargePlanStripePrice(args: {
  planId: string;
  name: string;
  amountCents: number;
  credits: number;
  stripeProductId: string | null;
}): Promise<RechargePlanStripeIds> {
  const client = stripe();

  let productId = args.stripeProductId?.trim() || null;
  if (!productId) {
    const created = await createRechargePlanStripeResources({
      planId: args.planId,
      name: args.name,
      amountCents: args.amountCents,
      credits: args.credits,
    });
    return created;
  }

  let price: Stripe.Price;
  try {
    price = await client.prices.create({
      product: productId,
      currency: "cny",
      unit_amount: args.amountCents,
      metadata: {
        tokfai_plan_id: args.planId,
      },
    });
  } catch (err) {
    throw stripeRechargePlanError(err, "stripe_price_create_failed");
  }

  return {
    stripe_product_id: productId,
    stripe_price_id: price.id,
  };
}
