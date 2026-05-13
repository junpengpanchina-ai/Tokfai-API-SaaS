import Link from "next/link";
import { ArrowUpRight, CreditCard, Gauge, KeyRound } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const STATS = [
  {
    label: "Credits remaining",
    value: "$0.00",
    sub: "Top up to start calling the API.",
    href: "/dashboard/credits",
    icon: CreditCard,
  },
  {
    label: "Requests (last 24h)",
    value: "0",
    sub: "No traffic yet.",
    href: "/dashboard/usage",
    icon: Gauge,
  },
  {
    label: "Active API keys",
    value: "0",
    sub: "Create your first key.",
    href: "/dashboard/api-keys",
    icon: KeyRound,
  },
];

export default function DashboardOverviewPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Welcome to Tokfai. Live numbers will appear here once you start
            sending traffic.
          </p>
        </div>
        <Badge variant="secondary">V1 preview</Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {STATS.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.label}>
              <CardHeader className="flex flex-row items-start justify-between space-y-0 pb-2">
                <CardDescription>{stat.label}</CardDescription>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-semibold tracking-tight">
                  {stat.value}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{stat.sub}</p>
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="mt-3 -ml-2 h-7 px-2 text-xs"
                >
                  <Link href={stat.href}>
                    Open
                    <ArrowUpRight className="h-3 w-3" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Get started in 3 steps</CardTitle>
          <CardDescription>
            Same flow as OpenAI: get a key, top up, start calling.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Step
            n={1}
            title="Create an API key"
            href="/dashboard/api-keys"
            body="Generate a sk-tokfai-... key. You will only see the secret once."
          />
          <Step
            n={2}
            title="Add credits"
            href="/dashboard/credits"
            body="Credits are consumed per request. No subscription."
          />
          <Step
            n={3}
            title="Try the Playground"
            href="/dashboard/playground"
            body="Send your first chat completion straight from the browser."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function Step({
  n,
  title,
  body,
  href,
}: {
  n: number;
  title: string;
  body: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-4 rounded-md border bg-card p-4 transition-colors hover:bg-accent/40"
    >
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
        {n}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          {title}
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">{body}</p>
      </div>
    </Link>
  );
}
