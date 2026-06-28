"use client";

import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

import { chatCurlOneLineSafe } from "./curl-one-line";
import {
  DashboardCopyConfigAction,
  useDashboardCopyToClipboard,
} from "./copy-block";
import { useDashboardLabels } from "./use-dashboard-labels";
import { useDashboardApiKey } from "./use-dashboard-api-key";

export type DashboardSafePageId =
  | "docs"
  | "integration-workbench"
  | "starter-templates"
  | "payload-builder"
  | "troubleshooting";

const PAGE_CONFIG: Record<
  DashboardSafePageId,
  { titleKey: string; subtitleKey: string }
> = {
  docs: {
    titleKey: "nav.docs",
    subtitleKey: "dashboard.firstRun.desc",
  },
  "integration-workbench": {
    titleKey: "integration.workbenchTitle",
    subtitleKey: "integration.commandCenter.subtitle",
  },
  "starter-templates": {
    titleKey: "integration.starterTemplates.title",
    subtitleKey: "integration.starterTemplates.subtitle",
  },
  "payload-builder": {
    titleKey: "integration.payloadBuilder.title",
    subtitleKey: "integration.payloadBuilder.subtitle",
  },
  troubleshooting: {
    titleKey: "integration.troubleshooting.title",
    subtitleKey: "integration.troubleshooting.subtitle",
  },
};

export function DashboardSafeFallback({ page }: { page: DashboardSafePageId }) {
  const { t } = useDashboardLabels();
  const apiKey = useDashboardApiKey();
  const { copiedId, copyText } = useDashboardCopyToClipboard();
  const config = PAGE_CONFIG[page];
  const curl = chatCurlOneLineSafe(apiKey);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t(config.titleKey)}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(config.subtitleKey)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Use API Keys to create a key, copy the one-line curl, and reconcile in
          Usage and Credits.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quick start</CardTitle>
          <CardDescription>
            Copy a one-line curl and test your API key.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DashboardCopyConfigAction
            id={`safe-fallback-curl-${page}`}
            value={curl}
            copiedId={copiedId}
            onCopy={copyText}
            label={t("dashboard.apiKeys.copyOneLineChatCurl")}
            copiedLabel={t("dashboard.apiKeys.copied")}
            primary
          />
          <pre className="max-h-48 overflow-x-auto rounded-md border bg-muted/30 p-3 font-mono text-xs whitespace-pre-wrap break-all">
            {curl.replace(apiKey, TOKFAI_API_KEY_PLACEHOLDER)}
          </pre>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="default">
              <Link href="/dashboard/api-keys">{t("nav.apiKeys")}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/playground">{t("nav.playground")}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/usage">{t("nav.usage")}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard/credits">{t("nav.credits")}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href="/docs">Public docs</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
