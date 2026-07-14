"use server";

/**
 * Session-driven image workbench proxy.
 * Resolves the user's API key only on the Next.js server — never returns the
 * secret to the browser. Billing still uses the user's own sk-tokfai key on DMIT.
 */

import { cookies, headers } from "next/headers";

import { parseCreateApiKeyResponse } from "./api-keys-client";
import { isFullTokfaiApiKey } from "./constants";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
} from "./chat-api";
import type {
  ImageGenerationRequest,
  ImageGenerationResponse,
} from "./image-api";
import {
  DmitServerError,
  dmitServerFetch,
  dmitServerFetchWithHeaders,
} from "@/lib/dmit/server";
import { createClient } from "@/lib/supabase/server";

const WORKBENCH_KEY_COOKIE = "tokfai_wb_sk";
const WORKBENCH_KEY_COOKIE_MAX_AGE = 60 * 60;
const DEFAULT_WORKBENCH_KEY_NAME = "Default Playground Key";

export type ConsumerWorkbenchErrorPayload = {
  ok: false;
  status: number;
  message: string;
  code?: string;
};

export type ConsumerWorkbenchOk<T> = { ok: true; data: T };

function requestHost(): string | null {
  const h = headers();
  return (
    h.get("x-tokfai-host")?.trim() ||
    h.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    h.get("host")?.trim() ||
    null
  );
}

async function requireAccessToken(): Promise<string> {
  const supabase = createClient();
  if (!supabase) {
    throw new DmitServerError({
      status: 503,
      message: "Service temporarily unavailable.",
      code: "service_unavailable",
    });
  }
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new DmitServerError({
      status: 401,
      message: "Please sign in again.",
      code: "not_authenticated",
    });
  }
  return session.access_token;
}

function readCachedWorkbenchKey(): string | null {
  try {
    const value = cookies().get(WORKBENCH_KEY_COOKIE)?.value?.trim() ?? "";
    return isFullTokfaiApiKey(value) ? value : null;
  } catch {
    return null;
  }
}

function writeCachedWorkbenchKey(secret: string): void {
  try {
    cookies().set(WORKBENCH_KEY_COOKIE, secret, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: WORKBENCH_KEY_COOKIE_MAX_AGE,
    });
  } catch {
    // RSC / edge contexts may not allow set — resolve again next call.
  }
}

