"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useTransition } from "react";

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
import { getDmitBaseUrl } from "@/lib/dmit/client";

export type AdminModel = {
  id: string;
  display_name: string | null;
  provider: string | null;
  enabled: boolean | null;
  visible: boolean | null;
  billing_mode: string | null;
  input_per_1k: number | null;
  output_per_1k: number | null;
  billable: boolean | null;
  markup_multiplier: number | null;
};

type ModelsResponse = {
  data: AdminModel[];
};

type ModelPatchBody = Partial<
  Pick<
    AdminModel,
    | "enabled"
    | "visible"
    | "billable"
    | "input_per_1k"
    | "output_per_1k"
    | "markup_multiplier"
  >
>;

type PricingDraft = {
  input_per_1k: string;
  output_per_1k: string;
  markup_multiplier: string;
};

function pricingDraftFromModel(model: AdminModel): PricingDraft {
  return {
    input_per_1k: formatDraftNumber(model.input_per_1k),
    output_per_1k: formatDraftNumber(model.output_per_1k),
    markup_multiplier: formatDraftNumber(model.markup_multiplier),
  };
}

function formatDraftNumber(value: number | null): string {
  return value == null ? "" : String(value);
}

function formatDisplayNumber(value: number | null): string {
  if (value == null) return "—";
  return Number.isInteger(value) ? String(value) : value.toString();
}

function boolLabel(value: boolean | null): string {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "—";
}

