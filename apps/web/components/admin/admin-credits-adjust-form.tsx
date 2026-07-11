"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAdminAdjustError } from "@/lib/admin/adjust-errors";
import {
  AdminApiError,
  adjustAdminCredits,
  createAdminAdjustIdempotencyKey,
  type AdminCreditsAdjustSuccess,
} from "@/lib/admin/client";
import { useI18n } from "@/lib/i18n/i18n-provider";

type AdjustDirection = "add" | "deduct";

export function AdminCreditsAdjustForm({
  userId,
  userEmail,
  disabled = false,
  onSuccess,
}: {
  userId: string;
  userEmail?: string | null;
  disabled?: boolean;
  onSuccess?: (result: AdminCreditsAdjustSuccess) => void;
}) {
  const { t } = useI18n();
  const [direction, setDirection] = useState<AdjustDirection>("add");
  const [amount, setAmount] = useState("300000");
  const [reason, setReason] = useState("pre-demo credits top-up");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<{
    status: number | null;
    code: string;
    message: string;
    request_id: string | null;
  } | null>(null);
  const [success, setSuccess] = useState<AdminCreditsAdjustSuccess | null>(
    null
  );

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || disabled) return;

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError({
        status: null,
        code: "invalid_amount",
        message: t("admin.adjust.invalidAmount"),
        request_id: null,
      });
      setSuccess(null);
      return;
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setError({
        status: null,
        code: "missing_reason",
        message: t("admin.adjust.missingReason"),
        request_id: null,
      });
      setSuccess(null);
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await adjustAdminCredits(
        {
          user_id: userId,
          direction,
          amount: parsedAmount,
          reason: trimmedReason,
        },
        createAdminAdjustIdempotencyKey(userId, direction)
      );

      setSuccess(result);
      onSuccess?.(result);
    } catch (err) {
      const formatted = formatAdminAdjustError(err, t);
      setError({
        status: err instanceof AdminApiError ? err.status : null,
        code: formatted.code,
        message: formatted.message,
        request_id: err instanceof AdminApiError ? err.requestId : null,
      });
    } finally {
      setSubmitting(false);
    }
  }

  const isBusy = submitting || disabled;

  return (
    <div className="space-y-4 rounded-lg border bg-background p-4">
      <div>
        <h4 className="text-sm font-semibold">{t("admin.adjust.title")}</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          {t("admin.adjust.subtitle")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={direction === "add" ? "default" : "outline"}
          size="sm"
          disabled={isBusy}
          onClick={() => setDirection("add")}
        >
          {t("admin.adjust.addCredits")}
        </Button>
        <Button
          type="button"
          variant={direction === "deduct" ? "default" : "outline"}
          size="sm"
          disabled={isBusy}
          onClick={() => setDirection("deduct")}
        >
          {t("admin.adjust.deductCredits")}
        </Button>
      </div>

      <form className="grid gap-4" onSubmit={handleSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`admin-adjust-user-id-${userId}`}>
              {t("admin.adjust.userId")}
            </Label>
            <Input
              id={`admin-adjust-user-id-${userId}`}
              value={userId}
              readOnly
              disabled={isBusy}
              className="font-mono text-xs"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`admin-adjust-email-${userId}`}>
              {t("admin.adjust.email")}
            </Label>
            <Input
              id={`admin-adjust-email-${userId}`}
              value={userEmail ?? "—"}
              readOnly
              disabled={isBusy}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`admin-adjust-direction-${userId}`}>
              {t("admin.adjust.direction")}
            </Label>
            <select
              id={`admin-adjust-direction-${userId}`}
              value={direction}
              disabled={isBusy}
              onChange={(event) =>
                setDirection(event.target.value as AdjustDirection)
              }
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="add">{t("admin.adjust.directionAdd")}</option>
              <option value="deduct">{t("admin.adjust.directionDeduct")}</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`admin-adjust-amount-${userId}`}>
              {t("admin.adjust.amount")}
            </Label>
            <Input
              id={`admin-adjust-amount-${userId}`}
              type="number"
              min="1"
              step="1"
              inputMode="numeric"
              value={amount}
              disabled={isBusy}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="300000"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`admin-adjust-reason-${userId}`}>
            {t("admin.adjust.reason")}
          </Label>
          <Input
            id={`admin-adjust-reason-${userId}`}
            value={reason}
            disabled={isBusy}
            onChange={(event) => setReason(event.target.value)}
            placeholder={t("admin.adjust.reasonPlaceholder")}
            maxLength={200}
            required
          />
        </div>

        {error ? (
          <div
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
            role="alert"
          >
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-destructive">
              {JSON.stringify(
                {
                  status: error.status,
                  error: {
                    code: error.code,
                    message: error.message,
                  },
                  request_id: error.request_id,
                },
                null,
                2
              )}
            </pre>
          </div>
        ) : null}

        {success ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-emerald-800 dark:text-emerald-300">
              {JSON.stringify(
                {
                  balance_after: success.balance_after,
                  delta: success.delta,
                  reference_id: success.reference_id,
                  reason: success.reason,
                },
                null,
                2
              )}
            </pre>
          </div>
        ) : null}

        <div>
          <Button type="submit" size="sm" disabled={isBusy}>
            {submitting ? t("admin.adjust.submitting") : t("admin.adjust.submit")}
          </Button>
        </div>
      </form>
    </div>
  );
}
