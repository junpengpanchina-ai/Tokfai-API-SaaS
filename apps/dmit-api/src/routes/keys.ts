import { Hono } from "hono";

import { generateApiKey } from "../auth/apiKey.js";
import { decryptSecret, encryptSecret } from "../auth/keyEncryption.js";
import { ApiError } from "../errors.js";
import { requireSupabaseJwt } from "../middleware/supabaseJwt.js";
import { supabase } from "../supabase.js";
import type { AuthedUser } from "../types.js";

const MAX_NAME_LEN = 64;

function authedUser(c: { get: (key: never) => unknown }): AuthedUser {
  return c.get("user" as never) as AuthedUser;
}

/**
 * /v1/keys — managed by the dashboard. All three actions require a valid
 * Supabase JWT. user_id is resolved from the JWT — never from request body.
 */
export const keyRoutes = new Hono();

keyRoutes.use("/v1/keys", requireSupabaseJwt);
keyRoutes.use("/v1/keys/*", requireSupabaseJwt);

keyRoutes.get("/v1/keys", async (c) => {
  const user = authedUser(c);
  const sb = supabase();
  const { data, error } = await sb
    .from("api_keys")
    .select("id, name, prefix, created_at, last_used_at, revoked_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw ApiError.internal(
      `Failed to list API keys: ${error.message}`,
      "keys_list_failed"
    );
  }

  return c.json({ data: data ?? [] });
});

keyRoutes.post("/v1/keys", async (c) => {
  const user = authedUser(c);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw ApiError.badRequest("Invalid JSON body.", "invalid_json");
  }

  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw ApiError.badRequest("Request body must be a JSON object.", "invalid_body");
  }

  const nameField = (body as Record<string, unknown>).name;
  if (nameField === undefined || nameField === null) {
    throw ApiError.badRequest("name is required.", "name_required");
  }
  if (typeof nameField !== "string") {
    throw ApiError.badRequest("name must be a string.", "name_invalid_type");
  }

  const name = nameField.trim();
  if (!name) {
    throw ApiError.badRequest("name must be non-empty after trimming.", "name_empty");
  }
  if (name.length > MAX_NAME_LEN) {
    throw ApiError.badRequest(`name must be at most ${MAX_NAME_LEN} characters.`, "name_too_long");
  }

  const material = generateApiKey();
  const encryptedSecret = encryptSecret(material.fullKey);
  const sb = supabase();
  const { data, error } = await sb
    .from("api_keys")
    .insert({
      user_id: user.id,
      name,
      key_id: material.keyId,
      prefix: material.prefix,
      hash: material.hash,
      encrypted_secret: encryptedSecret,
    })
    .select("id, name, prefix, created_at, last_used_at, revoked_at")
    .single();

  if (error) {
    throw ApiError.internal(
      `Failed to create API key: ${error.message}`,
      "keys_create_failed"
    );
  }

  return c.json(
    {
      data: {
        id: data.id,
        name: data.name,
        prefix: data.prefix,
        secret: material.fullKey,
        created_at: data.created_at,
        last_used_at: data.last_used_at,
        revoked_at: data.revoked_at,
      },
    },
    201
  );
});

keyRoutes.post("/v1/keys/:id/reveal", async (c) => {
  const user = authedUser(c);
  const id = c.req.param("id");
  const sb = supabase();
  const { data, error } = await sb
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
      "keys_reveal_failed"
    );
  }
  if (!data) {
    throw ApiError.notFound("API key not found.", "key_not_found");
  }
  if (data.revoked_at) {
    throw ApiError.forbidden("Revoked API keys cannot be revealed.", "key_revoked");
  }
  if (!data.encrypted_secret) {
    throw new ApiError({
      status: 409,
      message:
        "This key was created before encrypted storage. Please revoke it and create a new one.",
      code: "old_key_not_recoverable",
      type: "validation_error",
    });
  }

  return c.json({
    data: {
      secret: decryptSecret(data.encrypted_secret),
    },
  });
});

keyRoutes.delete("/v1/keys/:id", async (c) => {
  const user = authedUser(c);
  const id = c.req.param("id");
  const sb = supabase();
  const revokedAt = new Date().toISOString();

  const { data, error } = await sb
    .from("api_keys")
    .update({ revoked_at: revokedAt })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id")
    .maybeSingle();

  if (error) {
    throw ApiError.internal(
      `Failed to revoke API key: ${error.message}`,
      "keys_revoke_failed"
    );
  }
  if (!data) {
    throw ApiError.notFound("API key not found.", "key_not_found");
  }

  return c.body(null, 204);
});
