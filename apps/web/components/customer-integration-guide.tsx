"use client";

import Link from "next/link";

import {
  CodeBlock,
  CopyButton,
  useCopyToClipboard,
} from "@/components/copy-code-block";
import { CopyConfigAction } from "@/components/copyable-snippet-field";
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
  INTEGRATION_BASE_URL,
  INTEGRATION_DEFAULT_MODEL,
} from "@/lib/customer-integration-snippets";
import {
  CUSTOMER_DOC_ESSENTIAL_KEYS,
  CUSTOMER_DOC_SECTIONS,
  CUSTOMER_DOC_MODEL_ROWS,
  CUSTOMER_DOC_SNIPPETS,
  CUSTOMER_INTEGRATION_ERROR_CODES,
  type CustomerDocBlock,
  type CustomerDocCopyField,
  type CustomerDocDashboardLink,
  type CustomerDocSection,
} from "@/lib/docs/customer-docs-content";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

/** Nav label keys aligned with section ids. */
const SECTION_NAV_KEYS: Record<string, string> = {
  "product-positioning": "integration.navPositioning",
  "production-demo-flow": "integration.navDemoFlow",
  "quick-start": "integration.navQuickStart",
  "curl-examples": "integration.navCurl",
  "openai-sdk": "integration.navOpenAiSdk",
  "cursor-integration": "integration.navCursor",
  "cherry-studio": "integration.navCherry",
  "models-guide": "integration.navModels",
  "error-codes": "integration.navErrors",
  "billing-usage": "integration.navBilling",
  "batch-api": "integration.navBatch",
};

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

  function linkHref(link: CustomerDocDashboardLink): string {
    const base = link.href.startsWith("/dashboard")
      ? dashHref(link.href)
      : link.href;
    if (link.hash) {
      const hashBase = link.href === "/dashboard/docs" ? docsBase : base;
      return `${hashBase}#${link.hash}`;
    }
    return base;
  }

  return (
    <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:gap-8">
      <nav
        className="lg:sticky lg:top-6 lg:z-10 lg:max-h-[calc(100vh-3rem)] lg:w-44 shrink-0 overflow-y-auto rounded-lg border bg-muted/30 p-3 lg:self-start"
        aria-label={t("integration.navTitle")}
      >
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("integration.navTitle")}
        </p>
        <ul className="flex flex-col gap-1 text-sm">
          {CUSTOMER_DOC_SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="block rounded-md px-2 py-1.5 text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
              >
                {t(SECTION_NAV_KEYS[section.id])}
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
          <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            {CUSTOMER_DOC_ESSENTIAL_KEYS.map((key) => (
              <li key={key} className="flex items-start gap-2">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                <span>
                  {key === "integration.essentialBaseUrl"
                    ? formatMessage(t(key), { baseUrl: INTEGRATION_BASE_URL })
                    : key === "integration.essentialModel"
                      ? formatMessage(t(key), { model: INTEGRATION_DEFAULT_MODEL })
                      : t(key)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm">
              <Link href={dashHref("/dashboard/api-keys")}>
                {t("integration.ctaCreateKey")}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`${docsBase}#production-demo-flow`}>
                {t("integration.ctaDemoFlow")}
              </Link>
            </Button>
          </div>
        </div>

        {CUSTOMER_DOC_SECTIONS.map((section) => (
          <DocSectionCard
            key={section.id}
            section={section}
            t={t}
            copiedId={copiedId}
            onCopy={copyText}
            linkHref={linkHref}
            dashHref={dashHref}
            docsBase={docsBase}
          />
        ))}

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

function DocSectionCard({
  section,
  t,
  copiedId,
  onCopy,
  linkHref,
  dashHref,
  docsBase,
}: {
  section: CustomerDocSection;
  t: (key: string) => string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  linkHref: (link: CustomerDocDashboardLink) => string;
  dashHref: (path: string) => string;
  docsBase: string;
}) {
  return (
    <Card
      id={section.id}
      className={cn(
        "scroll-mt-6",
        section.highlight && "border-primary/20 bg-primary/5"
      )}
    >
      <CardHeader>
        <CardTitle>{t(section.titleKey)}</CardTitle>
        {section.descriptionKey ? (
          <CardDescription>{t(section.descriptionKey)}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {section.id === "openai-sdk" ? (
          <div className="flex flex-wrap gap-2">
            <CopyConfigAction
              id="sdk-copy-config"
              value={CUSTOMER_DOC_SNIPPETS["openai-sdk-config"]}
              copiedId={copiedId}
              onCopy={onCopy}
              label={t("integration.copyConfig")}
              copiedLabel={t("integration.copied")}
            />
            <CopyConfigAction
              id="sdk-copy-curl"
              value={CUSTOMER_DOC_SNIPPETS["chat-curl"]}
              copiedId={copiedId}
              onCopy={onCopy}
              label={t("integration.copyCurl")}
              copiedLabel={t("integration.copied")}
            />
          </div>
        ) : null}
        {section.id === "cursor-integration" ? (
          <div className="flex flex-wrap gap-2">
            <CopyConfigAction
              id="cursor-copy-config"
              value={CUSTOMER_DOC_SNIPPETS["cursor-config"]}
              copiedId={copiedId}
              onCopy={onCopy}
              label={t("integration.copyConfig")}
              copiedLabel={t("integration.copied")}
            />
          </div>
        ) : null}
        {section.id === "cherry-studio" ? (
          <div className="flex flex-wrap gap-2">
            <CopyConfigAction
              id="cherry-copy-config"
              value={CUSTOMER_DOC_SNIPPETS["cherry-config"]}
              copiedId={copiedId}
              onCopy={onCopy}
              label={t("integration.copyConfig")}
              copiedLabel={t("integration.copied")}
            />
          </div>
        ) : null}
        {section.blocks.map((block, index) => (
          <DocBlock
            key={`${section.id}-${index}`}
            block={block}
            t={t}
            copiedId={copiedId}
            onCopy={onCopy}
            linkHref={linkHref}
          />
        ))}
        {section.id === "models-guide" ? (
          <Button asChild variant="outline" size="sm">
            <Link href={dashHref("/dashboard/models")}>
              {t("integration.browseModels")}
            </Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}

function DocBlock({
  block,
  t,
  copiedId,
  onCopy,
  linkHref,
}: {
  block: CustomerDocBlock;
  t: (key: string) => string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  linkHref: (link: CustomerDocDashboardLink) => string;
}) {
  switch (block.type) {
    case "paragraph":
      return (
        <p className="text-sm text-muted-foreground">{t(block.textKey)}</p>
      );
    case "bullets":
      return (
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          {block.items.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      );
    case "ordered":
      return (
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          {block.items.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ol>
      );
    case "code":
      const code = CUSTOMER_DOC_SNIPPETS[block.snippetKey];
      const copyLabel =
        block.snippetKey.includes("curl") || block.id.includes("curl")
          ? t("integration.copyCurl")
          : block.snippetKey.includes("config")
            ? t("integration.copyConfig")
            : t("integration.copyCode");
      return (
        <CodeBlock
          id={block.id}
          label={block.label}
          code={code}
          copied={copiedId === block.id}
          onCopy={onCopy}
          copyLabel={copyLabel}
          copiedLabel={t("integration.copied")}
        />
      );
    case "copy-fields":
      return (
        <CopyFieldsTable
          prefix={block.id}
          fields={block.fields}
          t={t}
          copiedId={copiedId}
          onCopy={onCopy}
        />
      );
    case "error-table":
      return <ErrorTable t={t} />;
    case "model-list":
      return (
        <ul className="space-y-3 text-sm text-muted-foreground">
          {CUSTOMER_DOC_MODEL_ROWS.map((row) => (
            <li key={row.id}>
              <span className="font-mono text-xs text-foreground">{row.id}</span>
              {" — "}
              {t(row.labelKey)}
            </li>
          ))}
        </ul>
      );
    case "dashboard-links":
      return (
        <div className="flex flex-wrap gap-2">
          {block.links.map((link) => (
            <Button key={link.id} asChild size="sm" variant="outline">
              <Link href={linkHref(link)}>{t(link.labelKey)}</Link>
            </Button>
          ))}
        </div>
      );
    default:
      return null;
  }
}

function CopyFieldsTable({
  prefix,
  fields,
  t,
  copiedId,
  onCopy,
}: {
  prefix: string;
  fields: CustomerDocCopyField[];
  t: (key: string) => string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <tbody>
          {fields.map((field) => {
            const copyId = `${prefix}-${field.id}`;
            return (
              <tr key={field.id} className="border-b last:border-0">
                <td className="whitespace-nowrap px-4 py-3 font-medium">
                  {t(field.labelKey)}
                </td>
                <td className="min-w-0 px-4 py-3">
                  <code className="break-all font-mono text-xs text-muted-foreground">
                    {field.value}
                  </code>
                </td>
                <td className="px-4 py-3 text-right">
                  <CopyButton
                    copied={copiedId === copyId}
                    onCopy={() => onCopy(copyId, field.value)}
                    copyLabel={t("integration.copy")}
                    copiedLabel={t("integration.copied")}
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
