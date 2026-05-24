"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDmitBaseUrl } from "@/lib/dmit/client";
import { createClient } from "@/lib/supabase/client";

type Direction = "add" | "deduct";

type AdminCreditAdjustmentResponse = {
  ok?: boolean;
  user_id?: string;
  previous_credits?: number;
  delta?: number;
  credits?: number;
  balance_after?: number;
  reason?: string;
  reference_id?: string;
  data?: {
    user_id: string;
    amount: number;
    balance_after: number;
    reason: string;
    reference_id: string;
  };
};

export function AdminCreditAdjustmentClient({ userId }: { userId: string }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<Direction>("add");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isBusy = isSubmitting || isPending;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError("Enter a credits amount greater than 0.");
      return;
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError("Reason is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;

      if (sessionError || !accessToken) {
        setError("Please sign in again before adjusting credits.");
        return;
      }

      const response = await fetch(
        `${getDmitBaseUrl()}/admin/credits/adjust`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_id: userId,
            amount: parsedAmount,
            direction,
            reason: trimmedReason,
          }),
        }
      );
      const res = (await parseJson(response)) as AdminCreditAdjustmentResponse;

      if (!response.ok) {
        throw new Error(errorMessageFromBody(res, response.status));
      }

      setAmount("");
      setReason("");
      const balanceAfter =
        res.balance_after ?? res.credits ?? res.data?.balance_after;
      setMessage(
        balanceAfter == null
          ? "Applied. Admin data will refresh shortly."
          : `Applied. New balance: ${balanceAfter} credits.`
      );
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Adjustment failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="min-w-[28rem]" onSubmit={handleSubmit}>
      <div className="grid gap-2">
        <div className="grid grid-cols-[7rem_6rem_1fr_auto] items-end gap-2">
          <div>
            <Label className="text-xs" htmlFor={`amount-${userId}`}>
              Credits
            </Label>
            <Input
              id={`amount-${userId}`}
              min="0"
              step="0.000001"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="100"
              disabled={isBusy}
            />
          </div>
          <div>
            <Label className="text-xs" htmlFor={`direction-${userId}`}>
              Action
            </Label>
            <select
              id={`direction-${userId}`}
              value={direction}
              onChange={(event) => setDirection(event.target.value as Direction)}
              disabled={isBusy}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <option value="add">add</option>
              <option value="deduct">deduct</option>
            </select>
          </div>
          <div>
            <Label className="text-xs" htmlFor={`reason-${userId}`}>
              Reason (required)
            </Label>
            <Input
              id={`reason-${userId}`}
              value={reason}
              maxLength={200}
              required
              onChange={(event) => setReason(event.target.value)}
              placeholder="Manual top-up for support ticket"
              disabled={isBusy}
            />
          </div>
          <Button type="submit" size="sm" disabled={isBusy}>
            {isBusy ? "Applying..." : "Apply"}
          </Button>
        </div>
        {message ? <p className="text-xs text-emerald-600">{message}</p> : null}
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
      </div>
    </form>
  );
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessageFromBody(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const maybeError = (body as { error?: unknown; message?: unknown }).error;
    if (typeof maybeError === "string") return maybeError;
    if (maybeError && typeof maybeError === "object") {
      const message = (maybeError as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  if (typeof body === "string" && body.trim()) return body;
  return `DMIT request failed (HTTP ${status}).`;
}
