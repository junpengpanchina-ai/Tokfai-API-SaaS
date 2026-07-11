"use client";

import { Fragment, useState, type FormEvent } from "react";

import { AdminDebugCard } from "@/components/admin/admin-debug-card";
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
  updateAdminPricing,
  type AdminPricingRow,
  type AdminPricingUpdateBody,
} from "@/lib/admin/client";
import type { AdminDebug } from "@/lib/admin/server";
import { formatCreditsPrecise } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

type PricingDraft = {
  input_credits_per_million_tokens: string;
  output_credits_per_million_tokens: string;
  image_credits_per_generation: string;
  markup_ratio: string;
};

type RowError = {
  message: string;
  request_id: string | null;
};

function formatPrice(value: number | null): string {
  if (value == null) return "—";
  return formatCreditsPrecise(value);
}

function isImageModality(modality: string | null): boolean {
  return modality === "image";
}

function rowToDraft(row: AdminPricingRow): PricingDraft {
  return {
    input_credits_per_million_tokens:
      row.input_price == null ? "" : String(row.input_price),
    output_credits_per_million_tokens:
      row.output_price == null ? "" : String(row.output_price),
    image_credits_per_generation:
      row.image_price == null ? "" : String(row.image_price),
    markup_ratio:
      row.credits_multiplier == null ? "" : String(row.credits_multiplier),
  };
}

function parseOptionalNumber(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return undefined;
  return value;
}

function buildUpdateBody(
  draft: PricingDraft,
  isImage: boolean
): { body: AdminPricingUpdateBody } | { error: string } {
  const body: AdminPricingUpdateBody = {};

  if (isImage) {
    const image = parseOptionalNumber(draft.image_credits_per_generation);
    if (image === undefined) {
      return { error: "invalid_image_credits" };
    }
    if (image == null || image < 0) {
      return { error: "invalid_image_credits" };
    }
    body.image_credits_per_generation = image;
  } else {
    const input = parseOptionalNumber(draft.input_credits_per_million_tokens);
    const output = parseOptionalNumber(draft.output_credits_per_million_tokens);
    if (input === undefined || input == null || input < 0) {
      return { error: "invalid_input_credits" };
    }
    if (output === undefined || output == null || output < 0) {
      return { error: "invalid_output_credits" };
    }
    body.input_credits_per_million_tokens = input;
    body.output_credits_per_million_tokens = output;
  }

  const multiplier = parseOptionalNumber(draft.markup_ratio);
  if (multiplier === undefined) {
    return { error: "invalid_multiplier" };
  }
  if (multiplier != null) {
    if (multiplier <= 0) {
      return { error: "invalid_multiplier" };
    }
    body.markup_ratio = multiplier;
  }

  return { body };
}

function validationMessage(
  code: string,
  t: (key: string) => string
): string {
  switch (code) {
    case "invalid_input_credits":
      return t("admin.pricing.invalidInputCredits");
    case "invalid_output_credits":
      return t("admin.pricing.invalidOutputCredits");
    case "invalid_image_credits":
      return t("admin.pricing.invalidImageCredits");
    case "invalid_multiplier":
      return t("admin.pricing.invalidMultiplier");
    default:
      return t("admin.pricing.invalidFields");
  }
}

