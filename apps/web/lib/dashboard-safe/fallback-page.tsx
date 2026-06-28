import Link from "next/link";

import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

import { chatCurlOneLineSafe, imageCurlOneLineSafe, modelsCurlOneLineSafe } from "./curl-one-line";

export type DashboardSafePageId =
  | "docs"
  | "integration-workbench"
  | "starter-templates"
  | "payload-builder"
  | "troubleshooting"
  | "playground"
  | "image-playground"
  | "models";

type PageConfig = {
  title: string;
  description: string;
  curl: string;
};

const PAGE_CONFIG: Record<DashboardSafePageId, PageConfig> = {
  docs: {
    title: "API integration handbook",
    description:
      "Dashboard docs tools are temporarily in safe mode. Use API Keys, the public docs, and one-line curls to integrate.",
    curl: chatCurlOneLineSafe(),
  },
  "integration-workbench": {
    title: "Integration Workbench",
    description:
      "The interactive workbench is temporarily unavailable in the dashboard. Create a key and verify with curl below.",
    curl: chatCurlOneLineSafe(),
  },
  "starter-templates": {
    title: "Starter templates",
    description:
      "Template builders are temporarily in safe mode. Copy the curl below or open API Keys to continue.",
    curl: chatCurlOneLineSafe(),
  },
  "payload-builder": {
    title: "Payload builder",
    description:
      "The payload builder is temporarily in safe mode. Test with curl or build payloads in your own client.",
    curl: chatCurlOneLineSafe(),
  },
  troubleshooting: {
    title: "Troubleshooting",
    description:
      "The troubleshooting center is temporarily in safe mode. Check Usage and Credits for request records.",
    curl: chatCurlOneLineSafe(),
  },
  playground: {
    title: "Playground",
    description:
      "Chat Playground is temporarily in safe mode. Send a test request with curl using your API key.",
    curl: chatCurlOneLineSafe(),
  },
  "image-playground": {
    title: "Image Playground",
    description:
      "Image Playground is temporarily in safe mode. Test image generation with curl using your API key.",
    curl: imageCurlOneLineSafe(),
  },
  models: {
    title: "Models",
    description:
      "The models catalog UI is temporarily in safe mode. List models via API or open public docs.",
    curl: modelsCurlOneLineSafe(),
  },
};

const linkClass =
  "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const primaryLinkClass = `${linkClass} bg-primary text-primary-foreground hover:bg-primary/90`;
const outlineLinkClass = `${linkClass} border border-input bg-background hover:bg-muted`;

/**
 * Server-safe dashboard fallback — no client hooks, i18n, or shared demo modules.
 */
export function DashboardSafeFallback({ page }: { page: DashboardSafePageId }) {
  const config = PAGE_CONFIG[page];
  const curl = config.curl;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {config.title}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{config.description}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Production safe mode (P825): advanced dashboard tools are temporarily
          degraded. The Tokfai API at api.tokfai.com remains fully available.
        </p>
      </div>

      <div className="rounded-lg border bg-card text-card-foreground shadow-none">
        <div className="flex flex-col gap-1.5 p-6 pb-3">
          <h2 className="text-base font-semibold leading-none">Quick start</h2>
          <p className="text-sm text-muted-foreground">
            Copy this one-line curl and replace{" "}
            <code className="font-mono text-xs">{TOKFAI_API_KEY_PLACEHOLDER}</code>{" "}
            with your key from API Keys.
          </p>
        </div>
        <div className="flex flex-col gap-4 p-6 pt-0">
          <pre className="max-h-48 overflow-x-auto rounded-md border bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap break-all">
            {curl}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/api-keys" className={primaryLinkClass}>
              API Keys
            </Link>
            <Link href="/dashboard/usage" className={outlineLinkClass}>
              Usage
            </Link>
            <Link href="/dashboard/credits" className={outlineLinkClass}>
              Credits
            </Link>
            <Link href="/dashboard/docs" className={outlineLinkClass}>
              Docs
            </Link>
            <Link href="/docs" className={outlineLinkClass}>
              Public docs
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
