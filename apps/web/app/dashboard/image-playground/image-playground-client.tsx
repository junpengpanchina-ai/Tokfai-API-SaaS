"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ImageIcon,
  KeyRound,
  Loader2,
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
  DmitApiError,
  imageGenerations,
  revealMeApiKey,
  type ImageGenerationResponse,
} from "@/lib/dmit/client";
import { userMessageForDmitError } from "@/lib/dmit-messages";
import {
  IMAGE_PLAYGROUND_MODEL_IDS,
  IMAGE_PLAYGROUND_SIZES,
  isAvailableImageModel,
  type ImagePlaygroundModelId,
  type ImagePlaygroundSize,
} from "@/lib/model-catalog";
import {
  isFullTokfaiApiKey,
  TOKFAI_API_KEY_PLACEHOLDER,
  TOKFAI_IMAGES_GENERATIONS_ENDPOINT,
} from "@/lib/tokfai-api";

const DEFAULT_MODEL: ImagePlaygroundModelId = "nano-banana";
const DEFAULT_SIZE: ImagePlaygroundSize = "1024x1024";
const DEFAULT_PROMPT = "A serene mountain landscape at sunset, digital art.";

function resolveInitialModel(initialModel?: string): ImagePlaygroundModelId {
  if (initialModel && isAvailableImageModel(initialModel)) {
    return initialModel;
  }
  return DEFAULT_MODEL;
}

export interface ImagePlaygroundApiKeyOption {
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

export function ImagePlaygroundClient({
  accessToken,
  activeKeys,
  initialModel,
}: {
  accessToken: string;
  activeKeys: ImagePlaygroundApiKeyOption[];
  initialModel?: string;
}) {
  const [model, setModel] = useState(() => resolveInitialModel(initialModel));
  const [size, setSize] = useState<ImagePlaygroundSize>(DEFAULT_SIZE);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [apiKeyMode, setApiKeyMode] = useState<ApiKeyMode>(
    activeKeys.length > 0 ? "select" : "paste"
  );
  const [apiKey, setApiKey] = useState("");
  const [selectedKeyId, setSelectedKeyId] = useState(activeKeys[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImageGenerationResponse | null>(null);
  const [error, setError] = useState<PlaygroundError | null>(null);

  async function handleGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError(null);
    setResult(null);

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError({
        status: 0,
        code: "missing_prompt",
        message: "Prompt is required.",
      });
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
      const res = await imageGenerations(resolvedKey, {
        model,
        prompt: trimmedPrompt,
        size,
        n: 1,
        response_format: "url",
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
    <form onSubmit={handleGenerate} className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Image Playground
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Image Playground uses image models only. Successful generations debit
            credits. Failed calls are not charged.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Send a generation request through the Tokfai API using your own{" "}
            <code className="rounded bg-muted px-1 text-xs">sk-tokfai_</code>{" "}
            key — the same path external clients use.
          </p>
        </div>
        <Badge variant="secondary">{TOKFAI_IMAGES_GENERATIONS_ENDPOINT}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,280px]">
        <Card>
          <CardHeader>
            <CardTitle>Request</CardTitle>
            <CardDescription>
              One prompt, one image. Successful calls are recorded in Usage and
              debited from Credits.
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
                rows={6}
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
                    Generating…
                  </>
                ) : (
                  <>
                    <ImageIcon className="h-4 w-4" />
                    Generate
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
              Image models only. Values are sent in the JSON body to{" "}
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
                onChange={(e) => setModel(e.target.value as ImagePlaygroundModelId)}
                disabled={loading}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {IMAGE_PLAYGROUND_MODEL_IDS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="size">Size</Label>
              <select
                id="size"
                value={size}
                onChange={(e) => setSize(e.target.value as ImagePlaygroundSize)}
                disabled={loading}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {IMAGE_PLAYGROUND_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
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
  activeKeys: ImagePlaygroundApiKeyOption[];
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
  result: ImageGenerationResponse | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Generating image…
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
        Generated image will appear here.
      </div>
    );
  }

  const imageUrl = result.data?.[0]?.url ?? null;

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

      {imageUrl ? (
        <div className="overflow-hidden rounded-md border bg-muted/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Generated image"
            className="mx-auto max-h-[480px] w-full object-contain"
          />
        </div>
      ) : (
        <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
          No image URL returned.
        </div>
      )}

      <MetadataPanel result={result} imageUrl={imageUrl} />
    </div>
  );
}

function MetadataPanel({
  result,
  imageUrl,
}: {
  result: ImageGenerationResponse;
  imageUrl: string | null;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");

  async function handleCopyUrl() {
    if (!imageUrl) return;
    try {
      await navigator.clipboard.writeText(imageUrl);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("idle");
    }
  }

  const items: Array<{ label: string; value: string | number | null | undefined }> =
    [
      { label: "model", value: result.model },
      { label: "request_id", value: result.request_id },
      { label: "upstream_id", value: result.upstream_id },
      {
        label: "credits_charged",
        value:
          result.credits_charged != null
            ? String(result.credits_charged)
            : null,
      },
    ];

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-card p-4">
      {imageUrl ? (
        <div className="flex flex-col gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Image URL
          </Label>
          <code className="block overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs break-all">
            {imageUrl}
          </code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={handleCopyUrl}
          >
            {copyStatus === "copied" ? (
              <>
                <Check className="h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy image URL
              </>
            )}
          </Button>
        </div>
      ) : null}

      <dl className="grid gap-2 text-sm">
        {items.map((item) =>
          item.value != null && item.value !== "" ? (
            <div key={item.label} className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">{item.label}:</dt>
              <dd className="font-mono">{item.value}</dd>
            </div>
          ) : null
        )}
      </dl>
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
