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
import { isFullTokfaiApiKey } from "@/lib/tokfai-api";

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
    this.name = "DmitApiError";
    this.status = args.status;
    this.code = args.code;
    this.type = args.type;
    this.body = args.body;
    this.requestMethod = args.requestMethod;
    this.requestUrl = args.requestUrl;
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
    throw toApiError(res.status, parsed, init.method, url);
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

function toApiError(
  status: number,
  body: unknown,
  method?: string,
  url?: string
): DmitApiError {
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

  return new DmitApiError({
    status,
    message,
    code,
    type,
    body,
    requestMethod: method,
    requestUrl: url,
  });
}

// ---------------------------------------------------------------------------
// API Keys — GET / POST / DELETE /v1/keys, POST /v1/keys/:id/reveal
// ---------------------------------------------------------------------------

/**
 * A user's API key as returned to the dashboard. The raw secret is never
 * stored client-side; DMIT returns it at creation time and reveals it only
 * on explicit owner copy requests.
 */
export interface ApiKey {
  id: string;
  name: string;
  /** First few public chars of the key, for display, e.g. "sk-tokfai_6b7f...". */
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at?: string | null;
}

export interface ApiKeyWithSecret extends ApiKey {
  /** Full plaintext key. Keep in memory only long enough to display/copy. */
  secret: string;
}

interface ListApiKeysResponse {
  data: ApiKey[];
}

interface ApiKeyWithSecretResponse {
  data: ApiKeyWithSecret;
}

