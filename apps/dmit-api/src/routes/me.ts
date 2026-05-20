import { Hono } from "hono";

import { generateApiKey } from "../auth/apiKey.js";
import { decryptSecret, encryptSecret } from "../auth/keyEncryption.js";
import { ApiError } from "../errors.js";
import { requireSupabaseJwt } from "../middleware/supabaseJwt.js";
import { supabase } from "../supabase.js";
import type {
  ApiKeyRow,
  AuthedUser,
  CreditLedgerRow,
  ProfileRow,
  UsageLogRow,
} from "../types.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
const MAX_KEY_NAME_LEN = 64;
const DEFAULT_KEY_NAME = "API Key";

function authedUser(c: { get: (key: never) => unknown }): AuthedUser {
  return c.get("user" as never) as AuthedUser;
}

function parseLimit(raw: string | undefined): number {
  if (!raw) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed < 1) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

export const meRoutes = new Hono();

meRoutes.use("*", requireSupabaseJwt);

meRoutes.get("/credits", async (c) => {
  const user = authedUser(c);
  const { data, error } = await supabase()
    .from("profiles")
    .select(
      "id, email, credits_balance, total_credits_purchased, total_credits_used, updated_at"
    )
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    throw ApiError.internal(
      `Failed to load credit profile: ${error.message}`,
      "me_credits_failed"
    );
  }
  if (!data) {
    throw ApiError.notFound("Profile not found.", "profile_not_found");
  }

  return c.json({
    data: data as Pick<
      ProfileRow,
      | "id"
      | "email"
      | "credits_balance"
      | "total_credits_purchased"
      | "total_credits_used"
      | "updated_at"
    >,
  });
});

meRoutes.get("/credits/ledger", async (c) => {
  const user = authedUser(c);
  const limit = parseLimit(c.req.query("limit"));
  const { data, error } = await supabase()
    .from("credit_ledger")
    .select("id, created_at, type, amount, balance_after, reason, reference_id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw ApiError.internal(
      `Failed to load credit ledger: ${error.message}`,
      "me_ledger_failed"
    );
  }

  return c.json({ data: (data ?? []) as CreditLedgerRow[] });
});

/** POST /v1/me/api-keys/revoke — stable body route for dashboard revoke. */
meRoutes.post("/api-keys/revoke", async (c) => {
  const user = authedUser(c);
  const body = (await c.req.json().catch(() => null)) as
    | { id?: unknown }
    | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";

  if (!id) {
    return c.json(
      {
        error: {
          message: "Missing API key id",
          code: "missing_api_key_id",
          type: "bad_request",
        },
      },
      400
    );
  }

  const revokedAt = new Date().toISOString();
  const { data, error } = await supabase()
    .from("api_keys")
    .update({ revoked_at: revokedAt })
    .eq("id", id)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .select("id, revoked_at")
    .single();

  if (error || !data) {
    return c.json(
      {
        error: {
          message: "API key not found",
          code: "api_key_not_found",
          type: "not_found",
        },
      },
      404
    );
  }

  return c.json({
    api_key: {
      id: data.id,
      status: "revoked",
      revoked_at: data.revoked_at,
    },
  });
});

meRoutes.get("/api-keys", async (c) => {
  const user = authedUser(c);
  const { data, error } = await supabase()
    .from("api_keys")
    .select("id, name, prefix, created_at, last_used_at, revoked_at, encrypted_secret")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw ApiError.internal(
      `Failed to list API keys: ${error.message}`,
      "me_api_keys_failed"
    );
  }

  const keys = ((data ?? []) as Pick<
    ApiKeyRow,
    | "id"
    | "name"
    | "prefix"
    | "created_at"
    | "last_used_at"
    | "revoked_at"
    | "encrypted_secret"
  >[]).map((key) => ({
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    status: key.revoked_at ? "revoked" : "active",
    created_at: key.created_at,
    last_used_at: key.last_used_at,
    revoked_at: key.revoked_at,
    can_reveal: Boolean(key.encrypted_secret && !key.revoked_at),
  }));

  return c.json({ data: keys });
});

