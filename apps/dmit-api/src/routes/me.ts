import { Hono } from "hono";

import { generateApiKey } from "../auth/apiKey.js";
import { encryptSecret } from "../auth/keyEncryption.js";
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

meRoutes.get("/api-keys", async (c) => {
  const user = authedUser(c);
  const { data, error } = await supabase()
    .from("api_keys")
    .select("id, name, prefix, created_at, last_used_at, revoked_at")
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
    "id" | "name" | "prefix" | "created_at" | "last_used_at" | "revoked_at"
  >[]).map((key) => ({
    id: key.id,
    name: key.name,
    key_prefix: key.prefix,
    status: key.revoked_at ? "revoked" : "active",
    created_at: key.created_at,
    last_used_at: key.last_used_at,
  }));

  return c.json({ ok: true, keys });
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
        key_prefix: keyPrefix,
        status: data.revoked_at ? "revoked" : "active",
        created_at: data.created_at,
        last_used_at: data.last_used_at,
      },
      /** Full plaintext key — only on POST create; never on GET list. */
      one_time_secret: plainKey,
    },
    201
  );
});

meRoutes.post("/api-keys/:id/revoke", async (c) => {
  const user = authedUser(c);
  const id = c.req.param("id");
  const revokedAt = new Date().toISOString();

  const { data, error } = await supabase()
    .from("api_keys")
    .update({ revoked_at: revokedAt })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("id, name, prefix, created_at, last_used_at, revoked_at")
    .maybeSingle();

  if (error) {
    throw ApiError.internal(
      `Failed to revoke API key: ${error.message}`,
      "me_api_keys_revoke_failed"
    );
  }
  if (!data) {
    throw ApiError.notFound("API key not found.", "key_not_found");
  }

  return c.json({
    ok: true,
    api_key: {
      id: data.id,
      name: data.name,
      key_prefix: data.prefix,
      status: "revoked" as const,
      created_at: data.created_at,
      last_used_at: data.last_used_at,
    },
  });
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
