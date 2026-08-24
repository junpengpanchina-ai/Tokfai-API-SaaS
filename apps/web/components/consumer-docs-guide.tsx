"use client";

import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  API_ENDPOINTS,
  ENGINEERING_INTRO,
  PATH_WARNING,
  SOLUTION_HERO_CARDS,
  UAV_ANALYSIS_SCOPE,
  UAV_OUTPUT_FILE,
  UAV_SCRIPT_EXAMPLE,
  UAV_SUPPORTED_FORMATS,
  UAV_WORKFLOW_STEPS,
  UPSTREAM_CLIENT_CONFIGS,
  type UpstreamClientConfig,
  type UpstreamConfigBlock,
} from "@/lib/docs/consumer-integration-docs";
import { useI18n } from "@/lib/i18n/i18n-provider";

type ConsumerDocsGuideProps = {
  showDashboardLinks?: boolean;
};

function pick<T extends { zh: string; en: string }>(item: T, zh: boolean): string {
  return zh ? item.zh : item.en;
}

export function ConsumerDocsGuide({
  showDashboardLinks: _showDashboardLinks = true,
}: ConsumerDocsGuideProps) {
  const { locale } = useI18n();
  const zh = locale === "zh";

  return (
    <div className="flex flex-col gap-10">
      <header className="max-w-3xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          {zh ? "Tokfai 接入文档" : "Tokfai integration docs"}
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          {zh
            ? "工程材料分析、API 接入、客户端配置三个入口。按场景选择。"
            : "Three entry points: engineering analysis, API integration, and client configuration."}
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-3">
        {SOLUTION_HERO_CARDS.map((card) => (
          <Card
            key={card.id}
            className={
              card.id === "engineering"
                ? "border-primary/30 bg-primary/5 shadow-sm"
                : undefined
            }
          >
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">{pick(card.title, zh)}</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                {pick(card.description, zh)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                asChild
                variant={card.id === "engineering" ? "default" : "outline"}
                size="sm"
              >
                <a href={card.href}>
                  {pick(card.cta, zh)}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* 1. Engineering material analysis */}
      <section id="engineering-analysis" className="scroll-mt-24 space-y-5">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {zh ? "工程材料分析" : "Engineering material analysis"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {pick(ENGINEERING_INTRO, zh)}
          </p>
        </div>

        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle>
              {zh ? "无人机工程材料分析" : "UAV engineering material analysis"}
            </CardTitle>
            <CardDescription className="leading-relaxed">
              {zh
                ? "上传无人机工程包或相关材料，Tokfai 读取内容后输出诊断报告。"
                : "Upload UAV project archives or related materials. Tokfai reads content and outputs a diagnosis report."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5 text-sm">
            <WorkflowSteps steps={UAV_WORKFLOW_STEPS} zh={zh} />

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="mb-2 font-medium text-foreground">
                  {zh ? "支持材料" : "Supported formats"}
                </p>
                <p className="text-muted-foreground">{pick(UAV_SUPPORTED_FORMATS, zh)}</p>
              </div>
              <div>
                <p className="mb-2 font-medium text-foreground">
                  {zh ? "输出文件" : "Output file"}
                </p>
                <code className="text-xs text-foreground">{UAV_OUTPUT_FILE}</code>
              </div>
            </div>

            <div>
              <p className="mb-2 font-medium text-foreground">
                {zh ? "分析范围" : "Analysis scope"}
              </p>
              <ul className="flex flex-wrap gap-2">
                {UAV_ANALYSIS_SCOPE.map((item) => (
                  <li
                    key={item.zh}
                    className="rounded-md border bg-muted/30 px-2.5 py-1 text-xs text-foreground"
                  >
                    {pick(item, zh)}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">
                {zh ? "脚本示例" : "Script example"}
              </p>
              <CodeBlock code={UAV_SCRIPT_EXAMPLE} />
            </div>
          </CardContent>
        </Card>

        <Card
          id="path-warning"
          className="border-amber-500/40 bg-amber-500/5"
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-base text-amber-900 dark:text-amber-100">
              {pick(PATH_WARNING.title, zh)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {pick(PATH_WARNING.body, zh)}
            </p>
          </CardContent>
        </Card>
      </section>

      {/* 2. API integration */}
      <section id="api-access" className="scroll-mt-24 space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {zh ? "API 接入" : "API integration"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Authorization: Bearer sk-tokfai_xxx
          </p>
        </div>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <tbody>
                {API_ENDPOINTS.map((row) => (
                  <tr key={row.path} className="border-b last:border-0">
                    <td className="w-16 px-4 py-3 font-mono text-xs text-muted-foreground">
                      {row.method}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-foreground">
                      {row.path}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {pick(row.note, zh)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* 3. Client configuration */}
      <section id="client-config" className="scroll-mt-24 space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {zh ? "客户端配置" : "Client configuration"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {zh
              ? "Codex、Cursor、Cherry Studio 连接 Tokfai API。"
              : "Connect Codex, Cursor, and Cherry Studio to Tokfai API."}
          </p>
        </div>
        <div className="space-y-4">
          {UPSTREAM_CLIENT_CONFIGS.map((config) => (
            <UpstreamClientCard key={config.id} config={config} zh={zh} />
          ))}
        </div>
      </section>
    </div>
  );
}

function UpstreamClientCard({
  config,
  zh,
}: {
  config: UpstreamClientConfig;
  zh: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{pick(config.title, zh)}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {config.blocks.map((block) => (
          <UpstreamConfigBlockView
            key={pick(block.heading, zh)}
            block={block}
            zh={zh}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function UpstreamConfigBlockView({
  block,
  zh,
}: {
  block: UpstreamConfigBlock;
  zh: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="font-medium text-foreground">{pick(block.heading, zh)}</p>
      {block.body ? (
        <p className="text-muted-foreground">{pick(block.body, zh)}</p>
      ) : null}
      {block.code ? <CodeBlock code={block.code} /> : null}
      {block.bullets && block.bullets.length > 0 ? (
        <ul className="space-y-1 text-muted-foreground">
          {block.bullets.map((item) => (
            <li key={item.zh} className="font-mono text-xs">
              {pick(item, zh)}
            </li>
          ))}
        </ul>
      ) : null}
      {block.errors && block.errors.length > 0 ? (
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-sm">
            <tbody className="text-muted-foreground">
              {block.errors.map((row) => (
                <tr key={row.code} className="border-b last:border-0">
                  <td className="px-3 py-2 pr-4 align-top">
                    <code className="text-foreground">{row.code}</code>
                  </td>
                  <td className="px-3 py-2 align-top">{pick(row.meaning, zh)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function WorkflowSteps({
  steps,
  zh,
}: {
  steps: Array<{ zh: string; en: string }>;
  zh: boolean;
}) {
  return (
    <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {steps.map((step, index) => (
        <li
          key={step.zh}
          className="flex items-start gap-3 rounded-lg border bg-muted/20 p-3"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
            {index + 1}
          </span>
          <span className="text-sm text-foreground">{pick(step, zh)}</span>
        </li>
      ))}
    </ol>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs text-foreground">
      {code.trim()}
    </pre>
  );
}
