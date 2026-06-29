/** Credit order display helpers — dashboard-safe, no billing RPC. */

export type CreditOrderDisplayStatus =
  | "pending"
  | "paid"
  | "expired"
  | "cancelled"
  | "failed";

export const CREDIT_ORDER_PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export type CreditOrderTone = "success" | "warning" | "destructive" | "muted";

export function resolveCreditOrderDisplayStatus(args: {
  status: string;
  createdAt: string;
  now?: Date;
}): CreditOrderDisplayStatus {
  const normalized = args.status.trim().toLowerCase();
  if (
    normalized === "paid" ||
    normalized === "succeeded" ||
    normalized === "completed"
  ) {
    return "paid";
  }
  if (normalized === "cancelled" || normalized === "canceled") {
    return "cancelled";
  }
  if (normalized === "failed") return "failed";

  if (normalized === "pending") {
    const createdMs = Date.parse(args.createdAt);
    if (!Number.isNaN(createdMs)) {
      const nowMs = (args.now ?? new Date()).getTime();
      if (nowMs - createdMs >= CREDIT_ORDER_PENDING_TTL_MS) {
        return "expired";
      }
    }
    return "pending";
  }

  return "pending";
}

export function truncateCheckoutSessionId(id: string | null | undefined): string {
  if (!id) return "—";
  if (id.length <= 20) return id;
  return `${id.slice(0, 10)}…${id.slice(-8)}`;
}

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
