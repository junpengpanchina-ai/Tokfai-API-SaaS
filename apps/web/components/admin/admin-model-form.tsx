"use client";

import type { FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminModelFormValues } from "@/lib/admin/models";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function AdminModelForm({
  mode,
  values,
  onChange,
  onSubmit,
  onCancel,
  submitting,
  error,
}: {
  mode: "create" | "edit";
  values: AdminModelFormValues;
  onChange: (values: AdminModelFormValues) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel?: () => void;
  submitting: boolean;
  error: { code: string; message: string } | null;
}) {
  const { t } = useI18n();
  const isCreate = mode === "create";
  const isImageBilling = values.billing_type === "image";

  function patch(patchValues: Partial<AdminModelFormValues>) {
    onChange({ ...values, ...patchValues });
  }

  return (
    <form className="grid gap-4" onSubmit={onSubmit}>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label={t("admin.models.manage.formId")}>
          <Input
            value={values.id}
            disabled={!isCreate || submitting}
            onChange={(event) => patch({ id: event.target.value })}
            placeholder="gemini-3.1-pro"
            className="font-mono text-xs"
            required
          />
        </Field>
        <Field label={t("admin.models.manage.formDisplayName")}>
          <Input
            value={values.display_name}
            disabled={submitting}
            onChange={(event) => patch({ display_name: event.target.value })}
            required
          />
        </Field>
        <Field label={t("admin.models.manage.formProvider")}>
          <Input
            value={values.provider}
            disabled={submitting}
            onChange={(event) => patch({ provider: event.target.value })}
          />
        </Field>
        <Field label={t("admin.models.manage.formType")}>
          <NativeSelect
            value={values.model_type}
            disabled={submitting}
            onChange={(value) =>
              patch({
                model_type: value as AdminModelFormValues["model_type"],
                billing_type: value === "image" ? "image" : "chat",
              })
            }
            options={[
              { value: "chat", label: t("admin.models.typeChat") },
              { value: "image", label: t("admin.models.typeImage") },
              { value: "video", label: t("admin.models.typeVideo") },
              { value: "other", label: t("admin.models.manage.typeOther") },
            ]}
          />
        </Field>
        <Field label={t("admin.models.manage.formBillingType")}>
          <NativeSelect
            value={values.billing_type}
            disabled={submitting}
            onChange={(value) =>
              patch({
                billing_type: value as AdminModelFormValues["billing_type"],
              })
            }
            options={[
              { value: "chat", label: t("admin.models.manage.billingChat") },
              { value: "image", label: t("admin.models.manage.billingImage") },
            ]}
          />
        </Field>
        <Field label={t("admin.models.manage.formSortOrder")}>
          <Input
            type="number"
            min="0"
            step="1"
            value={values.sort_order}
            disabled={submitting}
            onChange={(event) =>
              patch({ sort_order: Number(event.target.value) || 0 })
            }
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {!isImageBilling ? (
          <>
            <Field label={t("admin.models.manage.formInputPerMillion")}>
              <Input
                type="number"
                min="0"
                step="0.000001"
                value={values.input_credits_per_million_tokens}
                disabled={submitting}
                onChange={(event) =>
                  patch({ input_credits_per_million_tokens: event.target.value })
                }
              />
            </Field>
            <Field label={t("admin.models.manage.formOutputPerMillion")}>
              <Input
                type="number"
                min="0"
                step="0.000001"
                value={values.output_credits_per_million_tokens}
                disabled={submitting}
                onChange={(event) =>
                  patch({ output_credits_per_million_tokens: event.target.value })
                }
              />
            </Field>
          </>
        ) : (
          <Field label={t("admin.models.manage.formImageCredits")}>
            <Input
              type="number"
              min="0"
              step="1"
              value={values.image_credits_per_generation}
              disabled={submitting}
              onChange={(event) =>
                patch({ image_credits_per_generation: event.target.value })
              }
            />
          </Field>
        )}
        <Field label={t("admin.models.manage.formMarkupRatio")}>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={values.markup_ratio}
            disabled={submitting}
            onChange={(event) => patch({ markup_ratio: event.target.value })}
          />
        </Field>
        <Field label={t("admin.models.manage.formUpstreamNote")}>
          <Input
            value={values.upstream_cost_note}
            disabled={submitting}
            onChange={(event) =>
              patch({ upstream_cost_note: event.target.value })
            }
            placeholder={t("admin.models.manage.formUpstreamNoteHint")}
          />
        </Field>
      </div>

      <div className="flex flex-wrap gap-4 text-sm">
        <ToggleField
          label={t("admin.models.manage.formEnabled")}
          checked={values.enabled}
          disabled={submitting}
          onChange={(enabled) => patch({ enabled })}
        />
        <ToggleField
          label={t("admin.models.manage.formVisible")}
          checked={values.visible}
          disabled={submitting}
          onChange={(visible) => patch({ visible })}
        />
        <ToggleField
          label={t("admin.models.manage.formPricingEnabled")}
          checked={values.pricing_enabled}
          disabled={submitting}
          onChange={(pricing_enabled) => patch({ pricing_enabled })}
        />
        <ToggleField
          label={t("admin.models.manage.formPricingVisible")}
          checked={values.pricing_visible}
          disabled={submitting}
          onChange={(pricing_visible) => patch({ pricing_visible })}
        />
      </div>

      {error ? (
        <div
          className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
          role="alert"
        >
          <p className="font-mono text-xs text-destructive">{error.code}</p>
          <p className="mt-1 text-destructive">{error.message}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting
            ? t("admin.models.manage.saving")
            : isCreate
              ? t("admin.models.manage.createModel")
              : t("admin.models.manage.saveChanges")}
        </Button>
        {onCancel ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={submitting}
            onClick={onCancel}
          >
            {t("admin.models.manage.cancel")}
          </Button>
        ) : null}
      </div>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ToggleField({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function NativeSelect({
  value,
  onChange,
  disabled,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
