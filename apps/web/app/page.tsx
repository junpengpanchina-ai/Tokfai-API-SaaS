import Link from "next/link";
import { ArrowRight, Image as ImageIcon, Sparkles, Zap } from "lucide-react";

import { PublicHeader } from "@/components/public-header";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const FEATURES = [
  {
    icon: Sparkles,
    title: "OpenAI-compatible",
    body: "Point any existing OpenAI client at api.tokfai.com — same endpoints, same request shapes.",
  },
  {
    icon: ImageIcon,
    title: "Image + chat in one API",
    body: "/v1/chat/completions and /v1/images/generations behind one key, one bill, one dashboard.",
  },
  {
    icon: Zap,
    title: "Pay per call",
    body: "Top up credits, watch them burn in real time. No subscriptions, no minimums.",
  },
];

const CODE_SAMPLE = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.TOKFAI_API_KEY,
  baseURL: "https://api.tokfai.com/v1",
});

const res = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "Hello!" }],
});`;

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />

      <main className="flex-1">
        <section className="container py-24 md:py-32">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-muted px-3 py-1 text-xs">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-muted-foreground">
                api.tokfai.com is live
              </span>
            </div>
            <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-6xl">
              One API key for chat and image generation.
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-balance text-lg text-muted-foreground">
              A drop-in OpenAI-compatible endpoint. Bring your existing code —
              swap the base URL, pay only for what you call.
            </p>
            <div className="mt-10 flex items-center justify-center gap-3">
              <Button asChild size="lg">
                <Link href="/signup">
                  Get an API key
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/docs">Read the docs</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="container pb-24">
          <div className="grid gap-6 md:grid-cols-3">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <Card key={feature.title}>
                  <CardHeader>
                    <div className="mb-3 grid h-9 w-9 place-items-center rounded-md bg-primary/10 text-primary">
                      <Icon className="h-5 w-5" />
                    </div>
                    <CardTitle>{feature.title}</CardTitle>
                    <CardDescription>{feature.body}</CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </section>

        <section className="container pb-24">
          <div className="mx-auto max-w-4xl">
            <div className="mb-6 flex items-end justify-between">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">
                  Drop-in compatible
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Works with the official OpenAI SDK out of the box.
                </p>
              </div>
              <Button asChild variant="ghost" size="sm">
                <Link href="/docs">More examples →</Link>
              </Button>
            </div>
            <pre className="overflow-x-auto rounded-lg border bg-muted p-6 text-sm leading-relaxed">
              <code>{CODE_SAMPLE}</code>
            </pre>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="container flex h-16 items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Tokfai</span>
          <div className="flex items-center gap-4">
            <Link href="/pricing" className="hover:text-foreground">
              Pricing
            </Link>
            <Link href="/docs" className="hover:text-foreground">
              Docs
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