function clearCachedWorkbenchKey(): void {
  try {
    cookies().set(WORKBENCH_KEY_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
  } catch {
    /* ignore */
  }
}

type ListedKey = {
  id: string;
  name: string;
  prefix: string;
  status: string;
  can_reveal?: boolean;
};

async function listActiveKeys(
  accessToken: string,
  host: string | null
): Promise<ListedKey[]> {
  const res = await dmitServerFetch<
    | { data: ListedKey[] }
    | { ok: true; keys: ListedKey[] }
  >("/v1/me/api-keys", accessToken, { host });
  const rows = "data" in res ? res.data : res.keys;
  return (rows ?? []).filter((row) => row.status === "active");
}

async function revealKey(
  accessToken: string,
  host: string | null,
  id: string
): Promise<string | null> {
  try {
    const raw = await dmitServerFetch<{
      secret?: string;
      api_key?: { secret?: string };
      data?: { secret?: string };
    }>("/v1/me/api-keys/reveal", accessToken, {
      host,
      method: "POST",
      json: { id },
    });
    const secret = raw.secret ?? raw.api_key?.secret ?? raw.data?.secret;
    return secret && isFullTokfaiApiKey(secret) ? secret : null;
  } catch {
    return null;
  }
}

async function createDefaultKey(
  accessToken: string,
  host: string | null,
  name: string
): Promise<string> {
  const raw = await dmitServerFetch<unknown>("/v1/me/api-keys", accessToken, {
    host,
    method: "POST",
    json: { name },
  });
  const created = parseCreateApiKeyResponse(raw);
  if (!isFullTokfaiApiKey(created.secret)) {
    throw new DmitServerError({
      status: 500,
      message: "Image service initialization failed.",
      code: "invalid_create_secret",
    });
  }
  return created.secret;
}

/**
 * Resolve a workbench API key on the server. Never exposed to the client.
 */
async function resolveWorkbenchApiKey(): Promise<string> {
  const cached = readCachedWorkbenchKey();
  if (cached) return cached;

  const accessToken = await requireAccessToken();
  const host = requestHost();
  const active = await listActiveKeys(accessToken, host);

  for (const key of active) {
    if (key.can_reveal === false) continue;
    const secret = await revealKey(accessToken, host, key.id);
    if (secret) {
      writeCachedWorkbenchKey(secret);
      return secret;
    }
  }

  try {
    const secret = await createDefaultKey(
      accessToken,
      host,
      DEFAULT_WORKBENCH_KEY_NAME
    );
    writeCachedWorkbenchKey(secret);
    return secret;
  } catch (err) {
    if (err instanceof DmitServerError && err.status === 409) {
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const secret = await createDefaultKey(
        accessToken,
        host,
        `${DEFAULT_WORKBENCH_KEY_NAME} ${stamp}`
      );
      writeCachedWorkbenchKey(secret);
      return secret;
    }
    throw err;
  }
}

function toActionError(err: unknown): ConsumerWorkbenchErrorPayload {
  if (err instanceof DmitServerError) {
    return {
      ok: false,
      status: err.status,
      message: err.message,
      code: err.code,
    };
  }
  if (err && typeof err === "object" && "status" in err && "message" in err) {
    const e = err as { status: number; message: string; code?: string };
    return {
      ok: false,
      status: e.status,
      message: e.message,
      code: e.code,
    };
  }
  return {
    ok: false,
    status: 500,
    message: "Image service initialization failed. Please refresh and retry.",
    code: "workbench_init_failed",
  };
}

export async function consumerChatCompletionsAction(
  body: ChatCompletionRequest
): Promise<ConsumerWorkbenchOk<ChatCompletionResponse> | ConsumerWorkbenchErrorPayload> {
  try {
    const apiKey = await resolveWorkbenchApiKey();
    const host = requestHost();
    const res = await dmitServerFetchWithHeaders<ChatCompletionResponse>(
      "/v1/chat/completions",
      apiKey,
      { host, method: "POST", json: body }
    );
    const requestId = res.headers.get("x-request-id");
    const data = requestId
      ? {
          ...res.data,
          tokfai: {
            ...res.data.tokfai,
            request_id: res.data.tokfai?.request_id ?? requestId,
          },
        }
      : res.data;
    return { ok: true, data };
  } catch (err) {
    if (
      err instanceof DmitServerError &&
      (err.status === 401 || err.code === "invalid_api_key")
    ) {
      clearCachedWorkbenchKey();
    }
    return toActionError(err);
  }
}

export async function consumerImageGenerationsAction(
  body: ImageGenerationRequest
): Promise<ConsumerWorkbenchOk<ImageGenerationResponse> | ConsumerWorkbenchErrorPayload> {
  try {
    const apiKey = await resolveWorkbenchApiKey();
    const host = requestHost();
    const res = await dmitServerFetchWithHeaders<ImageGenerationResponse>(
      "/v1/images/generations",
      apiKey,
      { host, method: "POST", json: body }
    );
    const requestId = res.headers.get("x-request-id");
    return {
      ok: true,
      data: {
        ...res.data,
        request_id: res.data.request_id ?? res.data.id ?? requestId ?? undefined,
      },
    };
  } catch (err) {
    if (
      err instanceof DmitServerError &&
      (err.status === 401 || err.code === "invalid_api_key")
    ) {
      clearCachedWorkbenchKey();
    }
    return toActionError(err);
  }
}

export async function consumerImageGenerationStatusAction(
  id: string
): Promise<ConsumerWorkbenchOk<ImageGenerationResponse> | ConsumerWorkbenchErrorPayload> {
  try {
    const apiKey = await resolveWorkbenchApiKey();
    const host = requestHost();
    const res = await dmitServerFetchWithHeaders<ImageGenerationResponse>(
      `/v1/images/generations/${encodeURIComponent(id)}`,
      apiKey,
      { host, method: "GET" }
    );
    return {
      ok: true,
      data: {
        ...res.data,
        request_id: res.data.request_id ?? res.data.id ?? id,
      },
    };
  } catch (err) {
    if (
      err instanceof DmitServerError &&
      (err.status === 401 || err.code === "invalid_api_key")
    ) {
      clearCachedWorkbenchKey();
    }
    return toActionError(err);
  }
}

export async function clearConsumerWorkbenchKeyCookieAction(): Promise<void> {
  clearCachedWorkbenchKey();
}
