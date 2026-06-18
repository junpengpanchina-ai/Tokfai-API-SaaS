"use client";

import Link from "next/link";
import { Activity, Terminal } from "lucide-react";

import { CopyableSnippetField } from "@/components/copyable-snippet-field";
import { Button } from "@/components/ui/button";
import {
  buildTrafficGovernorSnippet,
  type TrafficGovernorSnippetId,
} from "@/lib/customer-traffic-governor-snippets";
import {
  BATCH_WORKER_GOVERNOR,
  IMAGE_GOVERNOR,
  REALTIME_CHAT_GOVERNOR,
} from "@/lib/customer-traffic-governor-policy";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";

const SNIPPET_META: Record<
  TrafficGovernorSnippetId,
  { titleKey: string; scenarioKey: string; concurrencyKey: string; endpoint: string }
> = {
  "node-traffic-governor": {
    titleKey: "integration.trafficGovernor.cardNodeChatTitle",
    scenarioKey: "integration.trafficGovernor.cardNodeChatScenario",
    concurrencyKey: "integration.trafficGovernor.cardNodeChatConcurrency",
    endpoint: REALTIME_CHAT_GOVERNOR.endpoint,
  },
  "node-image-governor": {
    titleKey: "integration.trafficGovernor.cardNodeImageTitle",
    scenarioKey: "integration.trafficGovernor.cardNodeImageScenario",
    concurrencyKey: "integration.trafficGovernor.cardNodeImageConcurrency",
    endpoint: IMAGE_GOVERNOR.endpoint,
  },
  "node-batch-worker": {
    titleKey: "integration.trafficGovernor.cardNodeBatchTitle",
    scenarioKey: "integration.trafficGovernor.cardNodeBatchScenario",
    concurrencyKey: "integration.trafficGovernor.cardNodeBatchConcurrency",
    endpoint: BATCH_WORKER_GOVERNOR.endpoint,
  },
  "python-traffic-governor": {
    titleKey: "integration.trafficGovernor.cardPythonChatTitle",
    scenarioKey: "integration.trafficGovernor.cardPythonChatScenario",
    concurrencyKey: "integration.trafficGovernor.cardPythonChatConcurrency",
    endpoint: REALTIME_CHAT_GOVERNOR.endpoint,
  },
  "python-batch-worker": {
    titleKey: "integration.trafficGovernor.cardPythonBatchTitle",
    scenarioKey: "integration.trafficGovernor.cardPythonBatchScenario",
    concurrencyKey: "integration.trafficGovernor.cardPythonBatchConcurrency",
    endpoint: BATCH_WORKER_GOVERNOR.endpoint,
  },
  "browser-key-caution": {
    titleKey: "integration.trafficGovernor.cardBrowserTitle",
    scenarioKey: "integration.trafficGovernor.cardBrowserScenario",
    concurrencyKey: "integration.trafficGovernor.cardBrowserConcurrency",
    endpoint: "—",
  },
};

type TrafficGovernorCopyPanelProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
  showTitle?: boolean;
  snippetIds?: TrafficGovernorSnippetId[];
};

