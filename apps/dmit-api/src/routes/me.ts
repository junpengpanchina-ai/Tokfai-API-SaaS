import { Hono } from "hono";

import { generateApiKey } from "../auth/apiKey.js";
import { ApiError } from "../errors.js";
import { requireSupabaseJwt } from "../middleware/supabaseJwt.js";
import { supabase } from "../supabase.js";
import {
  buildApiKeyInsertPayload,
  insertApiKeyRow,
  listApiKeysForUser,
} from "../lib/apiKeysDb.js";
import {
  logCreateApiKeyFailed,
  readApiKeyId,
  revealApiKey,
  revokeApiKey,
} from "./apiKeyActions.js";
import { resolveCreditOrderDisplayStatus } from "../lib/creditOrders.js";
import type {
  AuthedUser,
  CreditLedgerRow,
  CreditOrderRow,
  ProfileRow,
  UsageLogRow,
  UsageSummaryResponse,
  UsageSummaryStats,
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function formatUtcDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateParam(raw: string, label: string): Date {
  if (!DATE_RE.test(raw)) {
    throw ApiError.badRequest(`${label} must be YYYY-MM-DD.`, "invalid_date");
  }
  const parsed = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw ApiError.badRequest(`${label} is not a valid date.`, "invalid_date");
  }
  return parsed;
}

function resolveUsageDateRange(
  startRaw: string | undefined,
  endRaw: string | undefined
): { start: Date; end: Date; startDate: string; endDate: string } {
  const now = new Date();
  const todayUtc = formatUtcDate(now);

  let startDate = startRaw?.trim() || null;
  let endDate = endRaw?.trim() || null;

  if (!startDate && !endDate) {
    endDate = todayUtc;
    const end = new Date(`${endDate}T23:59:59.999Z`);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    start.setUTCHours(0, 0, 0, 0);
    startDate = formatUtcDate(start);
    return { start, end, startDate, endDate };
  }

  if (startDate) parseDateParam(startDate, "start_date");
  if (endDate) parseDateParam(endDate, "end_date");

  if (!endDate) endDate = todayUtc;
  if (!startDate) {
    const end = new Date(`${endDate}T23:59:59.999Z`);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    start.setUTCHours(0, 0, 0, 0);
    startDate = formatUtcDate(start);
  }

  const start = new Date(`${startDate}T00:00:00.000Z`);
  const end = new Date(`${endDate}T23:59:59.999Z`);

  if (start > end) {
    throw ApiError.badRequest(
      "start_date must be on or before end_date.",
      "invalid_date_range"
    );
  }

  return { start, end, startDate, endDate };
}

type UsageQueryFilters = {
  apiKeyId: string | null;
  model: string | null;
  status: string | null;
};

function toNumber(value: string | number | null | undefined): number {
  if (value == null || value === "") return 0;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isNaN(n) ? 0 : n;
}

const SUCCESS_STATUSES = new Set(["succeeded", "success", "ok"]);

function isSucceededStatus(status: string): boolean {
  return SUCCESS_STATUSES.has(status.toLowerCase());
}

async function attachApiKeyPrefixes(
  userId: string,
  rows: UsageLogRow[]
): Promise<UsageLogRow[]> {
  const apiKeyIds = [
    ...new Set(
      rows
        .map((row) => row.api_key_id)
        .filter((id): id is string => typeof id === "string" && id.length > 0)
    ),
  ];

  const prefixById = new Map<string, string>();
  if (apiKeyIds.length > 0) {
    const { data: keys, error } = await supabase()
      .from("api_keys")
      .select("id, prefix")
      .eq("user_id", userId)
      .in("id", apiKeyIds);

    if (error) {
      throw ApiError.internal(
        `Failed to map usage API keys: ${error.message}`,
        "me_usage_api_key_map_failed"
      );
    }

    for (const key of keys ?? []) {
      if (typeof key.id === "string" && typeof key.prefix === "string") {
        prefixById.set(key.id, key.prefix);
      }
    }
  }

  return rows.map((row) => ({
    ...row,
    prefix: row.api_key_id ? prefixById.get(row.api_key_id) ?? null : null,
  }));
}

