"use client";

import Link from "next/link";

import { AdminCreditsAdjustForm } from "@/components/admin/admin-credits-adjust-form";
import { AdminDisabledWriteActions } from "@/components/admin/admin-disabled-write-actions";
import { Button } from "@/components/ui/button";
import {
  formatCredits,
  formatDateTime,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { AdminUserRow } from "@/components/admin/admin-users-panel";

export function AdminUserDetailPanel({
  user,
  onCreditsAdjusted,
}: {
  user: AdminUserRow;
  onCreditsAdjusted?: (userId: string, balanceAfter: number) => void;
}) {
  const { t } = useI18n();
  const email = user.email ?? "";

  return (
    <div className="rounded-lg border bg-muted/20 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">{t("admin.users.userDetailTitle")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{email || "—"}</p>
        </div>
        <AdminDisabledWriteActions
          actionKeys={["admin.users.revokeKey"]}
        />
      </div>

      <AdminCreditsAdjustForm
        userId={user.id}
        userEmail={user.email}
        onSuccess={(result) => {
          onCreditsAdjusted?.(user.id, result.balance_after);
        }}
      />

      <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DetailItem label={t("admin.users.email")} value={email || "—"} />
        <DetailItem
          label={t("admin.users.creditsBalance")}
          value={formatCredits(user.credits_balance)}
          mono
        />
        <DetailItem
          label={t("admin.users.lastActivity")}
          value={formatDateTime(user.updated_at)}
        />
        <DetailItem label={t("admin.users.apiKeysCount")} value="—" />
        <DetailItem label={t("admin.users.totalRequests")} value="—" />
        <DetailItem
          label={t("admin.users.totalCreditsUsed")}
          value={formatCredits(user.total_credits_used)}
          mono
        />
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {email ? (
          <>
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/admin/usage?email=${encodeURIComponent(email)}`}
              >
                {t("admin.users.viewRecentUsage")}
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link
                href={`/admin/credits?email=${encodeURIComponent(email)}`}
              >
                {t("admin.users.viewRecentLedger")}
              </Link>
            </Button>
          </>
        ) : null}
      </div>
    </div>
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
      <dd className={`mt-1 text-sm ${mono ? "font-mono" : ""}`}>{value}</dd>
    </div>
  );
}
