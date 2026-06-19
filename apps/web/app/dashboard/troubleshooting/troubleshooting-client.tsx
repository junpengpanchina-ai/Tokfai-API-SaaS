"use client";

import { useSearchParams } from "next/navigation";

import { useCopyToClipboard } from "@/components/copy-code-block";
import { CustomerTroubleshootingCenter } from "@/components/customer-troubleshooting-center";
import {
  troubleshootingCaseByErrorCode,
  type TroubleshootingCategory,
} from "@/lib/customer-troubleshooting";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useQuickStartApiKey } from "@/lib/use-quick-start-api-key";

const CATEGORY_SET = new Set<string>([
  "api_key",
  "request_format",
  "model",
  "rate_limits",
  "image",
  "batch",
  "cursor_cherry",
  "sdk",
  "usage_credits",
]);

export function TroubleshootingPageClient() {
  const { t } = useI18n();
  const apiKey = useQuickStartApiKey();
  const { copiedId, copyText } = useCopyToClipboard();
  const searchParams = useSearchParams();
  const codeParam = searchParams.get("code") ?? "";
  const categoryParam = searchParams.get("category") ?? "";
  const matched = codeParam ? troubleshootingCaseByErrorCode(codeParam) : undefined;
  const initialCategory: TroubleshootingCategory | "all" = CATEGORY_SET.has(categoryParam)
    ? (categoryParam as TroubleshootingCategory)
    : "all";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("integration.troubleshooting.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("integration.troubleshooting.subtitle")}
        </p>
      </div>
      <CustomerTroubleshootingCenter
        apiKey={apiKey}
        copiedId={copiedId}
        onCopy={copyText}
        idPrefix="dashboard-troubleshooting"
        initialQuery={matched?.errorCode ?? codeParam}
        initialCategory={matched?.category ?? initialCategory}
      />
    </div>
  );
}
