"use client";

import { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface CreditPlan {
  plan_id: "starter" | "pro" | "business";
  name: string;
  amount_cny: number;
  credits: number;
}

interface RechargeIntent {
  plan_id: CreditPlan["plan_id"];
  amount_cny: number;
  credits: number;
  user_id: string;
}

const CREDIT_PLANS: CreditPlan[] = [
  {
    plan_id: "starter",
    name: "Starter",
    amount_cny: 29,
    credits: 10_000,
  },
  {
    plan_id: "pro",
    name: "Pro",
    amount_cny: 99,
    credits: 50_000,
  },
  {
    plan_id: "business",
    name: "Business",
    amount_cny: 299,
    credits: 200_000,
  },
];

export function CreditsTopUpClient({ userId }: { userId: string }) {
  const [loadingPlanId, setLoadingPlanId] = useState<string | null>(null);
  const [selectedIntent, setSelectedIntent] = useState<RechargeIntent | null>(
    null
  );

  async function handleRecharge(plan: CreditPlan) {
    if (loadingPlanId != null) return;

    const intent: RechargeIntent = {
      plan_id: plan.plan_id,
      amount_cny: plan.amount_cny,
      credits: plan.credits,
      user_id: userId,
    };

    setLoadingPlanId(plan.plan_id);
    setSelectedIntent(null);
    await createRechargePlaceholder(intent);
    setSelectedIntent(intent);
    setLoadingPlanId(null);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Recharge credits</CardTitle>
          <Badge variant="secondary">Stripe checkout coming soon</Badge>
        </div>
        <CardDescription>
          Choose a package now. Payment is a placeholder until Stripe checkout
          is connected through DMIT.
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

        {selectedIntent ? <PlaceholderNotice intent={selectedIntent} /> : null}

        <p className="text-xs text-muted-foreground">
          Stripe checkout coming soon. This button does not modify{" "}
          <code>profiles.credits_balance</code> and does not start a real
          payment yet.
        </p>
      </CardContent>
    </Card>
  );
}

function PlaceholderNotice({ intent }: { intent: RechargeIntent }) {
  return (
    <div className="flex flex-col gap-2 rounded-md border border-emerald-300 bg-emerald-50 p-3 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100">
      <div className="flex items-center gap-2 text-sm font-medium">
        <CheckCircle2 className="h-4 w-4" />
        Recharge placeholder selected
      </div>
      <p className="text-xs text-emerald-900/80 dark:text-emerald-100/80">
        Stripe checkout coming soon. Future checkout payload:{" "}
        <code className="font-mono">
          {intent.plan_id} / ¥{intent.amount_cny} /{" "}
          {formatCredits(intent.credits)} credits
        </code>
        .
      </p>
    </div>
  );
}

async function createRechargePlaceholder(
  _intent: RechargeIntent
): Promise<void> {
  // Placeholder for a future DMIT Stripe checkout call.
  await new Promise((resolve) => window.setTimeout(resolve, 250));
}

function formatCredits(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