function computeUsageSummary(
  rows: Pick<
    UsageLogRow,
    | "status"
    | "prompt_tokens"
    | "completion_tokens"
    | "total_tokens"
    | "credits_charged"
  >[]
): UsageSummaryStats {
  let succeededRequests = 0;
  let totalTokens = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalCreditsCharged = 0;

  for (const row of rows) {
    const succeeded = isSucceededStatus(row.status);
    if (succeeded) {
      succeededRequests += 1;
      totalPromptTokens += row.prompt_tokens ?? 0;
      totalCompletionTokens += row.completion_tokens ?? 0;
      totalTokens += row.total_tokens ?? 0;

      const credits = toNumber(row.credits_charged);
      if (credits > 0) {
        totalCreditsCharged += credits;
      }
    }
  }

  const totalRequests = rows.length;

  return {
    total_requests: totalRequests,
    succeeded_requests: succeededRequests,
    failed_requests: totalRequests - succeededRequests,
    total_tokens: totalTokens,
    total_prompt_tokens: totalPromptTokens,
    total_completion_tokens: totalCompletionTokens,
    total_credits_charged: totalCreditsCharged,
  };
}

function normalizeUsageRow(row: UsageLogRow): UsageLogRow {
  if (isSucceededStatus(row.status)) {
    return row;
  }
  return {
    ...row,
    credits_charged: null,
  };
}

const USAGE_LIST_SELECT =
  "id, created_at, api_key_id, model, status, prompt_tokens, completion_tokens, total_tokens, credits_charged";

const USAGE_SUMMARY_SELECT =
  "id, request_id, api_key_id, model, status, prompt_tokens, completion_tokens, total_tokens, credits_charged, error_code, created_at";

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

/** GET /v1/me/credits/orders — recent Stripe Checkout top-up orders for the user. */
meRoutes.get("/credits/orders", async (c) => {
  const user = authedUser(c);
  const limit = parseLimit(c.req.query("limit"));
  const { data, error } = await supabase()
    .from("credit_orders")
    .select(
      "id, plan_id, status, currency, amount_cents, credits, stripe_checkout_session_id, created_at, updated_at, paid_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw ApiError.internal(
      `Failed to load credit orders: ${error.message}`,
      "me_credit_orders_failed"
    );
  }

  const rows = (data ?? []).map((row) => {
    const status = typeof row.status === "string" ? row.status : "pending";
    const createdAt =
      typeof row.created_at === "string" ? row.created_at : new Date().toISOString();

    return {
      id: row.id as string,
      plan_id: (row.plan_id as string | null) ?? null,
      status,
      display_status: resolveCreditOrderDisplayStatus({
        status,
        createdAt,
      }),
      currency: (row.currency as string | null) ?? "cny",
      amount_cents:
        typeof row.amount_cents === "number"
          ? row.amount_cents
          : row.amount_cents != null
            ? Number(row.amount_cents)
            : null,
      credits: row.credits as string | number,
      stripe_checkout_session_id:
        (row.stripe_checkout_session_id as string | null) ?? null,
      created_at: createdAt,
      updated_at:
        typeof row.updated_at === "string"
          ? row.updated_at
          : createdAt,
      paid_at: (row.paid_at as string | null) ?? null,
    } satisfies CreditOrderRow;
  });

  return c.json({ data: rows });
});

/** POST /v1/me/api-keys/revoke — stable body route for dashboard revoke. */
meRoutes.post("/api-keys/revoke", async (c) => {
  return revokeApiKey(c, await readApiKeyId(c));
});

meRoutes.post("/api-keys/:id/revoke", async (c) => {
  return revokeApiKey(c, await readApiKeyId(c));
});

meRoutes.delete("/api-keys/:id", async (c) => {
  return revokeApiKey(c, await readApiKeyId(c));
});

