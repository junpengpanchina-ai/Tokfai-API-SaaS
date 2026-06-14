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
import { dashboardCtaHref } from "@/lib/auth/public-cta";
import { useAuth } from "@/lib/auth/auth-provider";
import {
  BATCH_CHAT_CURL,
  BATCH_POLL_CURL,
  CUSTOMER_INTEGRATION_ERROR_CODES,
  CURSOR_CONFIG_SNIPPET,
  INTEGRATION_BASE_URL,
  INTEGRATION_DEFAULT_MODEL,
  INTEGRATION_KEY_PLACEHOLDER,
  chatCompletionsCurl,
  modelsListCurl,
  OPENAI_JS_SNIPPET,
  OPENAI_PYTHON_SNIPPET,
} from "@/lib/customer-integration-snippets";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { TOKFAI_BILLING_POLICY } from "@/lib/tokfai-api";

const SECTIONS = [
  { id: "quick-start", navKey: "integration.navQuickStart" },
  { id: "curl-examples", navKey: "integration.navCurl" },
  { id: "openai-sdk", navKey: "integration.navOpenAiSdk" },
  { id: "cursor-integration", navKey: "integration.navCursor" },
  { id: "cherry-studio", navKey: "integration.navCherry" },
  { id: "models-guide", navKey: "integration.navModels" },
  { id: "error-codes", navKey: "integration.navErrors" },
  { id: "billing-usage", navKey: "integration.navBilling" },
  { id: "batch-api", navKey: "integration.navBatch" },
] as const;

const CHERRY_ROWS = [
  { id: "provider", labelKey: "integration.cherryProvider", value: "OpenAI Compatible" },
  { id: "host", labelKey: "integration.cherryApiHost", value: INTEGRATION_BASE_URL },
  { id: "key", labelKey: "integration.cherryApiKey", value: INTEGRATION_KEY_PLACEHOLDER },
  {
    id: "model",
    labelKey: "integration.cherryModel",
    value: INTEGRATION_DEFAULT_MODEL,
  },
] as const;

const CURSOR_STEPS = [
  "integration.cursorStep1",
  "integration.cursorStep2",
  "integration.cursorStep3",
  "integration.cursorStep4",
] as const;

const QUICK_START_STEPS = [
  "integration.quickStep1",
  "integration.quickStep2",
  "integration.quickStep3",
  "integration.quickStep4",
] as const;

const MODEL_ROWS = [
  { id: "auto-fast", labelKey: "integration.modelAutoFast" },
  { id: "auto-pro", labelKey: "integration.modelAutoPro" },
  { id: "auto-cheap", labelKey: "integration.modelAutoCheap" },
] as const;

