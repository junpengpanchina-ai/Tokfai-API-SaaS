"use client";

import { useCallback, useEffect, useState } from "react";

import {
  DASHBOARD_LOCALE_EVENT,
} from "@/lib/dashboard-safe/labels";

import {
  formatImagePlaygroundLabel,
  imagePlaygroundLabel,
  readImagePlaygroundLocale,
  type ImagePlaygroundLocale,
} from "./image-playground-labels";

export function useImagePlaygroundLabels() {
  const [locale, setLocale] = useState<ImagePlaygroundLocale>("en");

  useEffect(() => {
    const refresh = () => setLocale(readImagePlaygroundLocale());
    refresh();
    window.addEventListener(DASHBOARD_LOCALE_EVENT, refresh);
    return () => window.removeEventListener(DASHBOARD_LOCALE_EVENT, refresh);
  }, []);

  const t = useCallback(
    (key: string) => imagePlaygroundLabel(key, locale),
    [locale]
  );

  const formatMessage = useCallback(
    (template: string, vars: Record<string, string | number>) =>
      formatImagePlaygroundLabel(template, vars),
    []
  );

  return { locale, t, formatMessage };
}
