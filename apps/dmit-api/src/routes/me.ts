import { Hono } from "hono";

import { ApiError } from "../errors.js";
import { requireSupabaseJwt } from "../middleware/supabaseJwt.js";
import { supabase } from "../supabase.js";
import type { AuthedUser, CreditLedgerRow, ProfileRow } from "../types.js";

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

meRoutes.use("/v1/me/*", requireSupabaseJwt);

meRoutes.get("/v1/me/credits", async (c) => {
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

meRoutes.get("/v1/me/credits/ledger", async (c) => {
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
