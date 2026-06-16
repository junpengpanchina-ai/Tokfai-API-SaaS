"use client";

import { CopyableSnippetField } from "@/components/copyable-snippet-field";
import { CUSTOMER_ERROR_RESPONSE_EXAMPLES } from "@/lib/customer-error-codes-chapter";
import { useI18n } from "@/lib/i18n/i18n-provider";

type ErrorCodesChapterPanelProps = {
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
};

export function ErrorCodesChapterPanel({
  copiedId,
  onCopy,
  idPrefix = "error-codes-chapter",
}: ErrorCodesChapterPanelProps) {
  const { t } = useI18n();

  return (
    <div className="flex flex-col gap-4">
      {CUSTOMER_ERROR_RESPONSE_EXAMPLES.map((example) => (
        <CopyableSnippetField
          key={example.id}
          label={t(example.labelKey)}
          value={example.body}
          copyId={`${idPrefix}-${example.id}`}
          copiedId={copiedId}
          onCopy={onCopy}
          copyLabel={t("integration.copyCode")}
          copiedLabel={t("integration.copied")}
          className="[&_code]:max-h-40 [&_code]:whitespace-pre-wrap [&_code]:break-all"
        />
      ))}
    </div>
  );
}
