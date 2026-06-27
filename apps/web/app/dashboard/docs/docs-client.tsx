"use client";

import { useCopyToClipboard } from "@/components/copy-code-block";
import { DashboardSafeFallback } from "@/components/dashboard-safe-fallback";

export function DocsPageClient() {
  const { copiedId, copyText } = useCopyToClipboard();
  return (
    <DashboardSafeFallback page="docs" copiedId={copiedId} onCopy={copyText} />
  );
}
