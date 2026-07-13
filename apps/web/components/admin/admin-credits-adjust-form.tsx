"use client";

import { useMemo, useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAdminAdjustError } from "@/lib/admin/adjust-errors";
import {
  AdminApiError,
  adjustAdminCredits,
  createAdminAdjustIdempotencyKey,
  type AdminCreditAdjustPurpose,
  type AdminCreditsAdjustSuccess,
} from "@/lib/admin/client";
import { formatCredits } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

type AdjustDirection = "add" | "deduct";

const AMOUNT_PRESETS = [10_000, 100_000, 300_000, 1_000_000] as const;

const PURPOSE_OPTIONS: {
  value: AdminCreditAdjustPurpose;
  labelKey:
    | "admin.adjust.purposePublicBetaInvite"
    | "admin.adjust.purposeManualTopup"
    | "admin.adjust.purposeCustomerCompensation"
    | "admin.adjust.purposeManualDeduct"
    | "admin.adjust.purposeOfflinePayment";
  direction: AdjustDirection;
  defaultAmount: string;
  defaultReason: string;
}[] = [
  {
    value: "public_beta_invite",
    labelKey: "admin.adjust.purposePublicBetaInvite",
    direction: "add",
    defaultAmount: "300000",
    defaultReason: "public_beta_invite",
  },
  {
    value: "manual_topup",
    labelKey: "admin.adjust.purposeManualTopup",
    direction: "add",
    defaultAmount: "100000",
    defaultReason: "manual_topup",
  },
  {
    value: "customer_compensation",
    labelKey: "admin.adjust.purposeCustomerCompensation",
    direction: "add",
    defaultAmount: "10000",
    defaultReason: "customer_compensation",
  },
  {
    value: "manual_deduct",
    labelKey: "admin.adjust.purposeManualDeduct",
    direction: "deduct",
    defaultAmount: "1000",
    defaultReason: "manual_deduct",
  },
  {
    value: "offline_payment_topup",
    labelKey: "admin.adjust.purposeOfflinePayment",
    direction: "add",
    defaultAmount: "100000",
    defaultReason: "offline_payment_topup",
  },
];

function parsePositiveAmount(raw: string): number | null {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || Number.isNaN(amount) || amount <= 0) {
    return null;
  }
  const text = String(raw).trim();
  const decimals = text.includes(".")
    ? (text.split(".")[1] ?? "").replace(/0+$/, "").length
    : 0;
  if (decimals > 6) return null;
  return amount;
}

