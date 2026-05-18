import { Hono } from "hono";

import { ApiError } from "../errors.js";
import { requireSupabaseJwt } from "../middleware/supabaseJwt.js";
import { supabase } from "../supabase.js";
import type { ApiKeyRow, AuthedUser, CreditLedgerRow, ProfileRow } from "../types.js";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

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