export function CustomerIntegrationGuide({
  showDashboardLinks = true,
}: {
  showDashboardLinks?: boolean;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { copiedId, copyText } = useCopyToClipboard();
  const isLoggedIn = Boolean(user);

  function dashHref(path: string): string {
    if (showDashboardLinks || isLoggedIn) return path;
    return dashboardCtaHref(path, false);
  }

  const docsBase = showDashboardLinks || isLoggedIn ? "/dashboard/docs" : "/docs";

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-10">
      <nav
        className="lg:sticky lg:top-6 lg:w-52 shrink-0 rounded-lg border bg-muted/30 p-4"
        aria-label={t("integration.navTitle")}
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("integration.navTitle")}
        </p>
        <ul className="flex flex-col gap-1 text-sm">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              >
                {t(section.navKey)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 flex-1 flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("integration.pageTitle")}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {t("integration.pageSubtitle")}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("integration.valueProps")}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={dashHref("/dashboard/api-keys")}>
                {t("integration.ctaCreateKey")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={dashHref("/dashboard/playground")}>
                {t("integration.ctaPlayground")}
              </Link>
            </Button>
          </div>
        </div>

        <Card id="quick-start">
          <CardHeader>
            <CardTitle>{t("integration.quickStartTitle")}</CardTitle>
            <CardDescription>{t("integration.quickStartDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              {QUICK_START_STEPS.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ol>
            <SetupTable
              rows={[
                {
                  id: "base",
                  label: t("integration.baseUrlLabel"),
                  value: INTEGRATION_BASE_URL,
                },
                {
                  id: "model",
                  label: t("integration.recommendedModelLabel"),
                  value: INTEGRATION_DEFAULT_MODEL,
                },
                {
                  id: "auth",
                  label: t("integration.authHeaderLabel"),
                  value: `Authorization: Bearer ${INTEGRATION_KEY_PLACEHOLDER}`,
                },
              ]}
              copiedId={copiedId}
              onCopy={copyText}
              copyLabel={t("integration.copy")}
              copiedLabel={t("integration.copied")}
            />
          </CardContent>
        </Card>

        <Card id="curl-examples">
          <CardHeader>
            <CardTitle>{t("integration.curlTitle")}</CardTitle>
            <CardDescription>{t("integration.curlDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CodeBlock
              id="curl-chat"
              label="chat"
              code={chatCompletionsCurl()}
              copied={copiedId === "curl-chat"}
              onCopy={copyText}
              copyLabel={t("integration.copy")}
              copiedLabel={t("integration.copied")}
            />
            <CodeBlock
              id="curl-models"
              label="models"
              code={modelsListCurl()}
              copied={copiedId === "curl-models"}
              onCopy={copyText}
              copyLabel={t("integration.copy")}
              copiedLabel={t("integration.copied")}
            />
          </CardContent>
        </Card>

        <Card id="openai-sdk">
          <CardHeader>
            <CardTitle>{t("integration.sdkTitle")}</CardTitle>
            <CardDescription>{t("integration.sdkDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <CodeBlock
              id="openai-js"
              label="javascript"
              code={OPENAI_JS_SNIPPET}
              copied={copiedId === "openai-js"}
              onCopy={copyText}
              copyLabel={t("integration.copy")}
              copiedLabel={t("integration.copied")}
            />
            <CodeBlock
              id="openai-python"
              label="python"
              code={OPENAI_PYTHON_SNIPPET}
              copied={copiedId === "openai-python"}
              onCopy={copyText}
              copyLabel={t("integration.copy")}
              copiedLabel={t("integration.copied")}
            />
          </CardContent>
        </Card>

        <Card id="cursor-integration">
          <CardHeader>
            <CardTitle>{t("integration.cursorTitle")}</CardTitle>
            <CardDescription>{t("integration.cursorDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              {CURSOR_STEPS.map((key) => (
                <li key={key}>{t(key)}</li>
              ))}
            </ul>
            <CodeBlock
              id="cursor-config"
              label="config"
              code={CURSOR_CONFIG_SNIPPET}
              copied={copiedId === "cursor-config"}
              onCopy={copyText}
              copyLabel={t("integration.copy")}
              copiedLabel={t("integration.copied")}
            />
          </CardContent>
        </Card>

        <Card id="cherry-studio">
          <CardHeader>
            <CardTitle>{t("integration.cherryTitle")}</CardTitle>
            <CardDescription>{t("integration.cherryDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ConfigTable
              rows={CHERRY_ROWS.map((row) => ({
                id: row.id,
                label: t(row.labelKey),
                value: row.value,
                copyId: `cherry-${row.id}`,
              }))}
              copiedId={copiedId}
              onCopy={copyText}
              copyLabel={t("integration.copy")}
              copiedLabel={t("integration.copied")}
            />
          </CardContent>
        </Card>

        <Card id="models-guide">
          <CardHeader>
            <CardTitle>{t("integration.modelsTitle")}</CardTitle>
            <CardDescription>{t("integration.modelsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <ul className="space-y-3 text-sm text-muted-foreground">
              {MODEL_ROWS.map((row) => (
                <li key={row.id}>
                  <span className="font-mono text-xs text-foreground">{row.id}</span>
                  {" — "}
                  {t(row.labelKey)}
                </li>
              ))}
            </ul>
            <p className="text-sm text-muted-foreground">
              {t("integration.modelsExplicitNote")}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link href={dashHref("/dashboard/models")}>
                {t("integration.browseModels")}
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card id="error-codes">
          <CardHeader>
            <CardTitle>{t("integration.errorsTitle")}</CardTitle>
            <CardDescription>{t("integration.errorsDesc")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ErrorTable t={t} />
          </CardContent>
        </Card>

        <Card id="billing-usage">
          <CardHeader>
            <CardTitle>{t("integration.billingTitle")}</CardTitle>
            <CardDescription>{t("integration.billingDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
            <p>{TOKFAI_BILLING_POLICY}</p>
            <p>{t("integration.billingFailedNote")}</p>
            <p>{t("integration.billingRequestIdNote")}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={dashHref("/dashboard/usage")}>
                  {t("integration.linkUsage")}
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={dashHref("/dashboard/credits")}>
                  {t("integration.linkCredits")}
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card id="batch-api">
          <CardHeader>
            <CardTitle>{t("integration.batchTitle")}</CardTitle>
            <CardDescription>{t("integration.batchDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <p className="text-sm text-muted-foreground">
              {t("integration.batchNote")}
            </p>
            <CodeBlock
              id="batch-create"
              label="create batch"
              code={BATCH_CHAT_CURL}
              copied={copiedId === "batch-create"}
              onCopy={copyText}
              copyLabel={t("integration.copy")}
              copiedLabel={t("integration.copied")}
            />
            <CodeBlock
              id="batch-poll"
              label="poll batch"
              code={BATCH_POLL_CURL}
              copied={copiedId === "batch-poll"}
              onCopy={copyText}
              copyLabel={t("integration.copy")}
              copiedLabel={t("integration.copied")}
            />
          </CardContent>
        </Card>

        <p className="text-xs text-muted-foreground">
          {t("integration.footerHint")}{" "}
          <Link href={docsBase} className="underline underline-offset-2">
            {t("integration.footerDocsLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}

function SetupTable({
  rows,
  copiedId,
  onCopy,
  copyLabel,
  copiedLabel,
}: {
  rows: { id: string; label: string; value: string }[];
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  copyLabel: string;
  copiedLabel: string;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <tbody>
          {rows.map((row) => {
            const copyId = `setup-${row.id}`;
            return (
              <tr key={row.id} className="border-b last:border-0">
                <td className="whitespace-nowrap px-4 py-3 font-medium">
                  {row.label}
                </td>
                <td className="min-w-0 px-4 py-3">
                  <code className="break-all font-mono text-xs text-muted-foreground">
                    {row.value}
                  </code>
                </td>
                <td className="px-4 py-3 text-right">
                  <CopyButton
                    copied={copiedId === copyId}
                    onCopy={() => onCopy(copyId, row.value)}
                    copyLabel={copyLabel}
                    copiedLabel={copiedLabel}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
              <td className="whitespace-nowrap px-4 py-3 font-medium">{row.label}</td>
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

function ErrorTable({ t }: { t: (key: string) => string }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pl-4 pr-4 font-medium">{t("integration.codeColumn")}</th>
            <th className="py-2 pr-4 font-medium">{t("integration.meaningColumn")}</th>
          </tr>
        </thead>
        <tbody>
          {CUSTOMER_INTEGRATION_ERROR_CODES.map((code) => (
            <tr key={code} className="border-b last:border-0">
              <td className="py-3 pl-4 pr-4 font-mono text-xs">{code}</td>
              <td className="py-3 pr-4 text-muted-foreground">
                {t(`integration.error.${code}`)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