meRoutes.get("/api-keys", async (c) => {
  const user = authedUser(c);
  const { data, error } = await listApiKeysForUser(user.id);

  if (error) {
    throw ApiError.internal(
      `Failed to list API keys: ${error.message}`,
      "me_api_keys_failed"
    );
  }

  return c.json({ data });
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

  const { data: existingKeys, error: existingKeyError } = await supabase()
    .from("api_keys")
    .select("id")
    .eq("user_id", user.id)
    .eq("name", name)
    .is("revoked_at", null)
    .limit(1);

  if (existingKeyError) {
    logCreateApiKeyFailed(user.id, "me_api_keys_name_check_failed", {
      message: existingKeyError.message,
      code: existingKeyError.code,
    });
    throw ApiError.internal(
      `Failed to check API key name uniqueness: ${existingKeyError.message}`,
      "me_api_keys_name_check_failed"
    );
  }

  if ((existingKeys ?? []).length > 0) {
    throw new ApiError({
      status: 409,
      message: "An active API key with this name already exists.",
      code: "api_key_name_exists",
      type: "validation_error",
    });
  }

  const material = generateApiKey();
  const plainKey = material.fullKey;
  const keyPrefix = material.prefix;
  const insertPayload = buildApiKeyInsertPayload(user.id, name, material);
  const { data, error } = await insertApiKeyRow(insertPayload);

  if (error || !data) {
    logCreateApiKeyFailed(user.id, "me_api_keys_create_failed", {
      message: error?.message ?? "Insert returned no row.",
      code: error?.code,
    });
    throw ApiError.internal(
      `Failed to create API key: ${error?.message ?? "Insert returned no row."}`,
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
        can_reveal: insertPayload.can_reveal && !data.revoked_at,
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
  return revealApiKey(c, await readApiKeyId(c));
});

meRoutes.post("/api-keys/:id/reveal", async (c) => {
  return revealApiKey(c, await readApiKeyId(c));
});

meRoutes.get("/usage", async (c) => {
  const user = authedUser(c);
  const limit = parseLimit(c.req.query("limit"));
  const { data, error } = await supabase()
    .from("usage_logs")
    .select(USAGE_LIST_SELECT)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw ApiError.internal(
      `Failed to load usage logs: ${error.message}`,
      "me_usage_failed"
    );
  }

  const rows = ((data ?? []) as UsageLogRow[]).map(normalizeUsageRow);
  const enriched = await attachApiKeyPrefixes(user.id, rows);
  return c.json({ data: enriched });
});

/** GET /v1/me/usage/summary — filtered usage query with aggregates. */
meRoutes.get("/usage/summary", async (c) => {
  const user = authedUser(c);
  const limit = parseLimit(c.req.query("limit"));
  const { start, end, startDate, endDate } = resolveUsageDateRange(
    c.req.query("start_date"),
    c.req.query("end_date")
  );

  const apiKeyId = c.req.query("api_key_id")?.trim() || null;
  const model = c.req.query("model")?.trim() || null;
  const status = c.req.query("status")?.trim() || null;

  if (status && status !== "succeeded" && status !== "failed") {
    throw ApiError.badRequest(
      "status must be succeeded or failed.",
      "invalid_status"
    );
  }

  const filters: UsageQueryFilters = { apiKeyId, model, status };

  let summaryQuery = supabase()
    .from("usage_logs")
    .select("status, prompt_tokens, completion_tokens, total_tokens, credits_charged")
    .eq("user_id", user.id)
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString());
  if (filters.apiKeyId) summaryQuery = summaryQuery.eq("api_key_id", filters.apiKeyId);
  if (filters.model) summaryQuery = summaryQuery.eq("model", filters.model);
  if (filters.status === "succeeded") {
    summaryQuery = summaryQuery.eq("status", "succeeded");
  } else if (filters.status === "failed") {
    summaryQuery = summaryQuery.neq("status", "succeeded");
  }

  let dataQuery = supabase()
    .from("usage_logs")
    .select(USAGE_SUMMARY_SELECT)
    .eq("user_id", user.id)
    .gte("created_at", start.toISOString())
    .lte("created_at", end.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);
  if (filters.apiKeyId) dataQuery = dataQuery.eq("api_key_id", filters.apiKeyId);
  if (filters.model) dataQuery = dataQuery.eq("model", filters.model);
  if (filters.status === "succeeded") {
    dataQuery = dataQuery.eq("status", "succeeded");
  } else if (filters.status === "failed") {
    dataQuery = dataQuery.neq("status", "succeeded");
  }

  const [summaryResult, dataResult] = await Promise.all([
    summaryQuery,
    dataQuery,
  ]);

  if (summaryResult.error) {
    throw ApiError.internal(
      `Failed to load usage summary: ${summaryResult.error.message}`,
      "me_usage_summary_failed"
    );
  }
  if (dataResult.error) {
    throw ApiError.internal(
      `Failed to load usage logs: ${dataResult.error.message}`,
      "me_usage_summary_failed"
    );
  }

  const summaryRows = (summaryResult.data ?? []) as Pick<
    UsageLogRow,
    | "status"
    | "prompt_tokens"
    | "completion_tokens"
    | "total_tokens"
    | "credits_charged"
  >[];
  const dataRows = ((dataResult.data ?? []) as UsageLogRow[]).map(
    normalizeUsageRow
  );
  const enrichedRows = await attachApiKeyPrefixes(user.id, dataRows);

  const response: UsageSummaryResponse = {
    summary: computeUsageSummary(summaryRows),
    filters: {
      start_date: startDate,
      end_date: endDate,
      api_key_id: apiKeyId,
      model,
      status,
    },
    data: enrichedRows,
  };

  return c.json(response);
});
