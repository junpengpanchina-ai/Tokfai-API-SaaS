"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

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
  fetchAdminCreditOrders,
  type AdminCreditOrderListItem,
} from "@/lib/admin/client";
import { formatCny } from "@/lib/billing/recharge-plans";
import { formatDateTime } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "pending" | "paid" | "cancelled" | "failed";

function formatPlanLabel(order: AdminCreditOrderListItem): string {
  const packageCode = order.package_code?.trim();
  const planId = order.plan_id?.trim();

  if (packageCode && planId && packageCode !== planId) {
    return `${packageCode} / ${planId}`;
  }

  return packageCode || planId || "—";
}

function formatAmount(order: AdminCreditOrderListItem): string {
  if (order.amount_cents == null) {
    return "—";
  }
  return formatCny(order.amount_cents);
}

function StatusBadge({ status }: { status: string }) {
  const normalized = status.trim().toLowerCase();
  const variant =
    normalized === "paid"
      ? "default"
      : normalized === "pending"
        ? "secondary"
        : normalized === "failed" || normalized === "cancelled"
          ? "destructive"
          : "outline";

  return <Badge variant={variant}>{status}</Badge>;
}

export function AdminCreditOrdersClient({
  initialOrders,
  initialError,
  initialEmailFilter = "",
  initialStatusFilter = "all",
  initialPackageCodeFilter = "",
}: {
  initialOrders: AdminCreditOrderListItem[];
  initialError: string | null;
  initialEmailFilter?: string;
  initialStatusFilter?: StatusFilter;
  initialPackageCodeFilter?: string;
}) {
  const { t } = useI18n();
  const [orders, setOrders] = useState(initialOrders);
  const [error, setError] = useState<string | null>(initialError);
  const [loading, setLoading] = useState(false);
  const [emailFilter, setEmailFilter] = useState(initialEmailFilter);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    initialStatusFilter
  );
  const [packageCodeFilter, setPackageCodeFilter] = useState(
    initialPackageCodeFilter
  );

  const activeFilters = useMemo(
    () => ({
      email: emailFilter.trim(),
      status: statusFilter === "all" ? undefined : statusFilter,
      package_code: packageCodeFilter.trim(),
    }),
    [emailFilter, statusFilter, packageCodeFilter]
  );

  const loadOrders = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await fetchAdminCreditOrders(activeFilters);
      setOrders(rows);
    } catch (err) {
      setError(
        err instanceof AdminApiError && err.isSessionExpired
          ? t("admin.common.sessionExpired")
          : err instanceof Error
            ? err.message
            : t("admin.creditOrders.loadFailed")
      );
    } finally {
      setLoading(false);
    }
  }, [activeFilters, t]);

  useEffect(() => {
    setOrders(initialOrders);
    setError(initialError);
    setEmailFilter(initialEmailFilter);
    setStatusFilter(initialStatusFilter);
    setPackageCodeFilter(initialPackageCodeFilter);
  }, [
    initialOrders,
    initialError,
    initialEmailFilter,
    initialStatusFilter,
    initialPackageCodeFilter,
  ]);

  const hasActiveFilters =
    Boolean(emailFilter.trim()) ||
    statusFilter !== "all" ||
    Boolean(packageCodeFilter.trim());

  return (
    <>
      <div>
        <Badge variant="secondary">{t("admin.common.adminTools")}</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {t("admin.creditOrders.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.creditOrders.subtitle")}
        </p>
      </div>

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base">
              {t("admin.creditOrders.couldNotLoad")}
            </CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadOrders()}
            >
              {t("admin.common.retry")}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("admin.creditOrders.filtersTitle")}
          </CardTitle>
          <CardDescription>{t("admin.creditOrders.filtersDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <FilterField
              id="credit-orders-email"
              label={t("admin.creditOrders.filterEmail")}
              value={emailFilter}
              onChange={setEmailFilter}
              placeholder={t("admin.creditOrders.filterEmailPlaceholder")}
            />
            <FilterSelect
              label={t("admin.creditOrders.filterStatus")}
              value={statusFilter}
              options={[
                { value: "all", label: t("admin.common.all") },
                { value: "pending", label: t("admin.creditOrders.statusPending") },
                { value: "paid", label: t("admin.creditOrders.statusPaid") },
                {
                  value: "cancelled",
                  label: t("admin.creditOrders.statusCancelled"),
                },
                { value: "failed", label: t("admin.creditOrders.statusFailed") },
              ]}
              onChange={(value) => setStatusFilter(value as StatusFilter)}
            />
            <FilterField
              id="credit-orders-package-code"
              label={t("admin.creditOrders.filterPackageCode")}
              value={packageCodeFilter}
              onChange={setPackageCodeFilter}
              placeholder={t("admin.creditOrders.filterPackageCodePlaceholder")}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={loading}
              onClick={() => void loadOrders()}
            >
              {loading
                ? t("admin.common.refreshing")
                : t("admin.creditOrders.applyFilters")}
            </Button>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={loading}
                onClick={() => {
                  setEmailFilter("");
                  setStatusFilter("all");
                  setPackageCodeFilter("");
                  setLoading(true);
                  setError(null);
                  void fetchAdminCreditOrders({})
                    .then((rows) => setOrders(rows))
                    .catch((err) => {
                      setError(
                        err instanceof AdminApiError && err.isSessionExpired
                          ? t("admin.common.sessionExpired")
                          : err instanceof Error
                            ? err.message
                            : t("admin.creditOrders.loadFailed")
                      );
                    })
                    .finally(() => setLoading(false));
                }}
              >
                {t("admin.creditOrders.clearFilters")}
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="text-base">
              {t("admin.creditOrders.tableTitle")}
            </CardTitle>
            <CardDescription>
              {formatMessage(t("admin.creditOrders.showingCount"), {
                count: String(orders.length),
              })}
            </CardDescription>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => void loadOrders()}
          >
            {loading ? t("admin.common.refreshing") : t("admin.common.refresh")}
          </Button>
        </CardHeader>
        <CardContent>
          {loading && orders.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              {t("admin.creditOrders.loading")}
            </div>
          ) : orders.length === 0 ? (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              {t("admin.creditOrders.empty")}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.creditOrders.colCreated")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.creditOrders.colEmail")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.creditOrders.colPlan")}
                    </th>
                    <th className="py-2 pr-4 text-right font-medium">
                      {t("admin.creditOrders.colAmount")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.creditOrders.colCurrency")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.creditOrders.colStatus")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.creditOrders.colCheckoutSession")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.creditOrders.colPaymentIntent")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.creditOrders.colUpdated")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {formatDateTime(order.created_at)}
                      </td>
                      <td className="py-2 pr-4">{order.email ?? "—"}</td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {formatPlanLabel(order)}
                      </td>
                      <td className="py-2 pr-4 text-right font-mono text-xs">
                        {formatAmount(order)}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs uppercase">
                        {order.currency}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={order.status} />
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {order.stripe_checkout_session_id ?? "—"}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {order.stripe_payment_intent_id ?? "—"}
                      </td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {formatDateTime(order.updated_at)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}

function FilterField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
          "ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        )}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
