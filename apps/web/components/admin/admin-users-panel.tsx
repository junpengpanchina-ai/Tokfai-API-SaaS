"use client";

import Link from "next/link";
import { Fragment, useEffect, useState } from "react";

import { AdminDebugCard } from "@/components/admin/admin-debug-card";
import { AdminUserDetailPanel } from "@/components/admin/admin-user-detail-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AdminUserSummary } from "@/lib/admin/client";
import type { AdminDebug } from "@/lib/admin/server";
import {
  formatCredits,
  formatDateTime,
  formatInt,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";

export type AdminUserRow = AdminUserSummary;

export function AdminUsersPanel({
  users: initialUsers,
  debug,
}: {
  users: AdminUserRow[];
  debug: AdminDebug | null;
}) {
  const { t } = useI18n();
  const [users, setUsers] = useState(initialUsers);
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);

  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  function toggleUserDetails(userId: string) {
    setExpandedUserId((current) => (current === userId ? null : userId));
  }

  async function copyUserId(userId: string) {
    try {
      await navigator.clipboard.writeText(userId);
      setCopiedUserId(userId);
      window.setTimeout(() => {
        setCopiedUserId((current) => (current === userId ? null : current));
      }, 1500);
    } catch {
      // Clipboard may be unavailable; ignore.
    }
  }

  return (
    <>
      <div>
        <Badge variant="secondary">{t("admin.common.adminTools")}</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {t("admin.users.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.users.subtitle")}
        </p>
      </div>

      {debug ? <AdminDebugCard debug={debug} /> : null}

      <Card className="border-muted bg-muted/30">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("admin.users.userManagement")}</CardTitle>
          <CardDescription>{t("admin.users.userManagementDesc")}</CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("admin.users.userProfiles")}</CardTitle>
          <CardDescription>
            {formatMessage(t("admin.users.userProfilesDesc"), {
              count: formatInt(users.length),
            })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[64rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">{t("admin.users.email")}</th>
                    <th className="py-2 pr-4 font-medium">{t("admin.users.userId")}</th>
                    <th className="py-2 pr-4 text-right font-medium">
                      {t("admin.users.creditsBalance")}
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      {t("admin.users.totalCreditsPurchased")}
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      {t("admin.users.totalCreditsUsed")}
                    </th>
                    <th className="py-2 pr-4 font-medium">{t("admin.users.createdAt")}</th>
                    <th className="py-2 pr-4 font-medium">{t("admin.users.updatedAt")}</th>
                    <th className="py-2 pr-4 font-medium">{t("admin.users.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((row) => {
                    const isExpanded = expandedUserId === row.id;

                    return (
                      <Fragment key={row.id}>
                        <tr className="border-b last:border-0">
                          <td className="py-2 pr-4">{row.email ?? "—"}</td>
                          <td
                            className="max-w-[12rem] truncate py-2 pr-4 font-mono text-xs text-muted-foreground"
                            title={row.id}
                          >
                            {row.id}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono text-xs">
                            {formatCredits(row.credits_balance)}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono text-xs">
                            {formatCredits(row.total_credits_purchased)}
                          </td>
                          <td className="py-2 pr-4 text-right font-mono text-xs">
                            {formatCredits(row.total_credits_used)}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {formatDateTime(row.created_at)}
                          </td>
                          <td className="py-2 pr-4 text-muted-foreground">
                            {formatDateTime(row.updated_at)}
                          </td>
                          <td className="py-2 pr-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => toggleUserDetails(row.id)}
                              >
                                {isExpanded
                                  ? t("admin.users.hideDetails")
                                  : t("admin.users.viewDetails")}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => void copyUserId(row.id)}
                              >
                                {copiedUserId === row.id
                                  ? t("admin.users.userIdCopied")
                                  : t("admin.users.copyUserId")}
                              </Button>
                              {row.email ? (
                                <Link
                                  href={`/admin/credits?email=${encodeURIComponent(row.email)}`}
                                  className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
                                >
                                  {t("admin.users.viewRecentLedger")}
                                </Link>
                              ) : null}
                              <Link
                                href={`/admin/credits-adjust?user_id=${encodeURIComponent(row.id)}&direction=add`}
                                className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                              >
                                {t("admin.users.addCredits")}
                              </Link>
                              <Link
                                href={`/admin/credits-adjust?user_id=${encodeURIComponent(row.id)}&direction=deduct`}
                                className="text-xs font-medium text-destructive underline-offset-4 hover:underline"
                              >
                                {t("admin.users.deductCredits")}
                              </Link>
                            </div>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="border-b last:border-0">
                            <td colSpan={8} className="py-3 pr-4">
                              <AdminUserDetailPanel user={row} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              {t("admin.users.noUsers")}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
