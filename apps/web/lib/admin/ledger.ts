export type AdminLedgerEntry = {
  id: string;
  created_at: string;
  type: string;
  amount: number;
  balance_after: number;
  reason: string | null;
  reference_id: string | null;
};

export type LedgerBucket = "topup" | "debit" | "adjustment" | "other";

export type LedgerBucketSummary = {
  count: number;
  totalAmount: number;
};

export type LedgerSummaries = {
  topup: LedgerBucketSummary;
  debit: LedgerBucketSummary;
  adjustment: LedgerBucketSummary;
};

export function classifyLedgerEntry(entry: {
  type: string;
  amount: number;
  reason?: string | null;
}): LedgerBucket {
  const type = entry.type?.toLowerCase() ?? "";

  if (type === "adjustment" || entry.reason === "admin_adjustment") {
    return "adjustment";
  }
  if (type === "debit") {
    return "debit";
  }
  if (
    type === "purchase" ||
    type === "topup" ||
    type === "grant" ||
    type === "refund" ||
    entry.reason === "stripe_checkout_completed"
  ) {
    return "topup";
  }
  if (entry.amount < 0) {
    return "debit";
  }
  if (entry.amount > 0) {
    return "topup";
  }

  return "other";
}

export function summarizeLedgerEntries(
  entries: AdminLedgerEntry[]
): LedgerSummaries {
  const summaries: LedgerSummaries = {
    topup: { count: 0, totalAmount: 0 },
    debit: { count: 0, totalAmount: 0 },
    adjustment: { count: 0, totalAmount: 0 },
  };

  for (const entry of entries) {
    const bucket = classifyLedgerEntry(entry);

    if (bucket === "topup") {
      summaries.topup.count += 1;
      summaries.topup.totalAmount += Math.abs(entry.amount);
    } else if (bucket === "debit") {
      summaries.debit.count += 1;
      summaries.debit.totalAmount += Math.abs(entry.amount);
    } else if (bucket === "adjustment") {
      summaries.adjustment.count += 1;
      summaries.adjustment.totalAmount += entry.amount;
    }
  }

  return summaries;
}

export function filterLedgerEntriesByBucket(
  entries: AdminLedgerEntry[],
  bucket: LedgerBucket,
  limit?: number
): AdminLedgerEntry[] {
  const filtered = entries.filter(
    (entry) => classifyLedgerEntry(entry) === bucket
  );

  return limit == null ? filtered : filtered.slice(0, limit);
}
