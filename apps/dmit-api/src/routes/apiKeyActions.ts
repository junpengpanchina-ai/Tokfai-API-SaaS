import type { Context } from "hono";

import { decryptSecret, encryptSecretIfConfigured } from "../auth/keyEncryption.js";
import { maskApiKeyId } from "../auth/apiKey.js";
import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import { supabase } from "../supabase.js";
import type { ApiKeyRow, AuthedUser } from "../types.js";

type RevokedApiKeyRow = Pick<ApiKeyRow, "id" | "revoked_at">;
type ApiKeyOwnerRow = Pick<ApiKeyRow, "id" | "prefix" | "key_id">;

const RESERVED_ROUTE_IDS = new Set(["revoke", "reveal"]);

function authedUser(c: { get: (key: never) => unknown }): AuthedUser {
  return c.get("user" as never) as AuthedUser;
}

function truncateDbError(message: string, max = 160): string {
  const trimmed = message.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max)}…`;
}

export async function readApiKeyId(c: Context): Promise<string> {
  const paramId = c.req.param("id")?.trim();
  if (paramId && !RESERVED_ROUTE_IDS.has(paramId)) return paramId;

  const body = (await c.req.json().catch(() => null)) as
    | { id?: unknown; key_id?: unknown }
    | null;

  if (typeof body?.id === "string") {
    const trimmed = body.id.trim();
    if (trimmed) return trimmed;
  }
  if (typeof body?.key_id === "string") {
    const trimmed = body.key_id.trim();
    if (trimmed) return trimmed;
  }
  return "";
}

async function resolveApiKeyOwnerRow(
  userId: string,
  identifier: string
): Promise<ApiKeyOwnerRow | null> {
  const sb = supabase();
  const baseSelect = "id, prefix, key_id";

  const byId = await sb
    .from("api_keys")
    .select<string, ApiKeyOwnerRow>(baseSelect)
    .eq("id", identifier)
    .eq("user_id", userId)
    .maybeSingle();

  if (byId.error) {
    throw ApiError.internal(
      `Failed to resolve API key: ${byId.error.message}`,
      "api_key_resolve_failed"
    );
  }
  if (byId.data) return byId.data;

  const byKeyId = await sb
    .from("api_keys")
    .select<string, ApiKeyOwnerRow>(baseSelect)
    .eq("key_id", identifier)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byKeyId.error) {
    throw ApiError.internal(
      `Failed to resolve API key: ${byKeyId.error.message}`,
      "api_key_resolve_failed"
    );
  }
  return byKeyId.data;
}

export async function revokeApiKey(c: Context, id: string) {
  const user = authedUser(c);
  if (!id) {
    throw ApiError.badRequest("Missing API key id.", "missing_api_key_id");
  }

  const owner = await resolveApiKeyOwnerRow(user.id, id);
  if (!owner) {
    log.warn("revoke_api_key_failed", {
      userId: user.id,
      code: "api_key_not_found",
      keyId: maskApiKeyId(id),
      message: "API key not found for revoke.",
    });
    throw ApiError.notFound("API key not found.", "api_key_not_found");
  }

  const revokedAt = new Date().toISOString();
  const { data, error } = await supabase()
    .from("api_keys")
    .update({ revoked_at: revokedAt })
    .eq("id", owner.id)
    .eq("user_id", user.id)
    .select("id, revoked_at")
    .maybeSingle<RevokedApiKeyRow>();

  if (error) {
    log.warn("revoke_api_key_failed", {
      userId: user.id,
      code: "api_key_revoke_failed",
      keyId: maskApiKeyId(owner.id),
      dbErrorMessage: truncateDbError(error.message),
      message: "Failed to revoke API key.",
    });
    throw ApiError.internal(
      `Failed to revoke API key: ${error.message}`,
      "api_key_revoke_failed"
    );
  }
  if (!data) {
    log.warn("revoke_api_key_failed", {
      userId: user.id,
      code: "api_key_not_found",
      keyId: maskApiKeyId(owner.id),
      message: "API key not found after resolve.",
    });
    throw ApiError.notFound("API key not found.", "api_key_not_found");
  }

  return c.json({
    ok: true,
    api_key: {
      id: data.id,
      status: "revoked" as const,
      revoked_at: data.revoked_at ?? revokedAt,
    },
    data: {
      id: data.id,
      status: "revoked" as const,
      revoked_at: data.revoked_at ?? revokedAt,
    },
  });
}

export async function revealApiKey(c: Context, id: string) {
  const user = authedUser(c);
  if (!id) {
    throw ApiError.badRequest("Missing API key id.", "missing_api_key_id");
  }

  const owner = await resolveApiKeyOwnerRow(user.id, id);
  if (!owner) {
    throw ApiError.notFound("API key not found.", "api_key_not_found");
  }

  const { data, error } = await supabase()
    .from("api_keys")
    .select<string, { encrypted_secret: string | null; revoked_at: string | null }>(
      "encrypted_secret, revoked_at"
    )
    .eq("id", owner.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw ApiError.internal(
      `Failed to reveal API key: ${error.message}`,
      "api_key_reveal_failed"
    );
  }
  if (!data) {
    throw ApiError.notFound("API key not found.", "api_key_not_found");
  }
  if (data.revoked_at) {
    throw ApiError.forbidden(
      "Revoked API keys cannot be revealed.",
      "key_revoked"
    );
  }
  if (!data.encrypted_secret) {
    throw new ApiError({
      status: 404,
      message: "This key cannot be revealed. Please create a new one.",
      code: "secret_unavailable",
      type: "not_found",
    });
  }

  const secret = decryptSecret(data.encrypted_secret);
  return c.json({
    api_key: {
      id: owner.id,
      secret,
    },
    secret,
  });
}

export function logCreateApiKeyFailed(
  userId: string,
  errorCode: string,
  dbErrorMessage?: string
) {
  log.error("create_api_key_failed", {
    userId,
    code: errorCode,
    dbErrorMessage: dbErrorMessage
      ? truncateDbError(dbErrorMessage)
      : undefined,
    message: "Failed to create API key.",
  });
}
