import Stripe from "stripe";

import { env } from "./env.js";
import { ApiError } from "./errors.js";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    if (!env.STRIPE_SECRET_KEY) {
      throw ApiError.internal(
        "STRIPE_SECRET_KEY is not configured.",
        "stripe_not_configured"
      );
    }
    _stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      // Pin the API version so behaviour stays stable across upgrades.
      apiVersion: "2025-02-24.acacia",
      typescript: true,
      maxNetworkRetries: 2,
      appInfo: {
        name: "tokfai-dmit-api",
        version: "0.1.0",
      },
    });
  }
  return _stripe;
}
