"use client";

import Link from "next/link";
import { Terminal } from "lucide-react";

import { CopyableSnippetField } from "@/components/copyable-snippet-field";
import { Button } from "@/components/ui/button";
import {
  buildSafeClientSnippet,
  SAFE_CLIENT_SNIPPET_IDS,
  type SafeClientSnippetId,
} from "@/lib/customer-safe-client-snippets";
import { DEFAULT_MAX_ATTEMPTS } from "@/lib/customer-retry-policy";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";

const SNIPPET_META: Record<
  SafeClientSnippetId,
  { titleKey: string; scenarioKey: string; requestIdKey: string }
> = {
  "bash-safe-retry": {
    titleKey: "integration.safeRetry.cardBashTitle",
    scenarioKey: "integration.safeRetry.cardBashScenario",
    requestIdKey: "integration.safeRetry.cardBashRequestId",
  },
  "powershell-safe-retry": {
    titleKey: "integration.safeRetry.cardPowerShellTitle",
    scenarioKey: "integration.safeRetry.cardPowerShellScenario",
    requestIdKey: "integration.safeRetry.cardPowerShellRequestId",
  },
  "node-safe-retry": {
    titleKey: "integration.safeRetry.cardNodeTitle",
    scenarioKey: "integration.safeRetry.cardNodeScenario",
    requestIdKey: "integration.safeRetry.cardNodeRequestId",
  },
  "python-safe-retry": {
    titleKey: "integration.safeRetry.cardPythonTitle",
    scenarioKey: "integration.safeRetry.cardPythonScenario",
    requestIdKey: "integration.safeRetry.cardPythonRequestId",
  },
  "node-safe-batch-poll": {
    titleKey: "integration.safeRetry.cardBatchTitle",
    scenarioKey: "integration.safeRetry.cardBatchScenario",
    requestIdKey: "integration.safeRetry.cardBatchRequestId",
  },
};

type SafeRetryCopyPanelProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
  showTitle?: boolean;
  snippetIds?: SafeClientSnippetId[];
};

export function SafeRetryCopyPanel({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "safe-retry",
  showTitle = true,
  snippetIds = ["bash-safe-retry", "powershell-safe-retry", "node-safe-retry", "python-safe-retry"],
}: SafeRetryCopyPanelProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-4">
      {showTitle ? (
        <div>
          <p className="text-sm font-semibold text-foreground">
            {t("integration.safeRetry.panelTitle")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("integration.safeRetry.panelNote")}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatMessage(t("integration.safeRetry.maxAttemptsNote"), {
              count: DEFAULT_MAX_ATTEMPTS,
            })}
          </p>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {snippetIds.map((snippetId) => {
          const meta = SNIPPET_META[snippetId];
          const snippet = buildSafeClientSnippet(snippetId, apiKey);
          return (
            <div
              key={snippetId}
              className="rounded-lg border-2 border-primary/20 bg-background/80 p-4"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
                <Terminal className="h-4 w-4 shrink-0 text-primary" />
                {t(meta.titleKey)}
              </p>
              <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                <li>{t(meta.scenarioKey)}</li>
                <li>
                  {formatMessage(t("integration.safeRetry.maxAttemptsLabel"), {
                    count: DEFAULT_MAX_ATTEMPTS,
                  })}
                </li>
                <li>{t(meta.requestIdKey)}</li>
              </ul>
              <CopyableSnippetField
                label={t("integration.safeRetry.copyLabel")}
                value={snippet}
                copyId={`${idPrefix}-${snippetId}`}
                copiedId={copiedId}
                onCopy={onCopy}
                copyLabel={t("integration.copyConfig")}
                copiedLabel={t("integration.copied")}
                className="mt-3 [&_code]:max-h-48 [&_code]:whitespace-pre-wrap [&_code]:break-all"
              />
            </div>
          );
        })}
      </div>
      <Button asChild size="sm" variant="outline">
        <Link href="/dashboard/docs#retry-and-backoff">
          {t("integration.navRetryBackoff")}
        </Link>
      </Button>
    </div>
  );
}

export { SAFE_CLIENT_SNIPPET_IDS };
