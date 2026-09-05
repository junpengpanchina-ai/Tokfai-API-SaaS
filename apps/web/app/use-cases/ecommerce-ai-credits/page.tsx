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
              用电商标题、详情页、图片 prompt 走 Tokfai Chat / Image API — 一个
              Key，按账本扣费。建议先用 99 元跑通，再放大素材量。
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
                  不是。Tokfai 是小团队可用的 API 中转；可用 Cherry Studio 或自研系统调用。
                </dd>
              </div>
              <div>
                <dt className="font-medium">图片会不会一次烧完积分？</dt>
                <dd className="mt-1 text-muted-foreground">
                  图片按次扣费，建议控制并发；失败/超时通常不扣费，以账本为准。异常可邮件
                  junpengpanchina@gmail.com 人工核查。
                </dd>
              </div>
              <div>
                <dt className="font-medium">适合谁 / 不适合谁？</dt>
                <dd className="mt-1 text-muted-foreground">
                  适合标题、详情、图片 prompt 与中小规模素材测试。不适合百万级铺货爬取、灰产违法，以及需要正式
                  SLA 的大客户采购。
                </dd>
              </div>
              <div>
                <dt className="font-medium">下一步做什么？</dt>
                <dd className="mt-1 text-muted-foreground">
                  注册 → 充值 99 → 创建 Key → 配 Base URL → 跑 /v1/models 与
                  chat → 再试图片工作台，并看 Usage / Credits。
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