export function AdminPricingPanel({
  pricing: initialPricing,
  debug,
}: {
  pricing: AdminPricingRow[];
  debug: AdminDebug | null;
}) {
  const { t } = useI18n();
  const [rows, setRows] = useState<AdminPricingRow[]>(initialPricing);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PricingDraft | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusBusyModelId, setStatusBusyModelId] = useState<string | null>(
    null
  );
  const [rowError, setRowError] = useState<RowError | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  function startEdit(row: AdminPricingRow) {
    setEditingModelId(row.model_id);
    setDraft(rowToDraft(row));
    setRowError(null);
    setStatusMessage(null);
  }

  function cancelEdit() {
    setEditingModelId(null);
    setDraft(null);
    setRowError(null);
    setSubmitting(false);
  }

  function patchDraft(patch: Partial<PricingDraft>) {
    setDraft((current) => (current ? { ...current, ...patch } : current));
  }

  async function handleSave(
    event: FormEvent<HTMLFormElement>,
    row: AdminPricingRow
  ) {
    event.preventDefault();
    if (!draft || submitting) return;

    const isImage = isImageModality(row.modality);
    const built = buildUpdateBody(draft, isImage);
    if ("error" in built) {
      setRowError({
        message: validationMessage(built.error, t),
        request_id: null,
      });
      return;
    }

    setSubmitting(true);
    setRowError(null);
    setStatusMessage(null);

    try {
      const updated = await updateAdminPricing(row.model_id, built.body);
      setRows((current) =>
        current.map((item) =>
          item.model_id === updated.model_id ? updated : item
        )
      );
      setEditingModelId(null);
      setDraft(null);
      setStatusMessage(t("admin.pricing.saved"));
    } catch (error) {
      if (error instanceof AdminApiError) {
        setRowError({
          message: error.isSessionExpired
            ? t("admin.common.sessionExpired")
            : error.message || t("admin.pricing.saveFailed"),
          request_id: error.requestId,
        });
      } else if (error instanceof Error) {
        setRowError({
          message: error.message || t("admin.pricing.saveFailed"),
          request_id: null,
        });
      } else {
        setRowError({
          message: t("admin.pricing.saveFailed"),
          request_id: null,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleListUnlist(
    row: AdminPricingRow,
    action: "list" | "unlist"
  ) {
    if (submitting || statusBusyModelId) return;

    setStatusBusyModelId(row.model_id);
    setRowError(null);
    setStatusMessage(null);

    try {
      const updated = await updateAdminPricing(row.model_id, { action });
      setRows((current) =>
        current.map((item) =>
          item.model_id === updated.model_id ? updated : item
        )
      );
      setStatusMessage(
        action === "list"
          ? t("admin.pricing.listed")
          : t("admin.pricing.unlisted")
      );
    } catch (error) {
      const fallback =
        action === "list"
          ? t("admin.pricing.listFailed")
          : t("admin.pricing.unlistFailed");
      if (error instanceof AdminApiError) {
        setRowError({
          message: error.isSessionExpired
            ? t("admin.common.sessionExpired")
            : error.message || fallback,
          request_id: error.requestId,
        });
      } else if (error instanceof Error) {
        setRowError({
          message: error.message || fallback,
          request_id: null,
        });
      } else {
        setRowError({ message: fallback, request_id: null });
      }
    } finally {
      setStatusBusyModelId(null);
    }
  }

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

      {statusMessage ? (
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          {statusMessage}
        </p>
      ) : null}

      {rowError && !editingModelId ? (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
          role="alert"
        >
          <p className="text-destructive">{rowError.message}</p>
          {rowError.request_id ? (
            <p className="mt-1 font-mono text-xs text-destructive">
              request_id: {rowError.request_id}
            </p>
          ) : null}
        </div>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t("admin.pricing.tableTitle")}</CardTitle>
          <CardDescription>{t("admin.pricing.tableDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            {rows.length === 0 ? (
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
                    <th className="py-2 font-medium">
                      {t("admin.pricing.colActions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const editing = editingModelId === row.model_id;
                    const isImage = isImageModality(row.modality);
                    const statusBusy = statusBusyModelId === row.model_id;
                    const isActive = row.effective_status === "active";

                    return (
                      <Fragment key={row.model_id}>
                        <tr className="border-b last:border-0">
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
                          <td className="py-2 pr-4">
                            {formatPrice(row.input_price)}
                          </td>
                          <td className="py-2 pr-4">
                            {formatPrice(row.output_price)}
                          </td>
                          <td className="py-2 pr-4">
                            {formatPrice(row.image_price)}
                          </td>
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
                          <td className="py-2">
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={
                                  (submitting && editing) ||
                                  Boolean(statusBusyModelId)
                                }
                                onClick={() =>
                                  editing ? cancelEdit() : startEdit(row)
                                }
                              >
                                {editing
                                  ? t("admin.pricing.cancel")
                                  : t("admin.pricing.editPricing")}
                              </Button>
                              {isActive ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={
                                    submitting || Boolean(statusBusyModelId)
                                  }
                                  onClick={() =>
                                    handleListUnlist(row, "unlist")
                                  }
                                >
                                  {statusBusy
                                    ? t("admin.pricing.unlisting")
                                    : t("admin.pricing.unlistModel")}
                                </Button>
                              ) : (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  disabled={
                                    submitting || Boolean(statusBusyModelId)
                                  }
                                  onClick={() => handleListUnlist(row, "list")}
                                >
                                  {statusBusy
                                    ? t("admin.pricing.listing")
                                    : t("admin.pricing.listModel")}
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {editing && draft ? (
                          <tr className="border-b bg-muted/20 last:border-0">
                            <td colSpan={10} className="px-3 py-4">
                              <form
                                className="space-y-4"
                                onSubmit={(event) => handleSave(event, row)}
                              >
                                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                                  {isImage ? (
                                    <div className="space-y-2">
                                      <Label
                                        htmlFor={`pricing-image-${row.model_id}`}
                                      >
                                        {t("admin.pricing.fieldImageCredits")}
                                      </Label>
                                      <Input
                                        id={`pricing-image-${row.model_id}`}
                                        type="number"
                                        min={0}
                                        step="any"
                                        disabled={submitting}
                                        value={
                                          draft.image_credits_per_generation
                                        }
                                        onChange={(event) =>
                                          patchDraft({
                                            image_credits_per_generation:
                                              event.target.value,
                                          })
                                        }
                                      />
                                    </div>
                                  ) : (
                                    <>
                                      <div className="space-y-2">
                                        <Label
                                          htmlFor={`pricing-input-${row.model_id}`}
                                        >
                                          {t(
                                            "admin.pricing.fieldInputCredits"
                                          )}
                                        </Label>
                                        <Input
                                          id={`pricing-input-${row.model_id}`}
                                          type="number"
                                          min={0}
                                          step="any"
                                          disabled={submitting}
                                          value={
                                            draft.input_credits_per_million_tokens
                                          }
                                          onChange={(event) =>
                                            patchDraft({
                                              input_credits_per_million_tokens:
                                                event.target.value,
                                            })
                                          }
                                        />
                                      </div>
                                      <div className="space-y-2">
                                        <Label
                                          htmlFor={`pricing-output-${row.model_id}`}
                                        >
                                          {t(
                                            "admin.pricing.fieldOutputCredits"
                                          )}
                                        </Label>
                                        <Input
                                          id={`pricing-output-${row.model_id}`}
                                          type="number"
                                          min={0}
                                          step="any"
                                          disabled={submitting}
                                          value={
                                            draft.output_credits_per_million_tokens
                                          }
                                          onChange={(event) =>
                                            patchDraft({
                                              output_credits_per_million_tokens:
                                                event.target.value,
                                            })
                                          }
                                        />
                                      </div>
                                    </>
                                  )}
                                  <div className="space-y-2">
                                    <Label
                                      htmlFor={`pricing-multiplier-${row.model_id}`}
                                    >
                                      {t("admin.pricing.fieldMultiplier")}
                                    </Label>
                                    <Input
                                      id={`pricing-multiplier-${row.model_id}`}
                                      type="number"
                                      min={0}
                                      step="any"
                                      disabled={submitting}
                                      value={draft.markup_ratio}
                                      onChange={(event) =>
                                        patchDraft({
                                          markup_ratio: event.target.value,
                                        })
                                      }
                                    />
                                  </div>
                                </div>

                                {rowError ? (
                                  <div
                                    className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
                                    role="alert"
                                  >
                                    <p className="text-destructive">
                                      {rowError.message}
                                    </p>
                                    {rowError.request_id ? (
                                      <p className="mt-1 font-mono text-xs text-destructive">
                                        request_id: {rowError.request_id}
                                      </p>
                                    ) : null}
                                  </div>
                                ) : null}

                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    type="submit"
                                    size="sm"
                                    disabled={submitting}
                                  >
                                    {submitting
                                      ? t("admin.pricing.saving")
                                      : t("admin.pricing.save")}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={submitting}
                                    onClick={cancelEdit}
                                  >
                                    {t("admin.pricing.cancel")}
                                  </Button>
                                </div>
                              </form>
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}
