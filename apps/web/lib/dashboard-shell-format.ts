/**
 * Dashboard shell / sidebar formatting only.
 * Zero imports — safe for shared layout client chunks.
 */

const SHELL_CREDITS = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function dashboardShellFormatCreditBalance(
  value: number | null | undefined
): string {
  return SHELL_CREDITS.format(value ?? 0);
}
