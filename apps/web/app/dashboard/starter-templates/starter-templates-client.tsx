"use client";

import { useCopyToClipboard } from "@/components/copy-code-block";
import { CustomerStarterTemplateLibrary } from "@/components/customer-starter-template-library";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useQuickStartApiKey } from "@/lib/use-quick-start-api-key";

export function StarterTemplatesPageClient() {
  const { t } = useI18n();
  const apiKey = useQuickStartApiKey();
  const { copiedId, copyText } = useCopyToClipboard();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("integration.starterTemplates.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("integration.starterTemplates.subtitle")}
        </p>
      </div>
      <CustomerStarterTemplateLibrary
        apiKey={apiKey}
        copiedId={copiedId}
        onCopy={copyText}
        idPrefix="dashboard-starter-templates"
      />
    </div>
  );
}