export function AdminModelsClient({
  accessToken,
  initialModels,
  initialError,
}: {
  accessToken: string | null;
  initialModels: AdminModel[];
  initialError: string | null;
}) {
  const router = useRouter();
  const [models, setModels] = useState(initialModels);
  const [error, setError] = useState<string | null>(initialError);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [pricingDrafts, setPricingDrafts] = useState<Record<string, PricingDraft>>(
    () => Object.fromEntries(initialModels.map((m) => [m.id, pricingDraftFromModel(m)]))
  );
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(
    initialModels.length === 0 && !initialError
  );
  const [isPending, startTransition] = useTransition();

  const syncDrafts = useCallback((rows: AdminModel[]) => {
    setPricingDrafts(
      Object.fromEntries(rows.map((m) => [m.id, pricingDraftFromModel(m)]))
    );
  }, []);

  const loadModels = useCallback(async () => {
    if (!accessToken) {
      setError("Please sign in again before managing models.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${getDmitBaseUrl()}/admin/models`, {
        method: "GET",
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
      });
      const body = (await parseJson(response)) as ModelsResponse & {
        error?: unknown;
      };

      if (!response.ok) {
        throw new Error(errorMessageFromBody(body, response.status));
      }

      const rows = Array.isArray(body.data) ? body.data : [];
      setModels(rows);
      syncDrafts(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load models.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, syncDrafts]);

  useEffect(() => {
    if (initialModels.length === 0 && !initialError) {
      void loadModels();
    }
  }, [initialModels.length, initialError, loadModels]);

  async function patchModel(id: string, patch: ModelPatchBody) {
    if (!accessToken) {
      throw new Error("Please sign in again before managing models.");
    }

    setRowError((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    const response = await fetch(`${getDmitBaseUrl()}/admin/models/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(patch),
    });
    const body = await parseJson(response);

    if (!response.ok) {
      throw new Error(errorMessageFromBody(body, response.status));
    }

    const updated = (body as { data?: AdminModel }).data;
    if (updated) {
      setModels((prev) =>
        prev.map((row) => (row.id === id ? { ...row, ...updated } : row))
      );
      setPricingDrafts((prev) => ({
        ...prev,
        [id]: pricingDraftFromModel(updated),
      }));
    } else {
      startTransition(() => {
        router.refresh();
      });
    }
  }

  async function handleToggle(
    id: string,
    field: "enabled" | "visible" | "billable",
    checked: boolean
  ) {
    try {
      await patchModel(id, { [field]: checked });
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Update failed.",
      }));
    }
  }

  async function handleSavePricing(id: string) {
    const draft = pricingDrafts[id];
    if (!draft) return;

    const input_per_1k = parseNonNegative(draft.input_per_1k);
    const output_per_1k = parseNonNegative(draft.output_per_1k);
    const markup_multiplier = parsePositive(draft.markup_multiplier);

    if (
      input_per_1k === "invalid" ||
      output_per_1k === "invalid" ||
      markup_multiplier === "invalid"
    ) {
      setRowError((prev) => ({
        ...prev,
        [id]: "Enter valid non-negative pricing values; markup must be > 0.",
      }));
      return;
    }

    const patch: ModelPatchBody = {};
    if (input_per_1k !== "empty") patch.input_per_1k = input_per_1k;
    if (output_per_1k !== "empty") patch.output_per_1k = output_per_1k;
    if (markup_multiplier !== "empty") patch.markup_multiplier = markup_multiplier;

    if (Object.keys(patch).length === 0) {
      setRowError((prev) => ({
        ...prev,
        [id]: "No pricing fields to save.",
      }));
      return;
    }

    setSavingRowId(id);
    try {
      await patchModel(id, patch);
    } catch (err) {
      setRowError((prev) => ({
        ...prev,
        [id]: err instanceof Error ? err.message : "Update failed.",
      }));
    } finally {
      setSavingRowId(null);
    }
  }

  const isBusy = loading || isPending;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">Admin tools</Badge>
          <Link
            href="/admin"
            className="text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Back to admin overview
          </Link>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">Model catalog</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage model visibility and pricing via DMIT. Auth uses your Supabase
          session token only.
        </p>
      </div>

      {error ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardHeader>
            <CardTitle className="text-base">Could not load models</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadModels()}>
              Retry
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Models</CardTitle>
          <CardDescription>
            Toggle availability flags inline. Edit per-1k rates and markup, then
            save each row.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading models…</p>
          ) : models.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">ID</th>
                    <th className="py-2 pr-4 font-medium">Display name</th>
                    <th className="py-2 pr-4 font-medium">Provider</th>
                    <th className="py-2 pr-4 font-medium">Enabled</th>
                    <th className="py-2 pr-4 font-medium">Visible</th>
                    <th className="py-2 pr-4 font-medium">Billable</th>
                    <th className="py-2 pr-4 font-medium">Billing mode</th>
                    <th className="py-2 pr-4 font-medium">Input / 1k</th>
                    <th className="py-2 pr-4 font-medium">Output / 1k</th>
                    <th className="py-2 pr-4 font-medium">Markup</th>
                    <th className="py-2 pr-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((row) => {
                    const draft = pricingDrafts[row.id] ?? pricingDraftFromModel(row);
                    const rowBusy = isBusy || savingRowId === row.id;

                    return (
                      <tr key={row.id} className="border-b align-top last:border-0">
                        <td className="py-2 pr-4 font-mono text-xs">{row.id}</td>
                        <td className="py-2 pr-4">{row.display_name ?? "—"}</td>
                        <td className="py-2 pr-4">{row.provider ?? "—"}</td>
                        <td className="py-2 pr-4">
                          <BoolToggle
                            checked={row.enabled === true}
                            disabled={rowBusy}
                            label={boolLabel(row.enabled)}
                            onChange={(checked) => void handleToggle(row.id, "enabled", checked)}
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <BoolToggle
                            checked={row.visible === true}
                            disabled={rowBusy}
                            label={boolLabel(row.visible)}
                            onChange={(checked) => void handleToggle(row.id, "visible", checked)}
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <BoolToggle
                            checked={row.billable === true}
                            disabled={rowBusy}
                            label={boolLabel(row.billable)}
                            onChange={(checked) => void handleToggle(row.id, "billable", checked)}
                          />
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs">
                          {row.billing_mode ?? "—"}
                        </td>
                        <td className="py-2 pr-4">
                          <Input
                            className="h-8 w-28 font-mono text-xs"
                            inputMode="decimal"
                            value={draft.input_per_1k}
                            disabled={rowBusy}
                            onChange={(event) =>
                              setPricingDrafts((prev) => ({
                                ...prev,
                                [row.id]: {
                                  ...draft,
                                  input_per_1k: event.target.value,
                                },
                              }))
                            }
                            placeholder={formatDisplayNumber(row.input_per_1k)}
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <Input
                            className="h-8 w-28 font-mono text-xs"
                            inputMode="decimal"
                            value={draft.output_per_1k}
                            disabled={rowBusy}
                            onChange={(event) =>
                              setPricingDrafts((prev) => ({
                                ...prev,
                                [row.id]: {
                                  ...draft,
                                  output_per_1k: event.target.value,
                                },
                              }))
                            }
                            placeholder={formatDisplayNumber(row.output_per_1k)}
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <Input
                            className="h-8 w-24 font-mono text-xs"
                            inputMode="decimal"
                            value={draft.markup_multiplier}
                            disabled={rowBusy}
                            onChange={(event) =>
                              setPricingDrafts((prev) => ({
                                ...prev,
                                [row.id]: {
                                  ...draft,
                                  markup_multiplier: event.target.value,
                                },
                              }))
                            }
                            placeholder={formatDisplayNumber(row.markup_multiplier)}
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={rowBusy}
                            onClick={() => void handleSavePricing(row.id)}
                          >
                            {savingRowId === row.id ? "Saving…" : "Save pricing"}
                          </Button>
                          {rowError[row.id] ? (
                            <p className="mt-1 max-w-[12rem] text-xs text-destructive">
                              {rowError[row.id]}
                            </p>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-md border border-dashed py-10 text-center text-sm text-muted-foreground">
              No models found.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function BoolToggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border border-input"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="text-xs text-muted-foreground">{label}</span>
    </label>
  );
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessageFromBody(body: unknown, status: number): string {
  if (body && typeof body === "object") {
    const maybeError = (body as { error?: unknown; message?: unknown }).error;
    if (typeof maybeError === "string") return maybeError;
    if (maybeError && typeof maybeError === "object") {
      const message = (maybeError as { message?: unknown }).message;
      if (typeof message === "string") return message;
    }
    const message = (body as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  if (typeof body === "string" && body.trim()) return body;
  return `DMIT request failed (HTTP ${status}).`;
}

type ParseResult = number | "empty" | "invalid";

function parseNonNegative(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return "empty";
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0) return "invalid";
  return value;
}

function parsePositive(raw: string): ParseResult {
  const trimmed = raw.trim();
  if (!trimmed) return "empty";
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return "invalid";
  return value;
}
