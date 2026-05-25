import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowUpRight,
  CreditCard,
  Gauge,
  ImageIcon,
  KeyRound,
  MessageSquare,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatCredits, formatInt } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";
import type { ProfileRow } from "@/lib/supabase/types";
import {
  TOKFAI_API_BASE_URL,
  TOKFAI_API_KEY_FORMAT,
  TOKFAI_BILLING_POLICY,
  TOKFAI_STARTER_PLAN,
} from "@/lib/tokfai-api";

const PROFILE_COLUMNS = "id, email, credits_balance";

const QUICK_REFERENCE = [
  { label: "Base URL", value: TOKFAI_API_BASE_URL },
  { label: "API key format", value: TOKFAI_API_KEY_FORMAT },
  { label: "Starter", value: TOKFAI_STARTER_PLAN },
  { label: "Billing", value: TOKFAI_BILLING_POLICY },
] as const;

const ONBOARDING_STEPS = [
  {
    step: 1,
    title: "Create API key",
    body: `Generate a ${TOKFAI_API_KEY_FORMAT} key. The full secret is shown once at creation and can be copied again from the list.`,
    href: "/dashboard/api-keys",
    buttonLabel: "Create API key",
    icon: KeyRound,
  },
  {
    step: 2,
    title: "Try Chat Playground",
    body: "Send a chat completion with your API key and verify the response before integrating.",
    href: "/dashboard/playground",
    buttonLabel: "Open Chat Playground",
    icon: MessageSquare,
  },
  {
    step: 3,
    title: "Try Image Playground",
    body: "Test text-to-image and image-to-image with uploads, URLs, or prompt-only requests.",
    href: "/dashboard/image-playground",
    buttonLabel: "Open Image Playground",
    icon: ImageIcon,
  },
  {
    step: 4,
    title: "Review Usage",
    body: "Confirm chat and image requests appear with model, credits charged, and request ID.",
    href: "/dashboard/usage",
    buttonLabel: "View Usage",
    icon: Gauge,
  },
  {
    step: 5,
    title: "Top up Credits",
    body: `${TOKFAI_STARTER_PLAN}. ${TOKFAI_BILLING_POLICY}`,
    href: "/dashboard/credits",
    buttonLabel: "Top up Credits",
    icon: CreditCard,
  },
] as const;

export default async function DashboardOverviewPage() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?redirect=/dashboard");
  }

  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [profileRes, apiKeysRes, usageRes] = await Promise.all([
    supabase
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("api_keys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .is("revoked_at", null),
    supabase
      .from("usage_logs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", since24h),
  ]);

  const profile = (profileRes.data ?? null) as Pick<
    ProfileRow,
    "id" | "email" | "credits_balance"
  > | null;
  const profileMissing = !profileRes.error && !profile;
  const activeApiKeyCount = apiKeysRes.count ?? 0;
  const requestsLast24h = usageRes.count ?? 0;
  const stats = [
    {
      label: "Credits remaining",
      value: formatCredits(profile?.credits_balance ?? 0),
      sub: profileMissing
        ? "Profile not found yet; showing 0 credits."
        : "Top up to start calling the API.",
      href: "/dashboard/credits",
      icon: CreditCard,
    },
    {
      label: "Requests (last 24h)",
      value: formatInt(requestsLast24h),
      sub: requestsLast24h > 0 ? "Recent API traffic." : "No traffic yet.",
      href: "/dashboard/usage",
      icon: Gauge,
    },
    {
      label: "Active API keys",
      value: formatInt(activeApiKeyCount),
      sub:
        activeApiKeyCount > 0
          ? "Ready to use with the API."
          : "Create your first key.",
      href: "/dashboard/api-keys",
      icon: KeyRound,
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Welcome to Tokfai. Follow the steps below to create a key, test chat
            and image generation, review usage, and top up credits.
          </p>
        </div>
        <Badge variant="secondary">V1 preview</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Get started</CardTitle>
          <CardDescription>
            Complete this checklist to validate your account end-to-end.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {ONBOARDING_STEPS.map((item) => (
            <OnboardingStep key={item.step} {...item} />
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        {stats.map((stat) => {
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
          <CardTitle>Developer quick reference</CardTitle>
          <CardDescription>
            Swap your base URL and Authorization header — keep the rest of your
            OpenAI-compatible code unchanged.
          </CardDescription>
        </CardHeader>
        <CardContent className="divide-y rounded-lg border p-0">
          {QUICK_REFERENCE.map((row) => (
            <div
              key={row.label}
              className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="text-sm font-medium text-foreground">
                {row.label}
              </span>
              <code className="break-all font-mono text-sm text-muted-foreground sm:text-right">
                {row.value}
              </code>
            </div>
          ))}
          <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-foreground">Models</span>
            <Link
              href="/dashboard/models"
              className="font-mono text-sm text-primary underline-offset-4 hover:underline sm:text-right"
            >
              /dashboard/models
            </Link>
          </div>
          <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-foreground">
              Chat Playground
            </span>
            <Link
              href="/dashboard/playground"
              className="font-mono text-sm text-primary underline-offset-4 hover:underline sm:text-right"
            >
              /dashboard/playground
            </Link>
          </div>
          <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-foreground">
              Image Playground
            </span>
            <Link
              href="/dashboard/image-playground"
              className="font-mono text-sm text-primary underline-offset-4 hover:underline sm:text-right"
            >
              /dashboard/image-playground
            </Link>
          </div>
          <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-sm font-medium text-foreground">Docs</span>
            <Link
              href="/dashboard/docs"
              className="font-mono text-sm text-primary underline-offset-4 hover:underline sm:text-right"
            >
              /dashboard/docs
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function OnboardingStep({
  step,
  title,
  body,
  href,
  buttonLabel,
  icon: Icon,
}: {
  step: number;
  title: string;
  body: string;
  href: string;
  buttonLabel: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-md border bg-card p-4 sm:flex-row sm:items-start">
      <div className="flex items-start gap-4 sm:flex-1">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
          {step}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {title}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">{body}</p>
        </div>
      </div>
      <Button asChild size="sm" className="shrink-0 sm:mt-0.5">
        <Link href={href}>{buttonLabel}</Link>
      </Button>
    </div>
  );
}
