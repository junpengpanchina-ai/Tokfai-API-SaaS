/** Template helper — dashboard-safe, no shared locale tree. */

export function formatDashboardMessage(
  template: string,
  vars: Record<string, string | number>
): string {
  return Object.entries(vars).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template
  );
}
