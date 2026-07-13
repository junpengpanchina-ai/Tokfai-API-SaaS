"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  PUBLIC_BETA_DOCS,
  type PublicBetaDoc,
} from "@/lib/docs/public-beta-docs-registry";
import { useI18n } from "@/lib/i18n/i18n-provider";
import {
  TOKFAI_API_KEY_PLACEHOLDER,
  TOKFAI_API_ORIGIN,
} from "@/lib/tokfai-api";

type ConsumerDocsGuideProps = {
  showDashboardLinks?: boolean;
};

function pickTitle(doc: PublicBetaDoc, zh: boolean): string {
  return zh ? doc.title.zh : doc.title.en;
}

function pickMarkdown(doc: PublicBetaDoc, zh: boolean): string {
  return zh ? doc.markdown.zh : doc.markdown.en;
}

export function ConsumerDocsGuide({
  showDashboardLinks = true,
}: ConsumerDocsGuideProps) {
  const { locale } = useI18n();
  const zh = locale === "zh";
  const docs = PUBLIC_BETA_DOCS;

  return (
    <div className="flex flex-col gap-10">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">
          {zh ? "Tokfai 接入文档" : "Tokfai integration docs"}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {zh
            ? "快速开始、认证、文本对话、Responses、图片生成、参考图改图、Cherry Studio、模型与价格入口、错误码与常见问题。模型能力看模型页，价格看定价页。"
            : "Quickstart, auth, chat, Responses, image generation, reference edit, Cherry Studio, models/pricing links, error codes, and FAQ. Capabilities on Models; rates on Pricing."}
        </p>
        <div className="mt-4 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          <p>
            Base URL:{" "}
            <code className="text-foreground">{TOKFAI_API_ORIGIN}</code>
          </p>
          <p className="mt-1">
            API Key:{" "}
            <code className="text-foreground">{TOKFAI_API_KEY_PLACEHOLDER}</code>
          </p>
          <p className="mt-1">
            {zh
              ? "官网：https://www.tokfai.com · 计费单位：算力积分（compute credits）"
              : "Website: https://www.tokfai.com · Billing unit: compute credits"}
          </p>
        </div>
        {showDashboardLinks ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/api-keys">
                {zh ? "创建 API Key" : "Create API key"}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/models">
                {zh ? "查看模型" : "View models"}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/pricing">{zh ? "查看定价" : "View pricing"}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/credits">
                {zh ? "算力积分账本" : "Compute credits ledger"}
              </Link>
            </Button>
          </div>
        ) : null}
        <nav className="mt-6 flex flex-wrap gap-2 text-sm">
          {docs.map((doc) => (
            <a
              key={doc.slug}
              href={`#${doc.slug}`}
              className="rounded-md border px-2.5 py-1 text-muted-foreground hover:text-foreground"
            >
              {pickTitle(doc, zh)}
            </a>
          ))}
        </nav>
      </header>

      {docs.map((doc) => (
        <DocSection
          key={doc.slug}
          id={doc.slug}
          title={pickTitle(doc, zh)}
          apiPaths={doc.apiPaths}
          updatedAt={doc.updatedAt}
          zh={zh}
        >
          <MarkdownBlock markdown={pickMarkdown(doc, zh)} />
        </DocSection>
      ))}
    </div>
  );
}

function DocSection({
  id,
  title,
  apiPaths,
  updatedAt,
  zh,
  children,
}: {
  id: string;
  title: string;
  apiPaths: string[];
  updatedAt: string;
  zh: boolean;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>
            {zh ? "更新于" : "Updated"} {updatedAt}
            {apiPaths.length > 0 ? (
              <>
                {" · "}
                {apiPaths.join(" · ")}
              </>
            ) : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          {children}
        </CardContent>
      </Card>
    </section>
  );
}

function MarkdownBlock({ markdown }: { markdown: string }) {
  const blocks = markdown.split(/```/);
  return (
    <div className="space-y-3">
      {blocks.map((block, index) => {
        if (index % 2 === 1) {
          const lines = block.replace(/^\w*\n/, "");
          return (
            <pre
              key={`code-${index}`}
              className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs text-foreground"
            >
              {lines.trim()}
            </pre>
          );
        }
        return (
          <div key={`text-${index}`} className="space-y-2 whitespace-pre-wrap">
            {block.trim()}
          </div>
        );
      })}
    </div>
  );
}
