"use client";

import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  formatCredits,
  formatDateTime,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { AdminUserRow } from "@/components/admin/admin-users-panel";

export function AdminUserDetailPanel({ user }: { user: AdminUserRow }) {
  const { t } = useI18n();
  const email = user.email ?? "";
  const [copied, setCopied] = useState(false);

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
              href={`/admin/credits-adjust?user_id=${encodeURIComponent(user.id)}&direction=add`}
            >
              {t("admin.users.addCredits")}
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link
              href={`/admin/credits-adjust?user_id=${encodeURIComponent(user.id)}&direction=deduct`}
            >
              {t("admin.users.deductCredits")}
            </Link>
          </Button>
        </div>
      </div>

      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <DetailItem label={t("admin.users.userId")} value={user.id} mono />
        <DetailItem label={t("admin.users.email")} value={email || "—"} />
        <DetailItem
          label={t("admin.users.creditsBalance")}
          value={formatCredits(user.credits_balance)}
          mono
        />
        <DetailItem
          label={t("admin.users.totalCreditsPurchased")}
          value={formatCredits(user.total_credits_purchased)}
          mono
        />
        <DetailItem
          label={t("admin.users.totalCreditsUsed")}
          value={formatCredits(user.total_credits_used)}
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
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {email ? (
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/usage?email=${encodeURIComponent(email)}`}>
                {t("admin.users.viewRecentUsage")}
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href={`/admin/credits?email=${encodeURIComponent(email)}`}>
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
      <dd className={`mt-1 break-all text-sm ${mono ? "font-mono text-xs" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
