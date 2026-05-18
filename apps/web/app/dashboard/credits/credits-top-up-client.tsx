"use client";

import { useState } from "react";
import { AlertCircle, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createCheckoutSession, DmitApiError } from "@/lib/dmit/client";
import { createClient } from "@/lib/supabase/client";

interface CreditPlan {
  plan_id: "starter" | "pro" | "business";
  package_code: "starter" | "pro" | "business";
  name: string;
  amount_cny: number;
  credits: number;
}

const CREDIT_PLANS: CreditPlan[] = [
  {
    plan_id: "starter",
    package_code: "starter",
    name: "Starter",
    amount_cny: 29,
    credits: 10_000,
  },
  {
    plan_id: "pro",
    package_code: "pro",
    name: "Pro",
    amount_cny: 99,
    credits: 50_000,
  },
  {
    plan_id: "business",
    package_code: "business",
    name: "Business",
    amount_cny: 299,
    credits: 200_000,
  },
];

export function CreditsTopUpClient() {
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleRecharge(plan: CreditPlan) {
    if (loadingPlanId != null) return;

    setLoadingPlanId(plan.plan_id);
    setError(null);
    try {
      const supabase = createClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        setError("Please sign in again");
        setLoadingPlanId(null);
        return;
      }

      const session = await createCheckoutSession({
        plan_id: plan.plan_id,
        package_code: plan.package_code,
        accessToken,
        success_url: `${window.location.origin}/dashboard/credits?success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${window.location.origin}/dashboard/credits?status=cancelled`,
      });
      window.location.assign(session.url);
    } catch (err) {
      setError(
        err instanceof DmitApiError
          ? err.message
          : "Unable to start Stripe Checkout. Please try again."
      );
      setLoadingPlanId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Recharge credits</CardTitle>
          <Badge variant="secondary">Stripe Checkout</Badge>
        </div>
        <CardDescription>
          Choose a fixed one-time package. Payments are handled by Stripe, and
          credits are added only after DMIT receives the signed webhook.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 md:grid-cols-3">
          {CREDIT_PLANS.map((plan) => {
            const isLoading = loadingPlanId === plan.plan_id;
            const isDisabled = loadingPlanId != null;
            return (
              <div
                key={plan.plan_id}
                className="flex flex-col gap-4 rounded-lg border bg-card p-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold">{plan.name}</h3>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {plan.plan_id}
                    </Badge>
                  </div>
                  <p className="mt-2 text-3xl font-semibold tracking-tight">
                    ¥{plan.amount_cny}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatCredits(plan.credits)} credits
                  </p>
                </div>

                <Button
                  type="button"
                  variant={plan.plan_id === "pro" ? "default" : "outline"}
                  disabled={isDisabled}
                  onClick={() => handleRecharge(plan)}
                  aria-label={`Recharge ${plan.name}`}
                  className="mt-auto"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  {plan.plan_id === "starter" ? "Buy" : "Recharge"}
                </Button>
              </div>
            );
          })}
        </div>

        {error ? <CheckoutError message={error} /> : null}

        <p className="text-xs text-muted-foreground">
          The frontend never writes <code>profiles.credits_balance</code>.
          Checkout success only shows a pending confirmation message until the
          Stripe webhook credits the account.
        </p>
      </CardContent>
    </Card>
  );
}

function CheckoutError({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <p>{message}</p>
    </div>
  );
}

function formatCredits(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
