"use client";

import { CopyableSnippetField, CopyConfigAction } from "@/components/copyable-snippet-field";
import {
  buildImageApiCurlOneLine,
  buildImageApiReferenceCurlOneLine,
} from "@/lib/customer-image-api-chapter";
import {
  isQuickStartKeyPlaceholder,
} from "@/lib/customer-quick-start-snippets";
import { useI18n } from "@/lib/i18n/i18n-provider";

export const IMAGE_API_COPY_ID = "image-api-one-line";
export const IMAGE_API_REFERENCE_COPY_ID = "image-api-reference-one-line";

type ImageApiChapterCopyPanelProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
  showReference?: boolean;
};

export function ImageApiChapterCopyPanel({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "image-api-chapter",
  showReference = false,
}: ImageApiChapterCopyPanelProps) {
  const { t } = useI18n();
  const imageCurl = buildImageApiCurlOneLine(apiKey);
  const referenceCurl = buildImageApiReferenceCurlOneLine(apiKey);
  const keyIsPlaceholder = isQuickStartKeyPlaceholder(apiKey);

  return (
    <div className="flex flex-col gap-3">
      <CopyableSnippetField
        label={t("integration.imageApiCopyNowLabel")}
        value={imageCurl}
        copyId={`${idPrefix}-${IMAGE_API_COPY_ID}`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyOneLineCurl")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      {keyIsPlaceholder ? (
        <p className="text-xs text-muted-foreground">{t("integration.placeholderKeyNote")}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("integration.imageApiLiveKeyNote")}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <CopyConfigAction
          id={`${idPrefix}-copy-image-action`}
          value={imageCurl}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.copyOneLineImageCurl")}
          copiedLabel={t("integration.copied")}
        />
      </div>
      {showReference ? (
        <div className="flex flex-col gap-3 border-t pt-3">
          <p className="text-sm font-medium text-foreground">
            {t("integration.imageApiReferenceTitle")}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("integration.imageApiReferenceDesc")}
          </p>
          <CopyableSnippetField
            label={t("integration.imageApiReferenceCopyLabel")}
            value={referenceCurl}
            copyId={`${idPrefix}-${IMAGE_API_REFERENCE_COPY_ID}`}
            copiedId={copiedId}
            onCopy={onCopy}
            copyLabel={t("integration.copyOneLineCurl")}
            copiedLabel={t("integration.copied")}
            className="[&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all"
          />
        </div>
      ) : null}
    </div>
  );
}