export function AdminCreditsAdjustForm({
  userId,
  userEmail,
  currentBalance,
  actorEmail,
  disabled = false,
  onSuccess,
}: {
  userId: string;
  userEmail?: string | null;
  currentBalance?: number | null;
  actorEmail?: string | null;
  disabled?: boolean;
  onSuccess?: (result: AdminCreditsAdjustSuccess) => void;
}) {
  const { t } = useI18n();
  const [purpose, setPurpose] =
    useState<AdminCreditAdjustPurpose>("manual_topup");
  const [direction, setDirection] = useState<AdjustDirection>("add");
  const [amount, setAmount] = useState("100000");
  const [amountPreset, setAmountPreset] = useState<number | "custom">(100_000);
  const [reason, setReason] = useState("manual_topup");
  const [confirmOpen, setConfirmOpen] = useState(false);
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

  function applyPurpose(next: AdminCreditAdjustPurpose) {
    const option = PURPOSE_OPTIONS.find((item) => item.value === next);
    if (!option) return;
    setPurpose(next);
    setDirection(option.direction);
    setAmount(option.defaultAmount);
    const n = Number(option.defaultAmount);
    setAmountPreset(
      AMOUNT_PRESETS.includes(n as (typeof AMOUNT_PRESETS)[number])
        ? (n as (typeof AMOUNT_PRESETS)[number])
        : "custom"
    );
    setReason(option.defaultReason);
  }

  const parsedAmount = parsePositiveAmount(amount);
  const balanceAfter = useMemo(() => {
    if (parsedAmount == null || currentBalance == null) return null;
    return direction === "add"
      ? currentBalance + parsedAmount
      : currentBalance - parsedAmount;
  }, [currentBalance, direction, parsedAmount]);

  function openConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || disabled) return;

    if (parsedAmount == null) {
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

    setError(null);
    setConfirmOpen(true);
  }

  async function submitAdjust() {
    if (submitting || disabled || parsedAmount == null) return;

    const trimmedReason = reason.trim();
    if (!trimmedReason) return;

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
          purpose,
        },
        createAdminAdjustIdempotencyKey(userId, direction, parsedAmount)
      );

      setSuccess(result);
      setConfirmOpen(false);
      onSuccess?.(result);
    } catch (err) {
      const formatted = formatAdminAdjustError(err, t);
      setError({
        status: err instanceof AdminApiError ? err.status : null,
        code: formatted.code,
        message: formatted.message,
        request_id: err instanceof AdminApiError ? err.requestId : null,
      });
      setConfirmOpen(false);
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

      <div className="space-y-2">
        <Label>{t("admin.adjust.purpose")}</Label>
        <div className="flex flex-wrap gap-2">
          {PURPOSE_OPTIONS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={purpose === option.value ? "default" : "outline"}
              disabled={isBusy}
              onClick={() => applyPurpose(option.value)}
            >
              {t(option.labelKey)}
            </Button>
          ))}
        </div>
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

      <form className="grid gap-4" onSubmit={openConfirm}>
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
              min="0.000001"
              step="any"
              inputMode="decimal"
              value={amount}
              disabled={isBusy}
              onChange={(event) => {
                setAmount(event.target.value);
                setAmountPreset("custom");
              }}
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>{t("admin.adjust.presets")}</Label>
          <div className="flex flex-wrap gap-2">
            {AMOUNT_PRESETS.map((preset) => (
              <Button
                key={preset}
                type="button"
                size="sm"
                variant={amountPreset === preset ? "default" : "outline"}
                disabled={isBusy}
                onClick={() => {
                  setAmount(String(preset));
                  setAmountPreset(preset);
                }}
              >
                +{preset.toLocaleString("en-US")}
              </Button>
            ))}
            <Button
              type="button"
              size="sm"
              variant={amountPreset === "custom" ? "default" : "outline"}
              disabled={isBusy}
              onClick={() => setAmountPreset("custom")}
            >
              {t("admin.adjust.presetCustom")}
            </Button>
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

        {confirmOpen ? (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-3 text-sm">
            <h4 className="font-semibold">{t("admin.adjust.confirmTitle")}</h4>
            <dl className="mt-2 grid gap-1">
              <div>
                {t("admin.adjust.confirmUser")}: {userEmail ?? userId}
              </div>
              <div>
                {t("admin.adjust.confirmBalance")}:{" "}
                {currentBalance != null ? formatCredits(currentBalance) : "—"}
              </div>
              <div>
                {t("admin.adjust.confirmOperation")}:{" "}
                {direction === "add"
                  ? t("admin.adjust.directionAdd")
                  : t("admin.adjust.directionDeduct")}
              </div>
              <div>
                {t("admin.adjust.confirmAmount")}:{" "}
                {parsedAmount != null ? formatCredits(parsedAmount) : "—"}
              </div>
              <div>
                {t("admin.adjust.confirmAfter")}:{" "}
                {balanceAfter != null ? formatCredits(balanceAfter) : "—"}
              </div>
              <div>
                {t("admin.adjust.confirmReason")}: {reason.trim()}
              </div>
              <div>
                {t("admin.adjust.confirmActor")}: {actorEmail ?? "—"}
              </div>
            </dl>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={isBusy}
                onClick={() => void submitAdjust()}
              >
                {submitting
                  ? t("admin.adjust.submitting")
                  : t("admin.adjust.confirmSubmit")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isBusy}
                onClick={() => setConfirmOpen(false)}
              >
                {t("admin.adjust.confirmCancel")}
              </Button>
            </div>
          </div>
        ) : null}

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
                  balance_before: success.balance_before,
                  balance_after: success.balance_after,
                  delta: success.delta,
                  ledger_id: success.ledger_id ?? success.credit_ledger_id,
                  request_id: success.request_id,
                },
                null,
                2
              )}
            </pre>
          </div>
        ) : null}

        {!confirmOpen ? (
          <div>
            <Button type="submit" size="sm" disabled={isBusy}>
              {submitting ? t("admin.adjust.submitting") : t("admin.adjust.submit")}
            </Button>
          </div>
        ) : null}
      </form>
    </div>
  );
}
