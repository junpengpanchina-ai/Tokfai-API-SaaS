"use client";

import { useEffect, useState } from "react";

import { QUICK_START_KEY_EVENT } from "@/lib/customer-quick-start-key-session";
import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

import { resolveWorkbenchApiKey } from "./integration-workbench-display-helpers";

export function useWorkbenchApiKey(explicitKey?: string | null): string {
  const [apiKey, setApiKey] = useState(() =>
    typeof window !== "undefined"
      ? resolveWorkbenchApiKey(explicitKey)
      : TOKFAI_API_KEY_PLACEHOLDER
  );

  useEffect(() => {
    const refresh = () => setApiKey(resolveWorkbenchApiKey(explicitKey));
    refresh();
    window.addEventListener(QUICK_START_KEY_EVENT, refresh);
    return () => window.removeEventListener(QUICK_START_KEY_EVENT, refresh);
  }, [explicitKey]);

  return apiKey;
}
