"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { useCopyToClipboard } from "@/components/copy-code-block";
import { CustomerPayloadBuilder } from "@/components/customer-payload-builder";
import { parsePayloadBuilderSearchParams } from "@/lib/customer-payload-builder";
import { useQuickStartApiKey } from "@/lib/use-quick-start-api-key";

export function PayloadBuilderPageClient() {
  const apiKey = useQuickStartApiKey();
  const { copiedId, copyText } = useCopyToClipboard();
  const searchParams = useSearchParams();

  const initial = useMemo(
    () => parsePayloadBuilderSearchParams(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  return (
    <div className="flex flex-col gap-6">
      <CustomerPayloadBuilder
        apiKey={apiKey}
        copiedId={copiedId}
        onCopy={copyText}
        idPrefix="dashboard-payload-builder"
        initialIndustry={initial.industry}
        initialApi={initial.api}
        initialModel={initial.model}
      />
    </div>
  );
}
