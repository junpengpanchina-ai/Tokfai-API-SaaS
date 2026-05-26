import { DmitServerError } from "@/lib/dmit/server";

export const ADMIN_SESSION_EXPIRED = "登录状态失效，请重新登录";

export type AdminDebug = {
  statusCode: string;
  message: string;
  dmitBaseUrl: string;
  hasAccessToken: boolean;
  userEmail: string | null;
  isForbidden: boolean;
};

export type AdminServerFetchOptions = {
  method?: string;
  json?: unknown;
  idempotencyKey?: string;
};

export async function fetchDmitAdmin<T>(
  url: string,
  accessToken: string,
  options: AdminServerFetchOptions = {}
): Promise<T> {
  if (!accessToken.trim()) {
    throw new DmitServerError({
      status: 401,
      message: ADMIN_SESSION_EXPIRED,
      code: "missing_access_token",
    });
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };

  if (options.idempotencyKey) {
    headers["Idempotency-Key"] = options.idempotencyKey;
  }

  const res = await fetch(url, {
    method: options.method ?? "GET",
    headers,
    body: options.json !== undefined ? JSON.stringify(options.json) : undefined,
    cache: "no-store",
  });

  const text = await res.text();
  const body = parseJson(text);

  if (!res.ok) {
    throw toDmitServerError(res.status, body);
  }

  return body as T;
}

export function toAdminDebug(
  error: unknown,
  context: Omit<AdminDebug, "statusCode" | "message" | "isForbidden">
): AdminDebug {
  if (error instanceof DmitServerError) {
    const isForbidden = error.status === 403;

    return {
      ...context,
      statusCode: String(error.status),
      message: isForbidden
        ? "Your account is not authorized for admin access."
        : error.message,
      isForbidden,
    };
  }

  if (error instanceof Error) {
    return {
      ...context,
      statusCode: "fetch failed",
      message: error.message,
      isForbidden: false,
    };
  }

  return {
    ...context,
    statusCode: "unknown",
    message: "Admin data could not be loaded.",
    isForbidden: false,
  };
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toDmitServerError(status: number, body: unknown): DmitServerError {
  let message = `Request failed (HTTP ${status}).`;
  let code: string | undefined;

  if (body && typeof body === "object") {
    const maybeError = (body as { error?: unknown }).error;
    if (maybeError && typeof maybeError === "object") {
      const err = maybeError as { message?: unknown; code?: unknown };
      if (typeof err.message === "string") message = err.message;
      if (typeof err.code === "string") code = err.code;
    }
  } else if (typeof body === "string" && body.trim()) {
    message = body;
  }

  return new DmitServerError({ status, message, code });
}
