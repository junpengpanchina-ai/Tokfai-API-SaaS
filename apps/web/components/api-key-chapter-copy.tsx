"use client";

import { CopyableSnippetField, CopyConfigAction } from "@/components/copyable-snippet-field";
import {
  API_KEY_CHAPTER_COPY_IDS,
  buildApiKeyChapterSnippets,
  type ApiKeyChapterSnippets,
} from "@/lib/customer-api-key-chapter";
import { isQuickStartKeyPlaceholder } from "@/lib/customer-quick-start-snippets";
import { useI18n } from "@/lib/i18n/i18n-provider";

type ApiKeyChapterCopyPanelProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
  showKeyFormat?: boolean;
  variant?: "default" | "success-card";
};

export function ApiKeyChapterCopyPanel({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "api-key-chapter",
  showKeyFormat = true,
  variant = "default",
}: ApiKeyChapterCopyPanelProps) {
  const { t } = useI18n();
  const snippets = buildApiKeyChapterSnippets(apiKey);
  const keyIsPlaceholder = isQuickStartKeyPlaceholder(apiKey);
  const fieldClass =
    variant === "success-card"
      ? "[&_code]:border-emerald-200 [&_code]:bg-white dark:[&_code]:border-emerald-800 dark:[&_code]:bg-background"
      : undefined;
  const curlFieldClass =
    variant === "success-card"
      ? "[&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all [&_code]:border-emerald-200 [&_code]:bg-white dark:[&_code]:border-emerald-800 dark:[&_code]:bg-background"
      : "[&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all";

  return (
    <div className="flex flex-col gap-3">
      <CopyableSnippetField
        label={t("integration.authHeaderLabel")}
        value={snippets.authHeader}
        copyId={`${idPrefix}-${API_KEY_CHAPTER_COPY_IDS.authHeader}`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copy")}
        copiedLabel={t("integration.copied")}
        className={fieldClass}
      />
      {showKeyFormat ? (
        <CopyableSnippetField
          label={t("integration.apiKeyFormatLabel")}
          value={snippets.keyFormat}
          copyId={`${idPrefix}-${API_KEY_CHAPTER_COPY_IDS.keyFormat}`}
          copiedId={copiedId}
          onCopy={onCopy}
          copyLabel={t("integration.copy")}
          copiedLabel={t("integration.copied")}
          className={fieldClass}
        />
      ) : null}
      <CopyableSnippetField
        label={t("integration.apiKeyVerifyCurlLabel")}
        value={snippets.modelsVerifyCurl}
        copyId={`${idPrefix}-${API_KEY_CHAPTER_COPY_IDS.modelsVerify}`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyOneLineCurl")}
        copiedLabel={t("integration.copied")}
        className={curlFieldClass}
      />
      <CopyableSnippetField
        label={t("integration.apiKeyChatCurlLabel")}
        value={snippets.chatVerifyCurl}
        copyId={`${idPrefix}-${API_KEY_CHAPTER_COPY_IDS.chatVerify}`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyOneLineCurl")}
        copiedLabel={t("integration.copied")}
        className={curlFieldClass}
      />
      {keyIsPlaceholder ? (
        <p className="text-xs text-muted-foreground">{t("integration.placeholderKeyNote")}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("integration.apiKeyLiveKeyNote")}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <CopyConfigAction
          id={`${idPrefix}-copy-auth-action`}
          value={snippets.authHeader}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.copyAuthHeader")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-copy-models-action`}
          value={snippets.modelsVerifyCurl}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.copyOneLineModelsCurl")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-copy-chat-action`}
          value={snippets.chatVerifyCurl}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.copyOneLineChatCurl")}
          copiedLabel={t("integration.copied")}
        />
      </div>
    </div>
  );
}

export function getApiKeyChapterSnippets(apiKey: string): ApiKeyChapterSnippets {
  return buildApiKeyChapterSnippets(apiKey);
}
