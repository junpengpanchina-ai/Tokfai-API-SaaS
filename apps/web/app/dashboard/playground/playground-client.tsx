"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  KeyRound,
  Loader2,
  Send,
  Sparkles,
} from "lucide-react";

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
  DmitApiError,
  revealMeApiKey,
  type ChatCompletionResponse,
} from "@/lib/dmit/client";
import { userMessageForDmitError } from "@/lib/dmit-messages";
import {
  isFullTokfaiApiKey,
  TOKFAI_API_KEY_PLACEHOLDER,
  TOKFAI_CHAT_COMPLETIONS_ENDPOINT,
} from "@/lib/tokfai-api";

const DEFAULT_MODEL = "gemini-3.1-pro";
const MODEL_OPTIONS = ["gemini-3.1-pro", "gemini-3-pro"] as const;
const DEFAULT_PROMPT = "Say hello from Tokfai.";

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

type ApiKeyMode = "paste" | "select";

export function PlaygroundClient({
  accessToken,
  activeKeys,
}: {
  accessToken: string;
  activeKeys: PlaygroundApiKeyOption[];
}) {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [apiKeyMode, setApiKeyMode] = useState<ApiKeyMode>(
    activeKeys.length > 0 ? "select" : "paste"
  );
  const [apiKey, setApiKey] = useState("");
  const [selectedKeyId, setSelectedKeyId] = useState(activeKeys[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ChatCompletionResponse | null>(null);
  const [error, setError] = useState<PlaygroundError | null>(null);

  async function handleRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError(null);
    setResult(null);

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError({ status: 0, code: "missing_prompt", message: "Prompt is required." });
      return;
    }

    let resolvedKey: string;
    try {
      resolvedKey = await resolveApiKey();
    } catch (err) {
      setError(toPlaygroundError(err));
      return;
    }

    setLoading(true);
    try {
      const res = await chatCompletions(resolvedKey, {
        model,
        messages: [{ role: "user", content: trimmedPrompt }],
        stream: false,
      });
      setResult(res);
    } catch (err) {
      setError(toPlaygroundError(err));
    } finally {
      setLoading(false);
    }
  }

  async function resolveApiKey(): Promise<string> {
    if (apiKeyMode === "paste") {
      const trimmed = apiKey.trim();
      if (!trimmed) {
        throw new PlaygroundValidationError(
          "API key is required.",
          "missing_api_key"
        );
      }
      if (!isFullTokfaiApiKey(trimmed)) {
        throw new PlaygroundValidationError(
          `Enter a full key like ${TOKFAI_API_KEY_PLACEHOLDER}.`,
          "invalid_api_key"
        );
      }
      return trimmed;
    }

    const selected = activeKeys.find((row) => row.id === selectedKeyId);
    if (!selected) {
      throw new PlaygroundValidationError(
        "Select an active API key or paste one manually.",
        "missing_api_key"
      );
    }
    if (!selected.can_reveal) {
      throw new PlaygroundValidationError(
        "This key cannot be loaded automatically. Switch to “Paste key” and enter the full secret.",
        "key_not_revealable"
      );
    }
    if (!accessToken) {
      throw new PlaygroundValidationError(
        "Please sign in again.",
        "missing_access_token"
      );
    }
    const secret = await revealMeApiKey(selected.id, { accessToken });
    if (!isFullTokfaiApiKey(secret)) {
      throw new PlaygroundValidationError(
        "Could not load a valid API key. Paste the full secret instead.",
        "invalid_api_key"
      );
    }
    return secret;
  }

  return (
    <form onSubmit={handleRun} className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Chat Playground
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Chat Playground only supports chat models. Send a single-turn
            completion through the Tokfai API using your own{" "}
            <code className="rounded bg-muted px-1 text-xs">sk-tokfai_</code> key
            — the same path external clients use, so normal billing applies.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Image models will be available in a separate Image Playground later.
          </p>
        </div>
        <Badge variant="secondary">{TOKFAI_CHAT_COMPLETIONS_ENDPOINT}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,280px]">
        <Card>
          <CardHeader>
            <CardTitle>Request</CardTitle>
            <CardDescription>
              One user message, non-streaming. Successful calls are recorded in
              Usage and debited from Credits.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ApiKeyField
              mode={apiKeyMode}
              activeKeys={activeKeys}
              apiKey={apiKey}
              selectedKeyId={selectedKeyId}
              loading={loading}
              onModeChange={setApiKeyMode}
              onApiKeyChange={setApiKey}
              onSelectedKeyChange={setSelectedKeyId}
            />

            <div className="flex flex-col gap-2">
              <Label htmlFor="prompt">Prompt</Label>
              <textarea
                id="prompt"
                rows={8}
                required
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={loading}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Running…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Run
                  </>
                )}
              </Button>
            </div>

            <ResponsePanel loading={loading} error={error} result={result} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>
              Chat models only. The selected model is passed in the JSON body to{" "}
              <code className="rounded bg-muted px-1 text-xs">
                api.tokfai.com
              </code>
              .
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="model">Model</Label>
              <select
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={loading}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {MODEL_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <p className="text-xs text-muted-foreground">
              Need a key?{" "}
              <Link
                href="/dashboard/api-keys"
                className="underline underline-offset-4"
              >
                Create an API key
              </Link>
              . Need more credits?{" "}
              <Link
                href="/dashboard/credits"
                className="underline underline-offset-4"
              >
                Top up
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function ApiKeyField({
  mode,
  activeKeys,
  apiKey,
  selectedKeyId,
  loading,
  onModeChange,
  onApiKeyChange,
  onSelectedKeyChange,
}: {
  mode: ApiKeyMode;
  activeKeys: PlaygroundApiKeyOption[];
  apiKey: string;
  selectedKeyId: string;
  loading: boolean;
  onModeChange: (mode: ApiKeyMode) => void;
  onApiKeyChange: (value: string) => void;
  onSelectedKeyChange: (id: string) => void;
}) {
  const revealableKeys = activeKeys.filter((row) => row.can_reveal !== false);

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        API key
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "select" ? "default" : "outline"}
          disabled={loading || revealableKeys.length === 0}
          onClick={() => onModeChange("select")}
        >
          Select key
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "paste" ? "default" : "outline"}
          disabled={loading}
          onClick={() => onModeChange("paste")}
        >
          Paste key
        </Button>
      </div>

      {mode === "select" ? (
        revealableKeys.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="api-key-select">Your active keys</Label>
            <select
              id="api-key-select"
              value={selectedKeyId}
              onChange={(e) => onSelectedKeyChange(e.target.value)}
              disabled={loading}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {revealableKeys.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} ({row.prefix || "no prefix"})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              The full secret is loaded only for this request and is not stored
              in the browser.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No revealable keys found.{" "}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => onModeChange("paste")}
            >
              Paste your key
            </button>{" "}
            or{" "}
            <Link
              href="/dashboard/api-keys"
              className="underline underline-offset-4"
            >
              create one
            </Link>
            .
          </p>
        )
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="api-key">Full API key</Label>
          <Input
            id="api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={TOKFAI_API_KEY_PLACEHOLDER}
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">
            Sent as{" "}
            <code className="rounded bg-background px-1 text-[11px]">
              Authorization: Bearer sk-tokfai_…
            </code>
            . Never logged or persisted by this page.
          </p>
        </div>
      )}
    </div>
  );
}

