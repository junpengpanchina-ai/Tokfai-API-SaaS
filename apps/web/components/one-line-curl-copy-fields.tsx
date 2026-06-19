"use client";

import { CopyableSnippetField, CopyConfigAction } from "@/components/copyable-snippet-field";
import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";
import { useI18n } from "@/lib/i18n/i18n-provider";

type OneLineCurlCopyFieldsProps = {
  apiKey: string;
  bashLabel: string;
  bashCurl: string;
  powershellCurl?: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix: string;
  showKeyNote?: boolean;
  liveKeyNoteKey?: string;
  pasteNoteKey?: string;
  className?: string;
  primaryCopy?: boolean;
  compact?: boolean;
};

export function OneLineCurlCopyFields({
  apiKey,
  bashLabel,
  bashCurl,
  powershellCurl,
  copiedId,
  onCopy,
  idPrefix,
  showKeyNote = true,
  liveKeyNoteKey = "integration.apiKeyLiveKeyNote",
  pasteNoteKey = "integration.oneLineCurlPasteAnywhere",
  className,
  primaryCopy = false,
  compact = false,
}: OneLineCurlCopyFieldsProps) {
  const { t } = useI18n();
  const keyIsPlaceholder = apiKey === TOKFAI_API_KEY_PLACEHOLDER;
  const codeClass =
    "[&_code]:max-h-24 [&_code]:overflow-x-auto [&_code]:whitespace-nowrap [&_code]:break-normal [&_code]:text-xs sm:[&_code]:text-sm";

  if (compact) {
    return (
      <div className={className ?? "flex min-w-0 flex-col gap-2"}>
        <CopyConfigAction
          id={`${idPrefix}-bash-action`}
          value={bashCurl}
          copiedId={copiedId}
          onCopy={onCopy}
          label={bashLabel}
          copiedLabel={t("integration.copied")}
          primary={primaryCopy}
        />
        <p className="text-xs text-muted-foreground">{t(pasteNoteKey)}</p>
        {showKeyNote && !keyIsPlaceholder ? (
          <p className="text-xs text-muted-foreground">{t(liveKeyNoteKey)}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={className ?? "flex min-w-0 flex-col gap-3"}>
      <CopyableSnippetField
        label={bashLabel}
        value={bashCurl}
        copyId={`${idPrefix}-bash`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyOneLineCurl")}
        copiedLabel={t("integration.copied")}
        className={codeClass}
      />
      <p className="text-xs text-muted-foreground">{t(pasteNoteKey)}</p>
      {powershellCurl ? (
        <CopyableSnippetField
          label={t("integration.clientSoftwarePowerShellCurlLabel")}
          value={powershellCurl}
          copyId={`${idPrefix}-powershell`}
          copiedId={copiedId}
          onCopy={onCopy}
          copyLabel={t("integration.copyPowerShellCurl")}
          copiedLabel={t("integration.copied")}
          className={codeClass}
        />
      ) : null}
      {showKeyNote ? (
        keyIsPlaceholder ? (
          <p className="text-xs text-muted-foreground">{t("integration.placeholderKeyNote")}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t(liveKeyNoteKey)}</p>
        )
      ) : null}
      <div className="flex flex-wrap gap-2">
        <CopyConfigAction
          id={`${idPrefix}-bash-action`}
          value={bashCurl}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.copyOneLineCurl")}
          copiedLabel={t("integration.copied")}
          primary={primaryCopy}
        />
        {powershellCurl ? (
          <CopyConfigAction
            id={`${idPrefix}-powershell-action`}
            value={powershellCurl}
            copiedId={copiedId}
            onCopy={onCopy}
            label={t("integration.copyPowerShellCurl")}
            copiedLabel={t("integration.copied")}
          />
        ) : null}
      </div>
    </div>
  );
}
