"use client";

import { useEffect, useState } from "react";

import { TOKFAI_API_KEY_PLACEHOLDER } from "./constants";

import { DASHBOARD_API_KEY_EVENT } from "./api-key-session";
import { resolveApiKeyPlaceholderSafe } from "./resolve-api-key";

export function useDashboardApiKey(explicitKey?: string | null): string {
  const [apiKey, setApiKey] = useState(TOKFAI_API_KEY_PLACEHOLDER);

  useEffect(() => {
    const refresh = () => setApiKey(resolveApiKeyPlaceholderSafe(explicitKey));
    refresh();
    window.addEventListener(DASHBOARD_API_KEY_EVENT, refresh);
    return () => window.removeEventListener(DASHBOARD_API_KEY_EVENT, refresh);
  }, [explicitKey]);

  return apiKey;
}
