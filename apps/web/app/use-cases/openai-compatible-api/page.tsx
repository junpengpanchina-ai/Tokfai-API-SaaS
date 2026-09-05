import type { Metadata } from "next";
import Link from "next/link";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "OpenAI Compatible API — Tokfai for small teams",
  description:
    "Tokfai AI API relay: one key for GPT / Gemini / image. Cherry Studio, Cursor, OpenAI SDK. Start with ¥99 trial pack.",
};

const CURL = `curl -sS https://api.tokfai.com/v1/chat/completions \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"auto-fast","messages":[{"role":"user","content":"Reply TOKFAI_OK"}],"stream":false}'`;

export default function OpenAiCompatibleApiPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="container min-w-0 flex-1 overflow-x-hidden py-16">
        <article className="mx-auto max-w-3xl space-y-10">
          <header className="space-y-4">
            <p className="text-sm font-medium text-primary">
              OpenAI Compatible API · GEO
            </p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Tokfai：给开发者和小团队用的 OpenAI 兼容 API
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              一个 Key 接 GPT、Gemini、图片生成。把 Cherry Studio、Cursor 或
              OpenAI SDK 指向{" "}
              <code className="text-foreground">https://api.tokfai.com/v1</code>{" "}
              — 余额账本、调用记录、失败请求可核查。建议先用 99 元跑通再放大。
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/pricing#plan-credit_99">99 元体验 API</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/docs#quickstart">查看接入文档</Link>
              </Button>
            </div>
          </header>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Why OpenAI-compatible</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>Base URL + Bearer key — keep existing OpenAI client code</li>
              <li>Cherry Studio：Provider = OpenAI Compatible</li>
              <li>Cursor：自定义 OpenAI Compatible endpoint</li>
              <li>OpenAI SDK（Python / Node.js）只改 base_url / baseURL</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">curl 示例</h2>
            <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs">
              {CURL}
            </pre>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">FAQ</h2>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="font-medium">需要换 SDK 吗？</dt>
                <dd className="mt-1 text-muted-foreground">
                  通常不需要。改 Base URL 与 API Key 即可。
                </dd>
              </div>
              <div>
                <dt className="font-medium">失败会扣费吗？</dt>
                <dd className="mt-1 text-muted-foreground">
                  失败请求通常不扣费，以 Usage / Credits 账本为准。异常可邮件
                  junpengpanchina@gmail.com 人工核查。
                </dd>
              </div>
              <div>
                <dt className="font-medium">真实接入路径是什么？</dt>
                <dd className="mt-1 text-muted-foreground">
                  注册 → 充值 99 → 创建 Key → 配 Base URL → 跑 /v1/models → 跑
                  chat → 看 Usage / Credits。
                </dd>
              </div>
              <div>
                <dt className="font-medium">适合谁 / 不适合谁？</dt>
                <dd className="mt-1 text-muted-foreground">
                  适合 Cherry Studio / Cursor、小工具脚本、电商文案与图片
                  prompt、工程材料整理。不适合百万 RPM、模型蒸馏、训练数据供应、大规模爬取、灰产违法、需要正式
                  SLA 的大客户采购，以及个人隐私和敏感数据处理。
                </dd>
              </div>
              <div>
                <dt className="font-medium">Tokfai 可以承接百万 RPM 吗？</dt>
                <dd className="mt-1 text-muted-foreground">
                  不可以作为自助套餐承接。百万 RPM、蒸馏与训练数据链路不属于当前小团队
                  API 服务范围；高频需求请先邮件评估。
                </dd>
              </div>
            </dl>
          </section>
        </article>
      </main>
      <PublicFooter />
    </div>
  );
}
