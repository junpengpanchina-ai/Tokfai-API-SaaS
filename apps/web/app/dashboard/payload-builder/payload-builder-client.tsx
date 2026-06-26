"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";

import { useCopyToClipboard } from "@/components/copy-code-block";

import { PayloadBuilderPanelClient } from "./payload-builder-panel-client";
import { parsePayloadBuilderSearchParams } from "./payload-builder-params";
import { usePayloadBuilderApiKey } from "./use-payload-builder-api-key";

export function PayloadBuilderPageClient() {
  const apiKey = usePayloadBuilderApiKey();
  const { copiedId, copyText } = useCopyToClipboard();
  const searchParams = useSearchParams();

  const initial = useMemo(
    () => parsePayloadBuilderSearchParams(new URLSearchParams(searchParams.toString())),
    [searchParams]
  );

  return (
    <div className="flex flex-col gap-6">
      <PayloadBuilderPanelClient
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
