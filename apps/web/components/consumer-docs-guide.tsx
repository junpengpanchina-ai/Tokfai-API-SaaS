"use client";

import { ArrowRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
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
  CLIENT_CONFIG_BULLETS,
  CONSUMER_DOC_COMMON_ERRORS,
  SOLUTION_HERO_CARDS,
  SUPPORTED_MATERIALS,
  UAV_ANALYZE_CODE,
  UAV_API_KEY_CODE,
  UAV_OUTPUT_FILE,
  UAV_SUCCESS_FLAG,
  UAV_WORKFLOW_STEPS,
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
      {/* Layer 1: Value proposition */}
      <header className="max-w-3xl space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">
          {zh ? "Tokfai 接入文档" : "Tokfai integration docs"}
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          {zh
            ? "Tokfai 支持 API 中转，也支持工程文件、PDF、日志、代码材料的读取与分析。客户可以按场景使用，开发者可以按接口接入。"
            : "Tokfai supports API relay plus reading and analysis of engineering files, PDFs, logs, and code. Customers use by scenario; developers integrate by API."}
        </p>
      </header>

      {/* Layer 2: Core scenario entry cards */}
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
              <Button asChild variant={card.id === "engineering" ? "default" : "outline"} size="sm">
                <a href={card.href}>
                  {pick(card.cta, zh)}
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </a>
              </Button>
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Engineering analysis — primary section */}
      <section id="engineering-analysis" className="scroll-mt-24 space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">
            {zh ? "工程材料分析" : "Engineering material analysis"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {zh
              ? "上传材料后，Tokfai 先读取文件内容，再生成诊断报告。"
              : "Tokfai reads file content first, then generates a diagnosis report."}
          </p>
        </div>

        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle>{zh ? "无人机材料分析" : "UAV material analysis"}</CardTitle>
            <CardDescription className="leading-relaxed">
              {zh
                ? "适合无人机项目中的飞行审批、空域限制、飞控代码、姿态控制、链路日志、安全边界和可交付风险分析。"
                : "For flight approvals, airspace limits, FC code, attitude control, link logs, safety boundaries, and delivery risk in UAV projects."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6 text-sm">
            <WorkflowSteps steps={UAV_WORKFLOW_STEPS} zh={zh} />

            <div className="space-y-2">
              <p className="font-medium text-foreground">
                {zh ? "步骤 1：准备 API Key" : "Step 1: Prepare API key"}
              </p>
              <CodeBlock code={UAV_API_KEY_CODE} />
            </div>

            <div className="space-y-2">
              <p className="font-medium text-foreground">
                {zh ? "步骤 2–3：运行分析脚本" : "Steps 2–3: Run analysis script"}
              </p>
              <CodeBlock code={UAV_ANALYZE_CODE} />
            </div>

            <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 p-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {zh ? "成功标志" : "Success flag"}
                </p>
                <Badge variant="secondary" className="font-mono text-xs">
                  {UAV_SUCCESS_FLAG}
                </Badge>
              </div>
              <div className="hidden h-8 w-px bg-border sm:block" />
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">
                  {zh ? "输出文件" : "Output file"}
                </p>
                <code className="text-xs text-foreground">{UAV_OUTPUT_FILE}</code>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card id="supported-materials" className="scroll-mt-24">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {zh ? "适合上传什么材料" : "What to upload"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
              {SUPPORTED_MATERIALS.map((item) => (
                <li key={item.zh} className="flex items-start gap-2">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  {pick(item, zh)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </section>

      {/* Common errors */}
      <section id="common-errors" className="scroll-mt-24">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {zh ? "常见问题" : "Common issues"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <tbody className="text-muted-foreground">
                  {CONSUMER_DOC_COMMON_ERRORS.map((row) => (
                    <tr key={row.code} className="border-b last:border-0">
                      <td className="py-2.5 pr-4 align-top">
                        <code className="text-foreground">{row.code}</code>
                      </td>
                      <td className="py-2.5 align-top">{pick(row.meaning, zh)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* API access — deferred */}
      <section id="api-access" className="scroll-mt-24 space-y-4">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">
            {zh ? "API 接入" : "API integration"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {zh
              ? "鉴权：Authorization: Bearer sk-tokfai_xxx"
              : "Auth: Authorization: Bearer sk-tokfai_xxx"}
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

      {/* Client access — deferred */}
      <section id="client-access" className="scroll-mt-24 space-y-4">
        <h2 className="text-xl font-semibold tracking-tight">
          {zh ? "客户端接入" : "Client integration"}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          {CLIENT_CONFIG_BULLETS.map((group) => (
            <Card key={group.title.zh}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{pick(group.title, zh)}</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1.5 text-sm text-muted-foreground">
                  {group.items.map((item) => (
                    <li key={item.zh} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground" />
                      {pick(item, zh)}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
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
