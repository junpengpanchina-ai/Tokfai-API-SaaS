import { EN, ZH, type DashboardLocale } from "./labels.generated";

const LOCALE_STORAGE_KEY = "tokfai-locale";

export const DASHBOARD_LOCALE_EVENT = "tokfai-locale-change";

export function readDashboardLocale(): DashboardLocale {
  if (typeof window === "undefined") return "en";
  const stored = window.localStorage.getItem(LOCALE_STORAGE_KEY);
  return stored === "zh" ? "zh" : "en";
}

export function setDashboardLocale(locale: DashboardLocale): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    window.dispatchEvent(new Event(DASHBOARD_LOCALE_EVENT));
  } catch {
    /* ignore */
  }
}

export function dashboardLabel(
  key: string,
  locale: DashboardLocale = readDashboardLocale()
): string {
  const table = locale === "zh" ? ZH : EN;
  return table[key] ?? EN[key] ?? key;
}

export { EN, ZH, type DashboardLocale };
