/**
 * Dashboard-safe DMIT fetch — explicit Bearer token only (no Supabase client).
 */

import { getDmitBaseUrl, isFullTokfaiApiKey } from "./constants";

export interface DmitErrorPayload {
  message: string;
  code?: string;
  type?: string;
}

export class DashboardDmitApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly type?: string;
  readonly body: unknown;
  readonly requestMethod?: string;
  readonly requestUrl?: string;

  constructor(args: {
    status: number;
    message: string;
    code?: string;
    type?: string;
    body?: unknown;
    requestMethod?: string;
    requestUrl?: string;
  }) {
    super(args.message);
    this.name = "DashboardDmitApiError";
    this.status = args.status;
    this.code = args.code;
    this.type = args.type;
    this.body = args.body;
    this.requestMethod = args.requestMethod;
    this.requestUrl = args.requestUrl;
  }

  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

export const DASHBOARD_DMIT_MISSING_ACCESS_TOKEN =
  "Missing Supabase access token before calling DMIT.";

export function requireDashboardDmitAccessToken(
  accessToken: string | undefined | null
): string {
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    throw new DashboardDmitApiError({
      status: 401,
      message: DASHBOARD_DMIT_MISSING_ACCESS_TOKEN,
      code: "missing_access_token",
    });
  }
  return accessToken.trim();
}

export interface DashboardDmitFetchOptions extends Omit<RequestInit, "body"> {
  accessToken: string;
  json?: unknown;
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toApiError(
  status: number,
  body: unknown,
  method?: string,
  url?: string
): DashboardDmitApiError {
  let message = `DMIT request failed (HTTP ${status}).`;
  let code: string | undefined;
  let type: string | undefined;

  if (body && typeof body === "object") {
    const maybeError = (body as { error?: unknown }).error;
    if (typeof maybeError === "string") {
      message = maybeError;
    } else if (maybeError && typeof maybeError === "object") {
      const err = maybeError as Partial<DmitErrorPayload>;
      if (typeof err.message === "string") message = err.message;
      if (typeof err.code === "string") code = err.code;
      if (typeof err.type === "string") type = err.type;
    }
  } else if (typeof body === "string" && body.trim()) {
    message = body;
  }

  return new DashboardDmitApiError({
    status,
    message,
    code,
    type,
    body,
    requestMethod: method,
    requestUrl: url,
  });
}

export async function dashboardDmitFetch<T = unknown>(
  path: string,
  options: DashboardDmitFetchOptions
): Promise<T> {
  const { accessToken, json, headers: extraHeaders, ...init } = options;

  const url = path.startsWith("http")
    ? path
    : `${getDmitBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(extraHeaders);
  headers.set(
    "Authorization",
    `Bearer ${requireDashboardDmitAccessToken(accessToken)}`
  );

  let body: BodyInit | undefined;
  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(json);
  }

  const res = await fetch(url, { ...init, headers, body });

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  const parsed = parseJson(text);

  if (!res.ok) {
    throw toApiError(res.status, parsed, init.method, url);
  }

  return parsed as T;
}

export async function dashboardDmitFetchWithHeaders<T = unknown>(
  path: string,
  options: DashboardDmitFetchOptions
): Promise<{ data: T; headers: Headers }> {
  const { accessToken, json, headers: extraHeaders, ...init } = options;

  const url = path.startsWith("http")
    ? path
    : `${getDmitBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(extraHeaders);
  headers.set(
    "Authorization",
    `Bearer ${requireDashboardDmitAccessToken(accessToken)}`
  );

  let requestBody: BodyInit | undefined;
  if (json !== undefined) {
    headers.set("Content-Type", "application/json");
    requestBody = JSON.stringify(json);
  }

  const response = await fetch(url, { ...init, headers, body: requestBody });

  if (response.status === 204) {
    return { data: undefined as T, headers: response.headers };
  }

  const text = await response.text();
  const parsed = parseJson(text);

  if (!response.ok) {
    throw toApiError(response.status, parsed, init.method, url);
  }

  return { data: parsed as T, headers: response.headers };
}

export function assertFullApiKeySecret(secret: string, context: string): void {
  if (!isFullTokfaiApiKey(secret)) {
    throw new DashboardDmitApiError({
      status: 500,
      message:
        context === "reveal"
          ? "The server returned an incomplete key. Create a new key to copy the full secret."
          : "API key was created but the one-time secret in the response was incomplete. Deploy the latest api.tokfai.com and try again.",
      code: context === "reveal" ? "invalid_reveal_secret" : "invalid_create_secret",
    });
  }
}
