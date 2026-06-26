"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Boxes } from "lucide-react";

import { CopyConfigAction } from "@/components/copyable-snippet-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildConfiguratorHrefFromPayload,
  buildPayload,
  emptyFieldsForIndustry,
  getIndustryFieldSchema,
  readPayloadBuilderPrefs,
  recommendPayloadModel,
  sampleFieldsForIndustry,
  writePayloadBuilderPrefs,
  type PayloadApi,
  type PayloadFieldSchema,
  type PayloadIndustry,
  type PayloadModel,
} from "./payload-builder-data";
import { useI18n } from "@/lib/i18n/i18n-provider";

import { isPayloadBuilderKeyPlaceholder } from "./payload-builder-display-helpers";

type CustomerPayloadBuilderProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
  initialIndustry?: PayloadIndustry;
  initialApi?: PayloadApi;
  initialModel?: PayloadModel;
  compact?: boolean;
};

const INDUSTRIES: PayloadIndustry[] = ["general", "hospital", "auto", "ecommerce", "support"];
const APIS: PayloadApi[] = ["chat", "responses", "image", "batch"];
const MODELS: PayloadModel[] = ["auto-fast", "auto-pro", "auto-cheap", "gpt-image-2"];

type PreviewTab = "requestJson" | "oneLineCurl" | "nodePayload" | "pythonPayload" | "batchItems";

function TagsField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap gap-1">
        {value.map((tag) => (
          <Badge key={tag} variant="secondary" className="gap-1">
            {tag}
            <button
              type="button"
              className="ml-1 text-muted-foreground hover:text-foreground"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              aria-label={`Remove ${tag}`}
            >
              ×
            </button>
          </Badge>
        ))}
      </div>
      <Input
        id={id}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && draft.trim()) {
            e.preventDefault();
            onChange([...value, draft.trim()]);
            setDraft("");
          }
        }}
      />
      <p className="text-xs text-muted-foreground">Press Enter to add each tag.</p>
    </div>
  );
}

