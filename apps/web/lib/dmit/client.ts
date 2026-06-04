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
    process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/+$/, "") ??
    process.env.NEXT_PUBLIC_DMIT_API_BASE?.replace(/\/+$/, "") ??
    DEFAULT_BASE
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
// Me API Keys — dashboard
// ---------------------------------------------------------------------------

/** Pass `accessToken` from the server session for reliable dashboard auth. */
export interface DmitSessionAuth {
  accessToken: string;
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

export const ME_API_KEYS_PATH = "/v1/me/api-keys";
export const ME_API_KEYS_REVEAL_PATH = `${ME_API_KEYS_PATH}/reveal`;
export const ME_API_KEYS_REVOKE_PATH = `${ME_API_KEYS_PATH}/revoke`;

export interface MeApiKeyMetadata {
  id: string;
  name: string;
  prefix: string;
  status: "active" | "revoked" | string;
  created_at: string;
  last_used_at: string | null;
  revoked_at?: string | null;
  can_reveal: boolean;
}

export type CreateApiKeyResponse = {
  api_key: MeApiKeyMetadata;
  secret: string;
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

  const secret = readNonEmptyString(body, "secret");
  if (!secret) {
    throw new DmitApiError({
      status: 500,
      message:
        "API key was created but the one-time secret was missing from the server response.",
      code: "missing_create_secret",
    });
  }

  if (!isFullTokfaiApiKey(secret)) {
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

  const prefix = readNonEmptyString(apiKeyRaw, "prefix") ?? "";

  const statusField = apiKeyRaw.status;
  const status =
    statusField === "revoked" || apiKeyRaw.revoked_at
      ? "revoked"
      : "active";

  const api_key: MeApiKeyMetadata = {
    id: apiKeyRaw.id,
    name:
      typeof apiKeyRaw.name === "string" ? apiKeyRaw.name : "API Key",
    prefix,
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

  return { api_key, secret };
}

/** POST /v1/me/api-keys — returns the full secret in `secret`. */
export async function createApiKey(
  input: CreateMeApiKeyInput,
  auth: DmitSessionAuth
): Promise<CreateApiKeyResponse> {
  const accessToken = requireDmitAccessToken(auth.accessToken);
  const raw = await dmitFetch<unknown>(ME_API_KEYS_PATH, {
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

  if (!dataRaw || typeof dataRaw.id !== "string") {
    throw new DmitApiError({
      status: 500,
      message: "API key metadata missing from revoke response.",
      code: "missing_revoke_metadata",
    });
  }

  const revokedAt =
    typeof dataRaw.revoked_at === "string"
      ? dataRaw.revoked_at
      : new Date().toISOString();

  const apiKey = {
    id: dataRaw.id,
    status: "revoked" as const,
    revoked_at: revokedAt,
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
  const path = ME_API_KEYS_REVOKE_PATH;
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
  api_key?: {
    id?: string;
    secret?: string;
  };
  data?: {
    secret?: string;
  };
}

/** POST /v1/me/api-keys/reveal — explicit owner copy request. */
export async function revealMeApiKey(
  id: string,
  auth: DmitSessionAuth
): Promise<string> {
  const accessToken = requireDmitAccessToken(auth.accessToken);
  const path = ME_API_KEYS_REVEAL_PATH;
  const raw = await dmitFetch<RevealMeApiKeyResponse>(path, {
    method: "POST",
    json: { id },
    accessToken,
  });
  const secret = raw.secret ?? raw.api_key?.secret ?? raw.data?.secret;
  if (!secret) {
    throw new DmitApiError({
      status: 500,
      message: "API key secret missing from reveal response.",
      code: "missing_reveal_secret",
      requestMethod: "POST",
      requestUrl: `${getDmitBaseUrl()}${path}`,
    });
  }
  if (!isFullTokfaiApiKey(secret)) {
    throw new DmitApiError({
      status: 500,
      message:
        "The server returned an incomplete key. Create a new key to copy the full secret.",
      code: "invalid_reveal_secret",
      requestMethod: "POST",
      requestUrl: `${getDmitBaseUrl()}${path}`,
    });
  }
  return secret;
}

// ---------------------------------------------------------------------------
// Billing — Stripe Checkout (UI wired in /dashboard/credits)
// ---------------------------------------------------------------------------

export interface BillingRechargePlan {
  plan_id: string;
  name: string;
  amount_cents: number;
  currency: string;
  base_credits: number;
  bonus_credits: number;
  /** Final credited amount (= base_credits + bonus_credits). */
  credits: number;
  enabled: boolean;
  visible: boolean;
  sort_order: number;
  badge: string | null;
  description: string | null;
}

export interface CreateCheckoutSessionInput {
  plan_id: string;
  accessToken: string;
}

export interface CreateCheckoutSessionResponse {
  /** Stripe Checkout URL — redirect the browser to this. */
  url: string;
  session_id: string;
  order_id: string;
  plan_id: string;
  amount_cents: number;
  credits: number;
}

export interface CatalogModelPricingItem {
  model_id: string;
  display_name: string | null;
  model_type: string | null;
  billing_type: "chat" | "image";
  input_credits_per_million_tokens: number | null;
  output_credits_per_million_tokens: number | null;
  image_credits_per_generation: number | null;
  updated_at: string | null;
}

export async function listCatalogModelPricing(
  accessToken: string
): Promise<CatalogModelPricingItem[]> {
  const res = await dmitFetch<{ data?: CatalogModelPricingItem[] }>(
    "/v1/catalog/model-pricing",
    {
      method: "GET",
      accessToken,
    }
  );
  return Array.isArray(res.data) ? res.data : [];
}

/**
 * List visible recharge plans for the credits dashboard.
 */
export async function listBillingRechargePlans(
  accessToken: string
): Promise<BillingRechargePlan[]> {
  const res = await dmitFetch<{ data?: BillingRechargePlan[] }>(
    "/v1/billing/plans",
    {
      method: "GET",
      accessToken,
    }
  );
  return Array.isArray(res.data) ? res.data : [];
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
  const { accessToken, plan_id } = input;
  return dmitFetch<CreateCheckoutSessionResponse>(
    "/v1/billing/checkout",
    {
      method: "POST",
      accessToken,
      json: { plan_id },
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
// Image generations — POST /v1/images/generations
//
// Auth: sk-tokfai_ API key only (same as external customers).
// ---------------------------------------------------------------------------

export interface ImageGenerationRequest {
  model: string;
  prompt: string;
  size?: string;
  n?: number;
  response_format?: "url";
  image_urls?: string[];
}

export interface ImageGenerationDataItem {
  url?: string;
  b64_json?: string;
}

export type ImageUrlResolveSource =
  | "direct"
  | "google_imgres"
  | "html_og_image"
  | "html_twitter_image"
  | "html_first_image";

export interface ImageGenerationResponse {
  created: number;
  data: ImageGenerationDataItem[];
  model: string;
  request_id?: string;
  upstream_id?: string;
  credits_charged?: number;
  input_images_count?: number;
  resolved_images_count?: number;
  image_url_sources?: ImageUrlResolveSource[];
}

/**
 * Call POST /v1/images/generations using the user's own sk-tokfai_... key.
 *
 * The api key is passed through to the Authorization header and never logged,
 * stored, or persisted by this module.
 */
export async function imageGenerations(
  apiKey: string,
  body: ImageGenerationRequest
): Promise<ImageGenerationResponse> {
  if (!apiKey) {
    throw new DmitApiError({
      status: 400,
      message: "Missing API key.",
      code: "no_api_key",
    });
  }
  return dmitFetch<ImageGenerationResponse>("/v1/images/generations", {
    method: "POST",
    json: {
      ...body,
      n: body.n ?? 1,
      response_format: body.response_format ?? "url",
      image_urls: body.image_urls ?? [],
    },
    accessToken: apiKey,
  });
}

// ---------------------------------------------------------------------------
// Usage query — GET /v1/me/usage/summary
// ---------------------------------------------------------------------------

export interface MeUsageSummary {
  total_requests: number;
  succeeded_requests: number;
  failed_requests: number;
  total_tokens: number;
  total_prompt_tokens: number;
  total_completion_tokens: number;
  total_credits_charged: number;
}

export interface MeUsageSummaryFilters {
  start_date: string | null;
  end_date: string | null;
  api_key_id: string | null;
  model: string | null;
  status: string | null;
}

export interface MeUsageLogEntry {
  id: string;
  created_at: string;
  api_key_id?: string | null;
  prefix?: string | null;
  model: string | null;
  status: string;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  credits_charged: number | string | null;
  request_id: string | null;
  error_code: string | null;
}

export interface MeUsageSummaryResponse {
  summary: MeUsageSummary;
  filters: MeUsageSummaryFilters;
  data: MeUsageLogEntry[];
}

export interface MeUsageSummaryQuery {
  start_date?: string;
  end_date?: string;
  api_key_id?: string;
  model?: string;
  status?: "succeeded" | "failed";
  limit?: number;
}

function buildUsageSummaryQuery(params: MeUsageSummaryQuery): string {
  const search = new URLSearchParams();
  if (params.start_date) search.set("start_date", params.start_date);
  if (params.end_date) search.set("end_date", params.end_date);
  if (params.api_key_id) search.set("api_key_id", params.api_key_id);
  if (params.model) search.set("model", params.model);
  if (params.status) search.set("status", params.status);
  if (params.limit != null) search.set("limit", String(params.limit));
  const qs = search.toString();
  return qs ? `/v1/me/usage/summary?${qs}` : "/v1/me/usage/summary";
}

/** GET /v1/me/usage/summary — browser-side usage query with aggregates. */
export async function fetchMyUsageSummary(
  params: MeUsageSummaryQuery = {}
): Promise<MeUsageSummaryResponse> {
  return dmitFetch<MeUsageSummaryResponse>(buildUsageSummaryQuery(params));
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

// ---------------------------------------------------------------------------
// Announcements — GET /v1/announcements (public)
// ---------------------------------------------------------------------------

import {
  ANNOUNCEMENT_TYPE_OPTIONS,
  type AnnouncementType,
  type PublicAnnouncement,
} from "@/lib/announcements";

export type { AnnouncementType, PublicAnnouncement } from "@/lib/announcements";

function normalizeAnnouncementType(value: string): AnnouncementType {
  return ANNOUNCEMENT_TYPE_OPTIONS.includes(value as AnnouncementType)
    ? (value as AnnouncementType)
    : "notice";
}

function mapPublicAnnouncement(row: PublicAnnouncement & { type: string }): PublicAnnouncement {
  return { ...row, type: normalizeAnnouncementType(row.type) };
}

export async function listPublicAnnouncements(
  limit = 10
): Promise<PublicAnnouncement[]> {
  const res = await dmitFetch<{ data?: (PublicAnnouncement & { type: string })[] }>(
    `/v1/announcements?limit=${limit}`,
    { accessToken: null }
  );
  return Array.isArray(res.data) ? res.data.map(mapPublicAnnouncement) : [];
}

export async function getPublicAnnouncementBySlug(
  slug: string
): Promise<PublicAnnouncement | null> {
  try {
    const res = await dmitFetch<{ data: PublicAnnouncement }>(
      `/v1/announcements/${encodeURIComponent(slug)}`,
      { accessToken: null }
    );
    return res.data ? mapPublicAnnouncement(res.data) : null;
  } catch (err) {
    if (err instanceof DmitApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}
