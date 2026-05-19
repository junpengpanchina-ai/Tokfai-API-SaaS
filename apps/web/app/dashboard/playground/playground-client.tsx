"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
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
import { Label } from "@/components/ui/label";
import {
  DmitApiError,
  playgroundChatCompletions,
  type ChatCompletionResponse,
} from "@/lib/dmit/client";
import { formatCreditsPrecise } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";

const DEFAULT_MODEL = "gemini-3.1-pro";
const MODEL_OPTIONS = [
  "gemini-3.1-pro",
  "gemini-3-pro",
  "gpt-4o-mini",
  "nano-banana",
] as const;
const DEFAULT_PROMPT = "Say hello from Tokfai.";

interface PlaygroundError {
  status: number;
  code?: string;
  message: string;
}

export function PlaygroundClient() {
  const [model, setModel] = useState(DEFAULT_MODEL);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
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
      setError({ status: 0, message: "Prompt is required." });
      return;
    }

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const accessToken = session?.access_token;
    if (!accessToken) {
      setError({ status: 401, message: "请重新登录" });
      return;
    }

    setLoading(true);
    try {
      const res = await playgroundChatCompletions(accessToken, {
        model,
        messages: [{ role: "user", content: trimmedPrompt }],
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
            Send a single-turn chat completion through Tokfai API. Your session
            token is sent to DMIT only — no API keys or secrets in the browser.
          </p>
        </div>
        <Badge variant="secondary">POST /v1/chat/completions</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,280px]">
        <Card>
          <CardHeader>
            <CardTitle>Request</CardTitle>
            <CardDescription>
              One user message, non-streaming. Billing and usage logging run on
              DMIT after a successful response.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
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
              Model is passed in the JSON body to DMIT.
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
              Need more credits?{" "}
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
          {error.code ? (
            <Badge variant="outline" className="font-mono text-[10px]">
              {error.code}
            </Badge>
          ) : null}
        </div>
        <p className="text-sm">{error.message}</p>
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
      message: messageForPlayground(err.status, err.code, err.message),
    };
  }
  if (err instanceof TypeError) {
    return {
      status: 0,
      message: "模型暂时不可用，请稍后重试",
    };
  }
  if (err instanceof Error) {
    return { status: 0, message: err.message };
  }
  return { status: 0, message: "模型暂时不可用，请稍后重试" };
}

function messageForPlayground(
  status: number,
  code: string | undefined,
  fallback: string
): string {
  if (status === 401 || status === 403) {
    return "请重新登录";
  }
  if (status === 402 || code === "insufficient_credits") {
    return "余额不足，请先充值";
  }
  if (
    status >= 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    code === "upstream_error" ||
    code === "upstream_auth_error" ||
    code === "upstream_rate_limited"
  ) {
    return "模型暂时不可用，请稍后重试";
  }
  return fallback;
}
