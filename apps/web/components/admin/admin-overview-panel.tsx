"use client";

import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Coins,
  Cpu,
  Gauge,
  Package,
  Receipt,
  Users,
} from "lucide-react";

import { AdminDebugCard } from "@/components/admin/admin-debug-card";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { AdminDashboardSummary } from "@/lib/admin/client";
import type { AdminDebug } from "@/lib/admin/server";
import { formatCny } from "@/lib/billing/recharge-plans";
import { formatDateTime, formatInt } from "@/lib/format";

type ApiHealth = {
  ok: boolean;
  service?: string;
  now?: string;
  timestamp?: string;
};

const QUICK_LINKS = [
  {
    href: "/admin/recharge-plans",
    title: "充值套餐",
    desc: "管理充值套餐与 Stripe 定价",
    icon: Package,
  },
  {
    href: "/admin/credit-orders",
    title: "充值订单",
    desc: "查看 Stripe Checkout 订单",
    icon: Receipt,
  },
  {
    href: "/admin/credits",
    title: "积分账本",
    desc: "按用户查询余额与账本",
    icon: Coins,
  },
  {
    href: "/admin/users",
    title: "用户管理",
    desc: "账户列表与积分概况",
    icon: Users,
  },
  {
    href: "/admin/usage",
    title: "全站用量",
    desc: "全站 API 调用记录",
    icon: Gauge,
  },
  {
    href: "/admin/models",
    title: "模型价格",
    desc: "模型目录与定价配置",
    icon: Cpu,
  },
] as const;

function formatCount(value: number | null | undefined): string {
  if (value == null) return "—";
  return formatInt(value);
}

function formatRechargeTotal(cents: number): string {
  return formatCny(cents);
}

function resolveHealthTimestamp(health: ApiHealth | null): string | null {
  if (!health) return null;
  return health.now ?? health.timestamp ?? null;
}

export function AdminOverviewPanel({
  summary,
  warnings,
  health,
  debug,
}: {
  summary: AdminDashboardSummary | null;
  warnings: string[];
  health: ApiHealth | null;
  debug: AdminDebug | null;
}) {
  const healthOk = health?.ok === true;
  const healthTimestamp = resolveHealthTimestamp(health);
  const summaryUpdatedAt = summary?.updated_at ?? null;

  return (
    <>
      <div>
        <Badge variant="secondary">运营后台</Badge>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">
          总览看板
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          核心指标一览。数据来自 DMIT Admin API，只读展示。
        </p>
      </div>

      {debug ? <AdminDebugCard debug={debug} /> : null}

      {warnings.length > 0 ? (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">部分指标未能加载</CardTitle>
            <CardDescription>
              以下查询失败，对应卡片显示为「—」，其余数据仍可用。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-xs text-muted-foreground">
              {warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {summary ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AdminStatCard
              label="用户数"
              value={formatCount(summary.total_users)}
            />
            <AdminStatCard
              label="订单数"
              value={formatCount(summary.total_credit_orders)}
            />
            <AdminStatCard
              label="累计充值金额"
              value={formatRechargeTotal(summary.total_recharge_amount_cents)}
            />
            <AdminStatCard
              label="总调用量"
              value={formatCount(summary.total_usage_logs)}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <AdminStatCard
              label="套餐数"
              value={formatCount(summary.total_recharge_plans)}
              hint="未归档"
            />
            <AdminStatCard
              label="可见套餐数"
              value={formatCount(summary.visible_recharge_plans)}
              hint="已启用且前台可见"
            />
            <AdminStatCard
              label="近 24 小时订单"
              value={formatCount(summary.credit_orders_last_24h)}
            />
            <AdminStatCard
              label="近 7 天订单"
              value={formatCount(summary.credit_orders_last_7d)}
            />
          </div>
        </>
      ) : null}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">最近健康状态</CardTitle>
          </div>
          <CardDescription>DMIT API 公开健康检查端点</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <Badge variant={healthOk ? "default" : "destructive"}>
              API {healthOk ? "正常" : "异常"}
            </Badge>
            {health?.service ? (
              <span className="text-sm text-muted-foreground">
                服务：{health.service}
              </span>
            ) : null}
          </div>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div>
              <span className="text-muted-foreground">健康检查时间：</span>
              {formatDateTime(healthTimestamp)}
            </div>
            <div>
              <span className="text-muted-foreground">看板数据更新时间：</span>
              {formatDateTime(summaryUpdatedAt)}
            </div>
          </div>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-sm font-medium text-muted-foreground">快捷入口</h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <Card
              key={link.href}
              className="transition-colors hover:bg-muted/30"
            >
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <link.icon className="h-5 w-5 text-muted-foreground" />
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <CardTitle className="text-base">
                  <Link href={link.href} className="hover:underline">
                    {link.title}
                  </Link>
                </CardTitle>
                <CardDescription>{link.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </div>
    </>
  );
}
