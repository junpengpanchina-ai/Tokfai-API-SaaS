"use client";

import { AdminDebugCard } from "@/components/admin/admin-debug-card";
import { AdminDisabledWriteActions } from "@/components/admin/admin-disabled-write-actions";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AdminPricingRow } from "@/lib/admin/client";
import type { AdminDebug } from "@/lib/admin/server";
import { formatCreditsPrecise } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

function formatPrice(value: number | null): string {
  if (value == null) return "—";
  return formatCreditsPrecise(value);
}

export function AdminPricingPanel({
  pricing,
  debug,
}: {
  pricing: AdminPricingRow[];
  debug: AdminDebug | null;
}) {
  const { t } = useI18n();

  return (
    <>
      <div>
        <Badge variant="secondary">{t("admin.common.adminTools")}</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {t("admin.pricing.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.pricing.subtitle")}
        </p>
      </div>

      {debug ? <AdminDebugCard debug={debug} /> : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">{t("admin.pricing.tableTitle")}</CardTitle>
            <Badge variant="secondary">{t("admin.common.readOnlyPhase")}</Badge>
          </div>
          <CardDescription>{t("admin.pricing.tableDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AdminDisabledWriteActions
            actionKeys={["admin.pricing.editPricing"]}
          />
          <div className="mt-4 overflow-x-auto">
            {pricing.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("admin.pricing.empty")}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.pricing.colModel")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.pricing.colProvider")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.pricing.colModality")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.pricing.colInput")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.pricing.colOutput")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.pricing.colImage")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.pricing.colMultiplier")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.pricing.colMinCharge")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.pricing.colStatus")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pricing.map((row) => (
                    <tr key={row.model_id} className="border-b last:border-0">
                      <td className="py-2 pr-4">
                        <div className="font-medium">
                          {row.display_name ?? row.model_id}
                        </div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {row.model_id}
                        </div>
                      </td>
                      <td className="py-2 pr-4">{row.provider ?? "—"}</td>
                      <td className="py-2 pr-4">{row.modality ?? "—"}</td>
                      <td className="py-2 pr-4">{formatPrice(row.input_price)}</td>
                      <td className="py-2 pr-4">{formatPrice(row.output_price)}</td>
                      <td className="py-2 pr-4">{formatPrice(row.image_price)}</td>
                      <td className="py-2 pr-4">
                        {row.credits_multiplier ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        {row.minimum_charge ?? "—"}
                      </td>
                      <td className="py-2 pr-4">
                        <Badge
                          variant={
                            row.effective_status === "active"
                              ? "default"
                              : "secondary"
                          }
                        >
                          {row.effective_status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
