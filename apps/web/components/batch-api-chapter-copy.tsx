"use client";

import { CopyableSnippetField, CopyConfigAction } from "@/components/copyable-snippet-field";
import {
  buildBatchCreateCurlOneLine,
  buildBatchPollCurlOneLine,
  BATCH_POLL_PLACEHOLDER_ID,
} from "@/lib/customer-batch-api-chapter";
import { isQuickStartKeyPlaceholder } from "@/lib/customer-quick-start-snippets";
import { useI18n } from "@/lib/i18n/i18n-provider";

export const BATCH_CREATE_COPY_ID = "batch-create-one-line";
export const BATCH_POLL_COPY_ID = "batch-poll-one-line";

type BatchApiChapterCopyPanelProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
};

export function BatchApiChapterCopyPanel({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "batch-api-chapter",
}: BatchApiChapterCopyPanelProps) {
  const { t } = useI18n();
  const createCurl = buildBatchCreateCurlOneLine(apiKey);
  const pollCurl = buildBatchPollCurlOneLine(apiKey, BATCH_POLL_PLACEHOLDER_ID);
  const keyIsPlaceholder = isQuickStartKeyPlaceholder(apiKey);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3">
        <CopyableSnippetField
          label={t("integration.batchApiCreateCopyLabel")}
          value={createCurl}
          copyId={`${idPrefix}-${BATCH_CREATE_COPY_ID}`}
          copiedId={copiedId}
          onCopy={onCopy}
          copyLabel={t("integration.copyOneLineCurl")}
          copiedLabel={t("integration.copied")}
          className="[&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all"
        />
        <CopyConfigAction
          id={`${idPrefix}-copy-create-action`}
          value={createCurl}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.copyOneLineBatchCreateCurl")}
          copiedLabel={t("integration.copied")}
        />
      </div>

      <div className="flex flex-col gap-3 border-t pt-3">
        <p className="text-xs text-muted-foreground">
          {t("integration.batchApiPollHint")}
        </p>
        <CopyableSnippetField
          label={t("integration.batchApiPollCopyLabel")}
          value={pollCurl}
          copyId={`${idPrefix}-${BATCH_POLL_COPY_ID}`}
          copiedId={copiedId}
          onCopy={onCopy}
          copyLabel={t("integration.copyOneLineCurl")}
          copiedLabel={t("integration.copied")}
          className="[&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all"
        />
        <CopyConfigAction
          id={`${idPrefix}-copy-poll-action`}
          value={pollCurl}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.copyOneLineBatchPollCurl")}
          copiedLabel={t("integration.copied")}
        />
      </div>

      {keyIsPlaceholder ? (
        <p className="text-xs text-muted-foreground">{t("integration.placeholderKeyNote")}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("integration.batchApiLiveKeyNote")}</p>
      )}
    </div>
  );
}
