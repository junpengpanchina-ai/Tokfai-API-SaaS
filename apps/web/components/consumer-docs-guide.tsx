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
            ? "必须新建 Tokfai Provider，不要选 Cherry 里自带的 garsai / GRSAI 供应商。"
            : "Add a Tokfai Provider. Do not use Cherry’s built-in garsai / GRSAI provider."
        }
      >
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">
          <p className="font-medium text-foreground">
            {zh ? "重要：不要选错供应商" : "Important: use Tokfai, not garsai"}
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
            <li>
              {zh
                ? "不要选择 Cherry 里旧的 garsai / GRSAI Provider。"
                : "Do not select Cherry’s legacy garsai / GRSAI Provider."}
            </li>
            <li>
              {zh ? (
                <>
                  若模型名后缀是{" "}
                  <code className="text-foreground">| garsai</code>
                  ，说明请求没有走 Tokfai。
                </>
              ) : (
                <>
                  If the model label ends with{" "}
                  <code className="text-foreground">| garsai</code>, the
                  request is not going through Tokfai.
                </>
              )}
            </li>
            <li>
              {zh ? (
                <>
                  正确路径是{" "}
                  <code className="text-foreground">{TOKFAI_API_ORIGIN}</code>
                  ，不是{" "}
                  <code className="text-foreground">https://grsaiapi.com</code>
                  。
                </>
              ) : (
                <>
                  Correct host is{" "}
                  <code className="text-foreground">{TOKFAI_API_ORIGIN}</code>
                  , not{" "}
                  <code className="text-foreground">https://grsaiapi.com</code>
                  .
                </>
              )}
            </li>
          </ul>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {zh ? "A. OpenAI Provider（推荐）" : "A. OpenAI Provider (recommended)"}
              </CardTitle>
              <CardDescription>
                {zh
                  ? "在 Cherry 新增 OpenAI Compatible / Custom OpenAI 供应商"
                  : "Add an OpenAI Compatible / Custom OpenAI provider in Cherry"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <CopyRow label="Base URL" value={TOKFAI_API_ORIGIN} />
              <CopyRow label="API Key" value={TOKFAI_API_KEY_PLACEHOLDER} />
              <div>
                <p className="font-medium text-foreground">
                  {zh ? "可用模型（model id）" : "Available model ids"}
                </p>
                <p className="mt-1 font-mono text-xs leading-relaxed text-foreground">
                  gpt-5.4 · gpt-5.5 · gpt-5 · gpt-5-chat · gpt-5-pro ·
                  gpt-5.4-pro · gpt-5.5-pro
                </p>
                <p className="mt-2 text-xs">
                  {zh
                    ? "也可用 auto-fast / auto-pro / auto-cheap，以及 Gemini 文本模型（OpenAI 路径）。"
                    : "You can also use auto-fast / auto-pro / auto-cheap and Gemini chat models on the OpenAI path."}
                </p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                {zh ? "B. Gemini Provider" : "B. Gemini Provider"}
              </CardTitle>
              <CardDescription>
                {zh
                  ? "仅在需要 Gemini 原生客户端时使用（/v1beta）"
                  : "Use only for Gemini-native clients (/v1beta)"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <CopyRow label="Base URL" value={TOKFAI_API_ORIGIN} />
              <CopyRow label="API Key" value={TOKFAI_API_KEY_PLACEHOLDER} />
              <div>
                <p className="font-medium text-foreground">
                  {zh ? "可用模型（model id）" : "Available model ids"}
                </p>
                <p className="mt-1 font-mono text-xs leading-relaxed text-foreground">
                  gemini-2.5-flash · gemini-2.5-pro · gemini-3-flash ·
                  gemini-3-pro
                </p>
                <p className="mt-2 text-xs">
                  {zh
                    ? "展示名可写 Gemini 3 Flash / Gemini 3 Pro，但 id 必须是 gemini-3-flash / gemini-3-pro。"
                    : "Display names may be Gemini 3 Flash / Gemini 3 Pro; ids must stay gemini-3-flash / gemini-3-pro."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="mt-4 rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">
            {zh ? "排障：model not register" : "Troubleshooting: model not register"}
          </p>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>
              {zh
                ? "若报错类似 model not register: xxx，先检查 Cherry 当前选中的模型是否属于你新建的 Tokfai Provider。"
                : "If you see model not register: xxx, first check that the selected model belongs to your Tokfai Provider."}
            </li>
            <li>
              {zh ? (
                <>
                  打开网络 / 日志：若请求路径是{" "}
                  <code className="text-foreground">grsaiapi.com</code>
                  ，说明选错了供应商，请改回{" "}
                  <code className="text-foreground">{TOKFAI_API_ORIGIN}</code>
                  。
                </>
              ) : (
                <>
                  Check the request URL: if it hits{" "}
                  <code className="text-foreground">grsaiapi.com</code>, you
                  picked the wrong provider — switch to{" "}
                  <code className="text-foreground">{TOKFAI_API_ORIGIN}</code>
                  .
                </>
              )}
            </li>
            <li>
              {zh
                ? "确认 model id 使用上文列表（例如 gpt-5.4、gemini-3-flash），不要用 Cherry 自带的 garsai 模型条目。"
                : "Use a model id from the lists above (e.g. gpt-5.4, gemini-3-flash), not Cherry’s built-in garsai model entries."}
            </li>
          </ol>
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
