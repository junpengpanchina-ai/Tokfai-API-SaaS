"use client";

import { CopyableSnippetField, CopyConfigAction } from "@/components/copyable-snippet-field";
import { OneLineCurlCopyFields } from "@/components/one-line-curl-copy-fields";
import { chatCurlOneLine, chatCurlPowerShellOneLine } from "@/lib/customer-curl-oneline";
import { isQuickStartKeyPlaceholder } from "@/lib/customer-quick-start-snippets";
import { useI18n } from "@/lib/i18n/i18n-provider";

export const CHAT_API_COPY_ID = "chat-api-one-line";

type ChatApiChapterCopyPanelProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
};

export function ChatApiChapterCopyPanel({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "chat-api-chapter",
}: ChatApiChapterCopyPanelProps) {
  const { t } = useI18n();
  const chatCurl = chatCurlOneLine(apiKey);
  const psCurl = chatCurlPowerShellOneLine(apiKey);

  return (
    <div className="flex flex-col gap-3">
      <OneLineCurlCopyFields
        apiKey={apiKey}
        bashLabel={t("integration.chatApiCopyNowLabel")}
        bashCurl={chatCurl}
        powershellCurl={psCurl}
        copiedId={copiedId}
        onCopy={onCopy}
        idPrefix={`${idPrefix}-chat`}
        liveKeyNoteKey="integration.chatApiLiveKeyNote"
      />
      <p className="text-xs text-muted-foreground">{t("integration.oneLineCurlPasteNote")}</p>
      <p className="text-xs text-muted-foreground">{t("integration.oneLineCurlSuccessFields")}</p>
      <p className="text-xs text-muted-foreground">{t("integration.oneLineCurlReconcileNote")}</p>
    </div>
  );
}
