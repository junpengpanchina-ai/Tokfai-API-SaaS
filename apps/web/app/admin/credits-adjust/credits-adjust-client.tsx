"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";

import { AdminLedgerMiniTable } from "@/components/admin/admin-ledger-mini-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatAdminAdjustError } from "@/lib/admin/adjust-errors";
import {
  AdminApiError,
  adjustAdminCredits,
  createAdminAdjustIdempotencyKey,
  fetchAdminApi,
  fetchAdminMe,
  fetchAdminUsers,
  type AdminApiKeyRow,
  type AdminCreditAdjustPurpose,
  type AdminCreditsAdjustSuccess,
} from "@/lib/admin/client";
import { formatCredits, formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

type AdjustDirection = "add" | "deduct";

type AdjustErrorView = {
  status: number | null;
  code: string;
  message: string;
  request_id: string | null;
};

type ApiKeyMatch = {
  user_id: string;
  email: string | null;
  created_at: string;
  prefix: string;
};

type LedgerEntry = {
  id: string;
  created_at: string;
  type: string;
  amount: number;
  balance_after: number;
  reason: string | null;
  reference_id: string | null;
};

type CreditsLookupData = {
  profile: {
    id: string;
    email: string | null;
    credits_balance: number;
  };
  ledger: LedgerEntry[];
};

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
    value: "correction",
    labelKey: "admin.adjust.purposeManualDeduct",
    direction: "deduct",
    defaultAmount: "1000",
    defaultReason: "correction",
  },
  {
    value: "offline_payment",
    labelKey: "admin.adjust.purposeOfflinePayment",
    direction: "add",
    defaultAmount: "100000",
    defaultReason: "offline_payment",
  },
];

function matchApiKeyPrefix(
  rows: AdminApiKeyRow[],
  query: string
): ApiKeyMatch[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  return rows
    .filter((row) => {
      const prefix = (row.prefix ?? "").toLowerCase();
      return prefix.startsWith(q) || prefix.includes(q);
    })
    .map((row) => ({
      user_id: row.user_id,
      email: row.owner_email,
      created_at: row.created_at,
      prefix: row.prefix,
    }));
}

function parsePositiveAmount(raw: string): number | null {
  const amount = Number(raw);
  if (!Number.isFinite(amount) || Number.isNaN(amount) || amount <= 0) {
    return null;
  }
  const decimals = (() => {
    if (Number.isInteger(amount)) return 0;
    const text = String(raw).trim();
    const part = text.includes(".") ? text.split(".")[1] ?? "" : "";
    return part.replace(/0+$/, "").length;
  })();
  if (decimals > 6) return null;
  return amount;
}

