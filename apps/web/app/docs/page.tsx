import type { Metadata } from "next";

import { ConsumerDocsGuide } from "@/components/consumer-docs-guide";
import { PublicFooter } from "@/components/public-footer";
import { PublicHeader } from "@/components/public-header";

export const metadata: Metadata = {
  title: "Docs — 3-minute OpenAI-compatible API setup",
  description:
    "Tokfai integration docs: Base URL, API key, curl examples, Cherry Studio / Cursor. Self-serve packs for test and mid-scale use; high-frequency production needs a capacity review.",
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
