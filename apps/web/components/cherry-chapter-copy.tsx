"use client";

import { CopyButton } from "@/components/copy-code-block";
import { CopyableSnippetField, CopyConfigAction } from "@/components/copyable-snippet-field";
import { OneLineCurlCopyFields } from "@/components/one-line-curl-copy-fields";
import {
  chatCurlOneLine,
  chatCurlPowerShellOneLine,
  modelsCurlOneLine,
  modelsCurlPowerShellOneLine,
} from "@/lib/customer-curl-oneline";
import {
  buildCherryConfigSnippet,
  buildCherryCopyFields,
  CHERRY_DEFAULT_MODEL,
} from "@/lib/customer-cherry-chapter";
import { authorizationHeader } from "@/lib/customer-integration-snippets";
import { isQuickStartKeyPlaceholder } from "@/lib/customer-quick-start-snippets";
import { TOKFAI_API_BASE_URL } from "@/lib/tokfai-api";
import { useI18n } from "@/lib/i18n/i18n-provider";

export const CHERRY_CONFIG_COPY_ID = "cherry-config";
export const CHERRY_BASE_URL_COPY_ID = "cherry-base-url";
export const CHERRY_AUTH_COPY_ID = "cherry-auth";
export const CHERRY_MODEL_COPY_ID = "cherry-model";
export const CHERRY_CHAT_CURL_COPY_ID = "cherry-chat-curl";
export const CHERRY_MODELS_CURL_COPY_ID = "cherry-models-curl";

type CherryChapterCopyPanelProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
};

export function CherryChapterCopyPanel({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "cherry-chapter",
}: CherryChapterCopyPanelProps) {
  const { t } = useI18n();
  const config = buildCherryConfigSnippet(apiKey);
  const fields = buildCherryCopyFields(apiKey);
  const baseUrl = TOKFAI_API_BASE_URL;
  const authHeader = authorizationHeader(apiKey);
  const chatCurl = chatCurlOneLine(apiKey);
  const psCurl = chatCurlPowerShellOneLine(apiKey);
  const modelsCurl = modelsCurlOneLine(apiKey);
  const modelsPsCurl = modelsCurlPowerShellOneLine(apiKey);
  const keyIsPlaceholder = isQuickStartKeyPlaceholder(apiKey);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-foreground">
        {t("integration.cherryCopyNowTitle")}
      </p>
      <OneLineCurlCopyFields
        apiKey={apiKey}
        bashLabel={t("integration.cherryCurlFirstLabel")}
        bashCurl={chatCurl}
        powershellCurl={psCurl}
        copiedId={copiedId}
        onCopy={onCopy}
        idPrefix={`${idPrefix}-verify-curl`}
        liveKeyNoteKey="integration.cherryLiveKeyNote"
      />
      <OneLineCurlCopyFields
        apiKey={apiKey}
        bashLabel={t("integration.apiKeyVerifyCurlLabel")}
        bashCurl={modelsCurl}
        powershellCurl={modelsPsCurl}
        copiedId={copiedId}
        onCopy={onCopy}
        idPrefix={`${idPrefix}-models-curl`}
        showKeyNote={false}
      />
      <p className="text-xs text-muted-foreground">{t("integration.oneLineCurlSuccessFields")}</p>
      <p className="text-xs text-muted-foreground">{t("integration.oneLineCurlReconcileNote")}</p>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <tbody>
            {fields.map((field) => {
              const copyId = `${idPrefix}-field-${field.id}`;
              return (
                <tr key={field.id} className="border-b last:border-0">
                  <td className="whitespace-nowrap px-4 py-3 font-medium">
                    {t(field.labelKey)}
                  </td>
                  <td className="min-w-0 px-4 py-3">
                    <code className="break-all font-mono text-xs text-muted-foreground">
                      {field.value}
                    </code>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <CopyButton
                      copied={copiedId === copyId}
                      onCopy={() => onCopy(copyId, field.value)}
                      copyLabel={t("integration.copy")}
                      copiedLabel={t("integration.copied")}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <CopyableSnippetField
        label={t("integration.cherryCopyConfigLabel")}
        value={config}
        copyId={`${idPrefix}-${CHERRY_CONFIG_COPY_ID}`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyConfig")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-40 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      {keyIsPlaceholder ? (
        <p className="text-xs text-muted-foreground">{t("integration.placeholderKeyNote")}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("integration.cherryLiveKeyNote")}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <CopyConfigAction
          id={`${idPrefix}-copy-cherry-config`}
          value={config}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.cherryCopyCherryConfigAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-${CHERRY_BASE_URL_COPY_ID}-action`}
          value={baseUrl}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.cherryCopyBaseUrlAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-${CHERRY_AUTH_COPY_ID}-action`}
          value={authHeader}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.cherryCopyAuthAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-${CHERRY_MODEL_COPY_ID}-action`}
          value={CHERRY_DEFAULT_MODEL}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.cherryCopyModelAction")}
          copiedLabel={t("integration.copied")}
        />
      </div>
    </div>
  );
}
