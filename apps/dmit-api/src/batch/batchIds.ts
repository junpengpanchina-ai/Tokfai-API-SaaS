/** External batch id: batch_<32 hex chars> (uuid without dashes). */

export function formatBatchId(uuid: string): string {
  return `batch_${uuid.replace(/-/g, "")}`;
}

export function parseBatchId(raw: string): string | null {
  const trimmed = raw.trim();
  const hex = trimmed.startsWith("batch_") ? trimmed.slice(6) : trimmed;

  if (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(hex)
  ) {
    return hex.toLowerCase();
  }

  if (/^[0-9a-f]{32}$/i.test(hex)) {
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`.toLowerCase();
  }

  return null;
}
