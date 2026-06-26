"use client";

import { IntegrationCommandCenter } from "@/components/integration-command-center";
import { IntegrationWorkbenchPanel } from "@/components/integration-workbench-panel";
import { useCopyToClipboard } from "@/components/copy-code-block";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useWorkbenchApiKey } from "./use-workbench-api-key";

export function IntegrationWorkbenchPageClient() {
  const { t } = useI18n();
  const apiKey = useWorkbenchApiKey();
  const { copiedId, copyText } = useCopyToClipboard();

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("integration.workbenchTitle")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("integration.commandCenter.subtitle")}
        </p>
      </div>

      <IntegrationCommandCenter
        apiKey={apiKey}
        copiedId={copiedId}
        onCopy={copyText}
        idPrefix="dashboard-workbench"
      />

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
          {t("integration.commandCenter.advancedToolsTitle")}
        </h2>
        <p className="text-sm text-muted-foreground">
          {t("integration.commandCenter.advancedToolsNote")}
        </p>
        <IntegrationWorkbenchPanel
          apiKey={apiKey}
          copiedId={copiedId}
          onCopy={copyText}
          idPrefix="dashboard-workbench-advanced"
        />
      </div>
    </div>
  );
}
