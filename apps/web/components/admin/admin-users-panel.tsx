"use client";

import Link from "next/link";
import { Fragment, useState } from "react";

import { AdminDebugCard } from "@/components/admin/admin-debug-card";
import { AdminFutureControlsCard } from "@/components/admin/admin-future-controls-card";
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
import type { AdminDebug } from "@/lib/admin/server";
import {
  formatCredits,
  formatDateTime,
  formatInt,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";

export type AdminUserRow = {
  id: string;
  email: string | null;
  credits_balance: number;
  total_credits_used: number;
  updated_at: string | null;
};

export function AdminUsersPanel({
  users,
  debug,
}: {
  users: AdminUserRow[];
  debug: AdminDebug | null;
}) {
  const { t } = useI18n();
  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);

  function toggleUserDetails(userId: string) {
    setExpandedUserId((current) => (current === userId ? null : userId));
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
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{t("admin.users.userManagement")}</CardTitle>
            <Badge variant="secondary">{t("admin.common.readOnlyPhase")}</Badge>
          </div>
          <CardDescription>{t("admin.users.userManagementDesc")}</CardDescription>
        </CardHeader>
      </Card>

      <AdminFutureControlsCard
        titleKey="admin.users.futureControlsTitle"
        descriptionKey="admin.users.futureControlsDesc"
        controlLabelKeys={[
          "admin.users.searchUserByEmail",
          "admin.users.viewBalance",
          "admin.users.viewApiKeysCount",
          "admin.users.viewUsage",
          "admin.users.adjustCreditsAfterApproval",
        ]}
      />

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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">{t("admin.users.email")}</th>
                    <th className="py-2 pr-4 text-right font-medium">
                      {t("admin.users.creditsBalance")}
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      {t("admin.users.apiKeysCount")}
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      {t("admin.users.totalRequests")}
                    </th>
                    <th className="py-2 pr-4 font-medium">{t("admin.users.lastActivity")}</th>
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
                          <td className="py-2 pr-4 text-right font-mono text-xs">
                            {formatCredits(row.credits_balance)}
                          </td>
                          <td className="py-2 pr-4 text-right text-muted-foreground">
                            —
                          </td>
                          <td className="py-2 pr-4 text-right text-muted-foreground">
                            —
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
                              {row.email ? (
                                <Link
                                  href={`/admin/credits?email=${encodeURIComponent(row.email)}`}
                                  className="text-xs font-medium text-muted-foreground underline-offset-4 hover:underline"
                                >
                                  {t("admin.users.ledger")}
                                </Link>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                        {isExpanded ? (
                          <tr className="border-b last:border-0">
                            <td colSpan={6} className="py-3 pr-4">
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
