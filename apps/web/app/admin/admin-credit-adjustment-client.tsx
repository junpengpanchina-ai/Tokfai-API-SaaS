"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { dmitFetch, DmitApiError } from "@/lib/dmit/client";
import { createClient } from "@/lib/supabase/client";

type Direction = "add" | "deduct";

type AdminCreditAdjustmentResponse = {
  data: {
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

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error: sessionError } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;

      if (sessionError || !accessToken) {
        setError("Please sign in again before adjusting credits.");
        return;
      }

      const res = await dmitFetch<AdminCreditAdjustmentResponse>(
        "/admin/credits/adjust",
        {
          method: "POST",
          accessToken,
          json: {
            user_id: userId,
            amount: parsedAmount,
            direction,
            reason,
          },
        }
      );

      setAmount("");
      setReason("");
      setMessage(`Applied. New balance: ${res.data.balance_after} credits.`);
      startTransition(() => {
        router.refresh();
      });
    } catch (err) {
      if (err instanceof DmitApiError) {
        setError(err.message);
        return;
      }
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
              Reason
            </Label>
            <Input
              id={`reason-${userId}`}
              value={reason}
              maxLength={200}
              onChange={(event) => setReason(event.target.value)}
              placeholder="admin_adjustment"
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
