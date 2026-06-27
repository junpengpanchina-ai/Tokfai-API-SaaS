"use client";

import { useCopyToClipboard } from "@/components/copy-code-block";
import { DashboardSafeFallback } from "@/components/dashboard-safe-fallback";

export function IntegrationWorkbenchPageClient() {
  const { copiedId, copyText } = useCopyToClipboard();
  return (
    <DashboardSafeFallback
      page="integration-workbench"
      copiedId={copiedId}
      onCopy={copyText}
    />
  );
}
