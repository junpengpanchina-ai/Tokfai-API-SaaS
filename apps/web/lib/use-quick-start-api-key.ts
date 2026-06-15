"use client";

import { useEffect, useState } from "react";

import {
  QUICK_START_KEY_EVENT,
} from "@/lib/customer-quick-start-key-session";
import { resolveQuickStartApiKey } from "@/lib/customer-quick-start-snippets";
import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

export function useQuickStartApiKey(explicitKey?: string | null): string {
  const [apiKey, setApiKey] = useState(() =>
    typeof window !== "undefined"
      ? resolveQuickStartApiKey(explicitKey)
      : TOKFAI_API_KEY_PLACEHOLDER
  );

  useEffect(() => {
    const refresh = () => setApiKey(resolveQuickStartApiKey(explicitKey));
    refresh();
    window.addEventListener(QUICK_START_KEY_EVENT, refresh);
    return () => window.removeEventListener(QUICK_START_KEY_EVENT, refresh);
  }, [explicitKey]);

  return apiKey;
}
