"use client";

import Link from "next/link";
import { Activity } from "lucide-react";

import { AdminDebugCard } from "@/components/admin/admin-debug-card";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AdminDashboardSummary } from "@/lib/admin/client";
import type { AdminDebug } from "@/lib/admin/server";
import { formatCny } from "@/lib/billing/recharge-plans";
import {
  formatCreditsPrecise,
  formatDateTime,
  formatInt,
} from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

type ApiHealth = {
  ok: boolean;
  service?: string;
  now?: string;
  timestamp?: string;
};

function formatCount(value: number | null | undefined): string {
  if (value == null) return "—";
  return formatInt(value);
}

function formatPercent(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${value}%`;
}

function resolveHealthTimestamp(health: ApiHealth | null): string | null {
  if (!health) return null;
  return health.now ?? health.timestamp ?? null;
}

function formatTokenMetric(
  summary: AdminDashboardSummary,
  field: "total_tokens" | "total_input_tokens" | "total_output_tokens",
  noDataLabel: string
): string {
  if (!summary.has_token_data) return noDataLabel;
  const value = summary[field];
  if (value == null) return "—";
  return formatInt(value);
}

function OrderStatusBadge({
  status,
  t,
}: {
  status: string;
  t: (key: string) => string;
}) {
  const normalized = status.trim().toLowerCase();
  const variant =
    normalized === "paid" ||
    normalized === "succeeded" ||
    normalized === "completed"
      ? "default"
      : normalized === "pending"
        ? "secondary"
        : normalized === "failed" || normalized === "cancelled"
          ? "destructive"
          : "outline";

  let label = status;
  if (normalized === "pending") label = t("admin.creditOrders.statusPending");
  else if (
    normalized === "paid" ||
    normalized === "succeeded" ||
    normalized === "completed"
  ) {
    label = t("admin.creditOrders.statusPaid");
  } else if (normalized === "cancelled") {
    label = t("admin.creditOrders.statusCancelled");
  } else if (normalized === "failed") {
    label = t("admin.creditOrders.statusFailed");
  }

  return <Badge variant={variant}>{label}</Badge>;
}

function RequestSparkline({
  points,
  emptyLabel,
}: {
  points: AdminDashboardSummary["request_sparkline_7d"];
  emptyLabel: string;
}) {
  if (!points.length) {
    return (
      <p className="text-sm text-muted-foreground">{emptyLabel}</p>
    );
  }

  const max = Math.max(...points.map((point) => point.count), 1);

  return (
    <div className="flex h-32 items-end gap-2">
      {points.map((point) => (
        <div key={point.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-sm bg-primary/80"
            style={{ height: `${Math.max(8, (point.count / max) * 100)}%` }}
            title={`${point.date}: ${point.count}`}
          />
          <span className="truncate text-[10px] text-muted-foreground">
            {point.date.slice(5)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function AdminOverviewPanel({
  summary,
  warnings,
  health,
  debug,
  availableModelsCount = null,
  rechargePlansCount = null,
  imageServiceOk = null,
}: {
  summary: AdminDashboardSummary | null;
  warnings: string[];
  health: ApiHealth | null;
  debug: AdminDebug | null;
  availableModelsCount?: number | null;
  rechargePlansCount?: number | null;
  imageServiceOk?: boolean | null;
}) {
  const { t } = useI18n();
  const healthOk = health?.ok === true;
  const healthTimestamp = resolveHealthTimestamp(health);
  const summaryUpdatedAt = summary?.updated_at ?? null;
  const recentUsersLabel =
    summary?.user_source === "admin_users"
      ? t("admin.overview.recentAdminUsers")
      : t("admin.overview.recentEndUsers");
  const noTokenData = t("admin.overview.noTokenData");
  const recentErrorCount = summary?.recent_errors?.length ?? null;
  const imageLabel =
    imageServiceOk == null
      ? t("admin.overview.betaStatusUnknown")
      : imageServiceOk
        ? t("admin.overview.betaStatusOk")
        : t("admin.overview.betaStatusDown");

  return (
    <>
      <div>
        <Badge variant="secondary">{t("admin.common.adminTools")}</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {t("admin.overview.dashboardTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.overview.dashboardSubtitle")}
        </p>
      </div>

      {debug ? <AdminDebugCard debug={debug} /> : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {t("admin.overview.betaStatusTitle")}
          </CardTitle>
          <CardDescription>{t("admin.overview.betaStatusDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <AdminStatCard
              label={t("admin.overview.betaApiStatus")}
              value={
                health
                  ? healthOk
                    ? t("admin.overview.betaStatusOk")
                    : t("admin.overview.betaStatusDown")
                  : t("admin.overview.betaStatusUnknown")
              }
            />
            <AdminStatCard
              label={t("admin.overview.betaModelsAvailable")}
              value={formatCount(availableModelsCount)}
            />
            <AdminStatCard
              label={t("admin.overview.betaRechargePlans")}
              value={formatCount(rechargePlansCount)}
            />
            <AdminStatCard
              label={t("admin.overview.betaRequests24h")}
              value={formatCount(summary?.today_requests)}
            />
            <AdminStatCard
              label={t("admin.overview.betaRecentErrors")}
              value={formatCount(
                recentErrorCount ?? summary?.failed_requests ?? null
              )}
            />
            <AdminStatCard
              label={t("admin.overview.betaImageStatus")}
              value={imageLabel}
            />
          </div>
        </CardContent>
      </Card>

      {warnings.length > 0 ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t("admin.overview.partialLoadTitle")}
            </CardTitle>
            <CardDescription>
              {t("admin.overview.partialLoadDesc")}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {summary ? (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {t("admin.overview.firstRunOpsTitle")}
              </CardTitle>
              <CardDescription>
                {t("admin.overview.firstRunOpsDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <AdminStatCard
                  label={t("admin.overview.firstRunUsersToday")}
                  value={formatCount(summary.today_new_users)}
                  hint={t("admin.overview.firstRunUsersTodayHint")}
                />
                <AdminStatCard
                  label={t("admin.overview.todaySuccess")}
                  value={formatCount(summary.today_successful_requests)}
                />
                <AdminStatCard
                  label={t("admin.overview.todayFailed")}
                  value={formatCount(summary.today_failed_requests)}
                  tone={
                    (summary.today_failed_requests ?? 0) > 0
                      ? "warning"
                      : "default"
                  }
                />
                <AdminStatCard
                  label={t("admin.overview.todayCredits")}
                  value={
                    summary.today_credits_consumed != null
                      ? formatCreditsPrecise(summary.today_credits_consumed)
                      : "—"
                  }
                />
                <AdminStatCard
                  label={t("admin.overview.recentErrorsTitle")}
                  value={formatCount(summary.recent_errors?.length ?? 0)}
                />
              </div>
              <div className="mt-4 flex flex-col gap-2 rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <p>
                  <span className="font-medium text-foreground">
                    {t("admin.overview.recommendedModelsLabel")}
                  </span>{" "}
                  <code className="font-mono text-xs">auto-fast</code>
                  {" · "}
                  <code className="font-mono text-xs">auto-pro</code>
                  {" · "}
                  <code className="font-mono text-xs">auto-cheap</code>
                </p>
                <Link
                  href="/admin/logs"
                  className="text-sm text-primary hover:underline"
                >
                  {t("admin.overview.viewAllLogs")}
                </Link>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("admin.overview.firstRunEntryHint")}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {t("admin.overview.developerCursorTipTitle")}
              </CardTitle>
              <CardDescription>
                {t("admin.overview.developerCursorTipDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">Base URL:</span>{" "}
                <code className="font-mono text-xs">
                  https://api.tokfai.com/v1
                </code>
              </p>
              <p>
                <span className="font-medium text-foreground">
                  {t("admin.overview.recommendedModelsLabel")}
                </span>{" "}
                <code className="font-mono text-xs">auto-fast</code>
                {" · "}
                <code className="font-mono text-xs">auto-pro</code>
                {" · "}
                <code className="font-mono text-xs">auto-cheap</code>
                {" / "}
                <code className="font-mono text-xs">gpt-5.5</code>
              </p>
              <ul className="list-disc space-y-1 pl-5">
                <li>{t("admin.overview.developerCursorTipScene")}</li>
                <li>{t("admin.overview.developerCursorTipTools")}</li>
                <li>{t("admin.overview.developerCursorTipRequestId")}</li>
              </ul>
            </CardContent>
          </Card>

          <Card className="border-destructive/30">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {t("admin.overview.moneyBagTitle")}
              </CardTitle>
              <CardDescription>
                {t("admin.overview.moneyBagDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <AdminStatCard
                  label={t("admin.overview.riskBadBilling")}
                  value={formatCount(
                    summary.money_bag_risks?.bad_billing_failures
                  )}
                  tone={
                    (summary.money_bag_risks?.bad_billing_failures ?? 0) > 0
                      ? "danger"
                      : "default"
                  }
                />
                <AdminStatCard
                  label={t("admin.overview.riskProviderUnpaid")}
                  value={formatCount(
                    summary.money_bag_risks?.provider_success_unpaid
                  )}
                  tone={
                    (summary.money_bag_risks?.provider_success_unpaid ?? 0) > 0
                      ? "danger"
                      : "default"
                  }
                />
                <AdminStatCard
                  label={t("admin.overview.riskChargedMissingUrl")}
                  value={formatCount(
                    summary.money_bag_risks?.charged_missing_url
                  )}
                  tone={
                    (summary.money_bag_risks?.charged_missing_url ?? 0) > 0
                      ? "danger"
                      : "default"
                  }
                />
                <AdminStatCard
                  label={t("admin.overview.riskMissingUrlSuccess")}
                  value={formatCount(
                    summary.money_bag_risks?.missing_url_success
                  )}
                  tone={
                    (summary.money_bag_risks?.missing_url_success ?? 0) > 0
                      ? "warning"
                      : "default"
                  }
                />
                <AdminStatCard
                  label={t("admin.overview.riskStaleTimeout")}
                  value={formatCount(
                    summary.money_bag_risks?.stale_timeout_pending
                  )}
                  tone={
                    (summary.money_bag_risks?.stale_timeout_pending ?? 0) > 0
                      ? "warning"
                      : "default"
                  }
                />
                <AdminStatCard
                  label={t("admin.overview.riskImageTimeout")}
                  value={formatCount(
                    summary.money_bag_risks?.image_task_timeout
                  )}
                  tone={
                    (summary.money_bag_risks?.image_task_timeout ?? 0) > 0
                      ? "warning"
                      : "default"
                  }
                />
                <AdminStatCard
                  label={t("admin.overview.riskTooManyRequests")}
                  value={formatCount(
                    summary.money_bag_risks?.too_many_requests
                  )}
                  tone={
                    (summary.money_bag_risks?.too_many_requests ?? 0) > 0
                      ? "warning"
                      : "default"
                  }
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AdminStatCard
              label={t("admin.overview.todayRequests")}
              value={formatCount(summary.today_requests)}
            />
            <AdminStatCard
              label={t("admin.overview.todaySuccess")}
              value={formatCount(summary.today_successful_requests)}
            />
            <AdminStatCard
              label={t("admin.overview.todayFailed")}
              value={formatCount(summary.today_failed_requests)}
              tone={
                (summary.today_failed_requests ?? 0) > 0 ? "warning" : "default"
              }
            />
            <AdminStatCard
              label={t("admin.overview.todayNotBillable")}
              value={formatCount(summary.today_not_billable_failures)}
              hint={t("admin.overview.todayNotBillableHint")}
            />
            <AdminStatCard
              label={t("admin.overview.todayCredits")}
              value={
                summary.today_credits_consumed != null
                  ? formatCreditsPrecise(summary.today_credits_consumed)
                  : "—"
              }
            />
            <AdminStatCard
              label={t("admin.overview.last7dRequests")}
              value={formatCount(summary.last_7d_requests)}
            />
            <AdminStatCard
              label={t("admin.overview.last7dCredits")}
              value={
                summary.last_7d_credits_consumed != null
                  ? formatCreditsPrecise(summary.last_7d_credits_consumed)
                  : "—"
              }
            />
            <AdminStatCard
              label={t("admin.overview.todayRevenue")}
              value={formatCny(summary.today_revenue_cents)}
            />
            <AdminStatCard
              label={t("admin.overview.activeUsers7d")}
              value={formatCount(summary.active_users_7d)}
            />
            <AdminStatCard
              label={t("admin.overview.totalBalance")}
              value={
                summary.total_balance_credits != null
                  ? formatCreditsPrecise(summary.total_balance_credits)
                  : "—"
              }
              hint={t("admin.overview.totalBalanceHint")}
            />
            <AdminStatCard
              label={t("admin.overview.totalRecharge")}
              value={formatCny(summary.total_recharge_amount_cents)}
            />
            <AdminStatCard
              label={t("admin.overview.chatCredits")}
              value={
                summary.chat_credits_consumed != null
                  ? formatCreditsPrecise(summary.chat_credits_consumed)
                  : "—"
              }
            />
            <AdminStatCard
              label={t("admin.overview.imageCredits")}
              value={
                summary.image_credits_consumed != null
                  ? formatCreditsPrecise(summary.image_credits_consumed)
                  : "—"
              }
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {t("admin.overview.quickLinksTitle")}
              </CardTitle>
              <CardDescription>{t("admin.overview.quickLinksDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/admin/users"
                  className="text-sm text-primary hover:underline"
                >
                  {t("admin.nav.users")}
                </Link>
                <Link
                  href="/admin/logs"
                  className="text-sm text-primary hover:underline"
                >
                  {t("admin.nav.errorLogs")}
                </Link>
                <Link
                  href="/admin/credits-adjust"
                  className="text-sm text-primary hover:underline"
                >
                  {t("admin.nav.creditsAdjust")}
                </Link>
                <Link
                  href="/admin/usage"
                  className="text-sm text-primary hover:underline"
                >
                  {t("admin.nav.usageLogs")}
                </Link>
                <Link
                  href="/admin/pricing"
                  className="text-sm text-primary hover:underline"
                >
                  {t("admin.nav.pricing")}
                </Link>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AdminStatCard
              label={t("admin.overview.totalApiKeys")}
              value={formatCount(summary.total_api_keys)}
            />
            <AdminStatCard
              label={t("admin.overview.errorRate")}
              value={formatPercent(summary.error_rate_percent)}
            />
            <AdminStatCard
              label={t("admin.overview.totalUsers")}
              value={formatCount(summary.total_users)}
              hint={
                summary.admin_user_count != null
                  ? t("admin.overview.adminCountHint").replace(
                      "{count}",
                      formatCount(summary.admin_user_count)
                    )
                  : undefined
              }
            />
            <AdminStatCard
              label={t("admin.overview.totalRequests")}
              value={formatCount(summary.total_requests)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {t("admin.overview.requestSparklineTitle")}
                </CardTitle>
                <CardDescription>
                  {t("admin.overview.requestSparklineDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <RequestSparkline
                  points={summary.request_sparkline_7d ?? []}
                  emptyLabel={t("admin.overview.sparklineEmpty")}
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {t("admin.overview.modelTop10Title")}
                </CardTitle>
                <CardDescription>
                  {t("admin.overview.modelTop10Desc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(summary.model_top_10 ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("admin.overview.modelTop10Empty")}
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-3 font-medium">
                          {t("admin.overview.colModel")}
                        </th>
                        <th className="pb-2 text-right font-medium">
                          {t("admin.overview.colRequests")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.model_top_10.map((row) => (
                        <tr key={row.model} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs">
                            {row.model}
                          </td>
                          <td className="py-2 text-right">
                            {formatInt(row.request_count)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {t("admin.overview.topUsersTitle")}
                </CardTitle>
                <CardDescription>
                  {t("admin.overview.topUsersDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(summary.top_users_7d ?? summary.high_consumption_users_7d ?? [])
                  .length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("admin.overview.topUsersEmpty")}
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-3 font-medium">
                          {t("admin.overview.colUser")}
                        </th>
                        <th className="pb-2 pr-3 text-right font-medium">
                          {t("admin.overview.colCredits")}
                        </th>
                        <th className="pb-2 text-right font-medium">
                          {t("admin.overview.colRequests")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(
                        summary.top_users_7d ??
                        summary.high_consumption_users_7d ??
                        []
                      ).map((row) => (
                        <tr key={row.user_id} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            <div className="truncate text-sm">
                              {row.email ?? "—"}
                            </div>
                            <div className="truncate font-mono text-xs text-muted-foreground">
                              {row.user_id.slice(0, 8)}…
                            </div>
                          </td>
                          <td className="py-2 pr-3 text-right">
                            {formatCreditsPrecise(row.credits_charged)}
                          </td>
                          <td className="py-2 text-right">
                            {formatInt(row.request_count)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {t("admin.overview.lowBalanceTitle")}
                </CardTitle>
                <CardDescription>
                  {t("admin.overview.lowBalanceDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(summary.low_balance_users ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("admin.overview.lowBalanceEmpty")}
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-3 font-medium">
                          {t("admin.overview.colUser")}
                        </th>
                        <th className="pb-2 text-right font-medium">
                          {t("admin.overview.colBalance")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(summary.low_balance_users ?? []).map((row) => (
                        <tr key={row.user_id} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            <div className="truncate text-sm">
                              {row.email ?? "—"}
                            </div>
                            <div className="truncate font-mono text-xs text-muted-foreground">
                              {row.user_id.slice(0, 8)}…
                            </div>
                          </td>
                          <td className="py-2 text-right">
                            {formatCreditsPrecise(row.credits_balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {t("admin.overview.recentImageTasksTitle")}
              </CardTitle>
              <CardDescription>
                {t("admin.overview.recentImageTasksDesc")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(summary.recent_image_tasks ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("admin.overview.recentImageTasksEmpty")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-3 font-medium">
                          {t("admin.overview.colCreated")}
                        </th>
                        <th className="pb-2 pr-3 font-medium">
                          {t("admin.overview.colModel")}
                        </th>
                        <th className="pb-2 pr-3 font-medium">
                          {t("admin.overview.colStatus")}
                        </th>
                        <th className="pb-2 pr-3 font-medium">
                          {t("admin.overview.colBilling")}
                        </th>
                        <th className="pb-2 pr-3 font-medium">
                          {t("admin.overview.colCode")}
                        </th>
                        <th className="pb-2 font-medium">
                          {t("admin.overview.colRequestId")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {(summary.recent_image_tasks ?? []).map((row) => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            {formatDateTime(row.created_at)}
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs">
                            {row.model ?? "—"}
                          </td>
                          <td className="py-2 pr-3">{row.status ?? "—"}</td>
                          <td className="py-2 pr-3">
                            {row.billing_status ?? "—"}
                            {row.credits_charged != null
                              ? ` · ${formatCreditsPrecise(row.credits_charged)}`
                              : ""}
                          </td>
                          <td className="py-2 pr-3">{row.error_code ?? "—"}</td>
                          <td className="py-2 font-mono text-xs">
                            {row.request_id ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <CardTitle className="text-base">
                    {t("admin.overview.recentErrorsTitle")}
                  </CardTitle>
                  <CardDescription>
                    {t("admin.overview.recentErrorsDesc")}
                  </CardDescription>
                </div>
                <Link
                  href="/admin/logs"
                  className="text-sm text-primary hover:underline"
                >
                  {t("admin.overview.viewAllLogs")}
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {(summary.recent_errors ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("admin.overview.recentErrorsEmpty")}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-muted-foreground">
                        <th className="pb-2 pr-3 font-medium">
                          {t("admin.overview.colCreated")}
                        </th>
                        <th className="pb-2 pr-3 font-medium">
                          {t("admin.overview.colRoute")}
                        </th>
                        <th className="pb-2 pr-3 font-medium">
                          {t("admin.overview.colStatus")}
                        </th>
                        <th className="pb-2 pr-3 font-medium">
                          {t("admin.overview.colCode")}
                        </th>
                        <th className="pb-2 font-medium">
                          {t("admin.overview.colRequestId")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.recent_errors.map((row) => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="py-2 pr-3">
                            {formatDateTime(row.created_at)}
                          </td>
                          <td className="py-2 pr-3 font-mono text-xs">
                            {row.route ?? "—"}
                          </td>
                          <td className="py-2 pr-3">{row.status ?? "—"}</td>
                          <td className="py-2 pr-3">{row.error_code ?? "—"}</td>
                          <td className="py-2 font-mono text-xs">
                            {row.request_id ? (
                              <Link
                                href={`/admin/logs?request_id=${encodeURIComponent(row.request_id)}`}
                                className="text-primary hover:underline"
                              >
                                {row.request_id}
                              </Link>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AdminStatCard
              label={t("admin.overview.todayNewUsers")}
              value={formatCount(summary.today_new_users)}
            />
            <AdminStatCard
              label={t("admin.overview.last7dNewUsers")}
              value={formatCount(summary.last_7d_new_users)}
            />
            <AdminStatCard
              label={t("admin.overview.paidOrders")}
              value={formatCount(summary.paid_orders)}
            />
            <AdminStatCard
              label={t("admin.overview.totalRecharge")}
              value={formatCny(summary.total_recharge_amount_cents)}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">
                  {t("admin.overview.recentOrdersTitle")}
                </CardTitle>
                <CardDescription>
                  {t("admin.overview.recentOrdersDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {summary.recent_orders.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("admin.overview.recentOrdersEmpty")}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 pr-3 font-medium">
                            {t("admin.creditOrders.colEmail")}
                          </th>
                          <th className="pb-2 pr-3 font-medium">
                            {t("admin.creditOrders.colPlan")}
                          </th>
                          <th className="pb-2 pr-3 font-medium">
                            {t("admin.creditOrders.colAmount")}
                          </th>
                          <th className="pb-2 pr-3 font-medium">
                            {t("admin.creditOrders.colStatus")}
                          </th>
                          <th className="pb-2 font-medium">
                            {t("admin.creditOrders.colCreated")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.recent_orders.map((order) => (
                          <tr key={order.id} className="border-b last:border-0">
                            <td className="py-2 pr-3">{order.email ?? "—"}</td>
                            <td className="py-2 pr-3">
                              {order.plan_label ?? "—"}
                            </td>
                            <td className="py-2 pr-3">
                              {order.amount_cents != null
                                ? formatCny(order.amount_cents)
                                : "—"}
                            </td>
                            <td className="py-2 pr-3">
                              <OrderStatusBadge status={order.status} t={t} />
                            </td>
                            <td className="py-2">
                              {formatDateTime(order.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">{recentUsersLabel}</CardTitle>
                <CardDescription>
                  {summary.user_source === "admin_users"
                    ? t("admin.overview.recentAdminUsersDesc")
                    : t("admin.overview.recentEndUsersDesc")}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {summary.recent_users.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {t("admin.overview.recentUsersEmpty")}
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-left text-muted-foreground">
                          <th className="pb-2 pr-3 font-medium">
                            {t("admin.creditOrders.colEmail")}
                          </th>
                          <th className="pb-2 font-medium">
                            {t("admin.creditOrders.colCreated")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.recent_users.map((user) => (
                          <tr key={user.id} className="border-b last:border-0">
                            <td className="py-2 pr-3">{user.email ?? "—"}</td>
                            <td className="py-2">
                              {formatDateTime(user.created_at)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {summary.has_token_data && summary.total_usage_credits != null ? (
            <p className="text-xs text-muted-foreground">
              {t("admin.overview.totalUsageCredits").replace(
                "{amount}",
                formatCreditsPrecise(summary.total_usage_credits)
              )}
            </p>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AdminStatCard
              label={t("admin.overview.succeeded")}
              value={formatCount(summary.successful_requests)}
            />
            <AdminStatCard
              label={t("admin.overview.failed")}
              value={formatCount(summary.failed_requests)}
            />
            <AdminStatCard
              label={t("admin.overview.totalTokens")}
              value={formatTokenMetric(summary, "total_tokens", noTokenData)}
              hint={
                summary.has_token_data
                  ? t("admin.overview.tokenBreakdown")
                      .replace(
                        "{input}",
                        formatTokenMetric(
                          summary,
                          "total_input_tokens",
                          noTokenData
                        )
                      )
                      .replace(
                        "{output}",
                        formatTokenMetric(
                          summary,
                          "total_output_tokens",
                          noTokenData
                        )
                      )
                  : undefined
              }
            />
          </div>
        </>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">
              {t("admin.overview.healthTitle")}
            </CardTitle>
          </div>
          <CardDescription>{t("admin.overview.healthDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={healthOk ? "default" : "destructive"}>
              {healthOk
                ? t("admin.overview.apiHealthy")
                : t("admin.overview.apiUnhealthy")}
            </Badge>
            {health?.service ? (
              <span className="text-sm text-muted-foreground">
                {t("admin.overview.serviceLabel")}: {health.service}
              </span>
            ) : null}
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">
                {t("admin.overview.healthCheckedAt")}:{" "}
              </span>
              {formatDateTime(healthTimestamp)}
            </div>
            <div>
              <span className="text-muted-foreground">
                {t("admin.overview.summaryUpdatedAt")}:{" "}
              </span>
              {formatDateTime(summaryUpdatedAt)}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
