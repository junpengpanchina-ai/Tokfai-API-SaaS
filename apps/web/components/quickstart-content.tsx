"use client";

import Link from "next/link";

import {
  CodeBlock,
  CopyButton,
  useCopyToClipboard,
} from "@/components/copy-code-block";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/i18n-provider";
import {
  TOKFAI_API_BASE_URL,
  TOKFAI_API_KEY_PLACEHOLDER,
} from "@/lib/tokfai-api";

const BASE_URL = TOKFAI_API_BASE_URL;
const API_KEY_PLACEHOLDER = TOKFAI_API_KEY_PLACEHOLDER;
const AUTH_HEADER = `Authorization: Bearer ${API_KEY_PLACEHOLDER}`;

const CHAT_COMPLETIONS_CURL = `curl https://api.tokfai.com/v1/chat/completions \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gemini-3.1-pro",
    "messages": [
      {"role": "user", "content": "Hello Tokfai"}
    ]
  }'`;

const OPENAI_JS_EXAMPLE = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-tokfai_xxx",
  baseURL: "https://api.tokfai.com/v1",
});

const completion = await client.chat.completions.create({
  model: "gemini-3.1-pro",
  messages: [{ role: "user", content: "Hello Tokfai" }],
});`;

const OPENAI_PYTHON_EXAMPLE = `from openai import OpenAI

client = OpenAI(
    api_key="sk-tokfai_xxx",
    base_url="https://api.tokfai.com/v1",
)

