/**
 * Dashboard API key mutations — explicit JWT, no Supabase browser client.
 */

import { getDmitBaseUrl } from "./constants";
import {
  assertFullApiKeySecret,
  DashboardDmitApiError,
  developerDmitFetch,
} from "./dmit-fetch";

export { DashboardDmitApiError as DmitApiError };

export interface DashboardSessionAuth {
  accessToken: string;
}

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

export { getDmitBaseUrl };

function readNonEmptyString(
  obj: Record<string, unknown>,
  key: string
): string | undefined {
  const value = obj[key];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseCreateApiKeyResponse(raw: unknown): CreateApiKeyResponse {
  if (!raw || typeof raw !== "object") {
    throw new DashboardDmitApiError({
      status: 500,
      message: "Invalid API key create response.",
      code: "invalid_create_response",
    });
  }

  const body = raw as Record<string, unknown>;
  const secret = readNonEmptyString(body, "secret");
  if (!secret) {
    throw new DashboardDmitApiError({
      status: 500,
      message:
        "API key was created but the one-time secret was missing from the server response.",
      code: "missing_create_secret",
    });
  }

  assertFullApiKeySecret(secret, "create");

  const apiKeyRaw =
    body.api_key && typeof body.api_key === "object"
      ? (body.api_key as Record<string, unknown>)
      : null;

  if (!apiKeyRaw || typeof apiKeyRaw.id !== "string") {
    throw new DashboardDmitApiError({
      status: 500,
      message: "API key metadata missing from create response.",
      code: "missing_create_metadata",
    });
  }

  const prefix = readNonEmptyString(apiKeyRaw, "prefix") ?? "";
  const statusField = apiKeyRaw.status;
  const status =
    statusField === "revoked" || apiKeyRaw.revoked_at ? "revoked" : "active";

  const api_key: MeApiKeyMetadata = {
    id: apiKeyRaw.id,
    name: typeof apiKeyRaw.name === "string" ? apiKeyRaw.name : "API Key",
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

export async function createApiKey(
  input: { name?: string },
  auth: DashboardSessionAuth
): Promise<CreateApiKeyResponse> {
  const raw = await developerDmitFetch<unknown>(ME_API_KEYS_PATH, {
    method: "POST",
    json: input,
    accessToken: auth.accessToken,
  });
  return parseCreateApiKeyResponse(raw);
}

export function parseRevokeApiKeyResponse(raw: unknown): RevokeApiKeyResponse {
  if (!raw || typeof raw !== "object") {
    throw new DashboardDmitApiError({
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
    throw new DashboardDmitApiError({
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

  return { api_key: apiKey, data: apiKey };
}

export async function revokeApiKey(
  id: string,
  auth: DashboardSessionAuth
): Promise<RevokeApiKeyResponse> {
  const path = ME_API_KEYS_REVOKE_PATH;
  const requestUrl = `${getDmitBaseUrl()}${path}`;
  const requestMethod = "POST";

  try {
    const raw = await developerDmitFetch<unknown>(path, {
      method: requestMethod,
      json: { id },
      accessToken: auth.accessToken,
    });
    return parseRevokeApiKeyResponse(raw);
  } catch (err) {
    if (err instanceof DashboardDmitApiError) {
      throw new DashboardDmitApiError({
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

interface RevealMeApiKeyResponse {
  ok?: boolean;
  secret?: string;
  api_key?: { id?: string; secret?: string };
  data?: { secret?: string };
}

export async function revealMeApiKey(
  id: string,
  auth: DashboardSessionAuth
): Promise<string> {
  const path = ME_API_KEYS_REVEAL_PATH;
  const raw = await developerDmitFetch<RevealMeApiKeyResponse>(path, {
    method: "POST",
    json: { id },
    accessToken: auth.accessToken,
  });
  const secret = raw.secret ?? raw.api_key?.secret ?? raw.data?.secret;
  if (!secret) {
    throw new DashboardDmitApiError({
      status: 500,
      message: "API key secret missing from reveal response.",
      code: "missing_reveal_secret",
      requestMethod: "POST",
      requestUrl: `${getDmitBaseUrl()}${path}`,
    });
  }
  assertFullApiKeySecret(secret, "reveal");
  return secret;
}