meRoutes.post("/api-keys", async (c) => {
  const user = authedUser(c);
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw ApiError.badRequest("Invalid JSON body.", "invalid_json");
  }

  if (body !== null && typeof body !== "object") {
    throw ApiError.badRequest("Request body must be a JSON object.", "invalid_body");
  }

  const nameField = (body as Record<string, unknown> | null)?.name;
  let name = DEFAULT_KEY_NAME;
  if (nameField !== undefined && nameField !== null) {
    if (typeof nameField !== "string") {
      throw ApiError.badRequest("name must be a string.", "name_invalid_type");
    }
    const trimmed = nameField.trim();
    if (trimmed) {
      name = trimmed;
    }
  }

  if (name.length > MAX_KEY_NAME_LEN) {
    throw ApiError.badRequest(
      `name must be at most ${MAX_KEY_NAME_LEN} characters.`,
      "name_too_long"
    );
  }

  const { data: existingKey, error: existingKeyError } = await supabase()
    .from("api_keys")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", name)
    .is("revoked_at", null)
    .maybeSingle();

  if (existingKeyError) {
    throw ApiError.internal(
      `Failed to check API key name uniqueness: ${existingKeyError.message}`,
      "me_api_keys_name_check_failed"
    );
  }

  if (existingKey) {
    throw new ApiError({
      status: 409,
      message: "An active API key with this name already exists.",
      code: "api_key_name_exists",
      type: "validation_error",
    });
  }

  const material = generateApiKey();
  const plainKey = material.fullKey;
  const keyHash = material.hash;
  const keyPrefix = material.prefix;
  const encryptedSecret = encryptSecret(plainKey);
  const { data, error } = await supabase()
    .from("api_keys")
    .insert({
      user_id: user.id,
      name,
      key_id: material.keyId,
      prefix: keyPrefix,
      hash: keyHash,
      encrypted_secret: encryptedSecret,
    })
    .select("id, name, prefix, created_at, last_used_at, revoked_at")
    .single();

  if (error) {
    throw ApiError.internal(
      `Failed to create API key: ${error.message}`,
      "me_api_keys_create_failed"
    );
  }

  return c.json(
    {
      api_key: {
        id: data.id,
        name: data.name,
        prefix: keyPrefix,
        status: data.revoked_at ? "revoked" : "active",
        created_at: data.created_at,
        last_used_at: data.last_used_at,
        revoked_at: data.revoked_at,
        can_reveal: !data.revoked_at,
      },
      /** Full plaintext key — only on POST create or explicit owner reveal. */
      secret: plainKey,
      one_time_secret: plainKey,
    },
    201
  );
});

/** POST /v1/me/api-keys/reveal — explicit owner copy request. */
meRoutes.post("/api-keys/reveal", async (c) => {
  const user = authedUser(c);
  const body = (await c.req.json().catch(() => null)) as
    | { id?: unknown }
    | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";

  if (!id) {
    return c.json(
      {
        error: {
          message: "Missing API key id",
          code: "missing_api_key_id",
          type: "bad_request",
        },
      },
      400
    );
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
      "me_api_keys_reveal_failed"
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

  return c.json({ secret: decryptSecret(data.encrypted_secret) });
});

meRoutes.get("/usage", async (c) => {
  const user = authedUser(c);
  const limit = parseLimit(c.req.query("limit"));
  const { data, error } = await supabase()
    .from("usage_logs")
    .select(
      "id, created_at, model, status, prompt_tokens, completion_tokens, total_tokens, credits_charged, request_id"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw ApiError.internal(
      `Failed to load usage logs: ${error.message}`,
      "me_usage_failed"
    );
  }

  return c.json({ data: (data ?? []) as UsageLogRow[] });
});
