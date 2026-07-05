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
}: {
  summary: AdminDashboardSummary | null;
  warnings: string[];
  health: ApiHealth | null;
  debug: AdminDebug | null;
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
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AdminStatCard
              label={t("admin.overview.todayRequests")}
              value={formatCount(summary.today_requests)}
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
              label={t("admin.overview.todayRevenue")}
              value={formatCny(summary.today_revenue_cents)}
            />
            <AdminStatCard
              label={t("admin.overview.activeUsers7d")}
              value={formatCount(summary.active_users_7d)}
            />
          </div>

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
                          {t("admin.overview.colRequestId")}
                        </th>
                        <th className="pb-2 pr-3 font-medium">
                          {t("admin.overview.colModel")}
                        </th>
                        <th className="pb-2 pr-3 font-medium">
                          {t("admin.overview.colError")}
                        </th>
                        <th className="pb-2 font-medium">
                          {t("admin.overview.colCreated")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.recent_errors.map((row) => (
                        <tr key={row.id} className="border-b last:border-0">
                          <td className="py-2 pr-3 font-mono text-xs">
                            {row.request_id ?? "—"}
                          </td>
                          <td className="py-2 pr-3">{row.model ?? "—"}</td>
                          <td className="max-w-[280px] truncate py-2 pr-3">
                            {row.error_message ?? row.error_code ?? row.status ?? "—"}
                          </td>
                          <td className="py-2">
                            {formatDateTime(row.created_at)}
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
