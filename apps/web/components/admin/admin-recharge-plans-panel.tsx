"use client";

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

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
  fetchAdminRechargePlans,
  updateAdminRechargePlan,
  type AdminRechargePlanListItem,
  type AdminRechargePlanUpdateBody,
} from "@/lib/admin/client";
import { formatCny } from "@/lib/billing/recharge-plans";
import { formatDateTime, formatInt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

type PlanDraft = {
  amount_yuan: string;
  base_credits: string;
  bonus_credits: string;
  badge: string;
  description: string;
  enabled: boolean;
  visible: boolean;
};

function centsToYuanInput(amountCents: number): string {
  const yuan = amountCents / 100;
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}

function yuanInputToCents(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const amountYuan = Number(trimmed);
  if (!Number.isFinite(amountYuan) || amountYuan < 0) return null;
  const amountCents = Math.round(amountYuan * 100);
  if (!Number.isInteger(amountCents) || amountCents < 0) return null;
  return amountCents;
}

function parseNonNegativeInt(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    return null;
  }
  return value;
}

function draftTotalCredits(draft: PlanDraft): number | null {
  const base = parseNonNegativeInt(draft.base_credits);
  const bonus = parseNonNegativeInt(draft.bonus_credits);
  if (base == null || bonus == null) return null;
  return base + bonus;
}

function planToDraft(plan: AdminRechargePlanListItem): PlanDraft {
  return {
    amount_yuan: centsToYuanInput(plan.amount_cents),
    base_credits: String(plan.base_credits),
    bonus_credits: String(plan.bonus_credits),
    badge: plan.badge ?? "",
    description: plan.description ?? "",
    enabled: plan.enabled,
    visible: plan.visible,
  };
}

function draftToUpdateBody(draft: PlanDraft): AdminRechargePlanUpdateBody {
  const amountCents = yuanInputToCents(draft.amount_yuan);
  if (amountCents == null) {
    throw new Error("invalid_amount");
  }

  const baseCredits = parseNonNegativeInt(draft.base_credits);
  const bonusCredits = parseNonNegativeInt(draft.bonus_credits);
  if (baseCredits == null || bonusCredits == null) {
    throw new Error("invalid_fields");
  }

  if (baseCredits + bonusCredits <= 0) {
    throw new Error("invalid_fields");
  }

  return {
    amount_cents: amountCents,
    base_credits: baseCredits,
    bonus_credits: bonusCredits,
    enabled: draft.enabled,
    visible: draft.visible,
    badge: draft.badge.trim() ? draft.badge.trim() : null,
    description: draft.description.trim() ? draft.description.trim() : null,
  };
}

function savePlanErrorMessage(
  error: unknown,
  t: (key: string) => string
): string {
  if (error instanceof AdminApiError) {
    if (error.isSessionExpired) {
      return t("admin.common.sessionExpired");
    }
    if (error.code === "invalid_recharge_plan_fields") {
      return t("admin.rechargePlans.invalidFields");
    }
    return error.message;
  }
  return error instanceof Error
    ? error.message
    : t("admin.rechargePlans.saveFailed");
}

