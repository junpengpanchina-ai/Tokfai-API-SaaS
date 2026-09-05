import type { Metadata } from "next";
import Link from "next/link";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Ecommerce AI Credits — product copy & images",
  description:
    "Tokfai ecommerce AI credits: product title, detail copy, and image generation via OpenAI-compatible API. ¥99 trial pack.",
};

export default function EcommerceAiCreditsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="container min-w-0 flex-1 overflow-x-hidden py-16">
        <article className="mx-auto max-w-3xl space-y-10">
          <header className="space-y-4">
            <p className="text-sm font-medium text-primary">
              Ecommerce AI · Credits
            </p>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">
              电商 AI：商品文案与图片生成 API
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              Use Tokfai compute credits for ecommerce SKU copy, listing
              details, and product image prompts — via OpenAI-compatible Chat /
              Image APIs. 一个 Key，按账本扣费。
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
            <h2 className="text-xl font-semibold">可落地的电商示例</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
              <li>
                <strong className="text-foreground">商品标题</strong>：批量生成
                listing title（人工审核后上架）
              </li>
              <li>
                <strong className="text-foreground">详情页文案</strong>
                ：卖点、参数、FAQ 草稿（不自动承诺退款政策）
              </li>
              <li>
                <strong className="text-foreground">图片生成</strong>
                ：主图 / 场景图 prompt → Nano Banana 异步任务
              </li>
            </ul>
            <p className="text-sm leading-relaxed text-muted-foreground">
              适合商品文案、图片 prompt、批量素材测试和中小规模生成。如果要做大规模自动化铺货或高频批量生成，需要单独评估，不建议直接用自助套餐硬跑。
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">示例 prompt（文案）</h2>
            <pre className="overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs whitespace-pre-wrap">
              {`为以下商品写中文标题与 3 条卖点，不要承诺发货时效或退款：
商品：无线降噪耳机，续航 30 小时，支持多设备切换`}
            </pre>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">FAQ</h2>
            <dl className="space-y-4 text-sm">
              <div>
                <dt className="font-medium">这是成品电商后台吗？</dt>
                <dd className="mt-1 text-muted-foreground">
                  不是。Tokfai 是 API 网关；可用 Cherry Studio 或自研系统调用。
                </dd>
              </div>
              <div>
                <dt className="font-medium">图片会不会一次烧完积分？</dt>
                <dd className="mt-1 text-muted-foreground">
                  图片按次扣费，建议控制并发；失败/超时通常不扣费，以账本为准。
                </dd>
              </div>
              <div>
                <dt className="font-medium">下一步做什么？</dt>
                <dd className="mt-1 text-muted-foreground">
                  充值 99 元体验包 → 创建 Key → 先跑通文本，再试图片工作台。
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
