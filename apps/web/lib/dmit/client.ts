/**
 * DMIT API client (browser → api.tokfai.com).
 *
 * Boundary rules (see AGENTS.md / .cursor/rules/*):
 *  - This file must never import or read server-only secrets. The frontend
 *    only ever holds NEXT_PUBLIC_* env vars.
 *  - Auth uses the user's Supabase access token: every call goes out as
 *      Authorization: Bearer <supabase_access_token>
 *    DMIT verifies the JWT server-side and resolves user_id from it.
 *  - We never send a "user_id" field in any request body. DMIT is the only
 *    source of truth for who the caller is.
 *  - We never wrap DMIT in a Next.js Route Handler. The browser talks to
 *    api.tokfai.com directly. CORS is configured on DMIT, not here.
 */

import { createClient as createBrowserSupabase } from "@/lib/supabase/client";

const DEFAULT_BASE = "https://api.tokfai.com";

export function getDmitBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_DMIT_API_BASE?.replace(/\/+$/, "") ?? DEFAULT_BASE
  );
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export interface DmitErrorPayload {
  message: string;
  code?: string;
  type?: string;
}

export class DmitApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly type?: string;
  readonly body: unknown;

  constructor(args: {
    status: number;
    message: string;
    code?: string;
    type?: string;
    body?: unknown;
  }) {
    super(args.message);
    this.name = "DmitApiError";
    this.status = args.status;
    this.code = args.code;
    this.type = args.type;
    this.body = args.body;
  }

  /** True if the user's session is invalid / expired. */
  get isAuth(): boolean {
    return this.status === 401 || this.status === 403;
  }
}

/** Thrown before any DMIT request when a dashboard JWT was not supplied. */
export const DMIT_MISSING_ACCESS_TOKEN =
  "Missing Supabase access token before calling DMIT.";

/**
 * Dashboard DMIT calls must pass the server-read `session.access_token`.
 * Never send a request without a non-empty Bearer token.
 */
export function requireDmitAccessToken(
  accessToken: string | undefined | null
): string {
  if (typeof accessToken !== "string" || !accessToken.trim()) {
    throw new DmitApiError({
      status: 401,
      message: DMIT_MISSING_ACCESS_TOKEN,
      code: "missing_access_token",
    });
  }
  return accessToken.trim();
}

// ---------------------------------------------------------------------------
// Low-level fetch
// ---------------------------------------------------------------------------

export interface DmitFetchOptions extends Omit<RequestInit, "body"> {
  /**
   * If provided, used directly. If omitted, dmitFetch grabs the current
   * Supabase session's access_token via the browser client.
   *
   * Pass `null` explicitly to call a public DMIT endpoint without auth
   * (e.g. /v1/health).
   */
  accessToken?: string | null;
  /** JSON body. Will be stringified and Content-Type will be set. */
  json?: unknown;
}

/**
 * Generic typed fetch against DMIT. Use this only when you need a one-off
 * call; prefer the named helpers below for everything else.
 */
export async function dmitFetch<T = unknown>(
  path: string,
  options: DmitFetchOptions = {}
): Promise<T> {
  const { accessToken, json, headers: extraHeaders, ...init } = options;

  const url = path.startsWith("http")
    ? path
    : `${getDmitBaseUrl()}${path.startsWith("/") ? path : `/${path}`}`;

  const headers = new Headers(extraHeaders);

  if (accessToken === null) {
    // Public endpoint (e.g. /v1/health) — no Authorization header.
  } else if (accessToken !== undefined) {
    headers.set(
      "Authorization",
      `Bearer ${requireDmitAccessToken(accessToken)}`
    );
  } else {
    const token = await getCurrentAccessToken();
    if (!token) {
      throw new DmitApiError({
        status: 401,
        message: DMIT_MISSING_ACCESS_TOKEN,
        code: "missing_access_token",
      });
    }
    headers.set("Authorization", `Bearer ${token}`);
  }

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
    throw toApiError(res.status, parsed);
  }

  return parsed as T;
}

