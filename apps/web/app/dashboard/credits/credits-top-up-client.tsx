"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  createCheckoutSession,
  DmitApiError,
} from "@/lib/dmit/client";

interface TopUpError {
  status: number;
  code?: string;
  message: string;
  hint?: string;
}

export function CreditsTopUpClient({ amounts }: { amounts: number[] }) {
  const router = useRouter();
  const [loadingAmount, setLoadingAmount] = useState<number | null>(null);
  const [error, setError] = useState<TopUpError | null>(null);

  async function handleTopUp(amount: number) {
    if (loadingAmount != null) return;
    setError(null);
    setLoadingAmount(amount);

    try {
      const siteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
      const res = await createCheckoutSession({
        amount_usd: amount,
        success_url: `${siteUrl}/dashboard/credits?status=success`,
        cancel_url: `${siteUrl}/dashboard/credits?status=cancel`,
      });

      if (!res?.url) {
        throw new DmitApiError({
          status: 502,
          message: "DMIT did not return a checkout URL.",
          code: "missing_url",
        });
      }

      // Page is about to unload — don't clear loading state.
      window.location.assign(res.url);
    } catch (err) {
      if (err instanceof DmitApiError && err.isAuth) {
        router.replace("/login?redirect=%2Fdashboard%2Fcredits");
        return;
      }
      setError(toTopUpError(err));
      setLoadingAmount(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Top up</CardTitle>
        <CardDescription>
          Pick an amount. Checkout is handled by Stripe via the DMIT backend —
          this app never talks to Stripe directly.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          {amounts.map((amount) => {
            const isLoading = loadingAmount === amount;
            const isDisabled = loadingAmount != null;
            return (
              <Button
                key={amount}
                variant="outline"
                disabled={isDisabled}
                onClick={() => handleTopUp(amount)}
                aria-label={`Top up $${amount}`}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : null}
                ${amount}
              </Button>
            );
          })}
        </div>

        {error ? <ErrorRow error={error} /> : null}

        <p className="text-xs text-muted-foreground">
          You&apos;ll be sent to Stripe&apos;s hosted checkout. Your card
          details never touch Tokfai servers.
        </p>
      </CardContent>
    </Card>
  );
}

function ErrorRow({ error }: { error: TopUpError }) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-destructive">
        <AlertTriangle className="h-4 w-4" />
        Could not start checkout
        {error.status > 0 ? (
          <Badge variant="outline" className="ml-1">
            HTTP {error.status}
          </Badge>
        ) : null}
        {error.code ? (
          <Badge variant="outline" className="font-mono text-[10px]">
            {error.code}
          </Badge>
        ) : null}
      </div>
      <p className="text-sm">{error.message}</p>
      {error.hint ? (
        <p className="text-xs text-muted-foreground">{error.hint}</p>
      ) : null}
    </div>
  );
}

function toTopUpError(err: unknown): TopUpError {
  if (err instanceof DmitApiError) {
    return {
      status: err.status,
      code: err.code,
      message: err.message,
      hint: hintForStatus(err.status, err.code),
    };
  }
  if (err instanceof TypeError) {
    return {
      status: 0,
      message: "Could not reach api.tokfai.com.",
      hint: "Network error or CORS misconfiguration on the DMIT side.",
    };
  }
  if (err instanceof Error) {
    return { status: 0, message: err.message };
  }
  return { status: 0, message: "Unknown error." };
}

function hintForStatus(status: number, code?: string): string | undefined {
  if (status === 400) {
    return code === "invalid_amount"
      ? "Pick one of the listed amounts."
      : "DMIT rejected the request body. Check the amount and try again.";
  }
  if (status === 429) {
    return "Slow down a moment, then try again.";
  }
  if (status >= 500) {
    return "Tokfai or Stripe is having a moment. Try again shortly.";
  }
  return undefined;
}
