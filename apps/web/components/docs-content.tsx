"use client";

import Link from "next/link";
import { AlertCircle, Check, Copy } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import {
  TOKFAI_API_BASE_URL,
  TOKFAI_API_KEY_PLACEHOLDER,
  TOKFAI_CHAT_COMPLETIONS_ENDPOINT,
  TOKFAI_MODELS_ENDPOINT,
  TOKFAI_RECOMMENDED_MODEL,
} from "@/lib/tokfai-api";

const BASE_URL = TOKFAI_API_BASE_URL;
const API_KEY_PLACEHOLDER = TOKFAI_API_KEY_PLACEHOLDER;
const DEFAULT_MODEL = TOKFAI_RECOMMENDED_MODEL;

const AUTH_HEADER = `Authorization: Bearer ${API_KEY_PLACEHOLDER}`;

const MODELS_CURL = `curl https://api.tokfai.com/v1/models \\
  -H "Authorization: Bearer sk-tokfai_xxx"`;

const CHAT_COMPLETIONS_CURL = `curl https://api.tokfai.com/v1/chat/completions \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-3.1-pro",
    "messages": [
      { "role": "user", "content": "Hello from Tokfai" }
    ],
    "stream": false
  }'`;

const OPENAI_JS_EXAMPLE = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-tokfai_xxx",
  baseURL: "https://api.tokfai.com/v1",
});

const completion = await client.chat.completions.create({
  model: "gemini-3.1-pro",
  messages: [{ role: "user", content: "Hello from Tokfai" }],
});`;

const OPENAI_PYTHON_EXAMPLE = `from openai import OpenAI

client = OpenAI(
    api_key="sk-tokfai_xxx",
    base_url="https://api.tokfai.com/v1",
)