function FieldInput({
  field,
  value,
  onChange,
  t,
}: {
  field: PayloadFieldSchema;
  value: string | string[];
  onChange: (v: string | string[]) => void;
  t: (key: string) => string;
}) {
  const label = t(field.labelKey);
  const placeholder = field.placeholderKey ? t(field.placeholderKey) : undefined;

  if (field.type === "tags") {
    return (
      <TagsField
        id={field.id}
        label={label}
        value={Array.isArray(value) ? value : []}
        onChange={(tags) => onChange(tags)}
        placeholder={placeholder}
      />
    );
  }

  if (field.type === "textarea") {
    return (
      <div className="flex flex-col gap-2">
        <Label htmlFor={field.id}>{label}</Label>
        <textarea
          id={field.id}
          className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          value={typeof value === "string" ? value : ""}
          placeholder={placeholder}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={field.id}>{label}</Label>
      <Input
        id={field.id}
        value={typeof value === "string" ? value : ""}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function PayloadBuilderPanelClient({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "payload-builder",
  initialIndustry,
  initialApi,
  initialModel,
  compact = false,
}: CustomerPayloadBuilderProps) {
  const { t } = useI18n();
  const [industry, setIndustry] = useState<PayloadIndustry>(initialIndustry ?? "general");
  const [api, setApi] = useState<PayloadApi>(initialApi ?? "chat");
  const [model, setModel] = useState<PayloadModel>(initialModel ?? "auto-fast");
  const [fields, setFields] = useState<Record<string, string | string[]>>(() =>
    emptyFieldsForIndustry(initialIndustry ?? "general")
  );
  const [previewTab, setPreviewTab] = useState<PreviewTab>("requestJson");

  useEffect(() => {
    const prefs = readPayloadBuilderPrefs();
    if (!initialIndustry && prefs?.industry) setIndustry(prefs.industry);
    if (!initialApi && prefs?.api) setApi(prefs.api);
    if (!initialModel && prefs?.model) setModel(prefs.model);
  }, [initialIndustry, initialApi, initialModel]);

  useEffect(() => {
    if (initialIndustry) setIndustry(initialIndustry);
    if (initialApi) setApi(initialApi);
    if (initialModel) setModel(initialModel);
  }, [initialIndustry, initialApi, initialModel]);

  useEffect(() => {
    writePayloadBuilderPrefs({
      industry,
      api,
      model: api === "image" ? "gpt-image-2" : model,
    });
  }, [industry, api, model]);

  useEffect(() => {
    if (api === "image") setModel("gpt-image-2");
  }, [api]);

  const schema = useMemo(() => getIndustryFieldSchema(industry, api), [industry, api]);

  const setField = useCallback((id: string, value: string | string[]) => {
    setFields((prev) => ({ ...prev, [id]: value }));
  }, []);

  const handleIndustryChange = (value: PayloadIndustry) => {
    setIndustry(value);
    setFields(emptyFieldsForIndustry(value));
    setModel(recommendPayloadModel(value, api));
  };

  const generated = useMemo(
    () =>
      buildPayload(
        {
          industry,
          api,
          model: api === "image" ? "gpt-image-2" : model,
          fields,
        },
        apiKey,
        t
      ),
    [industry, api, model, fields, apiKey, t]
  );

  const keyIsPlaceholder = isPayloadBuilderKeyPlaceholder(apiKey);
  const recommended = recommendPayloadModel(industry, api);

  const previewContent =
    previewTab === "requestJson"
      ? generated.requestJson
      : previewTab === "oneLineCurl"
        ? generated.oneLineCurl
        : previewTab === "nodePayload"
          ? generated.nodePayload
          : previewTab === "pythonPayload"
            ? generated.pythonPayload
            : generated.batchItems ?? "";

  const copyPreview = () => {
    if (previewTab === "requestJson") onCopy(`${idPrefix}-json`, generated.requestJson);
    else if (previewTab === "oneLineCurl") onCopy(`${idPrefix}-curl`, generated.oneLineCurl);
    else if (previewTab === "nodePayload") onCopy(`${idPrefix}-node`, generated.nodePayload);
    else if (previewTab === "pythonPayload") onCopy(`${idPrefix}-python`, generated.pythonPayload);
    else onCopy(`${idPrefix}-batch`, generated.batchItems ?? "");
  };

  return (
    <section className="min-w-0 rounded-xl border bg-card p-4 shadow-sm sm:p-6">
      {!compact ? (
        <div className="mb-6">
          <h2 className="flex items-center gap-2 text-xl font-semibold tracking-tight sm:text-2xl">
            <Boxes className="h-5 w-5 text-primary" />
            {t("integration.payloadBuilder.title")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("integration.payloadBuilder.subtitle")}
          </p>
          {keyIsPlaceholder ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {t("integration.starterTemplates.storeKeyBackend")}
            </p>
          ) : (
            <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">
              {t("integration.templateConfigurator.sessionKeyActive")}
            </p>
          )}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <p className="text-xs font-medium text-muted-foreground w-full">
              {t("integration.payloadBuilder.industryLabel")}
            </p>
            {INDUSTRIES.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={industry === value ? "default" : "outline"}
                onClick={() => handleIndustryChange(value)}
              >
                {t(`integration.payloadBuilder.industry.${value}`)}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <p className="text-xs font-medium text-muted-foreground w-full">
              {t("integration.payloadBuilder.apiLabel")}
            </p>
            {APIS.map((value) => (
              <Button
                key={value}
                type="button"
                size="sm"
                variant={api === value ? "default" : "outline"}
                onClick={() => setApi(value)}
              >
                {t(`integration.starterTemplates.filter${value === "chat" ? "Chat" : value === "responses" ? "Responses" : value === "image" ? "Image" : "Batch"}`)}
              </Button>
            ))}
          </div>

          {api !== "image" ? (
            <div className="flex flex-wrap gap-2">
              <p className="text-xs font-medium text-muted-foreground w-full">
                {t("integration.payloadBuilder.modelLabel")} — {t("integration.templateConfigurator.recommendedModel")}:{" "}
                <span className="font-mono">{recommended}</span>
              </p>
              {MODELS.filter((m) => m !== "gpt-image-2").map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={model === value ? "default" : "outline"}
                  onClick={() => setModel(value)}
                >
                  {value}
                </Button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              {t("integration.payloadBuilder.modelLabel")}: <span className="font-mono">gpt-image-2</span>
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setFields(sampleFieldsForIndustry(industry))}
            >
              {t("integration.payloadBuilder.useSampleData")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setFields(emptyFieldsForIndustry(industry))}
            >
              {t("integration.payloadBuilder.clear")}
            </Button>
          </div>

          <div className="flex flex-col gap-4 rounded-lg border bg-muted/20 p-4">
            <p className="text-sm font-medium text-foreground">{t("integration.payloadBuilder.fields")}</p>
            {schema.map((field) => (
              <FieldInput
                key={field.id}
                field={field}
                value={fields[field.id] ?? (field.type === "tags" ? [] : "")}
                onChange={(v) => setField(field.id, v)}
                t={t}
              />
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold">{generated.title}</h3>
            <Badge variant="outline" className="font-mono text-xs">{generated.endpoint}</Badge>
            <Badge variant="outline" className="font-mono text-xs">{generated.model}</Badge>
          </div>

          <div className="flex flex-wrap gap-2">
            <CopyConfigAction
              id={`${idPrefix}-copy-json`}
              value={generated.requestJson}
              copiedId={copiedId}
              onCopy={onCopy}
              label={t("integration.payloadBuilder.copyRequestJson")}
              copiedLabel={t("integration.copied")}
              primary
            />
            <CopyConfigAction
              id={`${idPrefix}-copy-curl`}
              value={generated.oneLineCurl}
              copiedId={copiedId}
              onCopy={onCopy}
              label={t("integration.payloadBuilder.copyOneLineCurl")}
              copiedLabel={t("integration.copied")}
            />
            <CopyConfigAction
              id={`${idPrefix}-copy-node`}
              value={generated.nodePayload}
              copiedId={copiedId}
              onCopy={onCopy}
              label={t("integration.payloadBuilder.copyNodePayload")}
              copiedLabel={t("integration.copied")}
            />
            <CopyConfigAction
              id={`${idPrefix}-copy-python`}
              value={generated.pythonPayload}
              copiedId={copiedId}
              onCopy={onCopy}
              label={t("integration.payloadBuilder.copyPythonPayload")}
              copiedLabel={t("integration.copied")}
            />
            {generated.batchItems ? (
              <CopyConfigAction
                id={`${idPrefix}-copy-batch`}
                value={generated.batchItems}
                copiedId={copiedId}
                onCopy={onCopy}
                label={t("integration.payloadBuilder.copyBatchItems")}
                copiedLabel={t("integration.copied")}
              />
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2">
            {(
              [
                ["requestJson", "integration.payloadBuilder.tab.requestJson"],
                ["oneLineCurl", "integration.payloadBuilder.tab.oneLineCurl"],
                ["nodePayload", "integration.payloadBuilder.tab.nodePayload"],
                ["pythonPayload", "integration.payloadBuilder.tab.pythonPayload"],
                ...(generated.batchItems
                  ? [["batchItems", "integration.payloadBuilder.tab.batchItems"] as const]
                  : []),
              ] as const
            ).map(([tab, labelKey]) => (
              <Button
                key={tab}
                type="button"
                size="sm"
                variant={previewTab === tab ? "default" : "outline"}
                onClick={() => setPreviewTab(tab)}
              >
                {t(labelKey)}
              </Button>
            ))}
          </div>

          <pre
            className={`max-h-72 overflow-x-auto rounded-md border bg-background p-3 font-mono text-xs ${
              previewTab === "oneLineCurl" ? "whitespace-nowrap" : "whitespace-pre-wrap break-all"
            }`}
          >
            {previewContent}
          </pre>

          <Button type="button" size="sm" variant="outline" onClick={copyPreview}>
            {t("integration.payloadBuilder.copyActiveTab")}
          </Button>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("integration.payloadBuilder.expectedOutput")}
              </p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {generated.expectedOutput.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("integration.payloadBuilder.reconcile")}
              </p>
              <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
                {generated.reconcileSteps.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
            </div>
          </div>

          <p className="rounded-md border border-amber-200/80 bg-amber-50/50 px-3 py-2 text-sm text-muted-foreground dark:border-amber-900/40 dark:bg-amber-950/20">
            <span className="font-medium text-foreground">
              {t("integration.payloadBuilder.safetyBoundary")}:{" "}
            </span>
            {generated.safetyBoundary.join(" ")}
          </p>

          {generated.validationWarnings.length > 0 ? (
            <div className="rounded-md border border-amber-300/80 bg-amber-50/60 px-3 py-2 text-sm dark:border-amber-800 dark:bg-amber-950/30">
              <p className="font-medium text-foreground">{t("integration.payloadBuilder.validationWarnings")}</p>
              <ul className="mt-1 list-disc space-y-1 pl-5 text-muted-foreground">
                {generated.validationWarnings.map((w) => (
                  <li key={w}>
                    {w === "browser_sensitive_data"
                      ? t("integration.payloadBuilder.warning.browserSensitive")
                      : w.startsWith("field_missing:")
                        ? t("integration.payloadBuilder.warning.fieldMissing")
                        : t("integration.payloadBuilder.warning.imageModel")}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link
                href={buildConfiguratorHrefFromPayload({
                  industry,
                  api,
                  model: api === "image" ? "gpt-image-2" : model,
                })}
              >
                {t("integration.payloadBuilder.openTemplateConfigurator")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/usage">{t("integration.payloadBuilder.openUsage")}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/credits">{t("integration.payloadBuilder.openCredits")}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/troubleshooting">
                {t("integration.payloadBuilder.openTroubleshooting")}
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
