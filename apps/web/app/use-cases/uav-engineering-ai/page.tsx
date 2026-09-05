import type { Metadata } from "next";
import Link from "next/link";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "UAV Engineering AI — flight materials & diagnostics",
  description:
    "Tokfai UAV engineering AI: flight approval, airspace limits, airworthiness materials, log diagnostics via OpenAI-compatible API.",
};

export default function UavEngineeringAiPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="container min-w-0 flex-1 overflow-x-hidden py-16">
        <article className="mx-auto max-w-3xl space-y-10">
          <header className="space-y-4">
            <p className="text-sm font-medium text-primary">
              UAV Engineering AI
            </p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              无人机工程材料 AI 分析
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              Upload flight / control project materials and ask Tokfai for
              structured diagnosis — 航飞审批、空域限制、适航材料、日志诊断、飞控
              与姿态环风险梳理。OpenAI-compatible API；本地路径无法直读，需上传内容。
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/pricing#plan-credit_99">99 元体验 API</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/docs#engineering-analysis">查看接入文档</Link>
              </Button>
            </div>
          </header>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">覆盖关键词</h2>
            <ul className="flex flex-wrap gap-2 text-sm">
              {[
                "航飞审批",
                "空域限制",
                "适航材料",
                "日志诊断",
                "飞控代码",
                "姿态控制",
                "安全边界",
              ].map((tag) => (
                <li
                  key={tag}
                  className="rounded-md border bg-muted/30 px-2.5 py-1 text-foreground"
                >
                  {tag}
                </li>
              ))}
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">建议工作流</h2>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
              <li>打包工程材料（zip / PDF / log / 源码）</li>
              <li>通过脚本或 API 上传内容（不要只发本地路径字符串）</li>
              <li>用 chat / responses 提问并导出 markdown 诊断报告</li>
              <li>人工复核后再用于交付或审批材料整理</li>
            </ol>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">FAQ</h2>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="font-medium">只发文件路径为什么读不到？</dt>
                <dd className="mt-1 text-muted-foreground">
                  云端收不到你电脑上的路径。必须上传真实文件内容。详见 Docs。
                </dd>
              </div>
              <div>
                <dt className="font-medium">这是官方适航认证吗？</dt>
                <dd className="mt-1 text-muted-foreground">
                  不是。Tokfai 只做工程材料分析辅助，不做官方认证，不替代人工审核。最终责任在人工审核与合规流程。
                </dd>
              </div>
              <div>
                <dt className="font-medium">大规模或敏感数据能直接自助吗？</dt>
                <dd className="mt-1 text-muted-foreground">
                  如果涉及大规模数据处理、涉密材料、个人隐私或监管审批结论，需要走人工评估或不承接。
                </dd>
              </div>
              <div>
                <dt className="font-medium">下一步？</dt>
                <dd className="mt-1 text-muted-foreground">
                  注册并创建 Key → 充值 99 → 按 Docs 无人机章节跑通上传脚本。
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
