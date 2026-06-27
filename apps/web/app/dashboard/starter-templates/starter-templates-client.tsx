"use client";

import { useCopyToClipboard } from "@/components/copy-code-block";
import { DashboardSafeFallback } from "@/components/dashboard-safe-fallback";

export function StarterTemplatesPageClient() {
  const { copiedId, copyText } = useCopyToClipboard();
  return (
    <DashboardSafeFallback
      page="starter-templates"
      copiedId={copiedId}
      onCopy={copyText}
    />
  );
}
