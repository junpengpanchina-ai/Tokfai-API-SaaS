"use client";

import { OneLineCurlCopyFields } from "@/components/one-line-curl-copy-fields";
import {
  buildBatchCreateCurlOneLine,
  buildBatchCreateCurlPowerShellOneLine,
  buildBatchPollCurlOneLine,
  buildBatchPollCurlPowerShellOneLine,
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
      <OneLineCurlCopyFields
        apiKey={apiKey}
        bashLabel={t("integration.batchApiCreateCopyLabel")}
        bashCurl={createCurl}
        powershellCurl={buildBatchCreateCurlPowerShellOneLine(apiKey)}
        copiedId={copiedId}
        onCopy={onCopy}
        idPrefix={`${idPrefix}-create`}
        showKeyNote={false}
      />
      <div className="flex flex-col gap-3 border-t pt-3">
        <p className="text-xs text-muted-foreground">{t("integration.batchApiPollHint")}</p>
        <OneLineCurlCopyFields
          apiKey={apiKey}
          bashLabel={t("integration.batchApiPollCopyLabel")}
          bashCurl={pollCurl}
          powershellCurl={buildBatchPollCurlPowerShellOneLine(apiKey)}
          copiedId={copiedId}
          onCopy={onCopy}
          idPrefix={`${idPrefix}-poll`}
          showKeyNote={false}
        />
      </div>
      {keyIsPlaceholder ? (
        <p className="text-xs text-muted-foreground">{t("integration.placeholderKeyNote")}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("integration.batchApiLiveKeyNote")}</p>
      )}
      <p className="text-xs text-muted-foreground">{t("integration.oneLineCurlPasteNote")}</p>
      <p className="text-xs text-muted-foreground">{t("integration.oneLineCurlBatchSuccessFields")}</p>
      <p className="text-xs text-muted-foreground">{t("integration.oneLineCurlReconcileNote")}</p>
    </div>
  );
}
