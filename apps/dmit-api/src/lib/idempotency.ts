const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export function parseIdempotencyKey(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!IDEMPOTENCY_KEY_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
}

export function batchItemIdempotencyKey(itemId: string): string {
  return `batch_item:${itemId}`;
}
