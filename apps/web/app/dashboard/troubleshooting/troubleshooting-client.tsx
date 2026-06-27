"use client";

import { useCopyToClipboard } from "@/components/copy-code-block";
import { DashboardSafeFallback } from "@/components/dashboard-safe-fallback";

export function TroubleshootingPageClient() {
  const { copiedId, copyText } = useCopyToClipboard();
  return (
    <DashboardSafeFallback
      page="troubleshooting"
      copiedId={copiedId}
      onCopy={copyText}
    />
  );
}
