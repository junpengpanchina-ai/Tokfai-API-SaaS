"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { loginPathWithNext } from "@/lib/auth/login-redirect";
import {
  createCheckoutSession,
  DmitApiError,
} from "@/lib/dmit/client";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";
import { createClient } from "@/lib/supabase/client";

/**
 * Logged-in: POST /v1/billing/checkout with { plan_id }, then redirect to Stripe.
 * Logged-out: send user to login, then back to /pricing.
 */
export function PricingBuyButton({
  planId,
  planName,
  isLoggedIn,
  disabled = false,
}: {
  planId: string;
  planName: string;
  isLoggedIn: boolean;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = formatMessage(t("pricing.buyPlan"), { name: planName });

  if (!isLoggedIn) {
    return (
      <Button asChild className="w-full" size="lg" disabled={disabled}>
        <Link href={loginPathWithNext("/pricing")}>{label}</Link>
      </Button>
    );
  }

  async function handleCheckout() {
    if (loading || disabled) return;
    setLoading(true);
    setError(null);

    try {
      const supabase = createClient();
      if (!supabase) {
        window.location.href = loginPathWithNext("/pricing");
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;
      if (!accessToken) {
        window.location.href = loginPathWithNext("/pricing");
        return;
      }

      const result = await createCheckoutSession({
        accessToken,
        plan_id: planId,
      });

      if (!result.url) {
        throw new DmitApiError({
          status: 502,
          message: t("dashboard.credits.checkoutUnavailable"),
          code: "checkout_url_missing",
        });
      }

      window.location.href = result.url;
    } catch (err) {
      const message =
        err instanceof DmitApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("dashboard.credits.checkoutUnavailable");
      setError(message || t("dashboard.credits.checkoutUnavailable"));
      setLoading(false);
    }
  }

  return (
    <div className="w-full space-y-2">
      <Button
        type="button"
        className="w-full"
        size="lg"
        disabled={disabled || loading}
        onClick={() => void handleCheckout()}
      >
        {label}
      </Button>
      {error ? (
        <p className="text-center text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}
