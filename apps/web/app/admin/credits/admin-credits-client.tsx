"use client";

import { useRouter } from "next/navigation";
import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { AdminCreditsAccountPanel } from "@/components/admin/admin-credits-account-panel";
import { AdminRechargePlansPanel } from "@/components/admin/admin-recharge-plans-panel";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
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
import {
  AdminApiError,
  fetchAdminApi,
  fetchAdminUsers,
  type AdminUserSummary,
} from "@/lib/admin/client";
import { formatInt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

export type AdminUserProfile = AdminUserSummary;

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
  initialEmail,
  initialData,
  initialError,
  initialUsers,
}: {
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
  const [users, setUsers] = useState<AdminUserProfile[]>(initialUsers);
  const [isPending, startTransition] = useTransition();

  const overviewStats = useMemo<CreditsOverviewStats>(() => {
    const activeUsers = users.filter(
      (profile) => profile.credits_balance > 0
    ).length;

    return {
      totalPurchased: "—",
      totalDebited: "—",
      totalAdjusted: "—",
      activeUsers: formatInt(activeUsers),
    };
  }, [users]);

  const refreshSummary = useCallback(async () => {
    try {
      const nextUsers = await fetchAdminUsers();
      setUsers(nextUsers);
      router.refresh();
    } catch {
      // Summary refresh is best-effort; ledger refresh remains primary feedback.
    }
  }, [router]);

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
        const params = new URLSearchParams({
          email: trimmed,
          limit: "50",
        });
        const body = await fetchAdminApi<CreditsResponse>(
          `/admin/credits?${params.toString()}`
        );

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
          err instanceof AdminApiError && err.isSessionExpired
            ? t("admin.common.sessionExpired")
            : err instanceof Error
              ? err.message
              : "Failed to load credits data."
        );
      } finally {
        setLoading(false);
      }
    },
    [router, t]
  );

  useEffect(() => {
    setEmail(initialEmail);
    setData(initialData);
    setError(initialError);
    setUsers(initialUsers);
  }, [initialEmail, initialData, initialError, initialUsers]);

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

      <AdminRechargePlansPanel />

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
        <AdminCreditsAccountPanel
          data={data}
          profileEmail={profileEmail}
          isBusy={isBusy}
          loading={loading}
          onRefresh={() => void loadCredits(data.profile.email ?? email)}
          onCreditsAdjusted={() => {
            void refreshSummary();
          }}
        />
      ) : null}
    </>
  );
}
