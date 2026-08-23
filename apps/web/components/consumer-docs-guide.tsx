"use client";

import Link from "next/link";

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
  CONSUMER_DOC_COMMON_ERRORS,
  CONSUMER_DOC_NAV,
  CONSUMER_DOC_SECTIONS,
  type ConsumerDocSection,
  type ConsumerDocStep,
} from "@/lib/docs/consumer-integration-docs";
import { useI18n } from "@/lib/i18n/i18n-provider";
import {
  TOKFAI_API_KEY_PLACEHOLDER,
  TOKFAI_API_ORIGIN,
} from "@/lib/tokfai-api";

type ConsumerDocsGuideProps = {
  showDashboardLinks?: boolean;
};

function pick<T extends { zh: string; en: string }>(item: T, zh: boolean): string {
  return zh ? item.zh : item.en;
}

export function ConsumerDocsGuide({
  showDashboardLinks = true,
}: ConsumerDocsGuideProps) {
  const { locale } = useI18n();
  const zh = locale === "zh";

  const mainSections = CONSUMER_DOC_SECTIONS.filter(
    (section) => section.id !== "uav-material-analysis"
  );
  const engineeringSection = CONSUMER_DOC_SECTIONS.find(
    (section) => section.id === "engineering-analysis"
  );
  const uavSection = CONSUMER_DOC_SECTIONS.find(
    (section) => section.id === "uav-material-analysis"
  );

  return (
    <div className="flex flex-col gap-8">
      <header className="max-w-3xl space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">
          {zh ? "Tokfai 接入文档" : "Tokfai integration docs"}
        </h1>
        <p className="text-muted-foreground">
          {zh
            ? "Tokfai 支持文本对话、图片生成、工程材料分析和 OpenAI 兼容 API。普通客户按场景使用，开发者按 API 接入。"
            : "Tokfai supports chat, image generation, engineering material analysis, and OpenAI-compatible APIs. Use by scenario as a customer; integrate by API as a developer."}
        </p>

        <Card className="border-muted bg-muted/20">
          <CardContent className="space-y-2 p-4 text-sm">
            <p>
              <span className="text-muted-foreground">Base URL: </span>
              <code className="text-foreground">{TOKFAI_API_ORIGIN}</code>
            </p>
            <p>
              <span className="text-muted-foreground">API Key: </span>
              <code className="text-foreground">{TOKFAI_API_KEY_PLACEHOLDER}</code>
            </p>
            <p className="text-muted-foreground">
              {zh ? "计费单位：算力积分" : "Billing unit: compute credits"}
            </p>
          </CardContent>
        </Card>

        {showDashboardLinks ? (
          <div className="flex flex-wrap gap-2">
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
          </div>
        ) : null}
      </header>

      <section aria-label={zh ? "文档导航" : "Documentation navigation"}>
        <h2 className="mb-3 text-sm font-medium text-muted-foreground">
          {zh ? "按场景查看" : "Browse by topic"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {CONSUMER_DOC_NAV.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="group rounded-lg border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-muted/30"
            >
              <p className="font-medium group-hover:text-foreground">
                {pick(item.title, zh)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {pick(item.description, zh)}
              </p>
            </a>
          ))}
        </div>
      </section>

      {mainSections.map((section) => (
        <DocSectionCard key={section.id} section={section} zh={zh}>
          {section.id === "engineering-analysis" && engineeringSection && uavSection ? (
            <div className="mt-6 space-y-4 border-t pt-6">
              <div>
                <h3 className="text-base font-semibold text-foreground">
                  {pick(uavSection.title, zh)}
                </h3>
                {uavSection.intro ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    {pick(uavSection.intro, zh)}
                  </p>
                ) : null}
              </div>
              <StepsBlock steps={uavSection.steps ?? []} zh={zh} />
              <BulletsBlock bullets={uavSection.bullets ?? []} zh={zh} />
            </div>
          ) : null}
        </DocSectionCard>
      ))}

      <section id="common-errors" className="scroll-mt-24">
        <Card>
          <CardHeader>
            <CardTitle>{zh ? "常见错误" : "Common errors"}</CardTitle>
            <CardDescription>
              {zh
                ? "按错误码快速定位问题"
                : "Quick lookup by error code"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[32rem] text-left text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">
                      {zh ? "错误" : "Error"}
                    </th>
                    <th className="pb-2 pr-4 font-medium">
                      {zh ? "含义" : "Meaning"}
                    </th>
                    <th className="pb-2 font-medium">
                      {zh ? "处理" : "Fix"}
                    </th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  {CONSUMER_DOC_COMMON_ERRORS.map((row) => (
                    <tr key={row.code} className="border-b last:border-0">
                      <td className="py-3 pr-4 align-top">
                        <code className="text-foreground">{row.code}</code>
                      </td>
                      <td className="py-3 pr-4 align-top">{pick(row.meaning, zh)}</td>
                      <td className="py-3 align-top">{pick(row.fix, zh)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function DocSectionCard({
  section,
  zh,
  children,
}: {
  section: ConsumerDocSection;
  zh: boolean;
  children?: React.ReactNode;
}) {
  return (
    <section id={section.id} className="scroll-mt-24">
      <Card>
        <CardHeader>
          <CardTitle>{pick(section.title, zh)}</CardTitle>
          {section.intro ? (
            <CardDescription className="text-sm leading-relaxed">
              {pick(section.intro, zh)}
            </CardDescription>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          {section.code ? <CodeBlock code={section.code} /> : null}
          <StepsBlock steps={section.steps ?? []} zh={zh} />
          <BulletsBlock bullets={section.bullets ?? []} zh={zh} />
          {section.note ? (
            <p className="rounded-md border border-dashed bg-muted/20 p-3 text-sm">
              {pick(section.note, zh)}
            </p>
          ) : null}
          {children}
        </CardContent>
      </Card>
    </section>
  );
}

function StepsBlock({
  steps,
  zh,
}: {
  steps: ConsumerDocStep[];
  zh: boolean;
}) {
  if (steps.length === 0) return null;

  return (
    <div className="space-y-4">
      {steps.map((step, index) => (
        <div key={`${pick(step.title, zh)}-${index}`} className="space-y-2">
          <p className="font-medium text-foreground">{pick(step.title, zh)}</p>
          {step.body ? (
            <p className="whitespace-pre-wrap">{pick(step.body, zh)}</p>
          ) : null}
          {step.code ? <CodeBlock code={step.code} /> : null}
          {step.successFlag ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {zh ? "成功标志" : "Success flag"}
              </span>
              <Badge variant="secondary" className="font-mono text-xs">
                {step.successFlag}
              </Badge>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function BulletsBlock({
  bullets,
  zh,
}: {
  bullets: Array<{ zh: string; en: string }>;
  zh: boolean;
}) {
  if (bullets.length === 0) return null;

  return (
    <ul className="list-disc space-y-1.5 pl-5">
      {bullets.map((bullet) => (
        <li key={bullet.zh}>{pick(bullet, zh)}</li>
      ))}
    </ul>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs text-foreground">
      {code.trim()}
    </pre>
  );
}
