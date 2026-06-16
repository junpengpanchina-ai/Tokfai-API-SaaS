import { ApiError } from "../errors.js";
import { env } from "../env.js";

export async function readJsonBodyWithLimit(c: {
  req: {
    text: () => Promise<string>;
    header: (name: string) => string | undefined;
  };
}): Promise<unknown> {
  const raw = await c.req.text().catch(() => {
    throw ApiError.badRequest("Invalid JSON body.", "invalid_request_error");
  });

  if (raw.length > env.TOKFAI_CHAT_BODY_MAX_BYTES) {
    throw ApiError.payloadTooLarge();
  }

  if (!raw.trim()) {
    throw ApiError.badRequest("Invalid JSON body.", "invalid_request_error");
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw ApiError.badRequest("Invalid JSON body.", "invalid_request_error");
  }
}
