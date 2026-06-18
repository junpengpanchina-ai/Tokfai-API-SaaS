"use client";

import Link from "next/link";
import { useEffect, type ReactNode } from "react";

import {
  CodeBlock,
  CopyButton,
  useCopyToClipboard,
} from "@/components/copy-code-block";
import { ApiKeyChapterCopyPanel } from "@/components/api-key-chapter-copy";
import { BatchApiChapterCopyPanel } from "@/components/batch-api-chapter-copy";
import { ErrorCodesChapterPanel } from "@/components/error-codes-chapter-panel";
import { ChatApiChapterCopyPanel } from "@/components/chat-api-chapter-copy";
import { ImageApiChapterCopyPanel } from "@/components/image-api-chapter-copy";
import { ClientSoftwareAcceptanceCopyPanel } from "@/components/client-software-acceptance-copy";
import { CapacityModelPanel } from "@/components/capacity-model-panel";
import { CherryChapterCopyPanel } from "@/components/cherry-chapter-copy";
import { CursorChapterCopyPanel } from "@/components/cursor-chapter-copy";
import { IndustryChapterCopyPanel, IndustryOverviewTable } from "@/components/industry-chapter-copy";
import { IndustryTemplatePackPanel } from "@/components/industry-template-card";
import { IntegrationWorkbenchPanel } from "@/components/integration-workbench-panel";
import { OpenAiSdkChapterCopyPanel } from "@/components/openai-sdk-chapter-copy";
import { CopyableSnippetField, CopyConfigAction } from "@/components/copyable-snippet-field";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  chatCurlPowerShellOneLine,
} from "@/lib/customer-curl-oneline";
import { useAuth } from "@/lib/auth/auth-provider";
import { dashboardCtaHref } from "@/lib/auth/public-cta";
import {
  INTEGRATION_BASE_URL,
  INTEGRATION_DEFAULT_MODEL,
} from "@/lib/customer-integration-snippets";
import { CUSTOMER_ERROR_CODE_HTTP } from "@/lib/customer-error-codes-chapter";
import {
  CUSTOMER_DOC_ESSENTIAL_KEYS,
  CUSTOMER_DOC_SECTIONS,
  CUSTOMER_DOC_ERROR_CODES,
  CUSTOMER_DOC_MODEL_ROWS,
  CUSTOMER_DOC_SNIPPET_COPY,
  CUSTOMER_DOC_SNIPPET_DISPLAY,
  type CustomerDocBlock,
  type CustomerDocChapterGuide,
  type CustomerDocChapterNow,
  type CustomerDocCopyField,
  type CustomerDocDashboardLink,
  CUSTOMER_DOC_INDUSTRY_SCENARIO_KEYS,
  type CustomerDocIndustryId,
  type CustomerDocSection,
} from "@/lib/docs/customer-docs-content";
import {
  isQuickStartKeyPlaceholder,
  quickStartChatCurlOneLine,
  resolveDocChatCurlDisplay,
  resolveDocCurlSnippetCopy,
  resolveDocImageCurlDisplay,
  resolveDocBatchCreateCurlDisplay,
  resolveDocBatchPollCurlDisplay,
  resolveDocOpenAiJsDisplay,
  resolveDocOpenAiNodeBatchDisplay,
  resolveDocOpenAiPythonBatchDisplay,
  resolveDocOpenAiPythonDisplay,
  resolveDocCursorConfigDisplay,
  resolveDocCherryConfigDisplay,
} from "@/lib/customer-quick-start-snippets";
import { modelsVerifyCurlMultiline } from "@/lib/customer-api-key-chapter";
import { buildIndustryCurlOneLine } from "@/lib/customer-industry-chapter";
import { useQuickStartApiKey } from "@/lib/use-quick-start-api-key";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

/** Offset for dashboard mobile sticky header when scrolling to in-page anchors. */
const DOC_SECTION_SCROLL_MARGIN = "scroll-mt-24 md:scroll-mt-20 lg:scroll-mt-6";

