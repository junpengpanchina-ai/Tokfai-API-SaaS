"use client";

import { CopyableSnippetField, CopyConfigAction } from "@/components/copyable-snippet-field";
import {
  buildAutoServiceTicketChatCurlOneLine,
  buildCustomerServiceQaChatCurlOneLine,
  buildEcommerceBatchCopyCurlOneLine,
  buildHospitalCaseSummaryChatCurlOneLine,
  CUSTOMER_INDUSTRY_OVERVIEW_ROWS,
  type IndustryOverviewRow,
} from "@/lib/customer-industry-chapter";
import { isQuickStartKeyPlaceholder } from "@/lib/customer-quick-start-snippets";
import { useI18n } from "@/lib/i18n/i18n-provider";

export const INDUSTRY_HOSPITAL_CURL_COPY_ID = "industry-hospital-curl";
export const INDUSTRY_AUTO_CURL_COPY_ID = "industry-auto-curl";
export const INDUSTRY_ECOMMERCE_BATCH_COPY_ID = "industry-ecommerce-batch-curl";
export const INDUSTRY_SUPPORT_CURL_COPY_ID = "industry-support-curl";

type IndustryChapterCopyPanelProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
};

export function IndustryOverviewTable({ t }: { t: (key: string) => string }) {
  const columns = [
    { key: "scenario", labelKey: "integration.industryOverviewColScenario" },
    { key: "system", labelKey: "integration.industryOverviewColSystem" },
    { key: "api", labelKey: "integration.industryOverviewColApi" },
    { key: "model", labelKey: "integration.industryOverviewColModel" },
    { key: "fields", labelKey: "integration.industryOverviewColFields" },
    { key: "reconcile", labelKey: "integration.industryOverviewColReconcile" },
  ] as const;

  function cellKey(row: IndustryOverviewRow, col: typeof columns[number]["key"]): string {
    switch (col) {
      case "scenario":
        return row.scenarioKey;
      case "system":
        return row.systemKey;
      case "api":
        return row.apiKey;
      case "model":
        return row.modelKey;
      case "fields":
        return row.fieldsKey;
      case "reconcile":
        return row.reconcileKey;
    }
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/40">
            {columns.map((col) => (
              <th
                key={col.key}
                className="px-3 py-2 text-left font-medium text-foreground"
              >
                {t(col.labelKey)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {CUSTOMER_INDUSTRY_OVERVIEW_ROWS.map((row) => (
            <tr key={row.id} className="border-b last:border-0">
              {columns.map((col) => (
                <td
                  key={col.key}
                  className="min-w-0 px-3 py-2 align-top text-muted-foreground"
                >
                  <span className="text-xs leading-relaxed">{t(cellKey(row, col.key))}</span>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function IndustryChapterCopyPanel({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "industry-chapter",
}: IndustryChapterCopyPanelProps) {
  const { t } = useI18n();
  const hospitalCurl = buildHospitalCaseSummaryChatCurlOneLine(apiKey);
  const autoCurl = buildAutoServiceTicketChatCurlOneLine(apiKey);
  const ecommerceBatchCurl = buildEcommerceBatchCopyCurlOneLine(apiKey);
  const supportCurl = buildCustomerServiceQaChatCurlOneLine(apiKey);
  const keyIsPlaceholder = isQuickStartKeyPlaceholder(apiKey);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-foreground">
        {t("integration.industryCopyNowTitle")}
      </p>
      <CopyableSnippetField
        label={t("integration.industryCopyHospitalLabel")}
        value={hospitalCurl}
        copyId={`${idPrefix}-${INDUSTRY_HOSPITAL_CURL_COPY_ID}`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyOneLineCurl")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      <CopyableSnippetField
        label={t("integration.industryCopyAutoLabel")}
        value={autoCurl}
        copyId={`${idPrefix}-${INDUSTRY_AUTO_CURL_COPY_ID}`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyOneLineCurl")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      <CopyableSnippetField
        label={t("integration.industryCopyEcommerceBatchLabel")}
        value={ecommerceBatchCurl}
        copyId={`${idPrefix}-${INDUSTRY_ECOMMERCE_BATCH_COPY_ID}`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyOneLineCurl")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      <CopyableSnippetField
        label={t("integration.industryCopySupportLabel")}
        value={supportCurl}
        copiedId={copiedId}
        onCopy={onCopy}
        copyId={`${idPrefix}-${INDUSTRY_SUPPORT_CURL_COPY_ID}`}
        copyLabel={t("integration.copyOneLineCurl")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      {keyIsPlaceholder ? (
        <p className="text-xs text-muted-foreground">{t("integration.placeholderKeyNote")}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("integration.industryLiveKeyNote")}</p>
      )}
      <p className="text-xs text-muted-foreground">{t("integration.industryBatchReconcileNote")}</p>
      <div className="flex flex-wrap gap-2">
        <CopyConfigAction
          id={`${idPrefix}-copy-hospital`}
          value={hospitalCurl}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.industryCopyHospitalAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-copy-ecommerce-batch`}
          value={ecommerceBatchCurl}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.industryCopyEcommerceBatchAction")}
          copiedLabel={t("integration.copied")}
        />
      </div>
    </div>
  );
}
