"use client";

import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const BASE_URL = "https://api.tokfai.com/v1";
const API_KEY_PLACEHOLDER = "sk-tokfai_xxx";
const DEFAULT_MODEL = "gemini-3.1-pro";

const AUTH_HEADER = `Authorization: Bearer ${API_KEY_PLACEHOLDER}`;

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
  apiKey: process.env.TOKFAI_API_KEY,
  baseURL: "https://api.tokfai.com/v1",
});

const completion = await client.chat.completions.create({
  model: "gemini-3.1-pro",
  messages: [{ role: "user", content: "Hello from Tokfai" }],
});`;

const COMPAT_CLIENT_CONFIG = `Base URL: https://api.tokfai.com/v1
API Key: sk-tokfai_xxx
Model: gemini-3.1-pro`;

const ERROR_CODES = [
  {
    status: "401",
    code: "invalid_token",
    meaning: "API Key 无效或格式错误",
  },
  {
    status: "402",
    code: "insufficient_credits",
    meaning: "余额不足",
  },
  {
    status: "404",
    code: "route_not_found",
    meaning: "接口路径错误",
  },
  {
    status: "5xx",
    code: "upstream_error",
    meaning: "上游模型暂不可用",
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
            Tokfai exposes an OpenAI-compatible API. Point your client at the
            base URL below, send a <code>sk-tokfai_...</code> key, and use the
            same request shape as OpenAI.
          </p>
        </div>
        {showDashboardLinks ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/api-keys">Create API key</Link>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <CopyableCard
          id="base-url"
          title="Base URL"
          description="Use this as your API host."
          value={BASE_URL}
          copied={copiedId === "base-url"}
          onCopy={copyText}
        />
        <CopyableCard
          id="endpoint"
          title="Chat Completions"
          description="OpenAI-compatible chat endpoint."
          value="POST /chat/completions"
          copied={copiedId === "endpoint"}
          onCopy={copyText}
        />
        <CopyableCard
          id="auth"
          title="Authorization"
          description="Include your Tokfai API key as a Bearer token."
          value={AUTH_HEADER}
          copied={copiedId === "auth"}
          onCopy={copyText}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>curl</CardTitle>
          <CardDescription>
            Minimal request to{" "}
            <code className="rounded bg-muted px-1 text-xs">POST /chat/completions</code>
            .
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
          <CardTitle>Cherry Studio / Cursor / OpenAI-compatible clients</CardTitle>
          <CardDescription>
            Use these settings in any client that supports a custom OpenAI base
            URL.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock
            id="compat-config"
            label="config"
            code={COMPAT_CLIENT_CONFIG}
            copied={copiedId === "compat-config"}
            onCopy={copyText}
          />
          <p className="mt-4 text-sm text-muted-foreground">
            Replace <code className="rounded bg-muted px-1 text-xs">sk-tokfai_xxx</code>{" "}
            with a key from{" "}
            {showDashboardLinks ? (
              <Link
                href="/dashboard/api-keys"
                className="font-medium text-foreground underline-offset-4 hover:underline"
              >
                API Keys
              </Link>
            ) : (
              "your Tokfai dashboard"
            )}
            . Default model:{" "}
            <code className="rounded bg-muted px-1 text-xs">{DEFAULT_MODEL}</code>.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>常见错误码</CardTitle>
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
}: {
  id: string;
  title: string;
  description: string;
  value: string;
  copied: boolean;
  onCopy: (id: string, value: string) => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
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
