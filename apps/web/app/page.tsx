import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { HomeHero } from "@/components/home-hero";
import { HomeScenarios } from "@/components/home-scenarios";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";
import {
  TOKFAI_API_BASE_URL,
  TOKFAI_API_KEY_FORMAT,
  TOKFAI_API_KEY_PLACEHOLDER,
  TOKFAI_BILLING_POLICY,
  TOKFAI_PLAYGROUND_POLICY,
  TOKFAI_PRODUCT_TAGLINE,
  TOKFAI_STARTER_PLAN,
} from "@/lib/tokfai-api";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Tokfai — OpenAI-compatible image & chat API",
  description: TOKFAI_PRODUCT_TAGLINE,
};

const STEPS = [
  {
    step: 1,
    title: "Sign in",
    body: "Create a Tokfai account or log in with your existing credentials.",
  },
  {
    step: 2,
    title: "Buy credits",
    body: `${TOKFAI_STARTER_PLAN} — prepaid balance powers every API call.`,
  },
  {
    step: 3,
    title: "Create API key",
    body: `Issue a ${TOKFAI_API_KEY_FORMAT} key from the dashboard and store it securely.`,
  },
  {
    step: 4,
    title: "Call the API",
    body: `Point OpenAI SDK, Cursor, Cherry Studio, or your app at ${TOKFAI_API_BASE_URL}. Test chat in Chat Playground and images in Image Playground.`,
  },
  {
    step: 5,
    title: "Monitor usage",
    body: "Watch requests, credits charged, and ledger entries update in real time.",
  },
];

const DEV_SNIPPET = [
  { label: "Base URL", value: TOKFAI_API_BASE_URL },
  { label: "API key format", value: TOKFAI_API_KEY_FORMAT },
  { label: "Starter", value: TOKFAI_STARTER_PLAN },
  { label: "Billing", value: TOKFAI_BILLING_POLICY },
  { label: "Playground", value: TOKFAI_PLAYGROUND_POLICY },
  {
    label: "Authorization example",
    value: `Bearer ${TOKFAI_API_KEY_PLACEHOLDER}`,
  },
] as const;

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />

      <main className="flex-1">
        <HomeHero />

        <HomeScenarios />

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
                <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <span className="text-sm font-medium text-foreground">
                    Models
                  </span>
                  <Link
                    href="/dashboard/models"
                    className="font-mono text-sm text-primary underline-offset-4 hover:underline sm:text-right"
                  >
                    /dashboard/models
                  </Link>
                </div>
                <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
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
                <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
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
                <div className="flex flex-col gap-1 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                  <span className="text-sm font-medium text-foreground">
                    Image API docs
                  </span>
                  <Link
                    href="/docs"
                    className="font-mono text-sm text-primary underline-offset-4 hover:underline sm:text-right"
                  >
                    POST /v1/images/generations
                  </Link>
                </div>
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

      <PublicFooter />
    </div>
  );
}