export function AdminRechargePlansPanel() {
  const { t } = useI18n();
  const [plans, setPlans] = useState<AdminRechargePlanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchAdminRechargePlans();
      setPlans(rows);
    } catch (error) {
      if (error instanceof AdminApiError && error.isSessionExpired) {
        setLoadError(t("admin.common.sessionExpired"));
      } else {
        setLoadError(
          error instanceof Error
            ? error.message
            : t("admin.rechargePlans.loadFailed")
        );
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const draftTotal = useMemo(
    () => (draft ? draftTotalCredits(draft) : null),
    [draft]
  );

  function startEdit(plan: AdminRechargePlanListItem) {
    setEditingPlanId(plan.id);
    setDraft(planToDraft(plan));
    setSaveError(null);
    setSaveMessage(null);
  }

  function cancelEdit() {
    setEditingPlanId(null);
    setDraft(null);
    setSaveError(null);
  }

  async function savePlan(planId: string) {
    if (!draft) return;

    setSavingPlanId(planId);
    setSaveError(null);
    setSaveMessage(null);
    try {
      let body: AdminRechargePlanUpdateBody;
      try {
        body = draftToUpdateBody(draft);
      } catch (err) {
        setSaveError(
          err instanceof Error && err.message === "invalid_fields"
            ? t("admin.rechargePlans.invalidFields")
            : t("admin.rechargePlans.amountInvalid")
        );
        return;
      }
      const updated = await updateAdminRechargePlan(planId, body);
      setPlans((current) =>
        current.map((plan) => (plan.id === updated.id ? updated : plan))
      );
      setEditingPlanId(null);
      setDraft(null);
      setSaveMessage(t("admin.rechargePlans.saved"));
    } catch (error) {
      setSaveError(savePlanErrorMessage(error, t));
    } finally {
      setSavingPlanId(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{t("admin.rechargePlans.tableTitle")}</CardTitle>
          <Badge variant="secondary">{plans.length}</Badge>
        </div>
        <CardDescription>{t("admin.rechargePlans.tableDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>{t("admin.rechargePlans.creditsComputedHint")}</li>
          <li>{t("admin.rechargePlans.checkoutHint")}</li>
        </ul>

        {loadError ? (
          <p className="text-sm text-destructive">{loadError}</p>
        ) : null}
        {saveMessage ? (
          <p className="text-sm text-emerald-600 dark:text-emerald-400">{saveMessage}</p>
        ) : null}
        {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {t("admin.common.refreshing")}
          </div>
        ) : plans.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("admin.rechargePlans.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[72rem] text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3 font-medium">{t("admin.rechargePlans.colId")}</th>
                  <th className="py-2 pr-3 font-medium">{t("admin.rechargePlans.colName")}</th>
                  <th className="py-2 pr-3 font-medium">{t("admin.rechargePlans.colAmount")}</th>
                  <th className="py-2 pr-3 text-right font-medium">
                    {t("admin.rechargePlans.colBaseCredits")}
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">
                    {t("admin.rechargePlans.colBonusCredits")}
                  </th>
                  <th className="py-2 pr-3 text-right font-medium">
                    {t("admin.rechargePlans.colCredits")}
                  </th>
                  <th className="py-2 pr-3 font-medium">{t("admin.rechargePlans.colBadge")}</th>
                  <th className="py-2 pr-3 font-medium">
                    {t("admin.rechargePlans.colDescription")}
                  </th>
                  <th className="py-2 pr-3 font-medium">{t("admin.rechargePlans.colEnabled")}</th>
                  <th className="py-2 pr-3 font-medium">{t("admin.rechargePlans.colVisible")}</th>
                  <th className="py-2 pr-3 font-medium">{t("admin.rechargePlans.colUpdated")}</th>
                  <th className="py-2 pr-3 font-medium">{t("admin.rechargePlans.colActions")}</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((plan) => {
                  const isEditing = editingPlanId === plan.id;
                  const isSaving = savingPlanId === plan.id;

                  return (
                    <Fragment key={plan.id}>
                      <tr className="border-b align-top">
                        <td className="py-2 pr-3 font-mono text-xs">{plan.id}</td>
                        <td className="py-2 pr-3 font-medium">{plan.name}</td>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {formatCny(plan.amount_cents)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-xs">
                          {formatInt(plan.base_credits)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-xs">
                          {formatInt(plan.bonus_credits)}
                        </td>
                        <td className="py-2 pr-3 text-right font-mono text-xs font-medium">
                          {formatInt(plan.credits)}
                        </td>
                        <td className="py-2 pr-3">{plan.badge ?? "—"}</td>
                        <td className="max-w-[12rem] py-2 pr-3 text-muted-foreground">
                          {plan.description ?? "—"}
                        </td>
                        <td className="py-2 pr-3">
                          {plan.enabled ? (
                            <Badge variant="success">{t("admin.rechargePlans.yes")}</Badge>
                          ) : (
                            <Badge variant="secondary">{t("admin.rechargePlans.no")}</Badge>
                          )}
                        </td>
                        <td className="py-2 pr-3">
                          {plan.visible ? (
                            <Badge variant="outline">{t("admin.rechargePlans.yes")}</Badge>
                          ) : (
                            <Badge variant="warning">{t("admin.rechargePlans.no")}</Badge>
                          )}
                        </td>
                        <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                          {formatDateTime(plan.updated_at)}
                        </td>
                        <td className="py-2 pr-3">
                          {!isEditing ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => startEdit(plan)}
                            >
                              {t("admin.rechargePlans.edit")}
                            </Button>
                          ) : null}
                        </td>
                      </tr>

                      {isEditing && draft ? (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={12} className="p-4">
                            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                              <Field label={t("admin.rechargePlans.colAmount")}>
                                <Input
                                  inputMode="decimal"
                                  value={draft.amount_yuan}
                                  onChange={(event) =>
                                    setDraft({ ...draft, amount_yuan: event.target.value })
                                  }
                                />
                              </Field>
                              <Field label={t("admin.rechargePlans.colBaseCredits")}>
                                <Input
                                  inputMode="numeric"
                                  value={draft.base_credits}
                                  onChange={(event) =>
                                    setDraft({ ...draft, base_credits: event.target.value })
                                  }
                                />
                              </Field>
                              <Field label={t("admin.rechargePlans.colBonusCredits")}>
                                <Input
                                  inputMode="numeric"
                                  value={draft.bonus_credits}
                                  onChange={(event) =>
                                    setDraft({ ...draft, bonus_credits: event.target.value })
                                  }
                                />
                              </Field>
                              <Field label={t("admin.rechargePlans.colCredits")}>
                                <Input
                                  value={
                                    draftTotal != null ? formatInt(draftTotal) : "—"
                                  }
                                  disabled
                                />
                              </Field>
                              <Field label={t("admin.rechargePlans.colBadge")}>
                                <Input
                                  value={draft.badge}
                                  onChange={(event) =>
                                    setDraft({ ...draft, badge: event.target.value })
                                  }
                                />
                              </Field>
                              <Field label={t("admin.rechargePlans.colDescription")}>
                                <Input
                                  value={draft.description}
                                  onChange={(event) =>
                                    setDraft({ ...draft, description: event.target.value })
                                  }
                                />
                              </Field>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={draft.enabled}
                                  onChange={(event) =>
                                    setDraft({ ...draft, enabled: event.target.checked })
                                  }
                                />
                                {t("admin.rechargePlans.colEnabled")}
                              </label>
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={draft.visible}
                                  onChange={(event) =>
                                    setDraft({ ...draft, visible: event.target.checked })
                                  }
                                />
                                {t("admin.rechargePlans.colVisible")}
                              </label>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                disabled={isSaving}
                                onClick={() => void savePlan(plan.id)}
                              >
                                {isSaving ? (
                                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                ) : null}
                                {isSaving
                                  ? t("admin.rechargePlans.saving")
                                  : t("admin.rechargePlans.save")}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={isSaving}
                                onClick={cancelEdit}
                              >
                                {t("admin.rechargePlans.cancel")}
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
