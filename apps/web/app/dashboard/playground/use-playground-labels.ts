"use client";

import { useCallback, useEffect, useState } from "react";

import {
  DASHBOARD_LOCALE_EVENT,
} from "@/lib/dashboard-safe/labels";

import {
  formatPlaygroundLabel,
  playgroundLabel,
  readPlaygroundLocale,
  type PlaygroundLocale,
} from "./playground-labels";

export function usePlaygroundLabels() {
  const [locale, setLocale] = useState<PlaygroundLocale>("en");

  useEffect(() => {
    const refresh = () => setLocale(readPlaygroundLocale());
    refresh();
    window.addEventListener(DASHBOARD_LOCALE_EVENT, refresh);
    return () => window.removeEventListener(DASHBOARD_LOCALE_EVENT, refresh);
  }, []);

  const t = useCallback(
    (key: string) => playgroundLabel(key, locale),
    [locale]
  );

  const formatMessage = useCallback(
    (template: string, vars: Record<string, string | number>) =>
      formatPlaygroundLabel(template, vars),
    []
  );

  return { locale, t, formatMessage };
}