export function CreditsAdjustClient({
  initialUserId = "",
  initialEmail = "",
  initialDirection = "add",
}: {
  initialUserId?: string;
  initialEmail?: string;
  initialDirection?: AdjustDirection;
}) {
  const { t } = useI18n();

  const [userId, setUserId] = useState(initialUserId);
  const [amount, setAmount] = useState("10000");
  const [amountPreset, setAmountPreset] = useState<number | "custom">(10_000);
  const [direction, setDirection] = useState<AdjustDirection>(initialDirection);
  const [purpose, setPurpose] =
    useState<AdminCreditAdjustPurpose>("public_beta_invite");
  const [reason, setReason] = useState("public_beta_invite");
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actorEmail, setActorEmail] = useState<string | null>(null);
  const [success, setSuccess] = useState<AdminCreditsAdjustSuccess | null>(
    null
  );
  const [error, setError] = useState<AdjustErrorView | null>(null);

  const [keyPrefix, setKeyPrefix] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<AdjustErrorView | null>(null);
  const [matches, setMatches] = useState<ApiKeyMatch[] | null>(null);

  const [ledgerEmail, setLedgerEmail] = useState("");
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState<string | null>(null);
  const [creditsData, setCreditsData] = useState<CreditsLookupData | null>(
    null
  );

  useEffect(() => {
    setUserId(initialUserId);
    setDirection(initialDirection);
  }, [initialUserId, initialDirection]);

  useEffect(() => {
    let cancelled = false;
    void fetchAdminMe()
      .then((me) => {
        if (!cancelled) setActorEmail(me.email);
      })
      .catch(() => {
        if (!cancelled) setActorEmail(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadCreditsByEmail = useCallback(
    async (email: string) => {
      const trimmed = email.trim();
      if (!trimmed) {
        setLedgerError(t("admin.credits.enterEmail"));
        setCreditsData(null);
        return;
      }

      setLedgerLoading(true);
      setLedgerError(null);

      try {
        const params = new URLSearchParams({
          email: trimmed,
          limit: "50",
        });
        const body = await fetchAdminApi<{ data?: CreditsLookupData }>(
          `/admin/credits?${params.toString()}`
        );
        setCreditsData(body.data ?? null);
        if (!body.data) {
          setLedgerError(`No profile found for ${trimmed}.`);
        } else {
          setUserId(body.data.profile.id);
        }
      } catch (err) {
        setCreditsData(null);
        setLedgerError(
          err instanceof AdminApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to load credits data."
        );
      } finally {
        setLedgerLoading(false);
      }
    },
    [t]
  );

  useEffect(() => {
    const trimmedEmail = initialEmail.trim();
    if (!trimmedEmail) return;
    setLedgerEmail(trimmedEmail);
    void loadCreditsByEmail(trimmedEmail);
  }, [initialEmail, loadCreditsByEmail]);

  async function resolveEmailForUser(
    targetUserId: string
  ): Promise<string | null> {
    try {
      const users = await fetchAdminUsers();
      const match = users.find((user) => user.id === targetUserId);
      return match?.email ?? null;
    } catch {
      return null;
    }
  }

  function applyPurpose(next: AdminCreditAdjustPurpose) {
    const option = PURPOSE_OPTIONS.find((item) => item.value === next);
    if (!option) return;
    setPurpose(next);
    setDirection(option.direction);
    setAmount(option.defaultAmount);
    setAmountPreset(
      AMOUNT_PRESETS.includes(Number(option.defaultAmount) as never)
        ? (Number(option.defaultAmount) as (typeof AMOUNT_PRESETS)[number])
        : "custom"
    );
    setReason(option.defaultReason);
  }

  const parsedAmount = parsePositiveAmount(amount);
  const balanceBefore =
    creditsData && creditsData.profile.id === userId.trim()
      ? creditsData.profile.credits_balance
      : null;
  const balanceAfter =
    parsedAmount != null && balanceBefore != null
      ? direction === "add"
        ? balanceBefore + parsedAmount
        : balanceBefore - parsedAmount
      : null;

  const confirmSummary = useMemo(() => {
    const email = creditsData?.profile.email?.trim() || ledgerEmail.trim();
    return {
      userLabel: email || userId.trim() || "—",
      balanceBefore,
      balanceAfter,
      amount: parsedAmount,
    };
  }, [
    balanceAfter,
    balanceBefore,
    creditsData?.profile.email,
    ledgerEmail,
    parsedAmount,
    userId,
  ]);

  function openConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const trimmedUserId = userId.trim();
    if (!trimmedUserId) {
      setError({
        status: null,
        code: "missing_user_id",
        message: "user_id is required",
        request_id: null,
      });
      setSuccess(null);
      return;
    }

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
    if (submitting) return;
    const trimmedUserId = userId.trim();
    const trimmedReason = reason.trim();
    if (!trimmedUserId || parsedAmount == null || !trimmedReason) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await adjustAdminCredits(
        {
          user_id: trimmedUserId,
          amount: parsedAmount,
          direction,
          reason: trimmedReason,
          purpose,
        },
        createAdminAdjustIdempotencyKey(
          trimmedUserId,
          direction,
          parsedAmount
        )
      );
      setSuccess(result);
      setConfirmOpen(false);

      const email =
        ledgerEmail.trim() ||
        (await resolveEmailForUser(trimmedUserId)) ||
        "";
      if (email) {
        setLedgerEmail(email);
        await loadCreditsByEmail(email);
      }
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

  async function handleSearchKeys(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (searching) return;

    const trimmed = keyPrefix.trim();
    if (trimmed.length < 12) {
      setSearchError({
        status: null,
        code: "invalid_prefix",
        message:
          "Enter at least 12 characters of the API key prefix (e.g. sk-tokfai_…).",
        request_id: null,
      });
      setMatches(null);
      return;
    }

    setSearching(true);
    setSearchError(null);
    setMatches(null);

    try {
      const res = await fetchAdminApi<{ data?: AdminApiKeyRow[] }>(
        "/admin/api-keys"
      );
      const rows = Array.isArray(res.data) ? res.data : [];
      setMatches(matchApiKeyPrefix(rows, trimmed));
    } catch (err) {
      if (err instanceof AdminApiError) {
        setSearchError({
          status: err.status,
          code: err.code ?? "unknown_error",
          message: err.message,
          request_id: err.requestId,
        });
      } else if (err instanceof Error) {
        setSearchError({
          status: null,
          code: "unknown_error",
          message: err.message,
          request_id: null,
        });
      } else {
        setSearchError({
          status: null,
          code: "unknown_error",
          message: "API key search failed.",
          request_id: null,
        });
      }
    } finally {
      setSearching(false);
    }
  }

  function handleLedgerSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadCreditsByEmail(ledgerEmail);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("admin.adjust.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.adjust.subtitle")}
        </p>
      </div>

      <section className="space-y-4 rounded-lg border bg-background p-4">
        <div>
          <h2 className="text-sm font-semibold">
            {t("admin.credits.searchByEmail")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("admin.adjust.subtitle")}
          </p>
        </div>

        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={handleLedgerSearch}
        >
          <div className="min-w-[16rem] flex-1 space-y-2">
            <Label htmlFor="credits-adjust-primary-email">
              {t("admin.credits.email")}
            </Label>
            <Input
              id="credits-adjust-primary-email"
              type="email"
              value={ledgerEmail}
              onChange={(event) => setLedgerEmail(event.target.value)}
              placeholder="user@example.com"
              disabled={ledgerLoading}
              required
            />
          </div>
          <Button type="submit" size="sm" disabled={ledgerLoading}>
            {ledgerLoading
              ? t("admin.credits.searching")
              : t("admin.credits.search")}
          </Button>
        </form>

        {ledgerError ? (
          <div
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            role="alert"
          >
            {ledgerError}
          </div>
        ) : null}

        {creditsData ? (
          <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
            <p>
              {t("admin.adjust.confirmUser")}:{" "}
              <span className="font-medium">
                {creditsData.profile.email ?? "—"}
              </span>
            </p>
            <p className="mt-1">
              {t("admin.adjust.confirmBalance")}:{" "}
              <span className="font-mono font-medium">
                {formatCredits(creditsData.profile.credits_balance)}
              </span>
            </p>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              user_id: {creditsData.profile.id}
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {t("admin.adjust.balanceUnknown")}
          </p>
        )}

        <form className="grid gap-4" onSubmit={openConfirm}>
          <div className="space-y-2">
            <Label>{t("admin.adjust.purpose")}</Label>
            <div className="flex flex-wrap gap-2">
              {PURPOSE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  type="button"
                  size="sm"
                  variant={purpose === option.value ? "default" : "outline"}
                  disabled={submitting || !userId.trim()}
                  onClick={() => applyPurpose(option.value)}
                >
                  {t(option.labelKey)}
                </Button>
              ))}
            </div>
          </div>

          <input type="hidden" value={userId} readOnly />

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="credits-adjust-direction">
                {t("admin.adjust.direction")}
              </Label>
              <select
                id="credits-adjust-direction"
                value={direction}
                disabled={!userId.trim()}
                onChange={(event) =>
                  setDirection(event.target.value as AdjustDirection)
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <option value="add">{t("admin.adjust.directionAdd")}</option>
                <option value="deduct">
                  {t("admin.adjust.directionDeduct")}
                </option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="credits-adjust-amount">
                {t("admin.adjust.amount")}
              </Label>
              <Input
                id="credits-adjust-amount"
                type="number"
                min="0.000001"
                step="any"
                inputMode="decimal"
                value={amount}
                disabled={!userId.trim()}
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
                  disabled={submitting || !userId.trim()}
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
                disabled={submitting || !userId.trim()}
                onClick={() => setAmountPreset("custom")}
              >
                {t("admin.adjust.presetCustom")}
              </Button>
            </div>
          </div>

          {parsedAmount != null && parsedAmount > 300_000 ? (
            <div
              className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-sm text-amber-900 dark:text-amber-100"
              role="status"
            >
              {t("admin.adjust.largeAmountWarning")}
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="credits-adjust-reason">
              {t("admin.adjust.reason")}
            </Label>
            <Input
              id="credits-adjust-reason"
              value={reason}
              disabled={!userId.trim()}
              onChange={(event) => setReason(event.target.value)}
              maxLength={200}
              required
            />
          </div>

          <div>
            <Button
              type="submit"
              size="sm"
              disabled={submitting || !userId.trim()}
            >
              {submitting
                ? t("admin.adjust.submitting")
                : t("admin.adjust.submit")}
            </Button>
          </div>
        </form>

        {confirmOpen ? (
          <div
            className="rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-3 text-sm"
            role="dialog"
            aria-label={t("admin.adjust.confirmTitle")}
          >
            <h3 className="font-semibold">{t("admin.adjust.confirmTitle")}</h3>
            <dl className="mt-2 grid gap-1 text-sm">
              <div>
                <dt className="inline text-muted-foreground">
                  {t("admin.adjust.confirmUser")}:{" "}
                </dt>
                <dd className="inline">{confirmSummary.userLabel}</dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">
                  {t("admin.adjust.confirmBalance")}:{" "}
                </dt>
                <dd className="inline font-mono">
                  {confirmSummary.balanceBefore != null
                    ? formatCredits(confirmSummary.balanceBefore)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">
                  {t("admin.adjust.confirmOperation")}:{" "}
                </dt>
                <dd className="inline">
                  {direction === "add"
                    ? t("admin.adjust.directionAdd")
                    : t("admin.adjust.directionDeduct")}
                </dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">
                  {t("admin.adjust.confirmAmount")}:{" "}
                </dt>
                <dd className="inline font-mono">
                  {confirmSummary.amount != null
                    ? formatCredits(confirmSummary.amount)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">
                  {t("admin.adjust.confirmAfter")}:{" "}
                </dt>
                <dd className="inline font-mono">
                  {confirmSummary.balanceAfter != null
                    ? formatCredits(confirmSummary.balanceAfter)
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">
                  {t("admin.adjust.confirmReason")}:{" "}
                </dt>
                <dd className="inline">{reason.trim()}</dd>
              </div>
              <div>
                <dt className="inline text-muted-foreground">
                  {t("admin.adjust.confirmActor")}:{" "}
                </dt>
                <dd className="inline">{actorEmail ?? "—"}</dd>
              </div>
            </dl>
            {confirmSummary.amount != null && confirmSummary.amount > 300_000 ? (
              <p className="mt-2 rounded-md border border-amber-500/50 bg-amber-500/10 px-2 py-1 text-xs">
                {t("admin.adjust.largeAmountWarning")}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                disabled={submitting}
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
                disabled={submitting}
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
            <p className="font-medium text-destructive">{error.message}</p>
            <p className="mt-1 text-xs text-muted-foreground">{error.code}</p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">
                Technical details
              </summary>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap font-mono text-xs text-destructive">
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
            </details>
          </div>
        ) : null}

        {success ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-emerald-800 dark:text-emerald-300">
              {JSON.stringify(
                {
                  ok: true,
                  user_id: success.user_id,
                  direction: success.direction,
                  amount: success.amount,
                  delta: success.delta,
                  balance_before: success.balance_before,
                  balance_after: success.balance_after,
                  ledger_id: success.ledger_id ?? success.credit_ledger_id,
                  request_id: success.request_id,
                },
                null,
                2
              )}
            </pre>
          </div>
        ) : null}
      </section>

      <section className="space-y-4 rounded-lg border bg-background p-4">
        <div>
          <h2 className="text-sm font-semibold">
            {t("admin.credits.currentBalance")}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("admin.credits.searchByEmailDesc")}
          </p>
        </div>

        {creditsData ? (
          <div className="space-y-4">
            {creditsData.ledger.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">
                        {t("admin.credits.colType")}
                      </th>
                      <th className="py-2 pr-4 text-right font-medium">
                        {t("admin.credits.colAmount")}
                      </th>
                      <th className="py-2 pr-4 text-right font-medium">
                        {t("admin.credits.colBalanceAfter")}
                      </th>
                      <th className="py-2 pr-4 font-medium">
                        {t("admin.credits.colReason")}
                      </th>
                      <th className="py-2 pr-4 font-medium">
                        {t("admin.credits.colCreated")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {creditsData.ledger.map((entry) => (
                      <tr key={entry.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">{entry.type}</td>
                        <td className="py-2 pr-4 text-right font-mono text-xs">
                          {formatCredits(entry.amount)}
                        </td>
                        <td className="py-2 pr-4 text-right font-mono text-xs">
                          {formatCredits(entry.balance_after)}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {entry.reason ?? "—"}
                        </td>
                        <td className="py-2 pr-4 text-muted-foreground">
                          {formatDateTime(entry.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <AdminLedgerMiniTable
                entries={[]}
                emptyLabel={t("admin.credits.noLedgerEntries")}
              />
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("admin.adjust.balanceUnknown")}
          </p>
        )}
      </section>

      <section className="space-y-4 rounded-lg border bg-background p-4">
        <div>
          <h2 className="text-sm font-semibold">Search by API Key prefix</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Optional helper — match prefix from GET /admin/api-keys (no full
            secrets shown).
          </p>
        </div>

        <form className="grid gap-4" onSubmit={handleSearchKeys}>
          <div className="space-y-2">
            <Label htmlFor="credits-adjust-key-prefix">Key prefix</Label>
            <Input
              id="credits-adjust-key-prefix"
              value={keyPrefix}
              onChange={(event) => setKeyPrefix(event.target.value)}
              placeholder="sk-tokfai_xxxxxxxxxxxx"
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={searching}
            >
              {searching ? "Searching…" : "Search"}
            </Button>
          </div>
        </form>

        {searchError ? (
          <div
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
            role="alert"
          >
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-destructive">
              {JSON.stringify(searchError, null, 2)}
            </pre>
          </div>
        ) : null}

        {matches ? (
          matches.length === 0 ? (
            <p className="text-sm text-muted-foreground">No matching keys.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">user_id</th>
                    <th className="py-2 pr-3 font-medium">email</th>
                    <th className="py-2 pr-3 font-medium">prefix</th>
                    <th className="py-2 font-medium">created_at</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((row) => (
                    <tr
                      key={`${row.user_id}-${row.prefix}`}
                      className="border-b"
                    >
                      <td className="py-2 pr-3 align-top">
                        <button
                          type="button"
                          className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                          onClick={() => {
                            setUserId(row.user_id);
                            if (row.email) setLedgerEmail(row.email);
                          }}
                        >
                          {row.user_id}
                        </button>
                      </td>
                      <td className="py-2 pr-3 align-top text-xs">
                        {row.email ?? "—"}
                      </td>
                      <td className="py-2 pr-3 align-top font-mono text-xs">
                        {row.prefix}
                      </td>
                      <td className="py-2 align-top text-xs">
                        {row.created_at}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </section>
    </div>
  );
}
