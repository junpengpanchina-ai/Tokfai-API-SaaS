"use client";

import { CopyableSnippetField, CopyConfigAction } from "@/components/copyable-snippet-field";
import {
  isQuickStartKeyPlaceholder,
  quickStartChatCurlOneLine,
} from "@/lib/customer-quick-start-snippets";
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
  const chatCurl = quickStartChatCurlOneLine(apiKey);
  const keyIsPlaceholder = isQuickStartKeyPlaceholder(apiKey);

  return (
    <div className="flex flex-col gap-3">
      <CopyableSnippetField
        label={t("integration.chatApiCopyNowLabel")}
        value={chatCurl}
        copyId={`${idPrefix}-${CHAT_API_COPY_ID}`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyOneLineCurl")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      {keyIsPlaceholder ? (
        <p className="text-xs text-muted-foreground">{t("integration.placeholderKeyNote")}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("integration.chatApiLiveKeyNote")}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <CopyConfigAction
          id={`${idPrefix}-copy-chat-action`}
          value={chatCurl}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.copyOneLineChatCurl")}
          copiedLabel={t("integration.copied")}
        />
      </div>
    </div>
  );
}
