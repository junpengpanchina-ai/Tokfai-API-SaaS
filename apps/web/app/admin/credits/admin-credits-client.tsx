"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useCallback, useEffect, useState, useTransition } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getDmitBaseUrl } from "@/lib/dmit/client";
import {
  formatCredits,
  formatCreditsPrecise,
  formatDateTime,
} from "@/lib/format";

export type AdminCreditsProfile = {
  id: string;
  email: string | null;
  credits_balance: number;
  total_credits_used: number;
  updated_at: string | null;
};

export type AdminCreditLedgerEntry = {
  id: string;
  created_at: string;
  type: string;
  amount: number;
  balance_after: number;
  reason: string | null;
  reference_id: string | null;
};

export type AdminCreditsData = {
  profile: AdminCreditsProfile;
  ledger: AdminCreditLedgerEntry[];
};

type CreditsResponse = {
  data?: AdminCreditsData;
};

type Direction = "add" | "deduct";

type AdminCreditAdjustmentResponse = {
  ok?: boolean;
  balance_after?: number;
  credits?: number;
  error?: string;
};

export function AdminCreditsClient({
  accessToken,
  initialEmail,
  initialData,
  initialError,
}: {
  accessToken: string;
  initialEmail: string;
  initialData: AdminCreditsData | null;
  initialError: string | null;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [data, setData] = useState<AdminCreditsData | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<Direction>("add");
  const [reason, setReason] = useState("");
  const [adjustMessage, setAdjustMessage] = useState<string | null>(null);
  const [adjustError, setAdjustError] = useState<string | null>(null);
  const [isAdjusting, setIsAdjusting] = useState(false);

  const loadCredits = useCallback(
    async (searchEmail: string) => {
      const trimmed = searchEmail.trim();
      if (!trimmed) {
        setError("Enter an email address to search.");
        return;
      }

      setLoading(true);
      setError(null);
      setAdjustMessage(null);
      setAdjustError(null);

      try {
        const url = new URL(`${getDmitBaseUrl()}/admin/credits`);
        url.searchParams.set("email", trimmed);
        url.searchParams.set("limit", "50");

        const response = await fetch(url.toString(), {
          method: "GET",
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        });
        const body = (await parseJson(response)) as CreditsResponse & {
          error?: unknown;
        };

        if (!response.ok) {
          throw new Error(errorMessageFromBody(body, response.status));
        }

        const nextData = body.data ?? null;
        setData(nextData);
        startTransition(() => {
          router.replace(
            `/admin/credits?email=${encodeURIComponent(trimmed)}`,
            { scroll: false }
          );
        });
      } catch (err) {
        setData(null);
        setError(
          err instanceof Error ? err.message : "Failed to load credits data."
        );
      } finally {
        setLoading(false);
      }
    },
    [accessToken, router]
  );

  useEffect(() => {
    setEmail(initialEmail);
    setData(initialData);
    setError(initialError);
  }, [initialEmail, initialData, initialError]);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void loadCredits(email);
  }

  async function handleAdjust(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAdjustMessage(null);
    setAdjustError(null);

    if (!data?.profile.id) {
      setAdjustError("Search for a user before adjusting credits.");
      return;
    }

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setAdjustError("Enter a credits amount greater than 0.");
      return;
    }

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      setAdjustError("Reason is required.");
      return;
    }

    setIsAdjusting(true);
    try {
      const response = await fetch(`${getDmitBaseUrl()}/admin/credits/adjust`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: data.profile.id,
          amount: parsedAmount,
          direction,
          reason: trimmedReason,
        }),
      });
      const body = (await parseJson(response)) as AdminCreditAdjustmentResponse;

      if (!response.ok) {
        throw new Error(errorMessageFromBody(body, response.status));
      }

      setAmount("");
      setReason("");
      const balanceAfter = body.balance_after ?? body.credits;
      setAdjustMessage(
        balanceAfter == null
          ? "Adjustment applied."
          : `Adjustment applied. New balance: ${formatCreditsPrecise(balanceAfter)} credits.`
      );
      await loadCredits(data.profile.email ?? email);
    } catch (err) {
      setAdjustError(
        err instanceof Error ? err.message : "Credit adjustment failed."
      );
    } finally {
      setIsAdjusting(false);
    }
  }

  const isBusy = loading || isPending || isAdjusting;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Admin tools</Badge>
          <Link
            href="/admin"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to admin overview
          </Link>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          Credits management
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Look up a user by email, review their balance and ledger, and apply
          manual adjustments through DMIT.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Search by email</CardTitle>
          <CardDescription>
            Loads profile balances and the 50 most recent ledger entries.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" onSubmit={handleSearch}>
            <div className="min-w-[16rem] flex-1">
              <Label htmlFor="admin-credits-email">Email</Label>
              <Input
                id="admin-credits-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="user@example.com"
                disabled={isBusy}
                required
              />
            </div>
            <Button type="submit" disabled={isBusy}>
              {loading ? "Searching…" : "Search"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base">Could not load credits</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          {email.trim() ? (
            <CardContent>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => void loadCredits(email)}
              >
                Retry
              </Button>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      {data ? (
        <>
          <Card>
            <CardHeader>
              <CardDescription>Current balance</CardDescription>
              <CardTitle className="text-4xl">
                {formatCredits(data.profile.credits_balance)}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-muted-foreground">
              <div>
                Email:{" "}
                <span className="font-medium text-foreground">
                  {data.profile.email ?? "—"}
                </span>
              </div>
              <div>
                Total used:{" "}
                <span className="font-medium text-foreground">
                  {formatCredits(data.profile.total_credits_used)}
                </span>
              </div>
              <div>
                User ID:{" "}
                <span className="font-mono text-xs text-foreground">
                  {data.profile.id}
                </span>
              </div>
              <div>
                Last updated:{" "}
                <span className="font-medium text-foreground">
                  {formatDateTime(data.profile.updated_at)}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Adjust credits</CardTitle>
              <CardDescription>
                Amount must be greater than 0. Deductions are stored as negative
                ledger entries. Each adjustment writes to credit_ledger.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={handleAdjust}>
                <div className="grid gap-3 md:grid-cols-[8rem_8rem_1fr_auto] md:items-end">
                  <div>
                    <Label htmlFor="admin-adjust-amount">Credits</Label>
                    <Input
                      id="admin-adjust-amount"
                      min="0"
                      step="0.000001"
                      inputMode="decimal"
                      value={amount}
                      onChange={(event) => setAmount(event.target.value)}
                      placeholder="100"
                      disabled={isBusy}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="admin-adjust-direction">Action</Label>
                    <select
                      id="admin-adjust-direction"
                      value={direction}
                      onChange={(event) =>
                        setDirection(event.target.value as Direction)
                      }
                      disabled={isBusy}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <option value="add">add</option>
                      <option value="deduct">deduct</option>
                    </select>
                  </div>
                  <div>
                    <Label htmlFor="admin-adjust-reason">Reason (required)</Label>
                    <Input
                      id="admin-adjust-reason"
                      value={reason}
                      maxLength={200}
                      required
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="Manual top-up for support ticket"
                      disabled={isBusy}
                    />
                  </div>
                  <Button type="submit" disabled={isBusy}>
                    {isAdjusting ? "Applying…" : "Apply"}
                  </Button>
                </div>
                {adjustMessage ? (
                  <p className="text-sm text-emerald-600">{adjustMessage}</p>
                ) : null}
                {adjustError ? (
                  <p className="text-sm text-destructive">{adjustError}</p>
                ) : null}
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>Recent ledger</CardTitle>
                <CardDescription>
                  Last {data.ledger.length} entries for this user.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => void loadCredits(data.profile.email ?? email)}
              >
                {loading ? "Refreshing…" : "Refresh"}
              </Button>
            </CardHeader>
            <CardContent>
              {data.ledger.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">Type</th>
                        <th className="py-2 pr-4 text-right font-medium">
                          Amount
                        </th>
                        <th className="py-2 pr-4 text-right font-medium">
                          Balance after
                        </th>
                        <th className="py-2 pr-4 font-medium">Reason</th>
                        <th className="py-2 pr-4 font-medium">Reference</th>
                        <th className="py-2 pr-4 font-medium">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ledger.map((entry) => (
                        <tr key={entry.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">
                            <TypeBadge type={entry.type} />
                          </td>
                          <td className="py-2 pr-4 text-right font-mono text-xs">
                            <AmountCell amount={entry.amount} />
                          </td>
                          <td className="py-2 pr-4 text-right font-mono text-xs">
                            {formatCredits(entry.balance_after)}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {displayReason(entry.reason)}
                          </td>
                          <td
                            className="max-w-[12rem] truncate py-2 pr-4 font-mono text-xs text-muted-foreground"
                            title={entry.reference_id ?? undefined}
                          >
                            {entry.reference_id ?? "—"}
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
                <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
                  No ledger entries for this user.
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function AmountCell({ amount }: { amount: number | null }) {
  if (amount == null) return <span>—</span>;
  const isPositive = amount >= 0;
  return (
    <span
      className={
        isPositive
          ? "inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
          : "inline-flex items-center gap-1 text-destructive"
      }
    >
      {isPositive ? (
        <ArrowUpRight className="h-3 w-3" />
      ) : (
        <ArrowDownRight className="h-3 w-3" />
      )}
      {formatCredits(Math.abs(amount))}
    </span>
  );
}

function TypeBadge({ type }: { type: string | null | undefined }) {
  if (!type) return <Badge variant="outline">unknown</Badge>;
  const t = type.toLowerCase();
  if (t === "purchase" || t === "topup" || t === "grant" || t === "refund") {
    return <Badge variant="success">{type}</Badge>;
  }
  if (t === "debit") {
    return <Badge variant="destructive">{type}</Badge>;
  }
  if (t === "adjustment") {
    return <Badge variant="warning">{type}</Badge>;
  }
  return <Badge variant="outline">{type}</Badge>;
}

function displayReason(reason: string | null | undefined) {
  if (!reason) return "—";
  if (reason === "stripe_checkout_completed") return "Stripe top-up";
  if (reason === "Chat completion usage") return "API usage debit";
  if (reason === "admin_adjustment") return "Admin adjustment";
  if (reason === "reverse_duplicate_stripe_topup_ledger_only") {
    return "System correction";
  }
  return reason;
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
    if (typeof maybeError === "string") {
      if (maybeError === "user_not_found") {
        return "No profile found for that email.";
      }
      if (maybeError === "missing_email") {
        return "Email is required.";
      }
      if (maybeError === "missing_reason") {
        return "Reason is required.";
      }
      return maybeError;
    }
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
