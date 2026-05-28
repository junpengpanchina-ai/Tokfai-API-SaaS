"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
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
import { formatInt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

type PlanDraft = {
  name: string;
  credits: string;
  bonus_credits: string;
  enabled: boolean;
  visible: boolean;
  sort_order: string;
  badge: string;
  stripe_price_id: string;
};

function planToDraft(plan: AdminRechargePlanListItem): PlanDraft {
  return {
    name: plan.name,
    credits: String(plan.credits),
    bonus_credits: String(plan.bonus_credits),
    enabled: plan.enabled,
    visible: plan.visible,
    sort_order: String(plan.sort_order),
    badge: plan.badge ?? "",
    stripe_price_id: plan.stripe_price_id ?? "",
  };
}

function draftToUpdateBody(draft: PlanDraft): AdminRechargePlanUpdateBody {
  const body: AdminRechargePlanUpdateBody = {
    name: draft.name.trim(),
    credits: Number(draft.credits),
    bonus_credits: Number(draft.bonus_credits),
    enabled: draft.enabled,
    visible: draft.visible,
    sort_order: Number(draft.sort_order),
    badge: draft.badge.trim() ? draft.badge.trim() : null,
    stripe_price_id: draft.stripe_price_id.trim()
      ? draft.stripe_price_id.trim()
      : null,
  };
  return body;
}

function formatAmountCny(amountCents: number): string {
  return `¥${amountCents / 100}`;
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
            : t("admin.credits.rechargePlansLoadFailed")
        );
      }
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

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
      const updated = await updateAdminRechargePlan(planId, draftToUpdateBody(draft));
      setPlans((current) =>
        current.map((plan) => (plan.id === updated.id ? updated : plan))
      );
      setEditingPlanId(null);
      setDraft(null);
      setSaveMessage(t("admin.credits.rechargePlansSaved"));
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : t("admin.credits.rechargePlansSaveFailed")
      );
    } finally {
      setSavingPlanId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">
            {t("admin.credits.rechargePlansTitle")}
          </CardTitle>
          <Badge variant="secondary">{plans.length}</Badge>
        </div>
        <CardDescription>{t("admin.credits.rechargePlansDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="space-y-1 text-sm text-muted-foreground">
          <li>{t("admin.credits.stripeSourceOfTruth")}</li>
          <li>{t("admin.credits.ledgerAfterPayment")}</li>
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
        ) : (
          <div className="grid gap-3">
            {plans.map((plan) => {
              const isEditing = editingPlanId === plan.id;
              const isSaving = savingPlanId === plan.id;
              return (
                <div
                  key={plan.id}
                  className="rounded-lg border bg-muted/20 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium">{plan.name}</div>
                        <Badge variant="outline" className="font-mono text-[10px]">
                          {plan.id}
                        </Badge>
                        {plan.enabled ? (
                          <Badge variant="success">{t("admin.credits.rechargePlansEnabled")}</Badge>
                        ) : (
                          <Badge variant="secondary">{t("dashboard.credits.comingSoon")}</Badge>
                        )}
                        {!plan.visible ? (
                          <Badge variant="warning">
                            {t("admin.credits.rechargePlansVisible")}: off
                          </Badge>
                        ) : null}
                      </div>
                      <div className="mt-1 text-2xl font-semibold tracking-tight">
                        {formatAmountCny(plan.amount_cents)}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        {formatInt(plan.total_credits)} {t("admin.credits.creditsUnit")}
                        {plan.bonus_credits > 0
                          ? ` (+${formatInt(plan.bonus_credits)} bonus)`
                          : ""}
                      </div>
                      {plan.stripe_price_id ? (
                        <div className="mt-1 font-mono text-xs text-muted-foreground">
                          {plan.stripe_price_id}
                        </div>
                      ) : null}
                    </div>

                    {!isEditing ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => startEdit(plan)}
                      >
                        {t("admin.credits.rechargePlansEdit")}
                      </Button>
                    ) : null}
                  </div>

                  {isEditing && draft ? (
                    <div className="mt-4 grid gap-4 border-t pt-4 md:grid-cols-2">
                      <Field label={t("admin.credits.rechargePlansPlanId")}>
                        <Input value={plan.id} disabled />
                      </Field>
                      <Field label={t("admin.credits.rechargePlansAmountReadOnly")}>
                        <Input value={formatAmountCny(plan.amount_cents)} disabled />
                      </Field>
                      <Field label={t("admin.credits.editPlan")}>
                        <Input
                          value={draft.name}
                          onChange={(event) =>
                            setDraft({ ...draft, name: event.target.value })
                          }
                        />
                      </Field>
                      <Field label={t("admin.credits.editCredits")}>
                        <Input
                          inputMode="numeric"
                          value={draft.credits}
                          onChange={(event) =>
                            setDraft({ ...draft, credits: event.target.value })
                          }
                        />
                      </Field>
                      <Field label={t("admin.credits.rechargePlansBonusCredits")}>
                        <Input
                          inputMode="numeric"
                          value={draft.bonus_credits}
                          onChange={(event) =>
                            setDraft({ ...draft, bonus_credits: event.target.value })
                          }
                        />
                      </Field>
                      <Field label={t("admin.credits.rechargePlansSortOrder")}>
                        <Input
                          inputMode="numeric"
                          value={draft.sort_order}
                          onChange={(event) =>
                            setDraft({ ...draft, sort_order: event.target.value })
                          }
                        />
                      </Field>
                      <Field label={t("admin.credits.rechargePlansBadge")}>
                        <Input
                          value={draft.badge}
                          onChange={(event) =>
                            setDraft({ ...draft, badge: event.target.value })
                          }
                        />
                      </Field>
                      <Field label={t("admin.credits.rechargePlansStripePriceId")}>
                        <Input
                          value={draft.stripe_price_id}
                          placeholder="price_..."
                          onChange={(event) =>
                            setDraft({
                              ...draft,
                              stripe_price_id: event.target.value,
                            })
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
                        {t("admin.credits.rechargePlansEnabled")}
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={draft.visible}
                          onChange={(event) =>
                            setDraft({ ...draft, visible: event.target.checked })
                          }
                        />
                        {t("admin.credits.rechargePlansVisible")}
                      </label>

                      <div className="flex flex-wrap gap-2 md:col-span-2">
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
                            ? t("admin.credits.rechargePlansSaving")
                            : t("admin.credits.rechargePlansSave")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={isSaving}
                          onClick={cancelEdit}
                        >
                          {t("admin.credits.rechargePlansCancel")}
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
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
