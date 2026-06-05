export type CreditOrderDisplayStatus =
  | "pending"
  | "paid"
  | "expired"
  | "cancelled"
  | "failed";

export type CreditOrderTone = "success" | "warning" | "destructive" | "muted";

export function toneForCreditOrderStatus(
  status: CreditOrderDisplayStatus
): CreditOrderTone {
  switch (status) {
    case "paid":
      return "success";
    case "pending":
      return "warning";
    case "expired":
      return "muted";
    case "cancelled":
    case "failed":
      return "destructive";
    default:
      return "muted";
  }
}

export function formatPlanIdLabel(planId: string | null | undefined): string {
  if (!planId) return "—";
  return planId.charAt(0).toUpperCase() + planId.slice(1);
}
