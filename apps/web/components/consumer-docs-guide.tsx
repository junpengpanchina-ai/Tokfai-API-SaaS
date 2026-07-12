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
import { useI18n } from "@/lib/i18n/i18n-provider";
import {
  TOKFAI_API_KEY_PLACEHOLDER,
  TOKFAI_API_ORIGIN,
} from "@/lib/tokfai-api";

const IMAGE_EXAMPLE = `{
  "model": "nano-banana-fast",
  "prompt": "生成一张科技感 API 网关海报",
  "size": "1024x1024"
}`;

const CHAT_EXAMPLE = `{
  "model": "gemini-2.5-flash",
  "messages": [{ "role": "user", "content": "Say hello" }],
  "stream": false
}`;

type ConsumerDocsGuideProps = {
  showDashboardLinks?: boolean;
};

export function ConsumerDocsGuide({
  showDashboardLinks = true,
}: ConsumerDocsGuideProps) {
  const { t, locale } = useI18n();
  const zh = locale === "zh";

  return (
    <div className="flex flex-col gap-10">
      <header className="max-w-3xl">
        <h1 className="text-3xl font-semibold tracking-tight">
          {zh ? "Tokfai 接入文档" : "Tokfai integration docs"}
        </h1>
        <p className="mt-3 text-muted-foreground">
          {zh
            ? "四个真实入口：快速开始、Cherry Studio、OpenAI-compatible API、图片生成 API。当前支持按后台模型定价扣费；失败请求不扣费。"
            : "Four real entry points: Quick start, Cherry Studio, OpenAI-compatible API, and Image API. Charges follow admin model pricing; failed requests are not charged."}
        </p>
        {showDashboardLinks ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/api-keys">
                {zh ? "创建 API Key" : "Create API key"}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/pricing">{zh ? "立即充值" : "Top up"}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/credits">
                {zh ? "算力积分账本" : "Compute credits ledger"}
              </Link>
            </Button>
          </div>
        ) : null}
      </header>

      <DocSection
        id="quick-start"
        title={zh ? "1. 快速开始" : "1. Quick start"}
        description={
          zh
            ? "用 Base URL 与 API Key 即可发起第一次调用。"
            : "Use the Base URL and API key for your first call."
        }
      >
        <CopyRow label="Base URL" value={TOKFAI_API_ORIGIN} />
        <CopyRow label="API Key" value={TOKFAI_API_KEY_PLACEHOLDER} />
        <CopyRow
          label={zh ? "认证方式" : "Auth"}
          value={`Authorization: Bearer ${TOKFAI_API_KEY_PLACEHOLDER}`}
        />
        <p className="mt-4 text-sm text-muted-foreground">
          {zh
            ? "充值算力积分后，在控制台创建 sk-tokfai_… 密钥，即可调用文本与图片接口。"
            : "After topping up compute credits, create an sk-tokfai_… key in the dashboard and call chat or image endpoints."}
        </p>
      </DocSection>

      <DocSection
        id="cherry-studio"
        title={zh ? "2. Cherry Studio 接入" : "2. Cherry Studio"}
        description={
          zh
            ? "推荐优先使用 OpenAI Provider；需要 Gemini 供应商时使用 Gemini Provider。"
            : "Prefer the OpenAI Provider; use the Gemini Provider when you need Gemini-native client mode."
        }
      >
        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {zh ? "A. 推荐：OpenAI Provider" : "A. Recommended: OpenAI Provider"}
              </CardTitle>
              <CardDescription>
                {zh
                  ? "API 地址：https://api.tokfai.com"
                  : "API host: https://api.tokfai.com"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                {zh ? "可用模型：" : "Models: "}
                <code className="text-foreground">gpt-5.5</code>、
                <code className="text-foreground">gemini-2.5-flash</code>、
                <code className="text-foreground">auto-fast</code>
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {zh ? "B. Gemini Provider" : "B. Gemini Provider"}
              </CardTitle>
              <CardDescription>
                {zh
                  ? "API 地址：https://api.tokfai.com"
                  : "API host: https://api.tokfai.com"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>
                {zh ? "可用模型：" : "Models: "}
                <code className="text-foreground">gemini-2.5-flash</code>、
                <code className="text-foreground">gemini-2.5-pro</code>
              </p>
              <p>
                {zh
                  ? "用于 Cherry Studio 的 Gemini 供应商兼容（/v1beta）。"
                  : "Gemini provider compatibility for Cherry Studio (/v1beta)."}
              </p>
            </CardContent>
          </Card>
        </div>
      </DocSection>

      <DocSection
        id="openai-compatible"
        title={zh ? "3. OpenAI-compatible API" : "3. OpenAI-compatible API"}
        description={
          zh
            ? "当前支持的 OpenAI 兼容入口。"
            : "Supported OpenAI-compatible endpoints."
        }
      >
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
          <li>
            <code className="text-foreground">GET /v1/models</code>
          </li>
          <li>
            <code className="text-foreground">POST /v1/chat/completions</code>
          </li>
          <li>
            <code className="text-foreground">POST /v1/responses</code>
          </li>
        </ul>
        <pre className="mt-4 overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs">
          {CHAT_EXAMPLE}
        </pre>
      </DocSection>

      <DocSection
        id="image-api"
        title={zh ? "4. 图片生成 API" : "4. Image generation API"}
        description={
          zh
            ? "图片生成当前支持 nano-banana 与 gpt-image-2 系列。图片模型按次扣费，返回图片 URL。"
            : "Image generation currently supports nano-banana and gpt-image-2. Image models bill per successful generation and return an image URL."
        }
      >
        <p className="text-sm text-muted-foreground">
          <code className="text-foreground">POST /v1/images/generations</code>
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg border bg-muted/40 p-4 text-xs">
          {IMAGE_EXAMPLE}
        </pre>
        <p className="mt-4 text-sm text-muted-foreground">
          {zh
            ? "当前 size 映射：1024x1024（1:1）、1792x1024（16:9）、1024x1792（9:16）。持续增加模型支持。"
            : "Supported sizes today: 1024x1024 (1:1), 1792x1024 (16:9), 1024x1792 (9:16). We keep expanding model support."}
        </p>
      </DocSection>
    </div>
  );
}

function DocSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function CopyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 border-b py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-sm font-medium">{label}</span>
      <code className="break-all font-mono text-xs text-muted-foreground sm:text-right">
        {value}
      </code>
    </div>
  );
}
