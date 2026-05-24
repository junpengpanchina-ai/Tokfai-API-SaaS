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
  model_type: string | null;
  enabled: boolean | null;
  visible: boolean | null;
  billing_mode: string | null;
  input_per_1k: number | null;
  output_per_1k: number | null;
  billable: boolean | null;
  markup_multiplier: number | null;
};

type ModelsResponse = {
  data?: AdminModel[];
  models?: AdminModel[];
};

type ModelPatchBody = {
  enabled: boolean;
  visible: boolean;
  billable: boolean;
  input_per_1k: number;
  output_per_1k: number;
  markup_multiplier: number;
};

const PER_1K_MAX = 0.1;
const PER_1K_HIGH_THRESHOLD = 0.05;
const MARKUP_MULTIPLIER_MAX = 20;

type RowDraft = {
  enabled: boolean;
  visible: boolean;
  billable: boolean;
  input_per_1k: string;
  output_per_1k: string;
  markup_multiplier: string;
};

function rowDraftFromModel(model: AdminModel): RowDraft {
  return {
    enabled: model.enabled === true,
    visible: model.visible === true,
    billable: model.billable === true,
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

export function AdminModelsClient({
  accessToken,
  initialModels,
  initialError,
}: {
  accessToken: string;
  initialModels: AdminModel[];
  initialError: string | null;
}) {
  const router = useRouter();
  const [models, setModels] = useState(initialModels);
  const [error, setError] = useState<string | null>(initialError);
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>(() =>
    Object.fromEntries(initialModels.map((m) => [m.id, rowDraftFromModel(m)]))
  );
  const [savingRowId, setSavingRowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isPending, startTransition] = useTransition();

  const syncDrafts = useCallback((rows: AdminModel[]) => {
    setDrafts(Object.fromEntries(rows.map((m) => [m.id, rowDraftFromModel(m)])));
  }, []);

  const loadModels = useCallback(async () => {
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

      const rows = modelsFromResponse(body);
      setModels(rows);
      syncDrafts(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load models.");
    } finally {
      setLoading(false);
    }
  }, [accessToken, syncDrafts]);

  useEffect(() => {
    setModels(initialModels);
    syncDrafts(initialModels);
    setError(initialError);
  }, [initialModels, initialError, syncDrafts]);

  async function patchModel(id: string, patch: ModelPatchBody) {
    setRowError((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });

    const response = await fetch(
      `${getDmitBaseUrl()}/admin/models/${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(patch),
        cache: "no-store",
      }
    );
    const body = await parseJson(response);

    if (!response.ok) {
      throw new Error(errorMessageFromBody(body, response.status));
    }

    setModels((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row))
    );
    startTransition(() => {
      router.refresh();
    });
  }

  async function handleSaveRow(id: string) {
    const draft = drafts[id];
    const row = models.find((m) => m.id === id);
    if (!draft || !row) return;

    const validated = validateModelPatch(draft, row);
    if (!validated.ok) {
      setRowError((prev) => ({
        ...prev,
        [id]: validated.message,
      }));
      return;
    }

    const patch = validated.patch;

    if (
      patch.input_per_1k > PER_1K_HIGH_THRESHOLD ||
      patch.output_per_1k > PER_1K_HIGH_THRESHOLD
    ) {
      const confirmed = window.confirm(
        "This price is unusually high. Confirm save?"
      );
      if (!confirmed) return;
    }

    setSavingRowId(id);
    try {
      await patchModel(id, patch);
      setDrafts((prev) => ({
        ...prev,
        [id]: rowDraftFromModel({ ...row, ...patch }),
      }));
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
            Edit flags and pricing per row, then save each row individually.
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
                    <th className="py-2 pr-4 font-medium">Model type</th>
                    <th className="py-2 pr-4 font-medium">Enabled</th>
                    <th className="py-2 pr-4 font-medium">Visible</th>
                    <th className="py-2 pr-4 font-medium">Billing mode</th>
                    <th className="py-2 pr-4 font-medium">Input / 1k</th>
                    <th className="py-2 pr-4 font-medium">Output / 1k</th>
                    <th className="py-2 pr-4 font-medium">Billable</th>
                    <th className="py-2 pr-4 font-medium">Markup</th>
                    <th className="py-2 pr-4 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((row) => {
                    const draft = drafts[row.id] ?? rowDraftFromModel(row);
                    const rowBusy = isBusy || savingRowId === row.id;

                    return (
                      <tr key={row.id} className="border-b align-top last:border-0">
                        <td className="py-2 pr-4 font-mono text-xs">{row.id}</td>
                        <td className="py-2 pr-4">{row.display_name ?? "—"}</td>
                        <td className="py-2 pr-4">{row.provider ?? "—"}</td>
                        <td className="py-2 pr-4 font-mono text-xs">
                          {row.model_type ?? "—"}
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border border-input"
                            checked={draft.enabled}
                            disabled={rowBusy}
                            onChange={(event) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [row.id]: { ...draft, enabled: event.target.checked },
                              }))
                            }
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border border-input"
                            checked={draft.visible}
                            disabled={rowBusy}
                            onChange={(event) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [row.id]: { ...draft, visible: event.target.checked },
                              }))
                            }
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
                              setDrafts((prev) => ({
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
                              setDrafts((prev) => ({
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
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border border-input"
                            checked={draft.billable}
                            disabled={rowBusy}
                            onChange={(event) =>
                              setDrafts((prev) => ({
                                ...prev,
                                [row.id]: { ...draft, billable: event.target.checked },
                              }))
                            }
                          />
                        </td>
                        <td className="py-2 pr-4">
                          <Input
                            className="h-8 w-24 font-mono text-xs"
                            inputMode="decimal"
                            value={draft.markup_multiplier}
                            disabled={rowBusy}
                            onChange={(event) =>
                              setDrafts((prev) => ({
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
                            onClick={() => void handleSaveRow(row.id)}
                          >
                            {savingRowId === row.id ? "Saving…" : "Save"}
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

function parseBoundedNumber(
  raw: string,
  max: number
): ParseResult | "out_of_range" {
  const parsed = parseNonNegative(raw);
  if (parsed === "empty" || parsed === "invalid") return parsed;
  if (parsed > max) return "out_of_range";
  return parsed;
}

function validateModelPatch(
  draft: RowDraft,
  row: AdminModel
):
  | { ok: true; patch: ModelPatchBody }
  | { ok: false; message: string } {
  if (
    typeof draft.enabled !== "boolean" ||
    typeof draft.visible !== "boolean" ||
    typeof draft.billable !== "boolean"
  ) {
    return {
      ok: false,
      message: "Enabled, visible, and billable must be boolean values.",
    };
  }

  const inputParsed = parseBoundedNumber(draft.input_per_1k, PER_1K_MAX);
  const outputParsed = parseBoundedNumber(draft.output_per_1k, PER_1K_MAX);
  const markupParsed = parseBoundedNumber(
    draft.markup_multiplier,
    MARKUP_MULTIPLIER_MAX
  );

  if (
    inputParsed === "invalid" ||
    outputParsed === "invalid" ||
    markupParsed === "invalid"
  ) {
    return {
      ok: false,
      message: "Enter valid numeric pricing values (0 or greater).",
    };
  }

  if (
    inputParsed === "out_of_range" ||
    outputParsed === "out_of_range" ||
    markupParsed === "out_of_range"
  ) {
    return {
      ok: false,
      message: `Pricing must be within limits: input/output per 1k ≤ ${PER_1K_MAX}, markup ≤ ${MARKUP_MULTIPLIER_MAX}.`,
    };
  }

  const patch: ModelPatchBody = {
    enabled: draft.enabled,
    visible: draft.visible,
    billable: draft.billable,
    input_per_1k:
      inputParsed === "empty" ? (row.input_per_1k ?? 0) : inputParsed,
    output_per_1k:
      outputParsed === "empty" ? (row.output_per_1k ?? 0) : outputParsed,
    markup_multiplier:
      markupParsed === "empty"
        ? (row.markup_multiplier ?? 1)
        : markupParsed,
  };

  if (patch.input_per_1k < 0 || patch.input_per_1k > PER_1K_MAX) {
    return {
      ok: false,
      message: `Input per 1k must be between 0 and ${PER_1K_MAX}.`,
    };
  }

  if (patch.output_per_1k < 0 || patch.output_per_1k > PER_1K_MAX) {
    return {
      ok: false,
      message: `Output per 1k must be between 0 and ${PER_1K_MAX}.`,
    };
  }

  if (patch.markup_multiplier < 0 || patch.markup_multiplier > MARKUP_MULTIPLIER_MAX) {
    return {
      ok: false,
      message: `Markup multiplier must be between 0 and ${MARKUP_MULTIPLIER_MAX}.`,
    };
  }

  return { ok: true, patch };
}

function modelsFromResponse(body: ModelsResponse | null | undefined): AdminModel[] {
  if (!body || typeof body !== "object") return [];
  if (Array.isArray(body.data)) return body.data;
  if (Array.isArray(body.models)) return body.models;
  return [];
}
