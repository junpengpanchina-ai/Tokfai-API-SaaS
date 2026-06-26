/** Tiny template helper — keep separate from messages.ts to avoid pulling full locale trees. */
export function formatMessage(
  template: string,
  vars: Record<string, string | number>
): string {
  return Object.entries(vars).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template
  );
}
