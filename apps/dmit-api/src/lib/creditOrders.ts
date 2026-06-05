/** Pending Checkout orders older than this are shown as expired (display-only). */
export const CREDIT_ORDER_PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export type CreditOrderDisplayStatus =
  | "pending"
  | "paid"
  | "expired"
  | "cancelled"
  | "failed";

export function stripeCheckoutReferenceId(sessionId: string): string {
  return `stripe_checkout:${sessionId}`;
}

export function resolveCreditOrderDisplayStatus(args: {
  status: string;
  createdAt: string;
  now?: Date;
}): CreditOrderDisplayStatus {
  const normalized = args.status.trim().toLowerCase();
  if (normalized === "paid") return "paid";
  if (normalized === "cancelled") return "cancelled";
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
