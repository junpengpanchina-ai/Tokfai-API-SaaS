import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  FlaskConical,
  KeyRound,
  Sparkles,
  Wallet,
} from "lucide-react";

import { PublicHeader } from "@/components/public-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Tokfai — OpenAI-compatible image & chat API",
  description:
    "One API for chat, image, and AI apps. Prepaid credits, API keys, usage logs, and OpenAI SDK compatibility.",
};

const FEATURES = [
  {
    icon: Sparkles,
    title: "OpenAI-compatible API",
    body: "Drop in your existing OpenAI client — same endpoints and request shapes at api.tokfai.com.",
  },
  {
    icon: Wallet,
    title: "Prepaid credits billing",
    body: "Buy credits upfront, spend per request. No surprise invoices or seat licenses.",
  },
  {
    icon: KeyRound,
    title: "API key management",
    body: "Create, label, and revoke keys from your dashboard whenever you need to rotate secrets.",
  },
  {
    icon: BarChart3,
    title: "Usage logs and ledger",
    body: "Every call is recorded. Track token usage and credit balance in one place.",
  },
  {
    icon: FlaskConical,
    title: "Playground testing",
    body: "Try models in the browser before you wire them into production code.",
  },
  {
    icon: BookOpen,
    title: "Developer docs",
    body: "Quick-start guides, endpoint reference, and examples for chat and image APIs.",
  },
];

const STEPS = [
  { step: 1, title: "Sign in", body: "Create a Tokfai account or log in with your existing credentials." },
  { step: 2, title: "Buy credits", body: "Top up from the credits page — prepaid balance powers every API call." },
  { step: 3, title: "Create API key", body: "Issue a sk-tokfai_ key from the dashboard and store it securely." },
  { step: 4, title: "Call /v1/chat/completions", body: "Point OpenAI SDK, Cursor, Cherry Studio, or your app at api.tokfai.com." },
  { step: 5, title: "Monitor usage", body: "Watch requests, token counts, and ledger entries update in real time." },
];

const DEV_SNIPPET = [
  { label: "Base URL", value: "https://api.tokfai.com/v1" },
  { label: "Endpoint", value: "POST /chat/completions" },
  { label: "Authorization", value: "Bearer sk-tokfai_xxx" },
] as const;

const FOOTER_LINKS = [
  { href: "/pricing", label: "Pricing" },
  { href: "/dashboard/docs", label: "Docs" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/dashboard/docs", label: "API reference" },
] as const;

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />

      <main className="flex-1">
        <section className="container py-20 md:py-28">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              Tokfai
            </p>
            <h1 className="mt-3 text-balance text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
              OpenAI-compatible image &amp; chat API
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
              One API for chat, image, and AI apps. Works with OpenAI SDK,
              Cursor, Cherry Studio, and your own products.
            </p>
            <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <Button asChild size="lg" className="w-full sm:w-auto">
                <Link href="/dashboard/credits">
                  Start with credits
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <Link href="/pricing">View pricing</Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="w-full sm:w-auto">
                <Link href="/dashboard/docs">Read docs</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="container pb-20 md:pb-28">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title}>
                  <CardHeader>
                    <div className="mb-3 grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle className="text-base">{feature.title}</CardTitle>
                    <CardDescription>{feature.body}</CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="border-t bg-muted/30">
          <div className="container py-16 md:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-2xl font-semibold tracking-tight">
                How it works
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                From sign-up to your first API call in five steps.
              </p>
            </div>
            <ol className="mx-auto mt-10 grid max-w-3xl gap-4">
              {STEPS.map((item) => (
                <li
                  key={item.step}
                  className="flex gap-4 rounded-lg border bg-background px-5 py-4"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
                    {item.step}
                  </span>
                  <div className="min-w-0 text-left">
                    <p className="font-medium">{item.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.body}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="container py-16 md:py-20">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-2xl font-semibold tracking-tight">
              Developer quick reference
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Swap your base URL and Authorization header — keep the rest of
              your OpenAI-compatible code unchanged.
            </p>
            <Card className="mt-8">
              <CardContent className="divide-y p-0">
                {DEV_SNIPPET.map((row) => (
                  <div
                    key={row.label}
                    className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
                  >
                    <span className="text-sm font-medium text-foreground">
                      {row.label}
                    </span>
                    <code className="break-all font-mono text-sm text-muted-foreground sm:text-right">
                      {row.value}
                    </code>
                  </div>
                ))}
              </CardContent>
            </Card>
            <div className="mt-6 flex justify-center">
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard/docs">
                  Full API reference
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="container flex flex-col gap-4 py-6 text-xs text-muted-foreground sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:py-0">
          <span>© {new Date().getFullYear()} Tokfai</span>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="hover:text-foreground"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
