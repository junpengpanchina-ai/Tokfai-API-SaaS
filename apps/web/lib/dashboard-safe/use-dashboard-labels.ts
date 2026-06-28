"use client";

import { useCallback, useEffect, useState } from "react";

import { formatDashboardMessage } from "./format-message";
import {
  dashboardLabel,
  readDashboardLocale,
  setDashboardLocale,
  DASHBOARD_LOCALE_EVENT,
  type DashboardLocale,
} from "./labels";

export function useDashboardLabels() {
  const [locale, setLocaleState] = useState<DashboardLocale>("en");

  useEffect(() => {
    const refresh = () => setLocaleState(readDashboardLocale());
    refresh();
    window.addEventListener(DASHBOARD_LOCALE_EVENT, refresh);
    return () => window.removeEventListener(DASHBOARD_LOCALE_EVENT, refresh);
  }, []);

  const t = useCallback(
    (key: string) => dashboardLabel(key, locale),
    [locale]
  );

  const formatMessage = useCallback(
    (template: string, vars: Record<string, string | number>) =>
      formatDashboardMessage(template, vars),
    []
  );

  const setLocale = useCallback((next: DashboardLocale) => {
    setDashboardLocale(next);
    setLocaleState(next);
  }, []);

  return { locale, t, formatMessage, setLocale };
}