completion = client.chat.completions.create(
    model="gemini-3.1-pro",
    messages=[{"role": "user", "content": "Hello from Tokfai"}],
)`;

const COMPAT_CLIENT_CONFIG = `Base URL: https://api.tokfai.com/v1
API Key: sk-tokfai_xxx
Model: gemini-3.1-pro`;

const ERROR_CODES = [
  {
    status: "401",
    code: "invalid_token",
    meaning: "Invalid token",
  },
  {
    status: "402",
    code: "insufficient_credits",
    meaning: "Not enough credits",
  },
  {
    status: "404",
    code: "route_not_found",
    meaning: "Route not found",
  },
  {
    status: "5xx",
    code: "upstream_error",
    meaning: "Model temporarily unavailable",
  },
];

export function DocsContent({
  showDashboardLinks = true,
}: {
  showDashboardLinks?: boolean;
}) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  async function copyText(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            API Documentation
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Tokfai exposes an OpenAI-compatible API. Point your client at{" "}
            <code className="rounded bg-muted px-1 text-xs">{BASE_URL}</code>,
            send a <code className="rounded bg-muted px-1 text-xs">sk-tokfai_...</code>{" "}
            API key, and use the same request shape as OpenAI.
          </p>
        </div>
        {showDashboardLinks ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/api-keys">Create API key</Link>
          </Button>
        ) : null}
      </div>

      <Card className="border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <AlertCircle className="h-4 w-4 text-amber-600" />
            Credits are consumed on every call
          </CardTitle>
          <CardDescription className="text-amber-900/80 dark:text-amber-100/80">
            Each successful API request debits credits from your account. Review
            per-request usage in{" "}
            <Link
              href="/dashboard/usage"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Usage
            </Link>{" "}
            and top-up or ledger history in{" "}
            <Link
              href="/dashboard/credits"
              className="font-medium text-foreground underline-offset-4 hover:underline"
            >
              Credits
            </Link>
            .
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CopyableCard
          id="base-url"
          title="Base URL"
          description="Use this as your OpenAI client baseURL."
          value={BASE_URL}
          copied={copiedId === "base-url"}
          onCopy={copyText}
        />
        <CopyableCard
          id="api-key-format"
          title="API key format"
          description="Create keys in the dashboard; shown once at creation."
          value="sk-tokfai_..."
          copied={copiedId === "api-key-format"}
          onCopy={copyText}
        />
        <CopyableCard
          id="models-endpoint"
          title="Models"
          description="List available models."
          value={TOKFAI_MODELS_ENDPOINT}
          copied={copiedId === "models-endpoint"}
          onCopy={copyText}
        />
        <CopyableCard
          id="chat-endpoint"
          title="Chat Completions"
          description="OpenAI-compatible chat endpoint."
          value={TOKFAI_CHAT_COMPLETIONS_ENDPOINT}
          copied={copiedId === "chat-endpoint"}
          onCopy={copyText}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recommended model</CardTitle>
          <CardDescription>
            Start with{" "}
            <code className="rounded bg-muted px-1 text-xs">{DEFAULT_MODEL}</code>{" "}
            for general chat. Pass it in the{" "}
            <code className="rounded bg-muted px-1 text-xs">model</code> field
            on chat completion requests.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CopyableCard
            id="recommended-model"
            title="Model ID"
            description=""
            value={DEFAULT_MODEL}
            copied={copiedId === "recommended-model"}
            onCopy={copyText}
            compact
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Authorization</CardTitle>
          <CardDescription>
            Send your API key in the{" "}
            <code className="rounded bg-muted px-1 text-xs">Authorization</code>{" "}
            header on every request.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CopyableCard
            id="auth"
            title="Header"
            description=""
            value={AUTH_HEADER}
            copied={copiedId === "auth"}
            onCopy={copyText}
            compact
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GET /v1/models</CardTitle>
          <CardDescription>
            List models available to your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock
            id="models-curl"
            label="curl"
            code={MODELS_CURL}
            copied={copiedId === "models-curl"}
            onCopy={copyText}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>POST /v1/chat/completions</CardTitle>
          <CardDescription>
            Send chat messages and receive a model response.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock
            id="chat-completions-curl"
            label="curl"
            code={CHAT_COMPLETIONS_CURL}
            copied={copiedId === "chat-completions-curl"}
            onCopy={copyText}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>OpenAI JavaScript SDK</CardTitle>
          <CardDescription>
            Set <code className="rounded bg-muted px-1 text-xs">baseURL</code> to
            Tokfai and pass your API key as{" "}
            <code className="rounded bg-muted px-1 text-xs">apiKey</code>.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock
            id="openai-js"
            label="javascript"
            code={OPENAI_JS_EXAMPLE}
            copied={copiedId === "openai-js"}
            onCopy={copyText}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>OpenAI Python SDK</CardTitle>
          <CardDescription>
            Install with{" "}
            <code className="rounded bg-muted px-1 text-xs">pip install openai</code>{" "}
            and point the client at Tokfai.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock
            id="openai-python"
            label="python"
            code={OPENAI_PYTHON_EXAMPLE}
            copied={copiedId === "openai-python"}
            onCopy={copyText}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Cherry Studio / Chatbox</CardTitle>
          <CardDescription>
            Use these settings in desktop clients that support a custom OpenAI
            base URL.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CodeBlock
            id="compat-config"
            label="config"
            code={COMPAT_CLIENT_CONFIG}
            copied={copiedId === "compat-config"}
            onCopy={copyText}
          />
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <span className="font-medium text-foreground">Cherry Studio:</span>{" "}
              Settings → Provider → OpenAI-compatible → set API Host to{" "}
              <code className="rounded bg-muted px-1 text-xs">{BASE_URL}</code>,
              API Key to your{" "}
              <code className="rounded bg-muted px-1 text-xs">sk-tokfai_...</code>{" "}
              key, and default model to{" "}
              <code className="rounded bg-muted px-1 text-xs">{DEFAULT_MODEL}</code>.
            </p>
            <p>
              <span className="font-medium text-foreground">Chatbox:</span>{" "}
              Settings → AI Provider → Custom → API Mode OpenAI-compatible →
              API Host{" "}
              <code className="rounded bg-muted px-1 text-xs">{BASE_URL}</code>,
              API Key{" "}
              <code className="rounded bg-muted px-1 text-xs">sk-tokfai_xxx</code>,
              Model{" "}
              <code className="rounded bg-muted px-1 text-xs">{DEFAULT_MODEL}</code>.
            </p>
            <p>
              Replace{" "}
              <code className="rounded bg-muted px-1 text-xs">sk-tokfai_xxx</code>{" "}
              with a key from{" "}
              {showDashboardLinks ? (
                <Link
                  href="/dashboard/api-keys"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  API Keys
                </Link>
              ) : (
                <Link
                  href="/dashboard/api-keys"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  your Tokfai dashboard
                </Link>
              )}
              .
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Error codes</CardTitle>
          <CardDescription>
            Handle these responses when integrating Tokfai.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">HTTP</th>
                  <th className="py-2 pr-4 font-medium">Code</th>
                  <th className="py-2 pr-4 font-medium">Meaning</th>
                </tr>
              </thead>
              <tbody>
                {ERROR_CODES.map((error) => (
                  <tr key={error.code} className="border-b last:border-0">
                    <td className="py-3 pr-4 font-mono text-xs">
                      {error.status}
                    </td>
                    <td className="py-3 pr-4 font-mono text-xs">
                      {error.code}
                    </td>
                    <td className="py-3 pr-4 text-muted-foreground">
                      {error.meaning}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function CopyableCard({
  id,
  title,
  description,
  value,
  copied,
  onCopy,
  compact = false,
}: {
  id: string;
  title: string;
  description: string;
  value: string;
  copied: boolean;
  onCopy: (id: string, value: string) => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex items-start justify-between gap-3">
        <code className="break-all rounded bg-muted px-2 py-1 text-sm">{value}</code>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0"
          onClick={() => onCopy(id, value)}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy
            </>
          )}
        </Button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent className="flex items-start justify-between gap-3">
        <code className="break-all rounded bg-muted px-2 py-1 text-sm">{value}</code>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 shrink-0"
          onClick={() => onCopy(id, value)}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

function CodeBlock({
  id,
  label,
  code,
  copied,
  onCopy,
}: {
  id: string;
  label: string;
  code: string;
  copied: boolean;
  onCopy: (id: string, value: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-muted">
      <div className="flex items-center justify-between border-b bg-background/70 px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8"
          onClick={() => onCopy(id, code)}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              Copied
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              Copy
            </>
          )}
        </Button>
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
