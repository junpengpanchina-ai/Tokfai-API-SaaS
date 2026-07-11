"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AdminApiError,
  adjustAdminCredits,
  fetchAdminApi,
  type AdminApiKeyRow,
  type AdminCreditsAdjustSuccess,
} from "@/lib/admin/client";
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

const DEFAULT_AMOUNT = "300000";
const DEFAULT_REASON = "pre-demo credits top-up";

function buildIdempotencyKey(userId: string): string {
  return `admin-credit-adjust-${userId}-${Date.now()}`;
}

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

export function CreditsAdjustClient() {
  const { t } = useI18n();

  const [userId, setUserId] = useState("");
  const [amount, setAmount] = useState(DEFAULT_AMOUNT);
  const [direction, setDirection] = useState<AdjustDirection>("add");
  const [reason, setReason] = useState(DEFAULT_REASON);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<AdminCreditsAdjustSuccess | null>(
    null
  );
  const [error, setError] = useState<AdjustErrorView | null>(null);

  const [keyPrefix, setKeyPrefix] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<AdjustErrorView | null>(null);
  const [matches, setMatches] = useState<ApiKeyMatch[] | null>(null);

  async function handleAdjust(event: FormEvent<HTMLFormElement>) {
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
          user_id: trimmedUserId,
          amount: parsedAmount,
          direction,
          reason: trimmedReason,
        },
        buildIdempotencyKey(trimmedUserId)
      );
      setSuccess(result);
    } catch (err) {
      if (err instanceof AdminApiError) {
        setError({
          status: err.status,
          code: err.code ?? "unknown_error",
          message: err.message,
          request_id: err.requestId,
        });
      } else if (err instanceof Error) {
        setError({
          status: null,
          code: "unknown_error",
          message: err.message,
          request_id: null,
        });
      } else {
        setError({
          status: null,
          code: "unknown_error",
          message: t("admin.adjust.failed"),
          request_id: null,
        });
      }
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
        message: "Enter at least 12 characters of the API key prefix (e.g. sk-tokfai_…).",
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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          Credits adjust
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Minimal demo tool — POST /admin/credits/adjust via DMIT.
        </p>
      </div>

      <section className="space-y-4 rounded-lg border bg-background p-4">
        <div>
          <h2 className="text-sm font-semibold">{t("admin.adjust.title")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("admin.adjust.subtitle")}
          </p>
        </div>

        <form className="grid gap-4" onSubmit={handleAdjust}>
          <div className="space-y-2">
            <Label htmlFor="credits-adjust-user-id">
              {t("admin.adjust.userId")}
            </Label>
            <Input
              id="credits-adjust-user-id"
              value={userId}
              disabled={submitting}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="uuid"
              className="font-mono text-xs"
              required
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="credits-adjust-amount">
                {t("admin.adjust.amount")}
              </Label>
              <Input
                id="credits-adjust-amount"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={amount}
                disabled={submitting}
                onChange={(event) => setAmount(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="credits-adjust-direction">
                {t("admin.adjust.direction")}
              </Label>
              <select
                id="credits-adjust-direction"
                value={direction}
                disabled={submitting}
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
          </div>

          <div className="space-y-2">
            <Label htmlFor="credits-adjust-reason">
              {t("admin.adjust.reason")}
            </Label>
            <Input
              id="credits-adjust-reason"
              value={reason}
              disabled={submitting}
              onChange={(event) => setReason(event.target.value)}
              maxLength={200}
              required
            />
          </div>

          <div>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting
                ? t("admin.adjust.submitting")
                : t("admin.adjust.submit")}
            </Button>
          </div>
        </form>

        {error ? (
          <div
            className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
            role="alert"
          >
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-destructive">
              {JSON.stringify(error, null, 2)}
            </pre>
          </div>
        ) : null}

        {success ? (
          <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm">
            <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-xs text-emerald-800 dark:text-emerald-300">
              {JSON.stringify(success, null, 2)}
            </pre>
          </div>
        ) : null}
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
              disabled={searching}
              onChange={(event) => setKeyPrefix(event.target.value)}
              placeholder="sk-tokfai_xxxxxxxxxxxx"
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Button type="submit" size="sm" variant="outline" disabled={searching}>
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
                    <tr key={`${row.user_id}-${row.prefix}`} className="border-b">
                      <td className="py-2 pr-3 align-top">
                        <button
                          type="button"
                          className="font-mono text-xs text-primary underline-offset-2 hover:underline"
                          onClick={() => setUserId(row.user_id)}
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