function ResponsePanel({
  loading,
  error,
  result,
}: {
  loading: boolean;
  error: PlaygroundError | null;
  result: ChatCompletionResponse | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Waiting for the model…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Request failed
          {error.status > 0 ? (
            <Badge variant="outline" className="ml-1">
              HTTP {error.status}
            </Badge>
          ) : null}
        </div>
        <dl className="grid gap-1 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Error code:</dt>
            <dd className="font-mono">{error.code ?? "n/a"}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Error message:</dt>
            <dd>{error.message}</dd>
          </div>
        </dl>
        {error.status === 402 || error.code === "insufficient_credits" ? (
          <Button asChild size="sm" variant="outline" className="w-fit">
            <Link href="/dashboard/credits">Add credits</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4" />
        Response will appear here.
      </div>
    );
  }

  const content =
    result.choices?.[0]?.message?.content ?? "(no content returned)";
  const usage = result.usage;
  const requestId =
    result.tokfai?.request_id ?? result.request_id ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <p>
          This request has been recorded. View it in{" "}
          <Link
            href="/dashboard/usage"
            className="font-medium underline underline-offset-4"
          >
            Usage
          </Link>{" "}
          and{" "}
          <Link
            href="/dashboard/credits"
            className="font-medium underline underline-offset-4"
          >
            Credits
          </Link>
          .
        </p>
      </div>

      <div className="rounded-md border bg-muted/40 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">assistant</Badge>
        </div>
        <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {content}
        </pre>
      </div>

      <UsageRow model={result.model} usage={usage} requestId={requestId} />
    </div>
  );
}

function UsageRow({
  model,
  usage,
  requestId,
}: {
  model: string;
  usage?: ChatCompletionResponse["usage"];
  requestId: string | null;
}) {
  const items: Array<{ label: string; value: string }> = [
    { label: "model", value: model },
  ];

  if (usage) {
    items.push({
      label: "prompt_tokens",
      value: usage.prompt_tokens.toString(),
    });
    items.push({
      label: "completion_tokens",
      value: usage.completion_tokens.toString(),
    });
    items.push({
      label: "total_tokens",
      value: usage.total_tokens.toString(),
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-card px-4 py-2 text-xs text-muted-foreground">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1">
          <span>{item.label}:</span>
          <span className="font-mono text-foreground">{item.value}</span>
        </div>
      ))}
      {requestId ? (
        <div className="ml-auto flex items-center gap-1">
          <span>request_id:</span>
          <span className="font-mono text-foreground">{requestId}</span>
        </div>
      ) : null}
    </div>
  );
}

class PlaygroundValidationError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "PlaygroundValidationError";
    this.code = code;
  }
}

function toPlaygroundError(err: unknown): PlaygroundError {
  if (err instanceof PlaygroundValidationError) {
    return {
      status: 0,
      code: err.code,
      message: err.message,
    };
  }
  if (err instanceof DmitApiError) {
    return {
      status: err.status,
      code: err.code,
      message: userMessageForDmitError(err.status, err.code, err.message),
    };
  }
  if (err instanceof TypeError) {
    return {
      status: 0,
      code: "network_error",
      message: userMessageForDmitError(503),
    };
  }
  if (err instanceof Error) {
    return {
      status: 0,
      code: "unknown_error",
      message: userMessageForDmitError(0, undefined, err.message),
    };
  }
  return {
    status: 0,
    code: "unknown_error",
    message: userMessageForDmitError(503),
  };
}
