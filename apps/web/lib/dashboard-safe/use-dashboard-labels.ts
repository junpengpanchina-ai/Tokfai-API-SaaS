"use client";

import { useEffect, useState } from "react";

import { formatDashboardMessage } from "./format-message";
import {
  dashboardLabel,
  readDashboardLocale,
  type DashboardLocale,
} from "./labels";

export function useDashboardLabels() {
  const [locale, setLocale] = useState<DashboardLocale>("en");

  useEffect(() => {
    setLocale(readDashboardLocale());
  }, []);

  const t = (key: string) => dashboardLabel(key, locale);

  const formatMessage = (
    template: string,
    vars: Record<string, string | number>
  ) => formatDashboardMessage(template, vars);

  return { locale, t, formatMessage };
}
