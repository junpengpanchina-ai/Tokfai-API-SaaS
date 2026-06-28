import { EN, ZH, type DashboardLocale } from "./labels.generated";

const LOCALE_STORAGE_KEY = "tokfai-locale";

export function readDashboardLocale(): DashboardLocale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored === "zh" ? "zh" : "en";
}

export function dashboardLabel(
  key: string,
  locale: DashboardLocale = readDashboardLocale()
): string {
  const table = locale === "zh" ? ZH : EN;
  return table[key] ?? EN[key] ?? key;
}

export { EN, ZH, type DashboardLocale };
