"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { AdminLedgerMiniTable } from "@/components/admin/admin-ledger-mini-table";
import type { AdminUsageLogRow } from "@/components/admin/admin-usage-logs-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { AdminCreditLedgerEntry } from "@/app/admin/credits/admin-credits-client";
import type { AdminUserRow } from "@/components/admin/admin-users-panel";
import {
  fetchAdminApi,
  type AdminApiKeyRow,
} from "@/lib/admin/client";
import { adminCreditsAdjustHref } from "@/lib/admin/user-links";
import {
  formatCredits,
  formatDateTime,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

type UserDetailData = {
  apiKeys: AdminApiKeyRow[];
  usage: AdminUsageLogRow[];
  ledger: AdminCreditLedgerEntry[];
};

export function AdminUserDetailPanel({ user }: { user: AdminUserRow }) {
  const { t } = useI18n();
  const email = user.email ?? "";
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState<string[]>([]);
  const [detail, setDetail] = useState<UserDetailData>({
    apiKeys: [],
    usage: [],
    ledger: [],
  });

  useEffect(() => {
    let cancelled = false;

    async function loadDetail() {
      setLoading(true);
      setLoadErrors([]);
      const errors: string[] = [];
      const next: UserDetailData = {
        apiKeys: [],
        usage: [],
        ledger: [],
      };

      const [apiKeysResult, usageResult, ledgerResult] = await Promise.allSettled([
        fetchAdminApi<{ data?: AdminApiKeyRow[] }>("/admin/api-keys"),
        fetchAdminApi<{ data?: AdminUsageLogRow[] }>("/admin/usage"),
        email.trim()
          ? fetchAdminApi<{
              data?: {
                ledger?: AdminCreditLedgerEntry[];
              };
            }>(
              `/admin/credits?${new URLSearchParams({
                email: email.trim(),
                limit: "10",
              }).toString()}`
            )
          : Promise.resolve(null),
      ]);

      if (cancelled) return;

      if (apiKeysResult.status === "fulfilled") {
        const rows = Array.isArray(apiKeysResult.value.data)
          ? apiKeysResult.value.data
          : [];
        next.apiKeys = rows.filter((row) => row.user_id === user.id);
      } else {
        errors.push(t("admin.users.detailApiKeysFailed"));
      }

      if (usageResult.status === "fulfilled") {
        const rows = Array.isArray(usageResult.value.data)
          ? usageResult.value.data
          : [];
        const normalizedEmail = email.trim().toLowerCase();
        next.usage = rows
          .filter((row) => {
            if (!normalizedEmail) return row.email == null;
            return (row.email ?? "").toLowerCase() === normalizedEmail;
          })
          .slice(0, 5);
      } else {
        errors.push(t("admin.users.detailUsageFailed"));
      }

      if (ledgerResult.status === "fulfilled" && ledgerResult.value) {
        next.ledger = Array.isArray(ledgerResult.value.data?.ledger)
          ? ledgerResult.value.data.ledger.slice(0, 5)
          : [];
      } else if (email.trim()) {
        errors.push(t("admin.users.detailLedgerFailed"));
      }

      setDetail(next);
      setLoadErrors(errors);
      setLoading(false);
    }

    void loadDetail();

    return () => {
      cancelled = true;
    };
  }, [email, t, user.id]);

  const ordersHref = useMemo(() => {
    if (!email.trim()) return "/admin/credit-orders";
    return `/admin/credit-orders?email=${encodeURIComponent(email.trim())}`;
  }, [email]);

  async function copyUserId() {
    try {
      await navigator.clipboard.writeText(user.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable; ignore.
    }
  }

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{t("admin.users.userDetailTitle")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{email || "—"}</p>
          <p className="mt-1 font-mono text-xs text-muted-foreground" title={user.id}>
            {t("admin.users.userId")}: {user.id}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void copyUserId()}>
            {copied ? t("admin.users.userIdCopied") : t("admin.users.copyUserId")}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link
              href={adminCreditsAdjustHref({
                userId: user.id,
                email: user.email,
                direction: "add",
              })}
            >
              {t("admin.users.addCredits")}
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link
              href={adminCreditsAdjustHref({
                userId: user.id,
                email: user.email,
                direction: "deduct",
              })}
            >
              {t("admin.users.deductCredits")}
            </Link>
          </Button>
        </div>
      </div>

      {loadErrors.length > 0 ? (
        <div className="mb-4 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-muted-foreground">
          {loadErrors.join(" · ")}
        </div>
      ) : null}

      <div className="space-y-6">
        <DetailSection title={t("admin.users.detailBasicInfo")}>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailItem label={t("admin.users.userId")} value={user.id} mono />
            <DetailItem label={t("admin.users.email")} value={email || "—"} />
            <DetailItem
              label={t("admin.users.totalCreditsPurchased")}
              value={formatCredits(user.total_credits_purchased)}
              mono
            />
            <DetailItem
              label={t("admin.users.createdAt")}
              value={formatDateTime(user.created_at)}
            />
            <DetailItem
              label={t("admin.users.updatedAt")}
              value={formatDateTime(user.updated_at)}
            />
            <DetailItem
              label={t("admin.users.lastUsedAt")}
              value={formatDateTime(user.last_used_at)}
            />
            <DetailItem
              label={t("admin.users.apiKeysCount")}
              value={String(user.key_count ?? 0)}
              mono
            />
          </dl>
        </DetailSection>

        <DetailSection title={t("admin.users.detailCurrentBalance")}>
          <p className="font-mono text-2xl font-semibold">
            {formatCredits(user.credits_balance)}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("admin.users.totalCreditsUsed")}:{" "}
            <span className="font-medium text-foreground">
              {formatCredits(user.total_credits_used)}
            </span>
          </p>
        </DetailSection>

        <DetailSection title={t("admin.users.detailApiKeys")}>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("admin.users.detailLoading")}</p>
          ) : detail.apiKeys.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">{t("admin.users.detailKeyPrefix")}</th>
                    <th className="py-2 pr-4 font-medium">{t("admin.users.detailKeyStatus")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.apiKeys.map((key) => (
                    <tr key={key.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-mono text-xs">{key.prefix}</td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant={key.status === "active" ? "success" : "destructive"}
                        >
                          {key.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("admin.users.detailNoApiKeys")}</p>
          )}
          <div className="mt-2">
            <Link
              href="/admin/api-keys"
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              {t("admin.users.detailViewAllKeys")}
            </Link>
          </div>
        </DetailSection>

        <DetailSection title={t("admin.users.detailRecentUsage")}>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("admin.users.detailLoading")}</p>
          ) : detail.usage.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">{t("admin.usage.colModel")}</th>
                    <th className="py-2 pr-4 font-medium">{t("admin.usage.colStatus")}</th>
                    <th className="py-2 pr-4 text-right font-medium">
                      {t("admin.usage.colCredits")}
                    </th>
                    <th className="py-2 pr-4 font-medium">{t("admin.usage.colCreated")}</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.usage.map((row, index) => (
                    <tr
                      key={row.id ?? row.request_id ?? `${row.created_at}-${index}`}
                      className="border-b last:border-0"
                    >
                      <td className="py-2 pr-4 font-mono text-xs">{row.model ?? "—"}</td>
                      <td className="py-2 pr-4">
                        <UsageStatusBadge status={row.status} />
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">
                        {formatCredits(row.credits_charged ?? 0)}
                      </td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {formatDateTime(row.created_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("admin.users.detailNoUsage")}</p>
          )}
          {email ? (
            <div className="mt-2">
              <Link
                href={`/admin/usage?email=${encodeURIComponent(email)}`}
                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                {t("admin.users.viewRecentUsage")}
              </Link>
            </div>
          ) : null}
        </DetailSection>

        <DetailSection title={t("admin.users.detailRecentLedger")}>
          {loading ? (
            <p className="text-sm text-muted-foreground">{t("admin.users.detailLoading")}</p>
          ) : email ? (
            <>
              <AdminLedgerMiniTable
                entries={detail.ledger}
                emptyLabel={t("admin.users.detailNoLedger")}
              />
              <div className="mt-2">
                <Link
                  href={`/admin/credits?email=${encodeURIComponent(email)}`}
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  {t("admin.users.viewRecentLedger")}
                </Link>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("admin.users.detailNoEmailForLedger")}</p>
          )}
        </DetailSection>

        <DetailSection title={t("admin.users.detailRecentOrders")}>
          <p className="text-sm text-muted-foreground">
            {t("admin.users.detailOrdersHint")}
          </p>
          <div className="mt-2">
            <Button variant="outline" size="sm" asChild>
              <Link href={ordersHref}>{t("admin.users.detailViewOrders")}</Link>
            </Button>
          </div>
        </DetailSection>
      </div>
    </div>
  );
}

function UsageStatusBadge({ status }: { status: string | null | undefined }) {
  const { t } = useI18n();
  if (!status) return <Badge variant="outline">{t("admin.common.unknown")}</Badge>;
  const normalized = status.toLowerCase();
  if (["succeeded", "success", "ok"].includes(normalized)) {
    return <Badge variant="success">{status}</Badge>;
  }
  if (["pending", "in_progress", "queued"].includes(normalized)) {
    return <Badge variant="warning">{status}</Badge>;
  }
  return <Badge variant="destructive">{status}</Badge>;
}

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

function DetailItem({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className={`mt-1 break-all text-sm ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
