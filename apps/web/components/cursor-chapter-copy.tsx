"use client";

import { CopyButton } from "@/components/copy-code-block";
import { CopyableSnippetField, CopyConfigAction } from "@/components/copyable-snippet-field";
import { OneLineCurlCopyFields } from "@/components/one-line-curl-copy-fields";
import {
  chatCurlOneLine,
  chatCurlPowerShellOneLine,
} from "@/lib/customer-curl-oneline";
import {
  buildCursorConfigSnippet,
  buildCursorCopyFields,
  CURSOR_DEFAULT_MODEL,
} from "@/lib/customer-cursor-chapter";
import { authorizationHeader } from "@/lib/customer-integration-snippets";
import { isQuickStartKeyPlaceholder } from "@/lib/customer-quick-start-snippets";
import { TOKFAI_API_BASE_URL } from "@/lib/tokfai-api";
import { useI18n } from "@/lib/i18n/i18n-provider";

export const CURSOR_CONFIG_COPY_ID = "cursor-config";
export const CURSOR_BASE_URL_COPY_ID = "cursor-base-url";
export const CURSOR_AUTH_COPY_ID = "cursor-auth";
export const CURSOR_MODEL_COPY_ID = "cursor-model";

type CursorChapterCopyPanelProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
};

export function CursorChapterCopyPanel({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "cursor-chapter",
}: CursorChapterCopyPanelProps) {
  const { t } = useI18n();
  const config = buildCursorConfigSnippet(apiKey);
  const fields = buildCursorCopyFields(apiKey);
  const baseUrl = TOKFAI_API_BASE_URL;
  const authHeader = authorizationHeader(apiKey);
  const chatCurl = chatCurlOneLine(apiKey);
  const psCurl = chatCurlPowerShellOneLine(apiKey);
  const keyIsPlaceholder = isQuickStartKeyPlaceholder(apiKey);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-foreground">
        {t("integration.cursorCopyNowTitle")}
      </p>
      <OneLineCurlCopyFields
        apiKey={apiKey}
        bashLabel={t("integration.cursorCurlFirstLabel")}
        bashCurl={chatCurl}
        powershellCurl={psCurl}
        copiedId={copiedId}
        onCopy={onCopy}
        idPrefix={`${idPrefix}-verify-curl`}
        liveKeyNoteKey="integration.cursorLiveKeyNote"
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
        label={t("integration.cursorCopyConfigLabel")}
        value={config}
        copyId={`${idPrefix}-${CURSOR_CONFIG_COPY_ID}`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyConfig")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      {keyIsPlaceholder ? (
        <p className="text-xs text-muted-foreground">{t("integration.placeholderKeyNote")}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("integration.cursorLiveKeyNote")}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <CopyConfigAction
          id={`${idPrefix}-copy-cursor-config`}
          value={config}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.cursorCopyCursorConfigAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-${CURSOR_BASE_URL_COPY_ID}-action`}
          value={baseUrl}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.cursorCopyBaseUrlAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-${CURSOR_AUTH_COPY_ID}-action`}
          value={authHeader}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.cursorCopyAuthAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-${CURSOR_MODEL_COPY_ID}-action`}
          value={CURSOR_DEFAULT_MODEL}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.cursorCopyModelAction")}
          copiedLabel={t("integration.copied")}
        />
      </div>
    </div>
  );
}
