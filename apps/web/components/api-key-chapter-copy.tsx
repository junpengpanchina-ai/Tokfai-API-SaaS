"use client";

import { CopyableSnippetField, CopyConfigAction } from "@/components/copyable-snippet-field";
import { OneLineCurlCopyFields } from "@/components/one-line-curl-copy-fields";
import {
  API_KEY_CHAPTER_COPY_IDS,
  buildApiKeyChapterSnippets,
  type ApiKeyChapterSnippets,
} from "@/lib/customer-api-key-chapter";
import {
  chatCurlPowerShellOneLine,
  modelsCurlPowerShellOneLine,
} from "@/lib/customer-curl-oneline";
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

  return (
    <div className="flex flex-col gap-4">
      <OneLineCurlCopyFields
        apiKey={apiKey}
        bashLabel={t("integration.apiKeyChatCurlLabel")}
        bashCurl={snippets.chatVerifyCurl}
        powershellCurl={chatCurlPowerShellOneLine(apiKey)}
        copiedId={copiedId}
        onCopy={onCopy}
        idPrefix={`${idPrefix}-chat`}
        liveKeyNoteKey="integration.apiKeyLiveKeyNote"
      />
      <OneLineCurlCopyFields
        apiKey={apiKey}
        bashLabel={t("integration.apiKeyVerifyCurlLabel")}
        bashCurl={snippets.modelsVerifyCurl}
        powershellCurl={modelsCurlPowerShellOneLine(apiKey)}
        copiedId={copiedId}
        onCopy={onCopy}
        idPrefix={`${idPrefix}-models`}
        showKeyNote={false}
      />
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
      {keyIsPlaceholder ? (
        <p className="text-xs text-muted-foreground">{t("integration.placeholderKeyNote")}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("integration.apiKeyLiveKeyNote")}</p>
      )}
      <p className="text-xs text-muted-foreground">{t("integration.oneLineCurlPasteNote")}</p>
      <p className="text-xs text-muted-foreground">{t("integration.oneLineCurlSuccessFields")}</p>
      <p className="text-xs text-muted-foreground">{t("integration.oneLineCurlReconcileNote")}</p>
      <div className="flex flex-wrap gap-2">
        <CopyConfigAction
          id={`${idPrefix}-copy-auth-action`}
          value={snippets.authHeader}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.copyAuthHeader")}
          copiedLabel={t("integration.copied")}
        />
      </div>
    </div>
  );
}

export function getApiKeyChapterSnippets(apiKey: string): ApiKeyChapterSnippets {
  return buildApiKeyChapterSnippets(apiKey);
}
