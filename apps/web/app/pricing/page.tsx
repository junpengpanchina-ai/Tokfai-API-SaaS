import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Code2, Gauge, ImageIcon, MessageSquare, Wallet } from "lucide-react";

import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import {
  TOKFAI_API_BASE_URL,
  TOKFAI_API_KEY_FORMAT,
  TOKFAI_BILLING_POLICY,
  TOKFAI_PLAYGROUND_POLICY,
  TOKFAI_PRODUCT_TAGLINE,
  TOKFAI_STARTER_PLAN,
} from "@/lib/tokfai-api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Pricing",
  description: TOKFAI_PRODUCT_TAGLINE,
};

const PLANS = [
  {
    name: "Starter",
    price: "¥29",
    credits: "10,000 credits",
    description: "For testing and personal use",
    cta: { label: "Get Starter", href: "/dashboard/credits", comingSoon: false },
  },
  {
    name: "Pro",
    price: "¥99",
    credits: "50,000 credits",
    description: "For builders and small apps",
    cta: { label: "Coming soon", comingSoon: true },
    highlight: true,
  },
  {
    name: "Business",
    price: "¥299",
    credits: "200,000 credits",
    description: "For teams and higher usage",
    cta: { label: "Coming soon", comingSoon: true },
  },
] as const;

const USAGE_POINTS = [
  {
    id: "billing-policy",
    icon: Gauge,
    text: TOKFAI_BILLING_POLICY,
  },
  {
    id: "chat-billing",
    icon: MessageSquare,
    text: "Chat calls are charged by token usage (input and output tokens).",
  },
  {
    id: "image-billing",
    icon: ImageIcon,
    text: "Image calls are charged per successful generation. Failed calls are not charged.",
  },
  {
    id: "starter-credits",
    icon: Wallet,
    text: `${TOKFAI_STARTER_PLAN} and can be used for Chat and Image testing.`,
  },
  {
    id: "model-cost",
    icon: Wallet,
    text: "Actual cost depends on model and request size.",
  },
  {
    id: "usage-dashboard",
    icon: ArrowRight,
    text: (
      <>
        You can monitor all usage in{" "}
        <Link
          href="/dashboard/usage"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          /dashboard/usage
        </Link>
        .
      </>
    ),
  },
  {
    id: "credits-ledger",
    icon: Code2,
    text: (
      <>
        Ledger is visible in{" "}
        <Link
          href="/dashboard/credits"
          className="font-medium text-foreground underline-offset-4 hover:underline"
        >
          /dashboard/credits
        </Link>
        .
      </>
    ),
  },
];

const DEV_ITEMS = [
  { label: "Base URL", value: TOKFAI_API_BASE_URL },
  { label: "API key format", value: TOKFAI_API_KEY_FORMAT },
  { label: "Starter", value: TOKFAI_STARTER_PLAN },
  { label: "Billing", value: TOKFAI_BILLING_POLICY },
  { label: "Playground", value: TOKFAI_PLAYGROUND_POLICY },
  {
    label: "Models",
    value: "/dashboard/models",
    href: "/dashboard/models",
  },
  {
    label: "Chat Playground",
    value: "/dashboard/playground",
    href: "/dashboard/playground",
  },
  {
    label: "Image Playground",
    value: "/dashboard/image-playground",
    href: "/dashboard/image-playground",
  },
  {
    label: "API Keys",
    value: "/dashboard/api-keys",
    href: "/dashboard/api-keys",
  },
  { label: "Docs", value: "/dashboard/docs", href: "/dashboard/docs" },
] as const;

export default function PricingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />

      <main className="flex-1">
        <section className="container py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl">
              OpenAI-compatible image &amp; chat API
            </h1>
            <p className="mx-auto mt-4 max-w-2xl text-balance text-lg text-muted-foreground">
              One API for chat, image, and AI apps. Use Tokfai with Cursor,
              Cherry Studio, OpenAI SDK, or your own app. Video models are
              coming soon.
            </p>
          </div>

          <div className="mx-auto mt-16 grid max-w-5xl gap-6 md:grid-cols-3">
            {PLANS.map((plan) => (
              <Card
                key={plan.name}
                className={
                  "highlight" in plan && plan.highlight
                    ? "border-primary shadow-md ring-1 ring-primary/20"
                    : ""
                }
              >
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>{plan.description}</CardDescription>
                  <div className="pt-4">
                    <div className="text-3xl font-semibold tracking-tight">
                      {plan.price}
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {plan.credits}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {plan.cta.comingSoon ? (
                    <Button className="w-full" disabled variant="outline">
                      {plan.cta.label}
                    </Button>
                  ) : (
                    <Button asChild className="w-full">
                      <Link href={plan.cta.href}>{plan.cta.label}</Link>
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="container py-16 md:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-semibold tracking-tight">
                Usage-based billing
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Prepaid credits power every API call. You only pay for what you
                use.
              </p>
            </div>
            <ul className="mx-auto mt-10 grid max-w-2xl gap-4">
              {USAGE_POINTS.map((point) => {
                const Icon = point.icon;
                return (
                  <li
                    key={point.id}
                    className="flex items-start gap-3 rounded-lg border bg-background px-4 py-3 text-sm text-muted-foreground"
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span>{point.text}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>

        <section className="container py-16 md:py-20">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-semibold tracking-tight">
              For developers
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Point any OpenAI-compatible client at Tokfai and start calling
              models with your API key.
            </p>
            <Card className="mt-8">
              <CardContent className="divide-y p-0">
                {DEV_ITEMS.map((item) => (
                  <div
                    key={item.label}
                    className="flex flex-col gap-1 px-6 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {item.label}
                    </span>
                    {"href" in item && item.href ? (
                      <Link
                        href={item.href}
                        className="break-all font-mono text-sm text-primary underline-offset-4 hover:underline sm:text-right"
                      >
                        {item.value}
                      </Link>
                    ) : (
                      <code className="break-all font-mono text-sm text-muted-foreground sm:text-right">
                        {item.value}
                      </code>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
