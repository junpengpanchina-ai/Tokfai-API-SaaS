"use client";

import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
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
  archiveAdminRechargePlan,
  createAdminRechargePlan,
  duplicateAdminRechargePlan,
  fetchAdminRechargePlans,
  restoreAdminRechargePlan,
  updateAdminRechargePlan,
  type AdminRechargePlanCreateBody,
  type AdminRechargePlanListItem,
  type AdminRechargePlanUpdateBody,
} from "@/lib/admin/client";
import {
  draftRechargePlanValidationMessage,
  formatAdminRechargePlanError,
} from "@/lib/admin/recharge-plan-errors";
import { formatCny } from "@/lib/billing/recharge-plans";
import { formatDateTime, formatInt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

const PLAN_ID_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

type PanelMode = "list" | "create" | "edit";

type PlanDraft = {
  id: string;
  name: string;
  amount_yuan: string;
  base_credits: string;
  bonus_credits: string;
  badge: string;
  description: string;
  sort_order: string;
  enabled: boolean;
  visible: boolean;
};

function emptyDraft(): PlanDraft {
  return {
    id: "",
    name: "",
    amount_yuan: "",
    base_credits: "",
    bonus_credits: "0",
    badge: "",
    description: "",
    sort_order: "1000",
    enabled: false,
    visible: true,
  };
}

function centsToYuanInput(amountCents: number): string {
  const yuan = amountCents / 100;
  return Number.isInteger(yuan) ? String(yuan) : yuan.toFixed(2);
}

function yuanInputToNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const amountYuan = Number(trimmed);
  if (!Number.isFinite(amountYuan) || amountYuan <= 0) return null;
  return amountYuan;
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
    id: plan.id,
    name: plan.name,
    amount_yuan: centsToYuanInput(plan.amount_cents),
    base_credits: String(plan.base_credits),
    bonus_credits: String(plan.bonus_credits),
    badge: plan.badge ?? "",
    description: plan.description ?? "",
    sort_order: String(plan.sort_order),
    enabled: plan.enabled,
    visible: plan.visible,
  };
}

function draftToCreateBody(draft: PlanDraft): AdminRechargePlanCreateBody {
  const planId = draft.id.trim();
  if (!planId || !PLAN_ID_PATTERN.test(planId) || planId.length < 2) {
    throw new Error("invalid_plan_id");
  }
  if (!draft.name.trim()) {
    throw new Error("invalid_name");
  }

  const amountYuan = yuanInputToNumber(draft.amount_yuan);
  if (amountYuan == null) {
    throw new Error("invalid_amount");
  }

  const baseCredits = parseNonNegativeInt(draft.base_credits);
  const bonusCredits = parseNonNegativeInt(draft.bonus_credits);
  const sortOrder = parseNonNegativeInt(draft.sort_order);
  if (baseCredits == null) {
    throw new Error("invalid_base_credits");
  }
  if (bonusCredits == null) {
    throw new Error("invalid_bonus_credits");
  }
  if (sortOrder == null) {
    throw new Error("invalid_sort_order");
  }
  if (baseCredits + bonusCredits <= 0) {
    throw new Error("invalid_total_credits");
  }

  return {
    id: planId,
    name: draft.name.trim(),
    amount_yuan: amountYuan,
    base_credits: baseCredits,
    bonus_credits: bonusCredits,
    enabled: draft.enabled,
    visible: draft.visible,
    sort_order: sortOrder,
    badge: draft.badge.trim() ? draft.badge.trim() : null,
    description: draft.description.trim() ? draft.description.trim() : null,
  };
}

function draftToUpdateBody(draft: PlanDraft): AdminRechargePlanUpdateBody {
  const amountYuan = yuanInputToNumber(draft.amount_yuan);
  if (amountYuan == null) {
    throw new Error("invalid_amount");
  }

  const baseCredits = parseNonNegativeInt(draft.base_credits);
  const bonusCredits = parseNonNegativeInt(draft.bonus_credits);
  const sortOrder = parseNonNegativeInt(draft.sort_order);
  if (baseCredits == null) {
    throw new Error("invalid_base_credits");
  }
  if (bonusCredits == null) {
    throw new Error("invalid_bonus_credits");
  }
  if (sortOrder == null) {
    throw new Error("invalid_sort_order");
  }
  if (baseCredits + bonusCredits <= 0) {
    throw new Error("invalid_total_credits");
  }
  if (!draft.name.trim()) {
    throw new Error("invalid_name");
  }

  return {
    name: draft.name.trim(),
    amount_yuan: amountYuan,
    base_credits: baseCredits,
    bonus_credits: bonusCredits,
    enabled: draft.enabled,
    visible: draft.visible,
    sort_order: sortOrder,
    badge: draft.badge.trim() ? draft.badge.trim() : null,
    description: draft.description.trim() ? draft.description.trim() : null,
  };
}