function scrollToDocSection(hash: string, behavior: ScrollBehavior = "smooth") {
  if (!hash) return;
  const id = hash.replace(/^#/, "");
  const el = document.getElementById(id);
  if (el) {
    el.scrollIntoView({ behavior, block: "start" });
  }
}

export function CustomerIntegrationGuide({
  showDashboardLinks = true,
}: {
  showDashboardLinks?: boolean;
}) {
  const { t } = useI18n();
  const { user } = useAuth();
  const { copiedId, copyText } = useCopyToClipboard();
  const isLoggedIn = Boolean(user);
  const quickStartApiKey = useQuickStartApiKey();

  function dashHref(path: string): string {
    if (showDashboardLinks || isLoggedIn) return path;
    return dashboardCtaHref(path, false);
  }

  const docsBase = showDashboardLinks || isLoggedIn ? "/dashboard/docs" : "/docs";

  useEffect(() => {
    const scrollFromHash = () => {
      if (window.location.hash) {
        window.requestAnimationFrame(() => {
          scrollToDocSection(window.location.hash, "auto");
        });
      }
    };

    scrollFromHash();
    window.addEventListener("hashchange", scrollFromHash);
    return () => window.removeEventListener("hashchange", scrollFromHash);
  }, []);

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
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
      <nav
        className="relative z-0 w-full shrink-0 rounded-lg border bg-muted/30 p-3 lg:sticky lg:top-6 lg:z-10 lg:max-h-[calc(100vh-3rem)] lg:w-44 lg:self-start lg:overflow-y-auto"
        aria-label={t("integration.navTitle")}
      >
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground lg:mb-3">
          {t("integration.navTitle")}
        </p>
        <ul className="-mx-1 flex gap-1 overflow-x-auto pb-1 lg:mx-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
          {CUSTOMER_DOC_SECTIONS.map((section) => (
            <li key={section.id} className="shrink-0 lg:shrink">
              <a
                href={`#${section.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  scrollToDocSection(`#${section.id}`);
                  window.history.replaceState(null, "", `#${section.id}`);
                }}
                className="block whitespace-nowrap rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-background hover:text-foreground lg:whitespace-normal"
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
              <GuideHashLink href={`${docsBase}#quick-start`}>
                {t("integration.ctaQuickStart")}
              </GuideHashLink>
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
            quickStartApiKey={quickStartApiKey}
          />
        ))}

        <p className="text-xs text-muted-foreground">
          {t("integration.footerHint")}{" "}
          <Link
            href={dashHref("/dashboard/image-playground")}
            className="underline underline-offset-2"
          >
            {t("integration.footerImageLink")}
          </Link>
          {" · "}
          <Link
            href={dashHref("/dashboard/models")}
            className="underline underline-offset-2"
          >
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
  quickStartApiKey,
}: {
  section: CustomerDocSection;
  t: (key: string) => string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  linkHref: (link: CustomerDocDashboardLink) => string;
  dashHref: (path: string) => string;
  docsBase: string;
  quickStartApiKey: string;
}) {
  return (
    <Card
      id={section.id}
      className={cn(
        DOC_SECTION_SCROLL_MARGIN,
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
        <ChapterNowPanel
          chapterNow={section.chapterNow}
          sectionId={section.id}
          t={t}
          copiedId={copiedId}
          onCopy={onCopy}
          linkHref={linkHref}
          quickStartApiKey={quickStartApiKey}
        />
        <ChapterGuidePanel guide={section.chapterGuide} t={t} />
        {section.blocks.map((block, index) => (
          <DocBlock
            key={`${section.id}-${index}`}
            block={block}
            sectionId={section.id}
            t={t}
            copiedId={copiedId}
            onCopy={onCopy}
            linkHref={linkHref}
            quickStartApiKey={quickStartApiKey}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function DocBlock({
  block,
  sectionId,
  t,
  copiedId,
  onCopy,
  linkHref,
  quickStartApiKey,
}: {
  block: CustomerDocBlock;
  sectionId: string;
  t: (key: string) => string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  linkHref: (link: CustomerDocDashboardLink) => string;
  quickStartApiKey: string;
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
      const isReadableOnly = block.readableOnly === true;
      const codeLabel = block.labelKey ? t(block.labelKey) : block.label ?? "";
      const isCurlSnippet = block.snippetKey.includes("curl");
      const isOpenAiSnippet = block.snippetKey.startsWith("openai-");
      const displayCode =
        block.snippetKey === "chat-curl" &&
        (sectionId === "quick-start" || sectionId === "chat-api")
          ? resolveDocChatCurlDisplay(quickStartApiKey)
          : block.snippetKey === "image-curl" && sectionId === "image-api"
            ? resolveDocImageCurlDisplay(quickStartApiKey)
            : block.snippetKey === "batch-create-curl" && sectionId === "batch-api"
              ? resolveDocBatchCreateCurlDisplay(quickStartApiKey)
              : block.snippetKey === "batch-poll-curl" && sectionId === "batch-api"
                ? resolveDocBatchPollCurlDisplay(quickStartApiKey)
                : block.snippetKey === "models-curl" && sectionId === "api-key"
            ? modelsVerifyCurlMultiline(
                isQuickStartKeyPlaceholder(quickStartApiKey)
                  ? undefined
                  : quickStartApiKey
              )
            : block.snippetKey === "openai-js" && sectionId === "openai-sdk"
              ? resolveDocOpenAiJsDisplay(quickStartApiKey)
              : block.snippetKey === "openai-python" && sectionId === "openai-sdk"
                ? resolveDocOpenAiPythonDisplay(quickStartApiKey)
                : block.snippetKey === "openai-node-batch" && sectionId === "openai-sdk"
                  ? resolveDocOpenAiNodeBatchDisplay(quickStartApiKey)
                  : block.snippetKey === "openai-python-batch" && sectionId === "openai-sdk"
                    ? resolveDocOpenAiPythonBatchDisplay(quickStartApiKey)
                    : block.snippetKey === "cursor-config" && sectionId === "cursor"
                      ? resolveDocCursorConfigDisplay(quickStartApiKey)
                      : block.snippetKey === "cherry-config" && sectionId === "cherry-studio"
                        ? resolveDocCherryConfigDisplay(quickStartApiKey)
                        : CUSTOMER_DOC_SNIPPET_DISPLAY[block.snippetKey];
      const isCursorSnippet = block.snippetKey === "cursor-config";
      const isCherrySnippet = block.snippetKey === "cherry-config";
      const snippetCopyValue =
        isCurlSnippet || isOpenAiSnippet || isCursorSnippet || isCherrySnippet
          ? resolveDocCurlSnippetCopy(block.snippetKey, quickStartApiKey)
          : CUSTOMER_DOC_SNIPPET_COPY[block.snippetKey];
      const copyLabel = isCurlSnippet
        ? t("integration.copyOneLineCurl")
        : block.snippetKey.includes("config")
          ? t("integration.copyConfig")
          : t("integration.copyCode");
      return (
        <CodeBlock
          id={block.id}
          label={codeLabel}
          code={displayCode}
          copyValue={
            isReadableOnly
              ? undefined
              : isCurlSnippet || isOpenAiSnippet || isCursorSnippet || isCherrySnippet
                ? snippetCopyValue
                : undefined
          }
          copied={copiedId === block.id}
          onCopy={onCopy}
          copyLabel={copyLabel}
          copiedLabel={t("integration.copied")}
          allowCopy={!isReadableOnly}
        />
      );
    case "one-line-curl":
      const oneLineSnippetKey = block.snippetKey ?? "chat-curl";
      const liveCurl = resolveDocCurlSnippetCopy(oneLineSnippetKey, quickStartApiKey);
      const keyIsPlaceholder = isQuickStartKeyPlaceholder(quickStartApiKey);
      return (
        <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-foreground">{t(block.titleKey)}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {keyIsPlaceholder
              ? t("integration.quickStartKeyHintPlaceholder")
              : t("integration.quickStartKeyHintLive")}
          </p>
          <CopyableSnippetField
            label={
              oneLineSnippetKey === "models-curl"
                ? t("integration.apiKeyVerifyCurlLabel")
                : t("integration.quickStartCopyNowLabel")
            }
            value={liveCurl}
            copyId={block.id}
            copiedId={copiedId}
            onCopy={onCopy}
            copyLabel={t("integration.copyOneLineCurl")}
            copiedLabel={t("integration.copied")}
            className="mt-3 [&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all"
          />
          {oneLineSnippetKey === "chat-curl" ? (
            <>
              <CopyableSnippetField
                label={t("integration.clientSoftwarePowerShellCurlLabel")}
                value={chatCurlPowerShellOneLine(quickStartApiKey)}
                copyId={`${block.id}-powershell`}
                copiedId={copiedId}
                onCopy={onCopy}
                copyLabel={t("integration.copyPowerShellCurl")}
                copiedLabel={t("integration.copied")}
                className="mt-3 [&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all"
              />
              <p className="mt-3 text-xs text-muted-foreground">
                {t("integration.oneLineCurlPasteNote")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("integration.oneLineCurlSuccessFields")}
              </p>
              <p className="text-xs text-muted-foreground">
                {t("integration.oneLineCurlReconcileNote")}
              </p>
            </>
          ) : null}
          <div className="mt-2 flex flex-wrap gap-2">
            <CopyConfigAction
              id={`${block.id}-action`}
              value={liveCurl}
              copiedId={copiedId}
              onCopy={onCopy}
              label={t("integration.copyOneLineCurl")}
              copiedLabel={t("integration.copied")}
            />
          </div>
        </div>
      );
    case "chat-api-copy-panel":
      return (
        <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-foreground">
            {t("integration.chatApiCopyNowTitle")}
          </p>
          <div className="mt-3">
            <ChatApiChapterCopyPanel
              apiKey={quickStartApiKey}
              copiedId={copiedId}
              onCopy={onCopy}
              idPrefix={block.id}
            />
          </div>
        </div>
      );
    case "image-api-copy-panel":
      return (
        <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-foreground">
            {t("integration.imageApiCopyNowTitle")}
          </p>
          <div className="mt-3">
            <ImageApiChapterCopyPanel
              apiKey={quickStartApiKey}
              copiedId={copiedId}
              onCopy={onCopy}
              idPrefix={block.id}
              showReference={block.showReference ?? false}
            />
          </div>
        </div>
      );
    case "batch-api-copy-panel":
      return (
        <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-foreground">
            {t("integration.batchApiCopyNowTitle")}
          </p>
          <div className="mt-3">
            <BatchApiChapterCopyPanel
              apiKey={quickStartApiKey}
              copiedId={copiedId}
              onCopy={onCopy}
              idPrefix={block.id}
            />
          </div>
        </div>
      );
    case "openai-sdk-copy-panel":
      return (
        <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
          <OpenAiSdkChapterCopyPanel
            apiKey={quickStartApiKey}
            copiedId={copiedId}
            onCopy={onCopy}
            idPrefix={block.id}
          />
        </div>
      );
    case "client-software-copy-panel":
      return (
        <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
          <ClientSoftwareAcceptanceCopyPanel
            apiKey={quickStartApiKey}
            copiedId={copiedId}
            onCopy={onCopy}
            idPrefix={block.id}
          />
        </div>
      );
    case "cursor-copy-panel":
      return (
        <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
          <CursorChapterCopyPanel
            apiKey={quickStartApiKey}
            copiedId={copiedId}
            onCopy={onCopy}
            idPrefix={block.id}
          />
        </div>
      );
    case "cherry-copy-panel":
      return (
        <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
          <CherryChapterCopyPanel
            apiKey={quickStartApiKey}
            copiedId={copiedId}
            onCopy={onCopy}
            idPrefix={block.id}
          />
        </div>
      );
    case "api-key-copy-panel":
      return (
        <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-semibold text-foreground">
            {t("integration.apiKeyCopyNowTitle")}
          </p>
          <ApiKeyChapterCopyPanel
            apiKey={quickStartApiKey}
            copiedId={copiedId}
            onCopy={onCopy}
            idPrefix={block.id}
            showKeyFormat={true}
          />
        </div>
      );
    case "api-key-errors":
      return (
        <div className="rounded-lg border bg-muted/30 p-4 text-sm">
          <p className="font-medium text-foreground">{t("integration.apiKeyErrorsTitle")}</p>
          <ul className="mt-2 list-disc space-y-2 pl-5 text-muted-foreground">
            <li>{t("integration.apiKeyErrorMissingToken")}</li>
            <li>{t("integration.apiKeyErrorInvalidToken")}</li>
          </ul>
        </div>
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
    case "error-examples-panel":
      return (
        <ErrorCodesChapterPanel
          copiedId={copiedId}
          onCopy={onCopy}
          idPrefix={block.id}
        />
      );
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
              {link.hash && link.href.endsWith("/docs") ? (
                <GuideHashLink href={linkHref(link)}>{t(link.labelKey)}</GuideHashLink>
              ) : (
                <Link href={linkHref(link)}>{t(link.labelKey)}</Link>
              )}
            </Button>
          ))}
        </div>
      );
    case "industry-cards":
      return (
        <div className="flex flex-col gap-4">
          {block.ids.map((id) => (
            <IndustryExampleCard
              key={id}
              id={id}
              t={t}
              apiKey={quickStartApiKey}
              copiedId={copiedId}
              onCopy={onCopy}
            />
          ))}
        </div>
      );
    case "industry-overview-table":
      return <IndustryOverviewTable t={t} />;
    case "industry-copy-panel":
      return (
        <div className="rounded-lg border-2 border-primary/30 bg-primary/5 p-4">
          <IndustryChapterCopyPanel
            apiKey={quickStartApiKey}
            copiedId={copiedId}
            onCopy={onCopy}
            idPrefix={block.id}
          />
        </div>
      );
    case "integration-workbench-panel":
      return (
        <IntegrationWorkbenchPanel
          apiKey={quickStartApiKey}
          copiedId={copiedId}
          onCopy={onCopy}
          idPrefix={block.id}
        />
      );
    case "industry-template-pack":
      return (
        <IndustryTemplatePackPanel
          apiKey={quickStartApiKey}
          copiedId={copiedId}
          onCopy={onCopy}
          idPrefix={block.id}
        />
      );
    case "capacity-model-panel":
      return (
        <CapacityModelPanel
          idPrefix={block.id}
          showReadiness={block.showReadiness === true}
        />
      );
    default:
      return null;
  }
}

function ChapterNowPanel({
  chapterNow,
  sectionId,
  t,
  copiedId,
  onCopy,
  linkHref,
  quickStartApiKey,
}: {
  chapterNow: CustomerDocChapterNow;
  sectionId: string;
  t: (key: string) => string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  linkHref: (link: CustomerDocDashboardLink) => string;
  quickStartApiKey: string;
}) {
  const copySnippetKey = chapterNow.copySnippetKey;
  const copyId = `chapter-now-${sectionId}-${copySnippetKey ?? "none"}`;
  const isCurlCopy =
    copySnippetKey != null && copySnippetKey.includes("curl");

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
      <p className="text-sm font-semibold text-foreground">
        {t("integration.chapterNowTitle")}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {chapterNow.try ? (
          <Button key={chapterNow.try.id} asChild size="sm" variant="outline">
            {chapterNow.try.hash && chapterNow.try.href.endsWith("/docs") ? (
              <GuideHashLink href={linkHref(chapterNow.try)}>
                {t(chapterNow.try.labelKey)}
              </GuideHashLink>
            ) : (
              <Link href={linkHref(chapterNow.try)}>{t(chapterNow.try.labelKey)}</Link>
            )}
          </Button>
        ) : null}
        {copySnippetKey ? (
          <CopyConfigAction
            id={copyId}
            value={resolveDocCurlSnippetCopy(copySnippetKey, quickStartApiKey)}
            copiedId={copiedId}
            onCopy={onCopy}
            label={
              isCurlCopy
                ? t("integration.copyOneLineCurl")
                : t("integration.copyConfig")
            }
            copiedLabel={t("integration.copied")}
          />
        ) : null}
        {chapterNow.verify?.map((link) => (
          <Button key={link.id} asChild size="sm" variant="outline">
            {link.hash && link.href.endsWith("/docs") ? (
              <GuideHashLink href={linkHref(link)}>{t(link.labelKey)}</GuideHashLink>
            ) : (
              <Link href={linkHref(link)}>{t(link.labelKey)}</Link>
            )}
          </Button>
        ))}
      </div>
      {isCurlCopy ||
      copySnippetKey === "openai-sdk-config" ||
      copySnippetKey === "cursor-config" ||
      copySnippetKey === "cherry-config" ? (
        <p className="mt-2 text-xs text-muted-foreground">
          {isQuickStartKeyPlaceholder(quickStartApiKey)
            ? t("integration.placeholderKeyNote")
            : t(
                copySnippetKey === "openai-sdk-config"
                  ? "integration.sdkLiveKeyNote"
                  : copySnippetKey === "cursor-config"
                    ? "integration.cursorLiveKeyNote"
                    : copySnippetKey === "cherry-config"
                      ? "integration.cherryLiveKeyNote"
                      : "integration.apiKeyLiveKeyNote"
              )}
        </p>
      ) : null}
    </div>
  );
}

function ChapterGuidePanel({
  guide,
  t,
}: {
  guide: CustomerDocChapterGuide;
  t: (key: string) => string;
}) {
  const rows = [
    { labelKey: "integration.chapterGuidePurpose", textKey: guide.purposeKey },
    { labelKey: "integration.chapterGuideCopy", textKey: guide.copyKey },
    { labelKey: "integration.chapterGuideRunAnywhere", textKey: guide.runAnywhereKey },
    { labelKey: "integration.chapterGuideVerify", textKey: guide.verifyKey },
    { labelKey: "integration.chapterGuideFailure", textKey: guide.failureKey },
  ];

  return (
    <div className="rounded-lg border bg-muted/30 p-4 text-sm">
      <dl className="space-y-3">
        {rows.map((row) => (
          <div key={row.labelKey}>
            <dt className="font-medium text-foreground">{t(row.labelKey)}</dt>
            <dd className="mt-0.5 text-muted-foreground">{t(row.textKey)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function IndustryExampleCard({
  id,
  t,
  apiKey,
  copiedId,
  onCopy,
}: {
  id: CustomerDocIndustryId;
  t: (key: string) => string;
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
}) {
  const prefix = `integration.industry.${id}`;
  const detailRows = [
    { labelKey: "integration.industryApisLabel", textKey: `${prefix}.apis` },
    { labelKey: "integration.industryModelsLabel", textKey: `${prefix}.models` },
    { labelKey: "integration.industryTypicalInputLabel", textKey: `${prefix}.typicalInput` },
    { labelKey: "integration.industryTypicalOutputLabel", textKey: `${prefix}.typicalOutput` },
    { labelKey: "integration.industryReconcileLabel", textKey: `${prefix}.reconcile` },
  ];
  const boundaryKey = `${prefix}.boundary`;
  const boundary = t(boundaryKey);
  const hasBoundary = boundary !== boundaryKey;
  const scenarios = CUSTOMER_DOC_INDUSTRY_SCENARIO_KEYS[id];
  const curlValue = buildIndustryCurlOneLine(id, apiKey);
  const copyId = `industry-card-${id}-curl`;

  return (
    <div className="rounded-lg border bg-background p-4">
      <h3 className="text-sm font-semibold">{t(`${prefix}.title`)}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{t(`${prefix}.purpose`)}</p>
      <p className="mt-2 text-xs font-medium text-muted-foreground">
        {t("integration.industryScenariosLabel")}
      </p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
        {scenarios.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ul>
      <dl className="mt-3 space-y-2 text-sm">
        {detailRows.map((row) => (
          <div key={row.labelKey}>
            <dt className="font-medium text-foreground">{t(row.labelKey)}</dt>
            <dd className="text-muted-foreground">{t(row.textKey)}</dd>
          </div>
        ))}
      </dl>
      {hasBoundary ? (
        <p className="mt-3 text-xs font-medium text-amber-700 dark:text-amber-400">
          {boundary}
        </p>
      ) : null}
      <p className="mt-2 text-xs text-muted-foreground">{t(`${prefix}.notManaged`)}</p>
      <div className="mt-3">
        <CopyConfigAction
          id={copyId}
          value={curlValue}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.industryCopyCurlAction")}
          copiedLabel={t("integration.copied")}
        />
      </div>
    </div>
  );
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
      <table className="w-full min-w-[960px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pl-4 pr-3 font-medium">{t("integration.errorsColCode")}</th>
            <th className="py-2 pr-3 font-medium">{t("integration.errorsColHttp")}</th>
            <th className="py-2 pr-3 font-medium">{t("integration.errorsColMeaning")}</th>
            <th className="py-2 pr-3 font-medium">{t("integration.errorsColCause")}</th>
            <th className="py-2 pr-3 font-medium">{t("integration.errorsColAction")}</th>
            <th className="py-2 pr-3 font-medium">{t("integration.errorsColCharged")}</th>
            <th className="py-2 pr-4 font-medium">{t("integration.errorsColWhere")}</th>
          </tr>
        </thead>
        <tbody>
          {CUSTOMER_DOC_ERROR_CODES.map((code) => (
            <tr key={code} className="border-b last:border-0 align-top">
              <td className="py-3 pl-4 pr-3 font-mono text-xs">{code}</td>
              <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">
                {CUSTOMER_ERROR_CODE_HTTP[code]}
              </td>
              <td className="py-3 pr-3 text-muted-foreground">
                {t(`integration.errorRow.${code}.meaning`)}
              </td>
              <td className="py-3 pr-3 text-muted-foreground">
                {t(`integration.errorRow.${code}.cause`)}
              </td>
              <td className="py-3 pr-3 text-muted-foreground">
                {t(`integration.errorRow.${code}.action`)}
              </td>
              <td className="py-3 pr-3 text-muted-foreground whitespace-nowrap">
                {t(`integration.errorRow.${code}.charged`)}
              </td>
              <td className="py-3 pr-4 text-muted-foreground">
                {t(`integration.errorRow.${code}.where`)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GuideHashLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const hashIndex = href.indexOf("#");
  const hash = hashIndex >= 0 ? href.slice(hashIndex) : "";

  return (
    <a
      href={href}
      className={className}
      onClick={(e) => {
        if (!hash) return;
        e.preventDefault();
        scrollToDocSection(hash);
        window.history.replaceState(null, "", href);
      }}
    >
      {children}
    </a>
  );
}