async function getCurrentAccessToken(): Promise<string | null> {
  if (typeof window === "undefined") {
    // The named methods below are browser-only. If you need a DMIT call from
    // a Server Component, write a server variant that reads the session from
    // cookies via @supabase/ssr's server client — don't fake a token here.
    throw new DmitApiError({
      status: 500,
      message:
        "DMIT client called from the server. Use the browser-side helpers.",
      code: "server_context",
    });
  }
  const supabase = createBrowserSupabase();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

function parseJson(text: string): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toApiError(status: number, body: unknown): DmitApiError {
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

  return new DmitApiError({ status, message, code, type, body });
}

// ---------------------------------------------------------------------------
// API Keys — GET / POST / DELETE /v1/keys
// ---------------------------------------------------------------------------

/**
 * A user's API key as returned to the dashboard. The raw secret is never
 * stored client-side; DMIT only ever returns it once at creation time
 * (see `ApiKeyWithSecret`).
 */
export interface ApiKey {
  id: string;
  name: string;
  /** First few public chars of the key, for display, e.g. "sk-tokfai-abcd". */
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at?: string | null;
}

export interface ApiKeyWithSecret extends ApiKey {
  /** Full plaintext key. Shown to the user once, immediately after creation. */
  secret: string;
}

interface ListApiKeysResponse {
  data: ApiKey[];
}

/** Pass `accessToken` from the server session for reliable dashboard auth. */
export interface DmitSessionAuth {
  accessToken: string;
}

export async function listApiKeys(
  auth: DmitSessionAuth
): Promise<ApiKey[]> {
  const accessToken = requireDmitAccessToken(auth.accessToken);
  const res = await dmitFetch<ListApiKeysResponse | ApiKey[]>("/v1/keys", {
    method: "GET",
    accessToken,
  });
  return Array.isArray(res) ? res : res.data;
}

export interface CreateApiKeyInput {
  name: string;
}

export async function createApiKey(
  input: CreateApiKeyInput,
  auth: DmitSessionAuth
): Promise<ApiKeyWithSecret> {
  const accessToken = requireDmitAccessToken(auth.accessToken);
  return dmitFetch<ApiKeyWithSecret>("/v1/keys", {
    method: "POST",
    json: input,
    accessToken,
  });
}

export async function revokeApiKey(
  id: string,
  auth: DmitSessionAuth
): Promise<void> {
  const accessToken = requireDmitAccessToken(auth.accessToken);
  await dmitFetch<void>(`/v1/keys/${encodeURIComponent(id)}`, {
    method: "DELETE",
    accessToken,
  });
}

// ---------------------------------------------------------------------------
// Billing — Stripe Checkout (UI wired in /dashboard/credits)
// ---------------------------------------------------------------------------

export interface CreateCheckoutSessionInput {
  /** Whole dollars, e.g. 25 for $25. */
  amount_usd: number;
  /** Optional override; DMIT will default to the dashboard's credits page. */
  success_url?: string;
  cancel_url?: string;
}

export interface CreateCheckoutSessionResponse {
  /** Stripe Checkout URL — redirect the browser to this. */
  url: string;
  session_id: string;
}

/**
 * Create a Stripe Checkout Session via DMIT and return the hosted URL.
 *
 * Stripe lives entirely on DMIT — the frontend just opens the URL DMIT
 * returns. Auth is the user's Supabase JWT (DMIT resolves user_id from it
 * and creates the Stripe customer / session under that user).
 */
export async function createCheckoutSession(
  input: CreateCheckoutSessionInput
): Promise<CreateCheckoutSessionResponse> {
  return dmitFetch<CreateCheckoutSessionResponse>("/v1/billing/checkout", {
    method: "POST",
    json: input,
  });
}

// ---------------------------------------------------------------------------
// Chat completions — POST /v1/chat/completions
//
// IMPORTANT: this endpoint is NOT called with the user's Supabase JWT. It
// uses the user's own `sk-tokfai-...` API key — the exact same auth path an
// external customer hits. The Playground simulates that customer flow so
// normal billing / rate limiting / usage logging applies.
// ---------------------------------------------------------------------------

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  /** V2 step 2 is non-streaming. Streaming is a follow-up. */
  stream?: false;
  max_tokens?: number;
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionChoice {
  index: number;
  message: ChatMessage;
  finish_reason?: string | null;
}

/** Tokfai-specific extension fields. Optional — UI must not require them. */
export interface TokfaiCompletionExtension {
  credits_charged?: number;
  request_id?: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
  tokfai?: TokfaiCompletionExtension;
}

/**
 * Call POST /v1/chat/completions using the user's own sk-tokfai-... key.
 *
 * The api key is passed through to the Authorization header and never logged,
 * stored, or persisted by this module.
 */
export async function chatCompletions(
  apiKey: string,
  body: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  if (!apiKey) {
    throw new DmitApiError({
      status: 400,
      message: "Missing API key.",
      code: "no_api_key",
    });
  }
  return dmitFetch<ChatCompletionResponse>("/v1/chat/completions", {
    method: "POST",
    json: body,
    // Bypass Supabase session lookup; use the customer key directly.
    accessToken: apiKey,
  });
}

// ---------------------------------------------------------------------------
// Health — useful for debug + status pages
// ---------------------------------------------------------------------------

export interface DmitHealth {
  ok: boolean;
  version?: string;
  service?: string;
}

export async function getDmitHealth(): Promise<DmitHealth> {
  return dmitFetch<DmitHealth>("/v1/health", { accessToken: null });
}