export function TrafficGovernorCopyPanel({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "traffic-governor",
  showTitle = true,
  snippetIds = [
    "node-traffic-governor",
    "node-image-governor",
    "node-batch-worker",
    "python-traffic-governor",
    "python-batch-worker",
  ],
}: TrafficGovernorCopyPanelProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-4">
      {showTitle ? (
        <div>
          <p className="text-sm font-semibold text-foreground">
            {t("integration.trafficGovernor.panelTitle")}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("integration.trafficGovernor.panelNote")}
          </p>
        </div>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {snippetIds.map((snippetId) => {
          const meta = SNIPPET_META[snippetId];
          const snippet = buildTrafficGovernorSnippet(snippetId, apiKey);
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
                <li>{t(meta.concurrencyKey)}</li>
                <li>
                  {formatMessage(t("integration.trafficGovernor.endpointLabel"), {
                    endpoint: meta.endpoint,
                  })}
                </li>
                <li>{t("integration.trafficGovernor.requestIdVerify")}</li>
              </ul>
              <CopyableSnippetField
                label={t("integration.trafficGovernor.copyLabel")}
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
        <Link href="/dashboard/docs#traffic-governor">
          {t("integration.navTrafficGovernor")}
        </Link>
      </Button>
    </div>
  );
}

type ScaleSafelyPanelProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
};

const SCALE_SAFELY_CARDS: {
  id: string;
  titleKey: string;
  scenarioKey: string;
  concurrencyKey: string;
  endpoint: string;
  snippetId?: TrafficGovernorSnippetId;
  docsHash: string;
}[] = [
  {
    id: "chat-governor",
    titleKey: "integration.trafficGovernor.scaleChatTitle",
    scenarioKey: "integration.trafficGovernor.scaleChatScenario",
    concurrencyKey: "integration.trafficGovernor.scaleChatConcurrency",
    endpoint: REALTIME_CHAT_GOVERNOR.endpoint,
    snippetId: "node-traffic-governor",
    docsHash: "traffic-governor",
  },
  {
    id: "image-governor",
    titleKey: "integration.trafficGovernor.scaleImageTitle",
    scenarioKey: "integration.trafficGovernor.scaleImageScenario",
    concurrencyKey: "integration.trafficGovernor.scaleImageConcurrency",
    endpoint: IMAGE_GOVERNOR.endpoint,
    snippetId: "node-image-governor",
    docsHash: "client-side-concurrency",
  },
  {
    id: "batch-worker",
    titleKey: "integration.trafficGovernor.scaleBatchTitle",
    scenarioKey: "integration.trafficGovernor.scaleBatchScenario",
    concurrencyKey: "integration.trafficGovernor.scaleBatchConcurrency",
    endpoint: BATCH_WORKER_GOVERNOR.endpoint,
    snippetId: "node-batch-worker",
    docsHash: "batch-worker",
  },
  {
    id: "reconcile",
    titleKey: "integration.trafficGovernor.scaleReconcileTitle",
    scenarioKey: "integration.trafficGovernor.scaleReconcileScenario",
    concurrencyKey: "integration.trafficGovernor.scaleReconcileConcurrency",
    endpoint: "Usage / Credits",
    docsHash: "traffic-governor",
  },
];

export function ScaleSafelyPanel({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "scale-safely",
}: ScaleSafelyPanelProps) {
  const { t } = useI18n();

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {SCALE_SAFELY_CARDS.map((card) => (
        <div
          key={card.id}
          className="rounded-lg border-2 border-primary/20 bg-background/80 p-4"
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-foreground">
            {card.id === "reconcile" ? (
              <Activity className="h-4 w-4 shrink-0 text-primary" />
            ) : (
              <Terminal className="h-4 w-4 shrink-0 text-primary" />
            )}
            {t(card.titleKey)}
          </p>
          <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
            <li>{t(card.scenarioKey)}</li>
            <li>{t(card.concurrencyKey)}</li>
            <li>
              {formatMessage(t("integration.trafficGovernor.endpointLabel"), {
                endpoint: card.endpoint,
              })}
            </li>
            <li>{t("integration.trafficGovernor.requestIdVerify")}</li>
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            {card.snippetId ? (
              <CopyableSnippetField
                label={t("integration.trafficGovernor.copyLabel")}
                value={buildTrafficGovernorSnippet(card.snippetId, apiKey)}
                copyId={`${idPrefix}-${card.id}`}
                copiedId={copiedId}
                onCopy={onCopy}
                copyLabel={t("integration.copyConfig")}
                copiedLabel={t("integration.copied")}
                className="[&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all"
              />
            ) : null}
            <Button asChild size="sm" variant="outline">
              <Link href={`/dashboard/docs#${card.docsHash}`}>
                {t("integration.trafficGovernor.scaleDocsLink")}
              </Link>
            </Button>
            {card.id === "reconcile" ? (
              <>
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/usage">{t("integration.linkUsage")}</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link href="/dashboard/credits">{t("integration.linkCredits")}</Link>
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
