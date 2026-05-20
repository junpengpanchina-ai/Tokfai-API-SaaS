import type { Context } from "hono";

import { decryptSecret } from "../auth/keyEncryption.js";
import { ApiError } from "../errors.js";
import { supabase } from "../supabase.js";
import type { AuthedUser } from "../types.js";

function authedUser(c: { get: (key: never) => unknown }): AuthedUser {
  return c.get("user" as never) as AuthedUser;
}

export async function readApiKeyId(c: Context): Promise<string> {
  const paramId = c.req.param("id")?.trim();
  if (paramId) return paramId;

  const body = (await c.req.json().catch(() => null)) as
    | { id?: unknown }
    | null;
  return typeof body?.id === "string" ? body.id.trim() : "";
}

export async function revokeApiKey(c: Context, id: string) {
  const user = authedUser(c);
  if (!id) {
    throw ApiError.badRequest("Missing API key id.", "missing_api_key_id");
  }

  const { data, error } = await supabase()
    .from("api_keys")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw ApiError.internal(
      `Failed to revoke API key: ${error.message}`,
      "api_key_revoke_failed"
    );
  }
  if (!data) {
    throw ApiError.notFound("API key not found.", "api_key_not_found");
  }

  return c.json({
    ok: true,
    api_key: {
      id: data.id,
      status: "revoked",
    },
  });
}

export async function revealApiKey(c: Context, id: string) {
  const user = authedUser(c);
  if (!id) {
    throw ApiError.badRequest("Missing API key id.", "missing_api_key_id");
  }

  const { data, error } = await supabase()
    .from("api_keys")
    .select<string, { encrypted_secret: string | null; revoked_at: string | null }>(
      "encrypted_secret, revoked_at"
    )
    .eq("id", id)
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
      id,
      secret,
    },
    secret,
  });
}
