import Stripe from "stripe";

import { env } from "./env.js";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
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
