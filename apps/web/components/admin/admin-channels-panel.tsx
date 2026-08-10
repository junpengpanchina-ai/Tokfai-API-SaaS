"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { AdminDebugCard } from "@/components/admin/admin-debug-card";
import { AdminReadonlyNotice } from "@/components/admin/admin-readonly-notice";
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
  createAdminSttChannel,
  fetchAdminChannels,
  testAdminSttChannel,
  updateAdminChannel,
  type AdminChannelRow,
  type AdminSttChannelTestResult,
} from "@/lib/admin/client";
import type { AdminDebug } from "@/lib/admin/server";
import { formatInt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";

function channelDisplayName(
  row: AdminChannelRow,
  index: number,
  t: (key: string) => string
): string {
  if (row.capability === "audio_transcription") {
    return row.provider_name || t("admin.channels.sttChannel");
  }
  if (row.priority <= 1 || index === 0) {
    return t("admin.channels.primaryChannel");
  }
  if (index === 1 || row.priority === 2) {
    return t("admin.channels.backupChannel");
  }
  return t("admin.channels.privateChannel");
}

function maskBaseUrl(value: string | null | undefined): string {
  if (!value) return "—";
  try {
    const url = new URL(value);
    const host = url.hostname;
    if (host.length <= 4) return `${url.protocol}//***`;
    return `${url.protocol}//${host.slice(0, 2)}***${host.slice(-3)}${url.port ? `:${url.port}` : ""}`;
  } catch {
    return "***";
  }
}

function isSttChannel(row: AdminChannelRow): boolean {
  return (
    row.capability === "audio_transcription" ||
    (Array.isArray(row.modalities) &&
      row.modalities.includes("audio_transcription"))
  );
}

type SttDraft = {
  name: string;
  provider:
    | "groq_whisper_compatible"
    | "openai_compatible"
    | "self_hosted_whisper";
  base_url: string;
  api_key: string;
  default_model: string;
  enabled: boolean;
  priority: string;
  timeout_ms: string;
};

function emptySttDraft(): SttDraft {
  return {
    name: "STT channel",
    provider: "groq_whisper_compatible",
    base_url: "https://api.groq.com/openai/v1",
    api_key: "",
    default_model: "whisper-large-v3-turbo",
    enabled: true,
    priority: "10",
    timeout_ms: "60000",
  };
}

function rowToSttDraft(row: AdminChannelRow): SttDraft {
  const provider =
    row.provider === "openai_compatible"
      ? "openai_compatible"
      : row.provider === "self_hosted_whisper"
        ? "self_hosted_whisper"
        : "groq_whisper_compatible";
  return {
    name: row.provider_name || "STT channel",
    provider,
    base_url: "",
    api_key: "",
    default_model:
      row.default_model ||
      (provider === "groq_whisper_compatible"
        ? "whisper-large-v3-turbo"
        : "whisper-1"),
    enabled: row.enabled,
    priority: String(row.priority ?? 10),
    timeout_ms: String(row.timeout_ms ?? 60_000),
  };
}

export function AdminChannelsPanel({
  channels: initialChannels,
  debug,
}: {
  channels: AdminChannelRow[];
  debug: AdminDebug | null;
}) {
  const { t } = useI18n();
  const [channels, setChannels] = useState(initialChannels);
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<SttDraft>(emptySttDraft);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<AdminSttChannelTestResult | null>(
    null
  );

  const sorted = useMemo(
    () => [...channels].sort((a, b) => a.priority - b.priority),
    [channels]
  );
  const chatChannels = sorted.filter((r) => !isSttChannel(r));
  const sttChannels = sorted.filter(isSttChannel);

  const refresh = useCallback(async () => {
    const next = await fetchAdminChannels();
    setChannels(next);
  }, []);

  function startCreate() {
    setMode("create");
    setEditingId(null);
    setDraft(emptySttDraft());
    setMessage(null);
    setError(null);
    setTestResult(null);
  }

  function startEdit(row: AdminChannelRow) {
    setMode("edit");
    setEditingId(row.id);
    setDraft(rowToSttDraft(row));
    setMessage(null);
    setError(null);
    setTestResult(null);
  }

  function cancelForm() {
    setMode("list");
    setEditingId(null);
    setDraft(emptySttDraft());
    setError(null);
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const priority = Number(draft.priority);
      if (!Number.isInteger(priority) || priority < 0) {
        throw new Error(t("admin.channels.invalidPriority"));
      }

      const timeoutMs = Number(draft.timeout_ms);
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 600_000) {
        throw new Error(t("admin.channels.invalidTimeout"));
      }

      if (mode === "create") {
        if (
          draft.provider !== "self_hosted_whisper" &&
          !draft.api_key.trim()
        ) {
          throw new Error(t("admin.channels.apiKeyRequired"));
        }
        if (!draft.base_url.trim()) {
          throw new Error(t("admin.channels.baseUrlRequired"));
        }
        await createAdminSttChannel({
          capability: "audio_transcription",
          provider: draft.provider,
          name: draft.name.trim() || undefined,
          base_url: draft.base_url.trim(),
          api_key: draft.api_key.trim() || undefined,
          default_model: draft.default_model.trim() || undefined,
          enabled: draft.enabled,
          priority,
          timeout_ms: timeoutMs,
        });
        setMessage(t("admin.channels.created"));
      } else if (editingId) {
        const body: Parameters<typeof updateAdminChannel>[1] = {
          enabled: draft.enabled,
          priority,
          default_model: draft.default_model.trim() || undefined,
          provider: draft.provider,
          name: draft.name.trim() || undefined,
          timeout_ms: timeoutMs,
        };
        if (draft.base_url.trim()) {
          body.base_url = draft.base_url.trim();
        }
        // Empty api_key must not overwrite existing secret.
        if (draft.api_key.trim()) {
          body.api_key = draft.api_key.trim();
        }
        await updateAdminChannel(editingId, body);
        setMessage(t("admin.channels.saved"));
      }
      await refresh();
      setMode("list");
      setEditingId(null);
      setDraft(emptySttDraft());
    } catch (err) {
      const msg =
        err instanceof AdminApiError
          ? err.message
          : err instanceof Error
            ? err.message
            : t("admin.channels.saveFailed");
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  async function onToggle(row: AdminChannelRow) {
    setBusy(true);
    setError(null);
    try {
      await updateAdminChannel(row.id, { enabled: !row.enabled });
      await refresh();
      setMessage(
        !row.enabled
          ? t("admin.channels.enabledOk")
          : t("admin.channels.disabledOk")
      );
    } catch (err) {
      setError(
        err instanceof AdminApiError
          ? err.message
          : t("admin.channels.saveFailed")
      );
    } finally {
      setBusy(false);
    }
  }

  async function onTest(row: AdminChannelRow) {
    setBusy(true);
    setError(null);
    setTestResult(null);
    try {
      const result = await testAdminSttChannel(row.id);
      setTestResult(result);
      setMessage(
        result.ok
          ? t("admin.channels.testOk")
          : result.message || t("admin.channels.testFailed")
      );
      if (!result.ok) {
        setError(result.message || t("admin.channels.testFailed"));
      }
      await refresh();
    } catch (err) {
      // Failed test may still return structured body via AdminApiError.
      const detail =
        err instanceof AdminApiError && err.body && typeof err.body === "object"
          ? (err.body as { data?: AdminSttChannelTestResult }).data
          : null;
      if (detail) setTestResult(detail);
      setError(
        err instanceof AdminApiError
          ? err.message
          : t("admin.channels.testFailed")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div>
        <Badge variant="secondary">{t("admin.common.adminTools")}</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          {t("admin.channels.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("admin.channels.subtitle")}
        </p>
      </div>

      {debug ? <AdminDebugCard debug={debug} /> : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="text-base">
              {t("admin.channels.tableTitle")}
            </CardTitle>
            <Badge variant="secondary">
              {t("admin.common.readOnlySnapshot")}
            </Badge>
          </div>
          <CardDescription>{t("admin.channels.tableDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <AdminReadonlyNotice
            titleKey="admin.channels.readonlyTitle"
            bodyKey="admin.channels.readonlyBody"
          />
          <div className="overflow-x-auto">
            {chatChannels.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("admin.channels.empty")}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.channels.colChannel")}
                    </th>
                    <th className="py-2 pr-4 font-medium">
                      {t("admin.channels.colSuccessRate")}
                    </th>
                    <th className="py-2 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {chatChannels.map((row, index) => (
                    <tr key={row.id} className="border-b last:border-0">
                      <td className="py-2 pr-4 font-medium">
                        {channelDisplayName(row, index, t)}
                      </td>
                      <td className="py-2 pr-4">
                        {row.success_rate != null
                          ? `${row.success_rate}%`
                          : "—"}
                      </td>
                      <td className="py-2">
                        <details className="text-xs">
                          <summary className="cursor-pointer select-none text-muted-foreground hover:text-foreground">
                            {t("admin.channels.technicalDetails")}
                          </summary>
                          <div className="mt-2 space-y-1 font-mono text-muted-foreground">
                            <p>id: {row.id}</p>
                            <p>
                              {t("admin.channels.colStatus")}:{" "}
                              {row.enabled
                                ? t("admin.channels.statusActive")
                                : t("admin.channels.statusDisabled")}
                            </p>
                            <p>
                              {t("admin.channels.colPriority")}: {row.priority}
                            </p>
                            <p>
                              {t("admin.channels.colWeight")}: {row.weight}
                            </p>
                            <p>
                              {t("admin.channels.colTimeout")}:{" "}
                              {row.timeout_ms != null
                                ? `${formatInt(row.timeout_ms)} ms`
                                : "—"}
                            </p>
                            <p>
                              {t("admin.channels.colBaseUrl")}:{" "}
                              {row.base_url_masked ||
                                maskBaseUrl(row.base_url) ||
                                "—"}
                            </p>
                          </div>
                        </details>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">
                {t("admin.channels.sttTitle")}
              </CardTitle>
              <CardDescription className="mt-1">
                {t("admin.channels.sttDesc")}
              </CardDescription>
            </div>
            {mode === "list" ? (
              <Button type="button" size="sm" onClick={startCreate} disabled={busy}>
                {t("admin.channels.createStt")}
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {message ? (
            <p className="text-sm text-muted-foreground">{message}</p>
          ) : null}
          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}
          {testResult ? (
            <div className="rounded-md border px-3 py-2 font-mono text-xs text-muted-foreground">
              <p>
                test: {testResult.ok ? "ok" : "failed"} · status=
                {testResult.upstream_status ?? "—"} · latency=
                {testResult.latency_ms ?? "—"}ms
                {testResult.error_class
                  ? ` · class=${testResult.error_class}`
                  : ""}
              </p>
              <p>{testResult.message}</p>
            </div>
          ) : null}

          {mode !== "list" ? (
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="stt-name">{t("admin.channels.fieldName")}</Label>
                  <Input
                    id="stt-name"
                    value={draft.name}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, name: e.target.value }))
                    }
                    disabled={busy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stt-provider">
                    {t("admin.channels.fieldProvider")}
                  </Label>
                  <select
                    id="stt-provider"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={draft.provider}
                    onChange={(e) => {
                      const provider = e.target
                        .value as SttDraft["provider"];
                      setDraft((d) => ({
                        ...d,
                        provider,
                        default_model:
                          provider === "groq_whisper_compatible"
                            ? d.default_model || "whisper-large-v3-turbo"
                            : d.default_model || "whisper-1",
                        base_url:
                          provider === "groq_whisper_compatible" && !d.base_url
                            ? "https://api.groq.com/openai/v1"
                            : provider === "self_hosted_whisper" &&
                                (!d.base_url ||
                                  d.base_url.includes("api.groq.com"))
                              ? "http://127.0.0.1:8080"
                              : d.base_url,
                        name:
                          provider === "self_hosted_whisper" &&
                          (!d.name || d.name === "STT channel")
                            ? "Self-hosted STT worker"
                            : d.name,
                      }));
                    }}
                    disabled={busy}
                  >
                    <option value="groq_whisper_compatible">
                      groq_whisper_compatible
                    </option>
                    <option value="openai_compatible">openai_compatible</option>
                    <option value="self_hosted_whisper">
                      self_hosted_whisper
                    </option>
                  </select>
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="stt-base-url">
                    {draft.provider === "self_hosted_whisper"
                      ? t("admin.channels.fieldWorkerBaseUrl")
                      : t("admin.channels.fieldBaseUrl")}
                  </Label>
                  <Input
                    id="stt-base-url"
                    value={draft.base_url}
                    placeholder={
                      mode === "edit"
                        ? t("admin.channels.baseUrlKeepPlaceholder")
                        : draft.provider === "self_hosted_whisper"
                          ? "http://stt-worker:8080"
                          : "https://api.groq.com/openai/v1"
                    }
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, base_url: e.target.value }))
                    }
                    disabled={busy}
                    required={mode === "create"}
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="stt-api-key">
                    {draft.provider === "self_hosted_whisper"
                      ? t("admin.channels.fieldWorkerApiKey")
                      : t("admin.channels.fieldApiKey")}
                  </Label>
                  <Input
                    id="stt-api-key"
                    type="password"
                    autoComplete="new-password"
                    value={draft.api_key}
                    placeholder={
                      mode === "edit"
                        ? t("admin.channels.apiKeyKeepPlaceholder")
                        : draft.provider === "self_hosted_whisper"
                          ? t("admin.channels.workerApiKeyPlaceholder")
                          : t("admin.channels.apiKeyPlaceholder")
                    }
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, api_key: e.target.value }))
                    }
                    disabled={busy}
                    required={
                      mode === "create" &&
                      draft.provider !== "self_hosted_whisper"
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    {draft.provider === "self_hosted_whisper"
                      ? t("admin.channels.workerApiKeyHint")
                      : t("admin.channels.apiKeyHint")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stt-model">
                    {t("admin.channels.fieldDefaultModel")}
                  </Label>
                  <Input
                    id="stt-model"
                    value={draft.default_model}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        default_model: e.target.value,
                      }))
                    }
                    disabled={busy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stt-priority">
                    {t("admin.channels.colPriority")}
                  </Label>
                  <Input
                    id="stt-priority"
                    value={draft.priority}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, priority: e.target.value }))
                    }
                    disabled={busy}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stt-timeout">
                    {t("admin.channels.colTimeout")}
                  </Label>
                  <Input
                    id="stt-timeout"
                    value={draft.timeout_ms}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, timeout_ms: e.target.value }))
                    }
                    disabled={busy}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, enabled: e.target.checked }))
                  }
                  disabled={busy}
                />
                {t("admin.channels.toggleChannel")}
              </label>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>
                  {busy ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  {mode === "create"
                    ? t("admin.channels.createStt")
                    : t("admin.channels.save")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelForm}
                  disabled={busy}
                >
                  {t("admin.channels.cancel")}
                </Button>
              </div>
            </form>
          ) : null}

          {mode === "list" ? (
            <div className="overflow-x-auto">
              {sttChannels.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("admin.channels.sttEmpty")}
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="py-2 pr-4 font-medium">
                        {t("admin.channels.colChannel")}
                      </th>
                      <th className="py-2 pr-4 font-medium">
                        {t("admin.channels.fieldProvider")}
                      </th>
                      <th className="py-2 pr-4 font-medium">
                        {t("admin.channels.colStatus")}
                      </th>
                      <th className="py-2 font-medium" />
                    </tr>
                  </thead>
                  <tbody>
                    {sttChannels.map((row) => (
                      <tr key={row.id} className="border-b last:border-0">
                        <td className="py-2 pr-4">
                          <div className="font-medium">
                            {row.provider_name || t("admin.channels.sttChannel")}
                          </div>
                          <div className="mt-1 font-mono text-xs text-muted-foreground">
                            {row.base_url_masked || "—"} ·{" "}
                            {row.default_model || "—"}
                            {row.api_key_set
                              ? ` · ${row.api_key_masked || "key set"}`
                              : ""}
                          </div>
                        </td>
                        <td className="py-2 pr-4 font-mono text-xs">
                          {row.provider || "—"}
                        </td>
                        <td className="py-2 pr-4">
                          {row.enabled
                            ? t("admin.channels.statusActive")
                            : t("admin.channels.statusDisabled")}
                        </td>
                        <td className="py-2">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => startEdit(row)}
                            >
                              {t("admin.channels.edit")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => onToggle(row)}
                            >
                              {row.enabled
                                ? t("admin.channels.statusDisabled")
                                : t("admin.channels.statusActive")}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              disabled={busy}
                              onClick={() => onTest(row)}
                            >
                              {t("admin.channels.testChannel")}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </>
  );
}