function planErrorMessage(
  error: unknown,
  t: (key: string) => string,
  fallback: string
): string {
  return formatAdminRechargePlanError(error, t, fallback);
}

export function AdminRechargePlansPanel() {
  const { t } = useI18n();
  const [plans, setPlans] = useState<AdminRechargePlanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [panelMode, setPanelMode] = useState<PanelMode>("list");
  const [editingPlanId, setEditingPlanId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [actionPlanId, setActionPlanId] = useState<string | null>(null);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const rows = await fetchAdminRechargePlans({ includeArchived: showArchived });
      setPlans(rows);
    } catch (error) {
      setLoadError(planErrorMessage(error, t, t("admin.rechargePlans.loadFailed")));
    } finally {
      setLoading(false);
    }
  }, [showArchived, t]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const draftTotal = useMemo(
    () => (draft ? draftTotalCredits(draft) : null),
    [draft]
  );

  function openCreateForm() {
    setPanelMode("create");
    setEditingPlanId(null);
    setDraft(emptyDraft());
    setFormError(null);
    setStatusMessage(null);
  }

  function startEdit(plan: AdminRechargePlanListItem) {
    setPanelMode("edit");
    setEditingPlanId(plan.id);
    setDraft(planToDraft(plan));
    setFormError(null);
    setStatusMessage(null);
  }

  function closeForm() {
    setPanelMode("list");
    setEditingPlanId(null);
    setDraft(null);
    setFormError(null);
  }

  async function handleCreateSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft) return;

    setSubmitting(true);
    setFormError(null);
    setStatusMessage(null);
    try {
      let body: AdminRechargePlanCreateBody;
      try {
        body = draftToCreateBody(draft);
      } catch (err) {
        setFormError(
          draftRechargePlanValidationMessage(
            err instanceof Error ? err : new Error("invalid_fields"),
            t
          )
        );
        return;
      }
      await createAdminRechargePlan(body);
      closeForm();
      setStatusMessage(t("admin.rechargePlans.created"));
      await loadPlans();
    } catch (error) {
      setFormError(
        planErrorMessage(error, t, t("admin.rechargePlans.createFailed"))
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft || !editingPlanId) return;

    setSubmitting(true);
    setFormError(null);
    setStatusMessage(null);
    try {
      let body: AdminRechargePlanUpdateBody;
      try {
        body = draftToUpdateBody(draft);
      } catch (err) {
        setFormError(
          draftRechargePlanValidationMessage(
            err instanceof Error ? err : new Error("invalid_fields"),
            t
          )
        );
        return;
      }
      await updateAdminRechargePlan(editingPlanId, body);
      closeForm();
      setStatusMessage(t("admin.rechargePlans.saved"));
      await loadPlans();
    } catch (error) {
      setFormError(
        planErrorMessage(error, t, t("admin.rechargePlans.saveFailed"))
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleQuickPatch(
    planId: string,
    body: AdminRechargePlanUpdateBody,
    successMessage: string
  ) {
    setActionPlanId(planId);
    setFormError(null);
    try {
      await updateAdminRechargePlan(planId, body);
      setStatusMessage(successMessage);
      await loadPlans();
    } catch (error) {
      setLoadError(
        planErrorMessage(error, t, t("admin.rechargePlans.saveFailed"))
      );
    } finally {
      setActionPlanId(null);
    }
  }

  async function handleDuplicate(plan: AdminRechargePlanListItem) {
    setActionPlanId(plan.id);
    setFormError(null);
    try {
      const result = await duplicateAdminRechargePlan(plan.id);
      setStatusMessage(
        t("admin.rechargePlans.duplicated").replace("{id}", result.plan.id)
      );
      await loadPlans();
    } catch (error) {
      setLoadError(
        planErrorMessage(error, t, t("admin.rechargePlans.createFailed"))
      );
    } finally {
      setActionPlanId(null);
    }
  }

  async function handleArchive(planId: string) {
    setActionPlanId(planId);
    try {
      await archiveAdminRechargePlan(planId);
      if (editingPlanId === planId) closeForm();
      setStatusMessage(t("admin.rechargePlans.archived"));
      await loadPlans();
    } catch (error) {
      setLoadError(
        planErrorMessage(error, t, t("admin.rechargePlans.saveFailed"))
      );
    } finally {
      setActionPlanId(null);
    }
  }

  async function handleRestore(planId: string) {
    setActionPlanId(planId);
    try {
      await restoreAdminRechargePlan(planId);
      setStatusMessage(t("admin.rechargePlans.restored"));
      await loadPlans();
    } catch (error) {
      setLoadError(
        planErrorMessage(error, t, t("admin.rechargePlans.saveFailed"))
      );
    } finally {
      setActionPlanId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {panelMode === "create" && draft ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("admin.rechargePlans.createTitle")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PlanForm
              mode="create"
              draft={draft}
              draftTotal={draftTotal}
              submitting={submitting}
              error={formError}
              onChange={setDraft}
              onSubmit={handleCreateSubmit}
              onCancel={closeForm}
              t={t}
            />
          </CardContent>
        </Card>
      ) : null}

      {panelMode === "edit" && draft && editingPlanId ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("admin.rechargePlans.edit")}</CardTitle>
            <CardDescription className="font-mono text-xs">
              {editingPlanId}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlanForm
              mode="edit"
              draft={draft}
              draftTotal={draftTotal}
              submitting={submitting}
              error={formError}
              onChange={setDraft}
              onSubmit={handleEditSubmit}
              onCancel={closeForm}
              t={t}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-base">
                  {t("admin.rechargePlans.tableTitle")}
                </CardTitle>
                <Badge variant="secondary">{plans.length}</Badge>
              </div>
              <CardDescription className="mt-1">
                {t("admin.rechargePlans.tableDesc")}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(event) => setShowArchived(event.target.checked)}
                />
                {t("admin.rechargePlans.showArchived")}
              </label>
              <Button type="button" size="sm" onClick={openCreateForm}>
                {t("admin.rechargePlans.createPlan")}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => void loadPlans()}
              >
                {loading ? t("admin.common.refreshing") : t("admin.common.refresh")}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>{t("admin.rechargePlans.creditsComputedHint")}</li>
            <li>{t("admin.rechargePlans.checkoutHint")}</li>
          </ul>

          {loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : null}
          {statusMessage ? (
            <p className="text-sm text-emerald-600 dark:text-emerald-400">
              {statusMessage}
            </p>
          ) : null}

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t("admin.common.refreshing")}
            </div>
          ) : plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("admin.rechargePlans.empty")}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[80rem] text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-3 font-medium">
                      {t("admin.rechargePlans.colId")}
                    </th>
                    <th className="py-2 pr-3 font-medium">
                      {t("admin.rechargePlans.colName")}
                    </th>
                    <th className="py-2 pr-3 font-medium">
                      {t("admin.rechargePlans.colAmount")}
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      {t("admin.rechargePlans.colBaseCredits")}
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      {t("admin.rechargePlans.colBonusCredits")}
                    </th>
                    <th className="py-2 pr-3 text-right font-medium">
                      {t("admin.rechargePlans.colCredits")}
                    </th>
                    <th className="py-2 pr-3 font-medium">
                      {t("admin.rechargePlans.colSortOrder")}
                    </th>
                    <th className="py-2 pr-3 font-medium">
                      {t("admin.rechargePlans.colStripePriceId")}
                    </th>
                    <th className="py-2 pr-3 font-medium">
                      {t("admin.rechargePlans.colBadge")}
                    </th>
                    <th className="py-2 pr-3 font-medium">
                      {t("admin.rechargePlans.colDescription")}
                    </th>
                    <th className="py-2 pr-3 font-medium">
                      {t("admin.rechargePlans.colEnabled")}
                    </th>
                    <th className="py-2 pr-3 font-medium">
                      {t("admin.rechargePlans.colVisible")}
                    </th>
                    <th className="py-2 pr-3 font-medium">
                      {t("admin.rechargePlans.colArchived")}
                    </th>
                    <th className="py-2 pr-3 font-medium">
                      {t("admin.rechargePlans.colUpdated")}
                    </th>
                    <th className="py-2 pr-3 font-medium">
                      {t("admin.rechargePlans.colActions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plans.map((plan) => {
                    const isArchived = Boolean(plan.archived_at);
                    const isBusy = actionPlanId === plan.id;

                    return (
                      <Fragment key={plan.id}>
                        <tr
                          className={`border-b align-top ${isArchived ? "opacity-70" : ""}`}
                        >
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
                          <td className="py-2 pr-3 font-mono text-xs">
                            {plan.sort_order}
                          </td>
                          <td className="max-w-[10rem] py-2 pr-3 font-mono text-xs text-muted-foreground">
                            {plan.stripe_price_id ?? "—"}
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
                          <td className="py-2 pr-3">
                            {isArchived ? (
                              <Badge variant="secondary">
                                {t("admin.rechargePlans.archivedBadge")}
                              </Badge>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">
                            {formatDateTime(plan.updated_at)}
                          </td>
                          <td className="py-2 pr-3">
                            <div className="flex flex-wrap gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => startEdit(plan)}
                              >
                                {t("admin.rechargePlans.edit")}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={isBusy}
                                onClick={() => void handleDuplicate(plan)}
                              >
                                {t("admin.rechargePlans.duplicate")}
                              </Button>
                              {!isArchived ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void handleQuickPatch(
                                      plan.id,
                                      { enabled: !plan.enabled },
                                      plan.enabled
                                        ? t("admin.rechargePlans.disableCheckout")
                                        : t("admin.rechargePlans.enableCheckout")
                                    )
                                  }
                                >
                                  {plan.enabled
                                    ? t("admin.rechargePlans.disableCheckout")
                                    : t("admin.rechargePlans.enableCheckout")}
                                </Button>
                              ) : null}
                              {!isArchived ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() =>
                                    void handleQuickPatch(
                                      plan.id,
                                      { visible: !plan.visible },
                                      plan.visible
                                        ? t("admin.rechargePlans.hideFromPricing")
                                        : t("admin.rechargePlans.showOnPricing")
                                    )
                                  }
                                >
                                  {plan.visible
                                    ? t("admin.rechargePlans.hideFromPricing")
                                    : t("admin.rechargePlans.showOnPricing")}
                                </Button>
                              ) : null}
                              {isArchived ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => void handleRestore(plan.id)}
                                >
                                  {t("admin.rechargePlans.unarchive")}
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={isBusy}
                                  onClick={() => void handleArchive(plan.id)}
                                >
                                  {t("admin.rechargePlans.archive")}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PlanForm({
  mode,
  draft,
  draftTotal,
  submitting,
  error,
  onChange,
  onSubmit,
  onCancel,
  t,
}: {
  mode: "create" | "edit";
  draft: PlanDraft;
  draftTotal: number | null;
  submitting: boolean;
  error: string | null;
  onChange: (draft: PlanDraft) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  t: (key: string) => string;
}) {
  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {mode === "create" ? (
          <Field label={t("admin.rechargePlans.colId")}>
            <Input
              value={draft.id}
              onChange={(event) =>
                onChange({ ...draft, id: event.target.value.toLowerCase() })
              }
              className="font-mono text-xs"
              placeholder="starter-plus"
            />
          </Field>
        ) : (
          <Field label={t("admin.rechargePlans.colId")}>
            <Input value={draft.id} disabled className="font-mono text-xs" />
          </Field>
        )}
        <Field label={t("admin.rechargePlans.colName")}>
          <Input
            value={draft.name}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
          />
        </Field>
        <Field label={t("admin.rechargePlans.colAmount")}>
          <Input
            inputMode="decimal"
            step="0.01"
            min="0.01"
            value={draft.amount_yuan}
            onChange={(event) =>
              onChange({ ...draft, amount_yuan: event.target.value })
            }
          />
        </Field>
        <Field label={t("admin.rechargePlans.colBaseCredits")}>
          <Input
            inputMode="numeric"
            value={draft.base_credits}
            onChange={(event) =>
              onChange({ ...draft, base_credits: event.target.value })
            }
          />
        </Field>
        <Field label={t("admin.rechargePlans.colBonusCredits")}>
          <Input
            inputMode="numeric"
            value={draft.bonus_credits}
            onChange={(event) =>
              onChange({ ...draft, bonus_credits: event.target.value })
            }
          />
        </Field>
        <Field label={t("admin.rechargePlans.colCredits")}>
          <Input
            value={draftTotal != null ? formatInt(draftTotal) : "—"}
            disabled
          />
        </Field>
        <Field label={t("admin.rechargePlans.colSortOrder")}>
          <Input
            inputMode="numeric"
            value={draft.sort_order}
            onChange={(event) =>
              onChange({ ...draft, sort_order: event.target.value })
            }
          />
        </Field>
        <Field label={t("admin.rechargePlans.colBadge")}>
          <Input
            value={draft.badge}
            onChange={(event) => onChange({ ...draft, badge: event.target.value })}
          />
        </Field>
        <Field label={t("admin.rechargePlans.colDescription")}>
          <Input
            value={draft.description}
            onChange={(event) =>
              onChange({ ...draft, description: event.target.value })
            }
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(event) =>
              onChange({ ...draft, enabled: event.target.checked })
            }
          />
          {t("admin.rechargePlans.colEnabled")}
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.visible}
            onChange={(event) =>
              onChange({ ...draft, visible: event.target.checked })
            }
          />
          {t("admin.rechargePlans.colVisible")}
        </label>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : null}
          {submitting
            ? mode === "create"
              ? t("admin.rechargePlans.creating")
              : t("admin.rechargePlans.saving")
            : mode === "create"
              ? t("admin.rechargePlans.create")
              : t("admin.rechargePlans.save")}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={submitting}
          onClick={onCancel}
        >
          {t("admin.rechargePlans.cancel")}
        </Button>
      </div>
    </form>
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