completion = client.chat.completions.create(
    model="gemini-3.1-pro",
    messages=[{"role": "user", "content": "Hello Tokfai"}],
)`;

const CHERRY_STUDIO_ROWS = [
  { id: "provider", labelKey: "quickstart.cherryProvider", value: "OpenAI Compatible" },
  { id: "api-host", labelKey: "quickstart.cherryApiHost", value: BASE_URL },
  { id: "api-key", labelKey: "quickstart.cherryApiKey", value: API_KEY_PLACEHOLDER },
  {
    id: "model",
    labelKey: "quickstart.cherryModel",
    valueKey: "quickstart.cherryModelValue",
  },
] as const;

const CURSOR_STEPS = [
  "quickstart.cursorStep1",
  "quickstart.cursorStep2",
  "quickstart.cursorStep3",
  "quickstart.cursorStep4",
] as const;

const API_KEY_TIPS = [
  "quickstart.apiKeyTip1",
  "quickstart.apiKeyTip2",
  "quickstart.apiKeyTip3",
] as const;

const ERROR_CODES = [
  { code: "missing_token", meaningKey: "quickstart.errorMissingToken" },
  { code: "invalid_token", meaningKey: "quickstart.errorInvalidToken" },
  { code: "insufficient_credits", meaningKey: "quickstart.errorInsufficientCredits" },
  { code: "model_not_found", meaningKey: "quickstart.errorModelNotFound" },
  { code: "upstream_error", meaningKey: "quickstart.errorUpstreamError" },
  { code: "rate_limited", meaningKey: "quickstart.errorRateLimited" },
] as const;

export function QuickstartContent() {
  const { t } = useI18n();
  const { copiedId, copyText } = useCopyToClipboard();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("quickstart.pageTitle")}
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          {t("quickstart.pageSubtitle")}
        </p>
      </div>

      <Card id="base-url">
        <CardHeader>
          <CardTitle>{t("quickstart.baseUrlTitle")}</CardTitle>
          <CardDescription>{t("quickstart.baseUrlDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <CopyableValue
            id="base-url"
            value={BASE_URL}
            copied={copiedId === "base-url"}
            onCopy={copyText}
            copyLabel={t("quickstart.copy")}
            copiedLabel={t("quickstart.copied")}
          />
        </CardContent>
      </Card>

      <Card id="api-key">
        <CardHeader>
          <CardTitle>{t("quickstart.apiKeyTitle")}</CardTitle>
          <CardDescription>{t("quickstart.apiKeyDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <CopyableValue
            id="api-key"
            value={AUTH_HEADER}
            copied={copiedId === "api-key"}
            onCopy={copyText}
            copyLabel={t("quickstart.copy")}
            copiedLabel={t("quickstart.copied")}
          />
          <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {API_KEY_TIPS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card id="curl-example">
        <CardHeader>
          <CardTitle>{t("quickstart.curlTitle")}</CardTitle>
          <CardDescription>{t("quickstart.curlDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock
            id="curl-chat"
            label="curl"
            code={CHAT_COMPLETIONS_CURL}
            copied={copiedId === "curl-chat"}
            onCopy={copyText}
            copyLabel={t("quickstart.copy")}
            copiedLabel={t("quickstart.copied")}
          />
        </CardContent>
      </Card>

      <Card id="nodejs-example">
        <CardHeader>
          <CardTitle>{t("quickstart.nodeTitle")}</CardTitle>
          <CardDescription>{t("quickstart.sdkDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock
            id="openai-js"
            label="javascript"
            code={OPENAI_JS_EXAMPLE}
            copied={copiedId === "openai-js"}
            onCopy={copyText}
            copyLabel={t("quickstart.copy")}
            copiedLabel={t("quickstart.copied")}
          />
        </CardContent>
      </Card>

      <Card id="python-example">
        <CardHeader>
          <CardTitle>{t("quickstart.pythonTitle")}</CardTitle>
          <CardDescription>{t("quickstart.sdkDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <CodeBlock
            id="openai-python"
            label="python"
            code={OPENAI_PYTHON_EXAMPLE}
            copied={copiedId === "openai-python"}
            onCopy={copyText}
            copyLabel={t("quickstart.copy")}
            copiedLabel={t("quickstart.copied")}
          />
        </CardContent>
      </Card>

      <Card id="cherry-studio">
        <CardHeader>
          <CardTitle>{t("quickstart.cherryTitle")}</CardTitle>
          <CardDescription>{t("quickstart.cherryDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ConfigTable
            rows={CHERRY_STUDIO_ROWS.map((row) => ({
              id: row.id,
              label: t(row.labelKey),
              value:
                "valueKey" in row ? t(row.valueKey) : row.value,
              copyId: `cherry-${row.id}`,
            }))}
            copiedId={copiedId}
            onCopy={copyText}
            copyLabel={t("quickstart.copy")}
            copiedLabel={t("quickstart.copied")}
          />
        </CardContent>
      </Card>

      <Card id="cursor-config">
        <CardHeader>
          <CardTitle>{t("quickstart.cursorTitle")}</CardTitle>
          <CardDescription>{t("quickstart.cursorDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
            {CURSOR_STEPS.map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card id="error-codes">
        <CardHeader>
          <CardTitle>{t("quickstart.errorsTitle")}</CardTitle>
          <CardDescription>{t("quickstart.errorsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ErrorCodeTable errors={ERROR_CODES} t={t} />
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href="/dashboard/api-keys">{t("quickstart.createApiKey")}</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/dashboard/playground">{t("quickstart.openPlayground")}</Link>
        </Button>
      </div>
    </div>
  );
}

function CopyableValue({
  id,
  value,
  copied,
  onCopy,
  copyLabel,
  copiedLabel,
}: {
  id: string;
  value: string;
  copied: boolean;
  onCopy: (id: string, value: string) => void;
  copyLabel: string;
  copiedLabel: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 p-4">
      <code className="min-w-0 flex-1 break-all font-mono text-sm">{value}</code>
      <CopyButton
        copied={copied}
        onCopy={() => onCopy(id, value)}
        copyLabel={copyLabel}
        copiedLabel={copiedLabel}
      />
    </div>
  );
}

function ConfigTable({
  rows,
  copiedId,
  onCopy,
  copyLabel,
  copiedLabel,
}: {
  rows: { id: string; label: string; value: string; copyId: string }[];
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  copyLabel: string;
  copiedLabel: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0">
              <td className="whitespace-nowrap px-4 py-3 font-medium text-foreground">
                {row.label}
              </td>
              <td className="min-w-0 px-4 py-3">
                <code className="break-all font-mono text-xs text-muted-foreground">
                  {row.value}
                </code>
              </td>
              <td className="px-4 py-3 text-right">
                <CopyButton
                  copied={copiedId === row.copyId}
                  onCopy={() => onCopy(row.copyId, row.value)}
                  copyLabel={copyLabel}
                  copiedLabel={copiedLabel}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ErrorCodeTable({
  errors,
  t,
}: {
  errors: readonly { code: string; meaningKey: string }[];
  t: (key: string) => string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pl-4 pr-4 font-medium">{t("quickstart.codeColumn")}</th>
            <th className="py-2 pr-4 font-medium">{t("quickstart.meaningColumn")}</th>
          </tr>
        </thead>
        <tbody>
          {errors.map((error) => (
            <tr key={error.code} className="border-b last:border-0">
              <td className="py-3 pl-4 pr-4 font-mono text-xs">{error.code}</td>
              <td className="py-3 pr-4 text-muted-foreground">{t(error.meaningKey)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

