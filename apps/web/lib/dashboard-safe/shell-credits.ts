/** Dashboard shell credit badge — dashboard-safe. */

export const LOW_CREDITS_THRESHOLD = 1;

export type DashboardShellCredits = {
  balance: number | null;
  loaded: boolean;
};

export const EMPTY_SHELL_CREDITS: DashboardShellCredits = {
  balance: null,
  loaded: false,
};

export function isLowCreditsBalance(credits: DashboardShellCredits): boolean {
  if (!credits.loaded || credits.balance == null) {
    return false;
  }
  return credits.balance < LOW_CREDITS_THRESHOLD;
}

const SHELL_CREDITS = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function dashboardShellFormatCreditBalance(
  value: number | null | undefined
): string {
  const n = Number(value);
  return SHELL_CREDITS.format(Number.isFinite(n) ? n : 0);
}
