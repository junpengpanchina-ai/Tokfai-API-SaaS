import type { Metadata } from "next";
import Link from "next/link";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "OpenAI Compatible API Gateway",
  description:
    "Tokfai OpenAI-compatible AI gateway — GPT / Gemini / image via one API key. Cherry Studio, Cursor, OpenAI SDK. ¥99 trial pack.",
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
              Tokfai：OpenAI 兼容 AI 网关
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              One API key for GPT, Gemini, and image generation. Point Cherry
              Studio, Cursor, or the OpenAI SDK at{" "}
              <code className="text-foreground">https://api.tokfai.com/v1</code>{" "}
              — 独立 API Key、余额账本、调用记录、在线充值自动到账。
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
                  失败请求通常不扣费，以 Usage / Credits 账本为准。
                </dd>
              </div>
              <div>
                <dt className="font-medium">从哪开始？</dt>
                <dd className="mt-1 text-muted-foreground">
                  注册 → 创建 Key → 充值 99 元体验包 → 跑通 docs 里的 curl。
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
