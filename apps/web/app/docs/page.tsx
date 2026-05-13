import Link from "next/link";

import { PublicHeader } from "@/components/public-header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const SECTIONS = [
  {
    title: "Quickstart",
    body: "Get a key, point your OpenAI client at api.tokfai.com, send your first request.",
    href: "#quickstart",
  },
  {
    title: "Authentication",
    body: "Use Bearer tokens. Every request must include `Authorization: Bearer sk-tokfai-...`.",
    href: "#authentication",
  },
  {
    title: "Chat completions",
    body: "POST /v1/chat/completions. Fully OpenAI-compatible request/response shape.",
    href: "#chat",
  },
  {
    title: "Images",
    body: "POST /v1/images/generations. Same parameters as the OpenAI image API.",
    href: "#images",
  },
];

const CURL = `curl https://api.tokfai.com/v1/chat/completions \\
  -H "Authorization: Bearer $TOKFAI_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{ "role": "user", "content": "Hi" }]
  }'`;

export default function DocsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />

      <main className="container flex-1 py-16">
        <div className="mx-auto max-w-4xl">
          <h1 className="text-4xl font-semibold tracking-tight">
            Documentation
          </h1>
          <p className="mt-3 text-muted-foreground">
            Tokfai is a thin, OpenAI-compatible proxy. If your code already
            works with the OpenAI SDK, it works here — just change the base URL.
          </p>

          <div className="mt-12 grid gap-4 md:grid-cols-2">
            {SECTIONS.map((section) => (
              <Card key={section.title}>
                <CardHeader>
                  <CardTitle>
                    <Link
                      href={section.href}
                      className="hover:underline underline-offset-4"
                    >
                      {section.title}
                    </Link>
                  </CardTitle>
                  <CardDescription>{section.body}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>

          <section id="quickstart" className="mt-16 space-y-4">
            <h2 className="text-2xl font-semibold tracking-tight">
              Quickstart
            </h2>
            <ol className="ml-5 list-decimal space-y-2 text-sm text-muted-foreground">
              <li>
                Sign up at <Link href="/signup" className="underline">/signup</Link>.
              </li>
              <li>
                Create a key under{" "}
                <Link href="/dashboard/api-keys" className="underline">
                  Dashboard → API Keys
                </Link>
                .
              </li>
              <li>Export it as <code>TOKFAI_API_KEY</code>.</li>
              <li>Make a request:</li>
            </ol>
            <pre className="overflow-x-auto rounded-lg border bg-muted p-6 text-sm leading-relaxed">
              <code>{CURL}</code>
            </pre>
          </section>

          <Card className="mt-16 border-dashed">
            <CardContent className="pt-6 text-sm text-muted-foreground">
              Full reference is being written. For now, anything documented for
              OpenAI&apos;s <code>/v1/chat/completions</code> and{" "}
              <code>/v1/images/generations</code> works against Tokfai.
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
