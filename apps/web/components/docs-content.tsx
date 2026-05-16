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

const BASE_URL = "https://api.tokfai.com";
const API_KEY_PLACEHOLDER = "sk-tokfai_xxx";

const MODELS_CURL = `curl https://api.tokfai.com/v1/models \\
  -H "Authorization: Bearer sk-tokfai_xxx"`;

const CHAT_COMPLETIONS_CURL = `curl https://api.tokfai.com/v1/chat/completions \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-3.1-pro",
    "messages": [
      {
        "role": "user",
        "content": "Write a one-sentence product tagline for Tokfai."
      }
    ]
  }'`;

const ERROR_CODES = [
  {
    status: "401",
    code: "invalid_token",
    meaning:
      "The API key is missing, malformed, revoked, or cannot be verified.",
  },
  {
    status: "402",
    code: "insufficient_credits",
    meaning: "The account does not have enough prepaid credits for the request.",
  },
  {
    status: "500 / 502",
    code: "upstream_error",
    meaning:
      "Tokfai or the upstream model provider could not complete the request.",
  },
];

export function DocsContent({ showDashboardLinks = true }: { showDashboardLinks?: boolean }) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  async function copyCode(id: string, value: string) {
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
            Tokfai base URL, send a <code>sk-tokfai_...</code> key, and use the
            same request shape you already know.
          </p>
        </div>
        {showDashboardLinks ? (
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/api-keys">Create API key</Link>
          </Button>
        ) : null}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Base URL</CardTitle>
            <CardDescription>Use this as your API host.</CardDescription>
          </CardHeader>
          <CardContent>
            <code className="rounded bg-muted px-2 py-1 text-sm">
              {BASE_URL}
            </code>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Authentication</CardTitle>
            <CardDescription>
              Include your Tokfai API key as a Bearer token.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <code className="break-all rounded bg-muted px-2 py-1 text-sm">
              Authorization: Bearer {API_KEY_PLACEHOLDER}
            </code>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>GET /v1/models</CardTitle>
          <CardDescription>
            List models available through the OpenAI-compatible endpoint.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock
            id="models"
            code={MODELS_CURL}
            copied={copiedId === "models"}
            onCopy={copyCode}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>POST /v1/chat/completions</CardTitle>
          <CardDescription>
            Send chat messages using the OpenAI chat completions request shape.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock
            id="chat-completions"
            code={CHAT_COMPLETIONS_CURL}
            copied={copiedId === "chat-completions"}
            onCopy={copyCode}
          />
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

function CodeBlock({
  id,
  code,
  copied,
  onCopy,
}: {
  id: string;
  code: string;
  copied: boolean;
  onCopy: (id: string, value: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-muted">
      <div className="flex items-center justify-between border-b bg-background/70 px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          curl
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
