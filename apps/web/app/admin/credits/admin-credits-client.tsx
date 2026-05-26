"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
} from "lucide-react";

import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { AdminRechargePlansPlaceholder } from "@/components/admin/admin-recharge-plans-placeholder";
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
import { formatCredits, formatDateTime, formatInt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";

export type AdminUserProfile = {
  id: string;
  email: string | null;
  credits_balance: number;
  total_credits_used: number;
  updated_at: string | null;
};

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

type CreditsOverviewStats = {
  totalPurchased: string;
  totalDebited: string;
  totalAdjusted: string;
  activeUsers: string;
};

export function AdminCreditsClient({
  accessToken,
  initialEmail,
  initialData,
  initialError,
  initialUsers,
}: {
  accessToken: string;
  initialEmail: string;
  initialData: AdminCreditsData | null;
  initialError: string | null;
  initialUsers: AdminUserProfile[];
}) {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState(initialEmail);
  const [data, setData] = useState<AdminCreditsData | null>(initialData);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const overviewStats = useMemo<CreditsOverviewStats>(() => {
    const activeUsers = initialUsers.filter(
      (profile) => profile.credits_balance > 0
    ).length;

    return {
      totalPurchased: "—",
      totalDebited: "—",
      totalAdjusted: "—",
      activeUsers: formatInt(activeUsers),
    };
  }, [initialUsers]);

  const loadCredits = useCallback(
    async (searchEmail: string) => {
      const trimmed = searchEmail.trim();
      if (!trimmed) {
        setError(t("admin.credits.enterEmail"));
        return;
      }

      setLoading(true);
      setError(null);

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
    [accessToken, router, t]
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

  const isBusy = loading || isPending;
  const profileEmail = data?.profile.email ?? email;

  return (
    <>
      <div>
        <Badge variant="secondary">{t("admin.common.adminTools")}</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {t("admin.credits.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.credits.subtitle")}
        </p>
      </div>

      <AdminRechargePlansPlaceholder />

      <Card className="border-muted bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("admin.credits.siteWideLedger")}</CardTitle>
          <CardDescription>{t("admin.credits.siteWideLedgerDesc")}</CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard
          label={t("admin.credits.totalPurchased")}
          value={overviewStats.totalPurchased}
        />
        <AdminStatCard
          label={t("admin.credits.totalDebited")}
          value={overviewStats.totalDebited}
        />
        <AdminStatCard
          label={t("admin.credits.totalAdjusted")}
          value={overviewStats.totalAdjusted}
        />
        <AdminStatCard
          label={t("admin.credits.activeUsersWithCredits")}
          value={overviewStats.activeUsers}
        />
      </div>

      {error && !data ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base">{t("admin.credits.couldNotLoad")}</CardTitle>
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
                {t("admin.credits.retry")}
              </Button>
            </CardContent>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.credits.searchByEmail")}</CardTitle>
          <CardDescription>{t("admin.credits.searchByEmailDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" onSubmit={handleSearch}>
            <div className="min-w-[16rem] flex-1">
              <Label htmlFor="admin-credits-email">{t("admin.credits.email")}</Label>
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
              {loading ? t("admin.credits.searching") : t("admin.credits.search")}
            </Button>
          </form>
        </CardContent>
      </Card>

      {data ? (
        <>
          <Card>
            <CardHeader>
              <CardDescription>{t("admin.credits.currentBalance")}</CardDescription>
              <CardTitle className="text-4xl">
                {formatCredits(data.profile.credits_balance)}
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm text-muted-foreground">
              <div>
                {t("admin.credits.email")}:{" "}
                <span className="font-medium text-foreground">
                  {data.profile.email ?? "—"}
                </span>
              </div>
              <div>
                {t("admin.credits.totalUsed")}:{" "}
                <span className="font-medium text-foreground">
                  {formatCredits(data.profile.total_credits_used)}
                </span>
              </div>
              <div>
                {t("admin.credits.lastUpdated")}:{" "}
                <span className="font-medium text-foreground">
                  {formatDateTime(data.profile.updated_at)}
                </span>
              </div>
              <div>
                <Link
                  href={`/admin/usage`}
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  {t("admin.credits.viewUsageLogs")}
                </Link>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle>{t("admin.credits.ledgerEntries")}</CardTitle>
                <CardDescription>
                  {formatMessage(t("admin.credits.ledgerEntriesDesc"), {
                    email: profileEmail || "selected user",
                  })}
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isBusy}
                onClick={() => void loadCredits(data.profile.email ?? email)}
              >
                {loading ? t("admin.credits.refreshing") : t("admin.credits.refresh")}
              </Button>
            </CardHeader>
            <CardContent>
              {data.ledger.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                        <th className="py-2 pr-4 font-medium">{t("admin.credits.email")}</th>
                        <th className="py-2 pr-4 font-medium">{t("admin.credits.colType")}</th>
                        <th className="py-2 pr-4 text-right font-medium">
                          {t("admin.credits.colAmount")}
                        </th>
                        <th className="py-2 pr-4 text-right font-medium">
                          {t("admin.credits.colBalanceAfter")}
                        </th>
                        <th className="py-2 pr-4 font-medium">{t("admin.credits.colReason")}</th>
                        <th className="py-2 pr-4 font-medium">
                          {t("admin.credits.colReference")}
                        </th>
                        <th className="py-2 pr-4 font-medium">{t("admin.credits.colCreated")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.ledger.map((entry) => (
                        <tr key={entry.id} className="border-b last:border-0">
                          <td className="py-2 pr-4">{profileEmail ?? "—"}</td>
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
                            <LedgerReason reason={entry.reason} />
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
                  {t("admin.credits.noLedgerEntries")}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </>
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

function LedgerReason({ reason }: { reason: string | null | undefined }) {
  const { t } = useI18n();

  if (!reason) return <>—</>;
  if (reason === "stripe_checkout_completed") {
    return <>{t("admin.credits.reasonStripeTopUp")}</>;
  }
  if (reason === "Chat completion usage") {
    return <>{t("admin.credits.reasonChatUsage")}</>;
  }
  if (reason === "admin_adjustment") {
    return <>{t("admin.credits.reasonAdminAdjustment")}</>;
  }
  if (reason === "reverse_duplicate_stripe_topup_ledger_only") {
    return <>{t("admin.credits.reasonSystemFix")}</>;
  }
  return <>{reason}</>;
}

function TypeBadge({ type }: { type: string | null | undefined }) {
  const { t } = useI18n();
  if (!type) return <Badge variant="outline">{t("admin.common.unknown")}</Badge>;
  const normalized = type.toLowerCase();
  if (
    normalized === "purchase" ||
    normalized === "topup" ||
    normalized === "grant" ||
    normalized === "refund"
  ) {
    return <Badge variant="success">{type}</Badge>;
  }
  if (normalized === "debit") {
    return <Badge variant="destructive">{type}</Badge>;
  }
  if (normalized === "adjustment") {
    return <Badge variant="warning">{type}</Badge>;
  }
  return <Badge variant="outline">{type}</Badge>;
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
  return `Request failed (HTTP ${status}).`;
}
