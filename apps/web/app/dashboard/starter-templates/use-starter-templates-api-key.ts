"use client";

import { useEffect, useState } from "react";

import { QUICK_START_KEY_EVENT } from "@/lib/customer-quick-start-key-session";
import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

import { resolveStarterTemplatesApiKey } from "./starter-templates-display-helpers";

export function useStarterTemplatesApiKey(explicitKey?: string | null): string {
  const [apiKey, setApiKey] = useState(() =>
    typeof window !== "undefined"
      ? resolveStarterTemplatesApiKey(explicitKey)
      : TOKFAI_API_KEY_PLACEHOLDER
  );

  useEffect(() => {
    const refresh = () => setApiKey(resolveStarterTemplatesApiKey(explicitKey));
    refresh();
    window.addEventListener(QUICK_START_KEY_EVENT, refresh);
    return () => window.removeEventListener(QUICK_START_KEY_EVENT, refresh);
  }, [explicitKey]);

  return apiKey;
}
