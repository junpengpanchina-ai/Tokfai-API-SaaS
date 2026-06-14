import type { DmitApiError } from "@/lib/dmit/client";

export function extractRequestIdFromBody(body: unknown): string | undefined {
  if (!body || typeof body !== "object") {
    return undefined;
  }

  const record = body as Record<string, unknown>;
  if (typeof record.request_id === "string" && record.request_id.trim()) {
    return record.request_id.trim();
  }

  const error = record.error;
  if (error && typeof error === "object") {
    const nested = error as Record<string, unknown>;
    if (typeof nested.request_id === "string" && nested.request_id.trim()) {
      return nested.request_id.trim();
    }
  }

  return undefined;
}

export function extractDmitActionErrorDetails(err: DmitApiError): {
  code?: string;
  requestId?: string;
} {
  const requestId = extractRequestIdFromBody(err.body);
  return {
    code: err.code,
    requestId,
  };
}
