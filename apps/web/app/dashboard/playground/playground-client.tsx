"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Eye,
  EyeOff,
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
  listModels,
  type ChatCompletionResponse,
  type ModelListItem,
} from "@/lib/dmit/client";
import { formatCreditsPrecise } from "@/lib/format";

const DEFAULT_MODEL = "gemini-3.1-pro";
const FALLBACK_MODELS = [DEFAULT_MODEL] as const;
const DEFAULT_PROMPT = "Say hello from Tokfai.";
const MAX_TOKENS = 512;

interface PlaygroundError {
  status: number;
  code?: string;
  message: string;
  hint?: string;
}

export function PlaygroundClient() {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [models, setModels] = useState<ModelListItem[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<PlaygroundError | null>(null);
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [temperature, setTemperature] = useState("0.7");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ChatCompletionResponse | null>(null);
  const [error, setError] = useState<PlaygroundError | null>(null);
  const modelOptions = useMemo(() => {
    const ids = new Set<string>([DEFAULT_MODEL]);
    for (const item of models) {
      if (item.id) ids.add(item.id);
    }
    return Array.from(ids);
  }, [models]);

  useEffect(() => {
    const trimmedKey = apiKey.trim();
    setModelsError(null);

    if (!trimmedKey) {
      setModels([]);
      setModelsLoading(false);
      setModel((current) => current || FALLBACK_MODELS[0]);
      return;
    }

    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setModelsLoading(true);
      try {
        const loadedModels = await listModels(trimmedKey);
        if (cancelled) return;
        setModels(loadedModels);
        setModel((current) => {
          if (loadedModels.some((item) => item.id === current)) return current;
          if (loadedModels.some((item) => item.id === DEFAULT_MODEL)) {
            return DEFAULT_MODEL;
          }
          return loadedModels[0]?.id ?? DEFAULT_MODEL;
        });
      } catch (err) {
        if (cancelled) return;
        setModels([]);
        setModelsError(toPlaygroundError(err));
      } finally {
        if (!cancelled) setModelsLoading(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [apiKey]);

  async function handleLoadModels() {
    const trimmedKey = apiKey.trim();
    setModelsError(null);
    if (!trimmedKey) {
      setModelsError({
        status: 0,
        message: "Paste your sk-tokfai_ API key to load models.",
      });
      return;
    }

    setModelsLoading(true);
    try {
      const loadedModels = await listModels(trimmedKey);
      setModels(loadedModels);
      setModel((current) => {
        if (loadedModels.some((item) => item.id === current)) return current;
        if (loadedModels.some((item) => item.id === DEFAULT_MODEL)) {
          return DEFAULT_MODEL;
        }
        return loadedModels[0]?.id ?? DEFAULT_MODEL;
      });
    } catch (err) {
      setModels([]);
      setModelsError(toPlaygroundError(err));
    } finally {
      setModelsLoading(false);
    }
  }

  async function handleRun(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError(null);
    setResult(null);

    const trimmedKey = apiKey.trim();
    if (!trimmedKey) {
      setError({
        status: 0,
        message: "Paste your sk-tokfai_ API key first.",
      });
      return;
    }
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError({ status: 0, message: "Prompt is required." });
      return;
    }
    const parsedTemp = Number(temperature);
    if (Number.isNaN(parsedTemp) || parsedTemp < 0 || parsedTemp > 2) {
      setError({
        status: 0,
        message: "Temperature must be a number between 0 and 2.",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await chatCompletions(trimmedKey, {
        model,
        messages: [{ role: "user", content: trimmedPrompt }],
        max_tokens: MAX_TOKENS,
        temperature: parsedTemp,
        stream: false,
      });
      setResult(res);
    } catch (err) {
      setError(toPlaygroundError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleRun} className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Playground</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Send a chat completion straight from the browser. Uses your own{" "}
            <code className="rounded bg-muted px-1 text-xs">sk-tokfai_…</code>{" "}
            key, just like an external customer would.
          </p>
        </div>
        <Badge variant="secondary">POST /v1/chat/completions</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,360px]">
        <Card>
          <CardHeader>
            <CardTitle>Request</CardTitle>
            <CardDescription>
              Prompt sent as a single user message. System / assistant turns
              are coming in a later step. Max tokens is fixed at {MAX_TOKENS}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="prompt">User message</Label>
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

            <ResponsePanel
              loading={loading}
              error={error}
              result={result}
              model={model}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>
              These never leave the browser. Your key is sent only to{" "}
              <code className="text-xs">api.tokfai.com</code> for this request.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="api-key">API key</Label>
              <div className="flex gap-2">
                <Input
                  id="api-key"
                  type={showKey ? "text" : "password"}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="sk-tokfai_…"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  disabled={loading}
                  className="font-mono text-xs"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowKey((v) => !v)}
                  aria-label={showKey ? "Hide API key" : "Show API key"}
                >
                  {showKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Paste a key from{" "}
                <a
                  href="/dashboard/api-keys"
                  className="underline underline-offset-4"
                >
                  API Keys
                </a>
                . Nothing is saved to localStorage or the URL.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="model">Model</Label>
              <div className="flex gap-2">
                <select
                  id="model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  disabled={loading || modelsLoading}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleLoadModels}
                  disabled={loading || modelsLoading}
                >
                  {modelsLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading
                    </>
                  ) : (
                    "Refresh"
                  )}
                </Button>
              </div>
              <ModelListStatus
                loading={modelsLoading}
                error={modelsError}
                count={models.length}
                hasApiKey={apiKey.trim().length > 0}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="temperature">Temperature</Label>
              <Input
                id="temperature"
                type="number"
                inputMode="decimal"
                min={0}
                max={2}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
                disabled={loading}
              />
              <p className="text-xs text-muted-foreground">
                0 = deterministic, 2 = wildly random.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function ModelListStatus({
  loading,
  error,
  count,
  hasApiKey,
}: {
  loading: boolean;
  error: PlaygroundError | null;
  count: number;
  hasApiKey: boolean;
}) {
  if (loading) {
    return (
      <p className="text-xs text-muted-foreground">
        Loading models from <code>GET /v1/models</code>...
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-xs text-destructive">
        Could not load models: {error.message}
      </p>
    );
  }

  if (count > 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Loaded {count} model{count === 1 ? "" : "s"} from DMIT.
      </p>
    );
  }

  return (
    <p className="text-xs text-muted-foreground">
      {hasApiKey
        ? "Models load automatically after the key is validated."
        : "Paste a Tokfai API key to auto-load available models."}
    </p>
  );
}

function ResponsePanel({
  loading,
  error,
  result,
  model,
}: {
  loading: boolean;
  error: PlaygroundError | null;
  result: ChatCompletionResponse | null;
  model: string;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Waiting for <code className="text-xs">{model}</code>…
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
          {error.code ? (
            <Badge variant="outline" className="font-mono text-[10px]">
              {error.code}
            </Badge>
          ) : null}
        </div>
        <p className="text-sm">{error.message}</p>
        {error.hint ? (
          <p className="text-xs text-muted-foreground">{error.hint}</p>
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
  const finishReason = result.choices?.[0]?.finish_reason ?? null;
  const usage = result.usage;
  const tokfai = {
    credits_charged: result.tokfai?.credits_charged ?? result.credits_charged,
    request_id: result.tokfai?.request_id ?? result.request_id,
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md border bg-muted/40 p-4">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
          <Badge variant="secondary">assistant</Badge>
          <span className="font-mono">{result.model}</span>
          {finishReason ? (
            <span className="font-mono">· finish: {finishReason}</span>
          ) : null}
        </div>
        <pre className="whitespace-pre-wrap break-words text-sm leading-relaxed">
          {content}
        </pre>
      </div>

      <UsageRow usage={usage} tokfai={tokfai} />
    </div>
  );
}

function UsageRow({
  usage,
  tokfai,
}: {
  usage?: ChatCompletionResponse["usage"];
  tokfai?: ChatCompletionResponse["tokfai"];
}) {
  const items: Array<{ label: string; value: string }> = [];
  if (usage) {
    items.push({ label: "prompt", value: usage.prompt_tokens.toString() });
    items.push({
      label: "completion",
      value: usage.completion_tokens.toString(),
    });
    items.push({ label: "total", value: usage.total_tokens.toString() });
  }
  if (typeof tokfai?.credits_charged === "number") {
    items.push({
      label: "credits charged",
      value: formatCreditsPrecise(tokfai.credits_charged),
    });
  }

  if (items.length === 0 && !tokfai?.request_id) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-card px-4 py-2 text-xs text-muted-foreground">
      {items.map((item) => (
        <div key={item.label} className="flex items-center gap-1">
          <span>{item.label}:</span>
          <span className="font-mono text-foreground">{item.value}</span>
        </div>
      ))}
      {tokfai?.request_id ? (
        <div className="ml-auto flex items-center gap-1">
          <span>request:</span>
          <span className="font-mono text-foreground">{tokfai.request_id}</span>
        </div>
      ) : null}
    </div>
  );
}

function toPlaygroundError(err: unknown): PlaygroundError {
  if (err instanceof DmitApiError) {
    return {
      status: err.status,
      code: err.code,
      message: messageForStatus(err.status, err.message),
      hint: hintForStatus(err.status, err.code),
    };
  }
  if (err instanceof TypeError) {
    return {
      status: 0,
      message: "Could not reach api.tokfai.com.",
      hint: "Network error or CORS misconfiguration on the DMIT side.",
    };
  }
  if (err instanceof Error) {
    return { status: 0, message: err.message };
  }
  return { status: 0, message: "Unknown error." };
}

function messageForStatus(status: number, fallback: string): string {
  if (status === 401) {
    return "API Key is invalid or has been revoked.";
  }
  if (status === 402) {
    return "Insufficient credits. Please top up before running the request.";
  }
  if (status === 500 || status === 502) {
    return "Upstream model error. Please retry shortly.";
  }
  return fallback;
}

function hintForStatus(status: number, code?: string): string | undefined {
  if (code === "insufficient_credits") {
    return "Top up under Credits to keep calling the API.";
  }
  if (status === 401) {
    return "Your API key may be invalid or revoked. Try creating a fresh one under API Keys.";
  }
  if (status === 402) {
    return "Insufficient credits. Top up under Credits.";
  }
  if (status === 429) {
    return "Rate limit hit. Wait a few seconds and retry.";
  }
  if (status >= 500) {
    return "Tokfai or its upstream provider is having a moment. Retry shortly.";
  }
  return undefined;
}
