"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Loader2,
  Send,
  Sparkles,
} from "lucide-react";

import { CopyButton, useCopyToClipboard } from "@/components/copy-code-block";
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
  chatCompletions,
  createApiKey,
  DmitApiError,
  revealMeApiKey,
  type ChatCompletionResponse,
} from "@/lib/dmit/client";
import { formatDateTime, formatCreditsPrecise, formatInt } from "@/lib/format";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";
import {
  AVAILABLE_CHAT_MODEL_IDS,
  getChatModelById,
  isAvailableChatModel,
} from "@/lib/model-catalog";
import {
  isFullTokfaiApiKey,
  TOKFAI_API_KEY_PLACEHOLDER,
  TOKFAI_CHAT_COMPLETIONS_ENDPOINT,
} from "@/lib/tokfai-api";

const DEFAULT_MODEL = "gemini-3.1-pro";
const MODEL_OPTIONS = AVAILABLE_CHAT_MODEL_IDS;
const REVEAL_KEY_TIMEOUT_MS = 30_000;
const PLAYGROUND_TEST_KEY_NAME = "playground-test";

function resolveInitialModel(initialModel?: string): string {
  if (initialModel && isAvailableChatModel(initialModel)) {
    return initialModel;
  }
  return DEFAULT_MODEL;
}

function firstActiveKeyId(keys: PlaygroundApiKeyOption[]): string {
  return keys[0]?.id ?? "";
}

function playgroundTestKeyNameWithDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${PLAYGROUND_TEST_KEY_NAME}-${y}${m}${day}`;
}

function meKeyToPlaygroundOption(
  apiKey: {
    id: string;
    name: string;
    prefix: string;
    status: string;
    can_reveal?: boolean;
  }
): PlaygroundApiKeyOption {
  return {
    id: apiKey.id,
    name: apiKey.name,
    prefix: apiKey.prefix,
    status: apiKey.status,
    can_reveal: apiKey.can_reveal,
  };
}

export interface PlaygroundApiKeyOption {
  id: string;
  name: string;
  prefix: string;
  status: "active" | "revoked" | string;
  can_reveal?: boolean;
}

interface PlaygroundError {
  status: number;
  code?: string;
  message: string;
}

type KeyPanelView = "select" | "paste" | "empty";

type PromptPresetId = "short" | "code" | "business" | "summary";

const PROMPT_PRESET_IDS: PromptPresetId[] = [
  "short",
  "code",
  "business",
  "summary",
];

function presetLabelKey(id: PromptPresetId): string {
  return `dashboard.playground.preset${id[0].toUpperCase()}${id.slice(1)}`;
}

function presetPromptKey(id: PromptPresetId): string {
  return `dashboard.playground.preset${id[0].toUpperCase()}${id.slice(1)}Prompt`;
}

export function PlaygroundClient({
  accessToken,
  activeKeys,
  initialModel,
}: {
  accessToken: string;
  activeKeys: PlaygroundApiKeyOption[];
  initialModel?: string;
}) {
  const { t } = useI18n();
  const router = useRouter();
  const promptRef = useRef<HTMLTextAreaElement>(null);

  const [localKeys, setLocalKeys] = useState<PlaygroundApiKeyOption[]>(activeKeys);
  const [sessionSecrets, setSessionSecrets] = useState<Record<string, string>>({});
  const [keyPanelView, setKeyPanelView] = useState<KeyPanelView>(() =>
    activeKeys.length > 0 ? "select" : "empty"
  );
  const [createdBannerKeyId, setCreatedBannerKeyId] = useState<string | null>(
    null
  );

  const [model, setModel] = useState(() => resolveInitialModel(initialModel));
  const [prompt, setPrompt] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState(() =>
    firstActiveKeyId(activeKeys)
  );
  const [creatingKey, setCreatingKey] = useState(false);
  const [createKeyError, setCreateKeyError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ChatCompletionResponse | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [error, setError] = useState<PlaygroundError | null>(null);

  useEffect(() => {
    setLocalKeys(activeKeys);
    if (activeKeys.length > 0 && keyPanelView === "empty") {
      setKeyPanelView("select");
    }
  }, [activeKeys, keyPanelView]);

  useEffect(() => {
    if (
      localKeys.length > 0 &&
      !localKeys.some((row) => row.id === selectedKeyId)
    ) {
      setSelectedKeyId(localKeys[0].id);
    }
  }, [localKeys, selectedKeyId]);

  const selectedKey = useMemo(
    () => localKeys.find((row) => row.id === selectedKeyId) ?? null,
    [localKeys, selectedKeyId]
  );

  const selectedModelEntry = useMemo(
    () => getChatModelById(model),
    [model]
  );

  const createdSecret =
    createdBannerKeyId != null
      ? (sessionSecrets[createdBannerKeyId] ?? null)
      : null;

  async function handleCreateTestKey() {
    if (creatingKey) {
      return;
    }
    if (!accessToken) {
      setCreateKeyError(t("dashboard.playground.errors.unknown"));
      return;
    }

    setCreatingKey(true);
    setCreateKeyError(null);

    try {
      let result;
      try {
        result = await createApiKey(
          { name: PLAYGROUND_TEST_KEY_NAME },
          { accessToken }
        );
      } catch (err) {
        if (err instanceof DmitApiError && err.status === 409) {
          result = await createApiKey(
            { name: playgroundTestKeyNameWithDate() },
            { accessToken }
          );
        } else {
          throw err;
        }
      }

      const listItem = meKeyToPlaygroundOption(result.api_key);
      setSessionSecrets((prev) => ({
        ...prev,
        [listItem.id]: result.secret,
      }));
      setLocalKeys((prev) => {
        const without = prev.filter((row) => row.id !== listItem.id);
        return [listItem, ...without];
      });
      setSelectedKeyId(listItem.id);
      setCreatedBannerKeyId(listItem.id);
      setKeyPanelView("select");
      router.refresh();
    } catch (err) {
      setCreateKeyError(
        err instanceof DmitApiError
          ? playgroundErrorMessage(err.status, err.code, t)
          : t("dashboard.playground.errors.unknown")
      );
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setError(null);
    setResult(null);
    setCompletedAt(null);

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError({
        status: 0,
        code: "missing_prompt",
        message: t("dashboard.playground.errors.missingPrompt"),
      });
      return;
    }

    setLoading(true);
    try {
      const resolvedKey = await resolveApiKey();
      if (!isFullTokfaiApiKey(resolvedKey)) {
        throw new PlaygroundValidationError(
          t("dashboard.playground.errors.missingToken"),
          "missing_api_key"
        );
      }

      const res = await chatCompletions(resolvedKey, {
        model,
        messages: [{ role: "user", content: trimmedPrompt }],
        stream: false,
      });

      setResult(res);
      setCompletedAt(new Date().toISOString());
      router.refresh();
    } catch (err) {
      setCompletedAt(new Date().toISOString());
      setError(toPlaygroundError(err, t));
    } finally {
      setLoading(false);
    }
  }

  async function resolveApiKey(): Promise<string> {
    if (keyPanelView === "paste") {
      const trimmed = apiKey.trim();
      if (!trimmed) {
        throw new PlaygroundValidationError(
          t("dashboard.playground.errors.missingToken"),
          "missing_api_key"
        );
      }
      if (!isFullTokfaiApiKey(trimmed)) {
        throw new PlaygroundValidationError(
          t("dashboard.playground.errors.invalidToken"),
          "invalid_api_key"
        );
      }
      return trimmed;
    }

    if (keyPanelView === "empty" || !selectedKey) {
      throw new PlaygroundValidationError(
        t("dashboard.playground.errors.missingToken"),
        "missing_api_key"
      );
    }

    const sessionSecret = sessionSecrets[selectedKey.id];
    if (sessionSecret && isFullTokfaiApiKey(sessionSecret)) {
      return sessionSecret;
    }

    if (selectedKey.can_reveal === false) {
      throw new PlaygroundValidationError(
        t("dashboard.playground.errors.keyNotRetrievable"),
        "key_not_revealable"
      );
    }

    if (!accessToken) {
      throw new PlaygroundValidationError(
        t("dashboard.playground.errors.unknown"),
        "missing_access_token"
      );
    }

    const secret = await revealApiKeyWithTimeout(selectedKey.id, accessToken);
    if (!isFullTokfaiApiKey(secret)) {
      throw new PlaygroundValidationError(
        t("dashboard.playground.errors.keyNotRetrievable"),
        "key_not_revealable"
      );
    }
    return secret;
  }

  async function revealApiKeyWithTimeout(
    keyId: string,
    token: string
  ): Promise<string> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        revealMeApiKey(keyId, { accessToken: token }),
        new Promise<string>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(
              new PlaygroundValidationError(
                t("dashboard.playground.apiKeyLoadTimedOut"),
                "key_reveal_timeout"
              )
            );
          }, REVEAL_KEY_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  function applyPreset(id: PromptPresetId) {
    setPrompt(t(presetPromptKey(id)));
  }

  function focusPrompt() {
    promptRef.current?.focus();
    promptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <form onSubmit={handleRun} className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("dashboard.playground.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("dashboard.playground.subtitle")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("dashboard.playground.forImageModels")}{" "}
            <Link
              href="/dashboard/image-playground"
              className="underline underline-offset-4"
            >
              Image Playground
            </Link>
            .
          </p>
        </div>
        <Badge variant="secondary">{TOKFAI_CHAT_COMPLETIONS_ENDPOINT}</Badge>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/5 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        <span>{t("dashboard.playground.productionKeyHint")}</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.playground.request")}</CardTitle>
          <CardDescription>{t("dashboard.playground.requestDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <ApiKeySection
            keyPanelView={keyPanelView}
            localKeys={localKeys}
            selectedKey={selectedKey}
            selectedKeyId={selectedKeyId}
            apiKey={apiKey}
            showApiKey={showApiKey}
            creatingKey={creatingKey}
            createKeyError={createKeyError}
            createdSecret={createdSecret}
            createdBannerKeyId={createdBannerKeyId}
            loading={loading}
            onCreateTestKey={handleCreateTestKey}
            onKeyPanelViewChange={setKeyPanelView}
            onSelectedKeyChange={setSelectedKeyId}
            onApiKeyChange={setApiKey}
            onShowApiKeyChange={setShowApiKey}
            onFocusPrompt={focusPrompt}
            t={t}
          />

          <div className="flex flex-col gap-2">
            <Label htmlFor="model">{t("dashboard.playground.model")}</Label>
            <select
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={loading}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {MODEL_OPTIONS.map((m) => {
                const entry = getChatModelById(m);
                return (
                  <option key={m} value={m}>
                    {entry ? `${entry.displayName} (${m})` : m}
                  </option>
                );
              })}
            </select>
            {selectedModelEntry?.description ? (
              <p className="text-xs text-muted-foreground">
                {selectedModelEntry.description}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="prompt">{t("dashboard.playground.prompt")}</Label>
            <textarea
              ref={promptRef}
              id="prompt"
              rows={8}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              disabled={loading}
              placeholder={t("dashboard.playground.promptPlaceholder")}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            />
            <div className="flex flex-wrap gap-2">
              {PROMPT_PRESET_IDS.map((id) => (
                <Button
                  key={id}
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={() => applyPreset(id)}
                >
                  {t(presetLabelKey(id))}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-md border bg-muted/30 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              {t("dashboard.playground.costHint")}
            </p>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link href="/dashboard/credits">
                {t("dashboard.playground.viewCreditsLedger")}
              </Link>
            </Button>
          </div>

          <div className="flex justify-end">
            <Button type="submit" disabled={loading} aria-busy={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {t("dashboard.playground.running")}
                </>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  {t("dashboard.playground.run")}
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.playground.resultTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsePanel
            loading={loading}
            error={error}
            result={result}
            completedAt={completedAt}
            t={t}
          />
        </CardContent>
      </Card>

      <PlaygroundFooter t={t} />
    </form>
  );
}

function ApiKeySection({
  keyPanelView,
  localKeys,
  selectedKey,
  selectedKeyId,
  apiKey,
  showApiKey,
  creatingKey,
  createKeyError,
  createdSecret,
  createdBannerKeyId,
  loading,
  onCreateTestKey,
  onKeyPanelViewChange,
  onSelectedKeyChange,
  onApiKeyChange,
  onShowApiKeyChange,
  onFocusPrompt,
  t,
}: {
  keyPanelView: KeyPanelView;
  localKeys: PlaygroundApiKeyOption[];
  selectedKey: PlaygroundApiKeyOption | null;
  selectedKeyId: string;
  apiKey: string;
  showApiKey: boolean;
  creatingKey: boolean;
  createKeyError: string | null;
  createdSecret: string | null;
  createdBannerKeyId: string | null;
  loading: boolean;
  onCreateTestKey: () => void;
  onKeyPanelViewChange: (view: KeyPanelView) => void;
  onSelectedKeyChange: (id: string) => void;
  onApiKeyChange: (value: string) => void;
  onShowApiKeyChange: (show: boolean) => void;
  onFocusPrompt: () => void;
  t: (key: string) => string;
}) {
  const { copiedId, copyText } = useCopyToClipboard();
  const secretCopied = copiedId === "playground-created-secret";

  if (keyPanelView === "paste") {
    return (
      <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          {t("dashboard.playground.pasteKey")}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="api-key">{t("dashboard.playground.fullApiKey")}</Label>
          <div className="flex gap-2">
            <Input
              id="api-key"
              type={showApiKey ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder={TOKFAI_API_KEY_PLACEHOLDER}
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              disabled={loading}
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={loading}
              aria-label={
                showApiKey
                  ? t("dashboard.playground.hideKey")
                  : t("dashboard.playground.showKey")
              }
              onClick={() => onShowApiKeyChange(!showApiKey)}
            >
              {showApiKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("dashboard.playground.pasteKeySecurityHint")}
          </p>
        </div>
        {localKeys.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            className="w-fit"
            onClick={() => onKeyPanelViewChange("select")}
          >
            {t("dashboard.playground.selectKey")}
          </Button>
        ) : null}
      </div>
    );
  }

  if (keyPanelView === "empty" || localKeys.length === 0) {
    return (
      <div className="flex flex-col gap-4 rounded-md border border-dashed bg-muted/20 p-4">
        <div className="flex items-start gap-2">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">
              {t("dashboard.playground.noKeyTitle")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("dashboard.playground.noKeyBody")}
            </p>
          </div>
        </div>
        {createKeyError ? (
          <p className="text-sm text-destructive">{createKeyError}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={loading || creatingKey}
            onClick={onCreateTestKey}
          >
            {creatingKey ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("dashboard.playground.creatingTestKey")}
              </>
            ) : (
              t("dashboard.playground.createTestKey")
            )}
          </Button>
          <Button asChild type="button" size="sm" variant="outline">
            <Link href="/dashboard/api-keys">
              {t("dashboard.playground.goToApiKeys")}
            </Link>
          </Button>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-auto w-fit px-0 text-xs text-muted-foreground"
          disabled={loading}
          onClick={() => onKeyPanelViewChange("paste")}
        >
          {t("dashboard.playground.pasteOtherKey")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        {t("dashboard.playground.apiKey")}
      </div>

      {createdSecret && createdBannerKeyId === selectedKeyId ? (
        <CreatedKeyBanner
          secret={createdSecret}
          secretCopied={secretCopied}
          onCopy={() => copyText("playground-created-secret", createdSecret)}
          onTestNow={onFocusPrompt}
          t={t}
        />
      ) : null}

      {selectedKey ? (
        <p className="text-sm text-muted-foreground">
          {formatMessage(t("dashboard.playground.currentKeySelection"), {
            name: selectedKey.name,
            prefix: selectedKey.prefix || "sk-tokfai",
          })}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="api-key-select">{t("dashboard.playground.selectKey")}</Label>
        <select
          id="api-key-select"
          value={selectedKeyId}
          onChange={(e) => onSelectedKeyChange(e.target.value)}
          disabled={loading}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {localKeys.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name} ({row.prefix || "no prefix"})
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {t("dashboard.playground.secretNotStored")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => onKeyPanelViewChange("paste")}
        >
          {t("dashboard.playground.pasteOtherKey")}
        </Button>
        <Button asChild type="button" size="sm" variant="outline">
          <Link href="/dashboard/api-keys">
            {t("dashboard.playground.manageApiKeys")}
          </Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("dashboard.playground.manageApiKeysHint")}
      </p>
    </div>
  );
}

function CreatedKeyBanner({
  secret,
  secretCopied,
  onCopy,
  onTestNow,
  t,
}: {
  secret: string;
  secretCopied: boolean;
  onCopy: () => void;
  onTestNow: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="flex items-start gap-2 text-sm text-emerald-800 dark:text-emerald-200">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t("dashboard.playground.testKeyCreated")}</span>
      </div>
      <code className="break-all rounded-md border bg-background px-3 py-2 font-mono text-sm">
        {secret}
      </code>
      <p className="text-xs text-muted-foreground">
        {t("dashboard.playground.secretOnceHint")}
      </p>
      <div className="flex flex-wrap gap-2">
        <CopyButton
          copied={secretCopied}
          onCopy={onCopy}
          copyLabel={t("dashboard.playground.copySecret")}
          copiedLabel={t("dashboard.playground.copied")}
        />
        <Button type="button" size="sm" variant="outline" onClick={onTestNow}>
          {t("dashboard.playground.testNow")}
        </Button>
      </div>
    </div>
  );
}

function ResponsePanel({
  loading,
  error,
  result,
  completedAt,
  t,
}: {
  loading: boolean;
  error: PlaygroundError | null;
  result: ChatCompletionResponse | null;
  completedAt: string | null;
  t: (key: string) => string;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("dashboard.playground.waitingForModel")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <ResultMeta
          status="failed"
          modelId={null}
          requestId={null}
          completedAt={completedAt}
          t={t}
        />
        <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {t("dashboard.playground.requestFailed")}
            {error.status > 0 ? (
              <Badge variant="outline" className="ml-1">
                HTTP {error.status}
              </Badge>
            ) : null}
          </div>
          <dl className="grid gap-1 text-sm">
            {error.code ? (
              <div className="flex flex-wrap gap-x-2">
                <dt className="text-muted-foreground">
                  {t("dashboard.playground.errorCode")}
                </dt>
                <dd className="font-mono">{error.code}</dd>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">
                {t("dashboard.playground.errorMessage")}
              </dt>
              <dd>{error.message}</dd>
            </div>
          </dl>
          {error.status === 402 ||
          error.code === "insufficient_credits" ? (
            <Button asChild size="sm" variant="outline" className="w-fit">
              <Link href="/dashboard/credits">
                {t("dashboard.playground.addCredits")}
              </Link>
            </Button>
          ) : null}
          {error.code === "key_not_revealable" ||
          error.code === "missing_api_key" ? (
            <Button asChild size="sm" variant="outline" className="w-fit">
              <Link href="/dashboard/api-keys">
                {t("dashboard.playground.manageApiKeys")}
              </Link>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4" />
        {t("dashboard.playground.responsePlaceholder")}
      </div>
    );
  }

  const content =
    result.choices?.[0]?.message?.content ?? "(no content returned)";
  const usage = result.usage;
  const requestId =
    result.tokfai?.request_id ?? result.request_id ?? null;
  const creditsCharged = resolveCreditsCharged(result);

  return (
    <div className="flex flex-col gap-4">
      <ResultMeta
        status="success"
        modelId={result.model}
        requestId={requestId}
        completedAt={completedAt}
        t={t}
      />

      <div className="rounded-md border bg-muted/40 p-4">
        <p className="mb-2 text-xs font-medium text-muted-foreground">
          {t("dashboard.playground.responseContent")}
        </p>
        <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {content}
        </pre>
      </div>

      {usage ? (
        <UsageDetails usage={usage} creditsCharged={creditsCharged} t={t} />
      ) : (
        <p className="text-sm text-muted-foreground">
          {t("dashboard.playground.usageFallback")}
        </p>
      )}
    </div>
  );
}

function ResultMeta({
  status,
  modelId,
  requestId,
  completedAt,
  t,
}: {
  status: "success" | "failed";
  modelId: string | null;
  requestId: string | null;
  completedAt: string | null;
  t: (key: string) => string;
}) {
  const isSuccess = status === "success";

  return (
    <div className="flex flex-col gap-2 rounded-md border p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {isSuccess ? (
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
        ) : (
          <AlertTriangle className="h-4 w-4 text-destructive" />
        )}
        <span className="font-medium">
          {t("dashboard.playground.requestStatus")}：
          {isSuccess
            ? t("dashboard.playground.statusSuccess")
            : t("dashboard.playground.statusFailed")}
        </span>
        <Badge variant={isSuccess ? "secondary" : "destructive"}>
          {isSuccess
            ? t("dashboard.playground.statusSuccess")
            : t("dashboard.playground.statusFailed")}
        </Badge>
      </div>
      <dl className="grid gap-1 text-sm sm:grid-cols-2">
        {modelId ? (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">
              {t("dashboard.playground.modelId")}
            </dt>
            <dd className="font-mono">{modelId}</dd>
          </div>
        ) : null}
        {requestId ? (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">
              {t("dashboard.playground.requestId")}
            </dt>
            <dd className="font-mono">{requestId}</dd>
          </div>
        ) : null}
        {completedAt ? (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">
              {t("dashboard.playground.createdAt")}
            </dt>
            <dd className="font-mono">{formatDateTime(completedAt)}</dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function UsageDetails({
  usage,
  creditsCharged,
  t,
}: {
  usage: NonNullable<ChatCompletionResponse["usage"]>;
  creditsCharged: number | null;
  t: (key: string) => string;
}) {
  const items: Array<{ label: string; value: string }> = [
    {
      label: t("dashboard.playground.inputTokens"),
      value: formatInt(usage.prompt_tokens),
    },
    {
      label: t("dashboard.playground.outputTokens"),
      value: formatInt(usage.completion_tokens),
    },
    {
      label: t("dashboard.playground.totalTokens"),
      value: formatInt(usage.total_tokens),
    },
  ];

  if (creditsCharged != null) {
    items.push({
      label: t("dashboard.playground.creditsCharged"),
      value: formatCreditsPrecise(creditsCharged),
    });
  }

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 rounded-md border bg-card px-4 py-3 text-sm">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1.5">
          <span className="text-muted-foreground">{item.label}</span>
          <span className="font-mono">{item.value}</span>
        </div>
      ))}
    </div>
  );
}

function PlaygroundFooter({ t }: { t: (key: string) => string }) {
  const links = [
    { href: "/dashboard/models", label: t("dashboard.playground.viewModels") },
    { href: "/dashboard/docs", label: t("dashboard.playground.viewDocs") },
    {
      href: "/dashboard/credits",
      label: t("dashboard.playground.viewCreditsLedger"),
    },
    {
      href: "/dashboard/api-keys",
      label: t("dashboard.playground.manageApiKeys"),
    },
  ] as const;

  return (
    <div className="flex flex-wrap gap-2 border-t pt-4">
      {links.map((link) => (
        <Button key={link.href} asChild variant="outline" size="sm">
          <Link href={link.href}>{link.label}</Link>
        </Button>
      ))}
    </div>
  );
}

function resolveCreditsCharged(
  result: ChatCompletionResponse
): number | null {
  const raw = result.credits_charged ?? result.tokfai?.credits_charged;
  if (raw == null) return null;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

class PlaygroundValidationError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "PlaygroundValidationError";
    this.code = code;
  }
}

function playgroundErrorMessage(
  status: number,
  code: string | undefined,
  t: (key: string) => string
): string {
  const normalized = (code ?? "").toLowerCase();

  if (status === 402 || normalized === "insufficient_credits") {
    return t("dashboard.playground.errors.insufficientCredits");
  }

  const codeMap: Record<string, string> = {
    missing_token: "dashboard.playground.errors.missingToken",
    missing_api_key: "dashboard.playground.errors.missingToken",
    no_api_key: "dashboard.playground.errors.missingToken",
    key_not_revealable: "dashboard.playground.errors.keyNotRetrievable",
    invalid_token: "dashboard.playground.errors.invalidToken",
    invalid_api_key: "dashboard.playground.errors.invalidToken",
    insufficient_credits: "dashboard.playground.errors.insufficientCredits",
    model_not_found: "dashboard.playground.errors.modelNotFound",
    upstream_error: "dashboard.playground.errors.upstreamError",
    upstream_auth_error: "dashboard.playground.errors.upstreamError",
    upstream_rate_limited: "dashboard.playground.errors.upstreamError",
    rate_limited: "dashboard.playground.errors.rateLimited",
    missing_prompt: "dashboard.playground.errors.missingPrompt",
  };

  if (status === 401 && !codeMap[normalized]) {
    return t("dashboard.playground.errors.invalidToken");
  }

  if (status === 404 && !codeMap[normalized]) {
    return t("dashboard.playground.errors.modelNotFound");
  }

  if (
    status >= 500 ||
    status === 502 ||
    status === 503 ||
    status === 504
  ) {
    return t("dashboard.playground.errors.upstreamError");
  }

  const key = codeMap[normalized];
  if (key) {
    return t(key);
  }

  return t("dashboard.playground.errors.unknown");
}

function toPlaygroundError(
  err: unknown,
  t: (key: string) => string
): PlaygroundError {
  if (err instanceof PlaygroundValidationError) {
    const message =
      err.code === "key_reveal_timeout"
        ? err.message
        : playgroundErrorMessage(0, err.code, t);
    return {
      status: 0,
      code: err.code,
      message,
    };
  }
  if (err instanceof DmitApiError) {
    return {
      status: err.status,
      code: err.code,
      message: playgroundErrorMessage(err.status, err.code, t),
    };
  }
  if (err instanceof TypeError) {
    return {
      status: 0,
      code: "network_error",
      message: t("dashboard.playground.errors.upstreamError"),
    };
  }
  if (err instanceof Error) {
    return {
      status: 0,
      code: "unknown_error",
      message: t("dashboard.playground.errors.unknown"),
    };
  }
  return {
    status: 0,
    code: "unknown_error",
    message: t("dashboard.playground.errors.unknown"),
  };
}