interface RevealApiKeyResponse {
  data: {
    secret: string;
  };
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

export async function revealApiKey(
  id: string,
  auth: DmitSessionAuth
): Promise<string> {
  const accessToken = requireDmitAccessToken(auth.accessToken);
  const res = await dmitFetch<RevealApiKeyResponse>(
    `/v1/keys/${encodeURIComponent(id)}/reveal`,
    {
      method: "POST",
      accessToken,
    }
  );
  return res.data.secret;
}

export interface RevokeApiKeyResponse {
  api_key?: {
    id: string;
    status: "revoked";
    revoked_at: string;
  };
  data: {
    id: string;
    status: "revoked";
    revoked_at: string;
  };
}

// ---------------------------------------------------------------------------
// Me API Keys — POST /v1/me/api-keys (dashboard V0.6)
// ---------------------------------------------------------------------------

export interface MeApiKeyMetadata {
  id: string;
  name: string;
  key_prefix: string;
  status: "active" | "revoked" | string;
  created_at: string;
  last_used_at: string | null;
  revoked_at?: string | null;
  can_reveal: boolean;
}

export type CreateApiKeyResponse = {
  api_key: MeApiKeyMetadata;
  secret: string;
  /** Backwards-compatible alias for older dashboard callers. */
  one_time_secret: string;
};

export interface CreateMeApiKeyInput {
  name?: string;
}

function readNonEmptyString(
  obj: Record<string, unknown>,
  key: string
): string | undefined {
  const value = obj[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Normalizes POST /v1/me/api-keys create responses.
 * Full secret is returned once at creation — never from list endpoints.
 */
export function parseCreateApiKeyResponse(raw: unknown): CreateApiKeyResponse {
  if (!raw || typeof raw !== "object") {
    throw new DmitApiError({
      status: 500,
      message: "Invalid API key create response.",
      code: "invalid_create_response",
    });
  }

  const body = raw as Record<string, unknown>;

  // Prefer the current top-level secret; accept one_time_secret from older DMIT builds.
  const oneTimeSecret =
    readNonEmptyString(body, "secret") ??
    readNonEmptyString(body, "one_time_secret");
  if (!oneTimeSecret) {
    throw new DmitApiError({
      status: 500,
      message:
        "API key was created but the one-time secret was missing from the server response.",
      code: "missing_create_secret",
    });
  }

  if (!isFullTokfaiApiKey(oneTimeSecret)) {
    throw new DmitApiError({
      status: 500,
      message:
        "API key was created but the one-time secret in the response was incomplete. Deploy the latest api.tokfai.com and try again.",
      code: "invalid_create_secret",
    });
  }

  const apiKeyRaw =
    body.api_key && typeof body.api_key === "object"
      ? (body.api_key as Record<string, unknown>)
      : null;

  if (!apiKeyRaw || typeof apiKeyRaw.id !== "string") {
    throw new DmitApiError({
      status: 500,
      message: "API key metadata missing from create response.",
      code: "missing_create_metadata",
    });
  }

  const key_prefix =
    readNonEmptyString(apiKeyRaw, "key_prefix") ??
    readNonEmptyString(apiKeyRaw, "prefix") ??
    "";

  const statusField = apiKeyRaw.status;
  const status =
    statusField === "revoked" || apiKeyRaw.revoked_at
      ? "revoked"
      : "active";

  const api_key: MeApiKeyMetadata = {
    id: apiKeyRaw.id,
    name:
      typeof apiKeyRaw.name === "string" ? apiKeyRaw.name : "API Key",
    key_prefix,
    status,
    created_at:
      typeof apiKeyRaw.created_at === "string"
        ? apiKeyRaw.created_at
        : new Date().toISOString(),
    last_used_at:
      typeof apiKeyRaw.last_used_at === "string"
        ? apiKeyRaw.last_used_at
        : null,
    revoked_at:
      typeof apiKeyRaw.revoked_at === "string" ? apiKeyRaw.revoked_at : null,
    can_reveal:
      typeof apiKeyRaw.can_reveal === "boolean"
        ? apiKeyRaw.can_reveal
        : status === "active",
  };

  return { api_key, secret: oneTimeSecret, one_time_secret: oneTimeSecret };
}

/** POST /v1/me/api-keys — returns the full secret in `secret`. */
export async function createApiKey(
  input: CreateMeApiKeyInput,
  auth: DmitSessionAuth
): Promise<CreateApiKeyResponse> {
  const accessToken = requireDmitAccessToken(auth.accessToken);
  const raw = await dmitFetch<unknown>("/v1/me/api-keys", {
    method: "POST",
    json: input,
    accessToken,
  });
  return parseCreateApiKeyResponse(raw);
}

/** POST /v1/me/api-keys/revoke — soft-revoke; key stays in the list. */
export function parseRevokeApiKeyResponse(raw: unknown): RevokeApiKeyResponse {
  if (!raw || typeof raw !== "object") {
    throw new DmitApiError({
      status: 500,
      message: "Invalid API key revoke response.",
      code: "invalid_revoke_response",
    });
  }

  const body = raw as Record<string, unknown>;
  const dataRaw =
    body.data && typeof body.data === "object"
      ? (body.data as Record<string, unknown>)
      : body.api_key && typeof body.api_key === "object"
        ? (body.api_key as Record<string, unknown>)
      : null;

  if (
    !dataRaw ||
    typeof dataRaw.id !== "string" ||
    typeof dataRaw.revoked_at !== "string"
  ) {
    throw new DmitApiError({
      status: 500,
      message: "API key metadata missing from revoke response.",
      code: "missing_revoke_metadata",
    });
  }

  const apiKey = {
    id: dataRaw.id,
    status: "revoked" as const,
    revoked_at: dataRaw.revoked_at,
  };

  return {
    api_key: apiKey,
    data: apiKey,
  };
}

export async function revokeApiKey(
  id: string,
  auth: DmitSessionAuth
): Promise<RevokeApiKeyResponse> {
  const accessToken = requireDmitAccessToken(auth.accessToken);
  const path = "/v1/me/api-keys/revoke";
  const requestUrl = `${getDmitBaseUrl()}${path}`;
  const requestMethod = "POST";

  try {
    const raw = await dmitFetch<unknown>(path, {
      method: requestMethod,
      json: { id },
      accessToken,
    });
    return parseRevokeApiKeyResponse(raw);
  } catch (err) {
    if (err instanceof DmitApiError) {
      throw new DmitApiError({
        status: err.status,
        message: err.message,
        code: err.code,
        type: err.type,
        body: err.body,
        requestMethod,
        requestUrl,
      });
    }
    throw err;
  }
}

export interface RevealMeApiKeyResponse {
  ok?: boolean;
  secret?: string;
  data?: {
    secret?: string;
  };
}

/** POST /v1/me/api-keys/:id/reveal — explicit owner copy request. */
export async function revealMeApiKey(
  id: string,
  auth: DmitSessionAuth
): Promise<string> {
  const accessToken = requireDmitAccessToken(auth.accessToken);
  const raw = await dmitFetch<RevealMeApiKeyResponse>(
    `/v1/me/api-keys/${encodeURIComponent(id)}/reveal`,
    {
      method: "POST",
      accessToken,
    }
  );
  const secret = raw.secret ?? raw.data?.secret;
  if (!secret) {
    throw new DmitApiError({
      status: 500,
      message: "API key secret missing from reveal response.",
      code: "missing_reveal_secret",
      requestMethod: "POST",
      requestUrl: `${getDmitBaseUrl()}/v1/me/api-keys/${encodeURIComponent(
        id
      )}/reveal`,
    });
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Billing — Stripe Checkout (UI wired in /dashboard/credits)
// ---------------------------------------------------------------------------

export interface CreateCheckoutSessionInput {
  package_code: "starter" | "pro" | "business";
  accessToken: string;
}

export interface CreateCheckoutSessionResponse {
  /** Stripe Checkout URL — redirect the browser to this. */
  url: string;
  session_id: string;
  order_id: string;
  plan_id: CreateCheckoutSessionInput["package_code"];
  amount_cents: number;
  credits: number;
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
  const { accessToken, package_code } = input;
  return dmitFetch<CreateCheckoutSessionResponse>(
    "/v1/billing/checkout",
    {
      method: "POST",
      accessToken,
      json: { package_code },
    }
  );
}

// ---------------------------------------------------------------------------
// Chat completions — POST /v1/chat/completions
//
// Auth: sk-tokfai_ API key (external customers) or Supabase access JWT
// (dashboard Playground). DMIT runs the same billing / usage logging for both.
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
  credits_charged?: number;
  request_id?: string;
  tokfai?: TokfaiCompletionExtension;
}

export interface ModelListItem {
  id: string;
  object?: "model" | string;
  created?: number;
  owned_by?: string;
}

export interface ModelListResponse {
  object: "list";
  data: ModelListItem[];
}

export async function listModels(apiKey: string): Promise<ModelListItem[]> {
  if (!apiKey) {
    throw new DmitApiError({
      status: 400,
      message: "Missing API key.",
      code: "no_api_key",
    });
  }
  const res = await dmitFetch<ModelListResponse | ModelListItem[]>(
    "/v1/models",
    {
      method: "GET",
      accessToken: apiKey,
    }
  );
  return Array.isArray(res) ? res : res.data;
}

/**
 * Dashboard Playground — POST /v1/chat/completions with the Supabase JWT.
 */
export async function playgroundChatCompletions(
  accessToken: string,
  body: Pick<ChatCompletionRequest, "model" | "messages">
): Promise<ChatCompletionResponse> {
  const token = requireDmitAccessToken(accessToken);
  const res = await dmitFetchWithHeaders<ChatCompletionResponse>(
    "/v1/chat/completions",
    {
      method: "POST",
      json: { ...body, stream: false },
      accessToken: token,
    }
  );
  const requestId = res.headers.get("x-request-id");
  if (!requestId) return res.data;
  return {
    ...res.data,
    tokfai: {
      ...res.data.tokfai,
      request_id: res.data.tokfai?.request_id ?? requestId,
    },
  };
}

/**
 * Call POST /v1/chat/completions using the user's own sk-tokfai_... key.
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
  const res = await dmitFetchWithHeaders<ChatCompletionResponse>(
    "/v1/chat/completions",
    {
      method: "POST",
      json: body,
      // Bypass Supabase session lookup; use the customer key directly.
      accessToken: apiKey,
    }
  );
  const requestId = res.headers.get("x-request-id");
  if (!requestId) return res.data;
  return {
    ...res.data,
    tokfai: {
      ...res.data.tokfai,
      request_id: res.data.tokfai?.request_id ?? requestId,
    },
  };
}

async function dmitFetchWithHeaders<T = unknown>(
  path: string,
  options: DmitFetchOptions = {}
): Promise<{ data: T; headers: Headers }> {
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
