/** Pure currency / credits formatting — no server imports, safe for client bundles. */

export function formatCny(amountCents: number): string {
  const yuan = amountCents / 100;
  const hasFraction = amountCents % 100 !== 0;
  return new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: hasFraction ? 1 : 0,
    maximumFractionDigits: 2,
  }).format(yuan);
}

export function formatPlanCredits(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
