import type { Metadata } from "next";

import { ConsumerDocsGuide } from "@/components/consumer-docs-guide";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";

export const metadata: Metadata = {
  title: "Docs — Tokfai integration path",
  description:
    "Sign up → top up ¥99 → create a key → set Base URL → call /v1/models → run chat → check Usage / Credits. Cherry Studio / Cursor / OpenAI SDK. Early public beta.",
};

export default function DocsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />

      <main className="container min-w-0 flex-1 overflow-x-hidden py-16">
        <div className="mx-auto max-w-5xl">
          <ConsumerDocsGuide showDashboardLinks={false} />
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
