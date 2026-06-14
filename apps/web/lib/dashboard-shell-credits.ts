export const LOW_CREDITS_THRESHOLD = 1;

export type DashboardShellCredits = {
  /** null when the profile balance could not be loaded */
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
