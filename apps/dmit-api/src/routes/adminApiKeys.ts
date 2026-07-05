import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import { supabase } from "../supabase.js";

const PAGE_SIZE = 1000;
/** PostgREST `.in()` list size — avoids oversized filters under load. */
const IN_CHUNK_SIZE = 100;

export type AdminApiKeysLogContext = {
  requestId: string;
  route: string;
};

export type AdminApiKeyListItem = {
  id: string;
  user_id: string;
  owner_email: string | null;
  name: string;
  prefix: string;
  status: "active" | "revoked";
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  total_usage: number;
};

type ApiKeyDbRow = {
  id: string;
  user_id: string;
  name: string;
  prefix: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

export type AdminApiKeysStage =
  | "api_keys_query"
  | "profiles_query"
  | "usage_logs_aggregate"
  | "merge";

function chunkArray<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function errorFields(error: unknown): Record<string, unknown> {
  if (!(error && typeof error === "object")) {
    return {
      errorName: error instanceof Error ? error.name : "UnknownError",
      message: error instanceof Error ? error.message : String(error),
    };
  }

  const record = error as Record<string, unknown>;
  return {
    errorName: error instanceof Error ? error.name : "PostgrestError",
    message:
      typeof record.message === "string"
        ? record.message
        : error instanceof Error
          ? error.message
          : String(error),
    dbErrorCode: typeof record.code === "string" ? record.code : undefined,
    dbErrorDetails:
      typeof record.details === "string" ? record.details : undefined,
    dbErrorHint: typeof record.hint === "string" ? record.hint : undefined,
    status: typeof record.status === "number" ? record.status : undefined,
  };
}

function logAdminApiKeysEvent(
  level: "warn" | "error",
  msg: string,
  ctx: AdminApiKeysLogContext,
  stage: AdminApiKeysStage,
  startedAt: number,
  extra?: Record<string, unknown>
) {
  const latencyMs = Math.round(performance.now() - startedAt);
  log[level](msg, {
    requestId: ctx.requestId,
    route: ctx.route,
    stage,
    latencyMs,
    code:
      level === "error" && stage === "api_keys_query"
        ? "admin_api_keys_list_failed"
        : `admin_api_keys_${stage}_failed`,
    ...extra,
  });
}

async function fetchAllApiKeys(
  ctx: AdminApiKeysLogContext
): Promise<ApiKeyDbRow[]> {
  const stage: AdminApiKeysStage = "api_keys_query";
  const startedAt = performance.now();
  const rows: ApiKeyDbRow[] = [];

  try {
    for (let from = 0; ; from += PAGE_SIZE) {
      const to = from + PAGE_SIZE - 1;
      const { data, error } = await supabase()
        .from("api_keys")
        .select("id, user_id, name, prefix, created_at, last_used_at, revoked_at")
        .order("created_at", { ascending: false })
        .range(from, to);

      if (error) {
        logAdminApiKeysEvent("error", "admin_api_keys_list_failed", ctx, stage, startedAt, {
          ...errorFields(error),
        });
        throw ApiError.internal(
          "Failed to list API keys.",
          "admin_api_keys_list_failed"
        );
      }

      const page = (data ?? []) as ApiKeyDbRow[];
      rows.push(...page);
      if (page.length < PAGE_SIZE) break;
    }

    return rows;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logAdminApiKeysEvent("error", "admin_api_keys_list_failed", ctx, stage, startedAt, {
      ...errorFields(error),
    });
    throw ApiError.internal(
      "Failed to list API keys.",
      "admin_api_keys_list_failed"
    );
  }
}

async function fetchProfileEmailsByUserIds(
  ctx: AdminApiKeysLogContext,
  userIds: string[]
): Promise<Map<string, string | null>> {
  const stage: AdminApiKeysStage = "profiles_query";
  const startedAt = performance.now();
  const emails = new Map<string, string | null>();

  if (userIds.length === 0) {
    return emails;
  }

  let hadFailure = false;

  for (const chunk of chunkArray(userIds, IN_CHUNK_SIZE)) {
    try {
      const { data, error } = await supabase()
        .from("profiles")
        .select("id, email")
        .in("id", chunk);

      if (error) {
        hadFailure = true;
        logAdminApiKeysEvent(
          "warn",
          "admin_api_keys_profiles_query_degraded",
          ctx,
          stage,
          startedAt,
          {
            ...errorFields(error),
            chunkSize: chunk.length,
          }
        );
        continue;
      }

      for (const profile of (data ?? []) as Array<{
        id: string;
        email: string | null;
      }>) {
        emails.set(profile.id, profile.email);
      }
    } catch (error) {
      hadFailure = true;
      logAdminApiKeysEvent(
        "warn",
        "admin_api_keys_profiles_query_degraded",
        ctx,
        stage,
        startedAt,
        {
          ...errorFields(error),
          chunkSize: chunk.length,
        }
      );
    }
  }

  if (hadFailure) {
    logAdminApiKeysEvent(
      "warn",
      "admin_api_keys_profiles_partial",
      ctx,
      stage,
      startedAt,
      {
        message: "Some profile emails unavailable; owner_email will be null.",
        userIdCount: userIds.length,
        resolvedCount: emails.size,
      }
    );
  }

  return emails;
}

async function aggregateUsageCountsByApiKeyIds(
  ctx: AdminApiKeysLogContext,
  apiKeyIds: string[]
): Promise<Map<string, number>> {
  const stage: AdminApiKeysStage = "usage_logs_aggregate";
  const startedAt = performance.now();
  const counts = new Map<string, number>();

  for (const id of apiKeyIds) {
    counts.set(id, 0);
  }

  if (apiKeyIds.length === 0) {
    return counts;
  }

  let hadFailure = false;

  for (const chunk of chunkArray(apiKeyIds, IN_CHUNK_SIZE)) {
    let chunkFailed = false;

    for (let from = 0; ; from += PAGE_SIZE) {
      const to = from + PAGE_SIZE - 1;

      try {
        const { data, error } = await supabase()
          .from("usage_logs")
          .select("api_key_id")
          .in("api_key_id", chunk)
          .range(from, to);

        if (error) {
          chunkFailed = true;
          hadFailure = true;
          logAdminApiKeysEvent(
            "warn",
            "admin_api_keys_usage_aggregate_degraded",
            ctx,
            stage,
            startedAt,
            {
              ...errorFields(error),
              chunkSize: chunk.length,
              pageFrom: from,
            }
          );
          break;
        }

        const page = (data ?? []) as Array<{ api_key_id: string | null }>;
        for (const row of page) {
          if (!row.api_key_id) continue;
          counts.set(row.api_key_id, (counts.get(row.api_key_id) ?? 0) + 1);
        }

        if (page.length < PAGE_SIZE) break;
      } catch (error) {
        chunkFailed = true;
        hadFailure = true;
        logAdminApiKeysEvent(
          "warn",
          "admin_api_keys_usage_aggregate_degraded",
          ctx,
          stage,
          startedAt,
          {
            ...errorFields(error),
            chunkSize: chunk.length,
            pageFrom: from,
          }
        );
        break;
      }
    }

    if (chunkFailed) {
      for (const id of chunk) {
        counts.set(id, 0);
      }
    }
  }

  if (hadFailure) {
    logAdminApiKeysEvent(
      "warn",
      "admin_api_keys_usage_partial",
      ctx,
      stage,
      startedAt,
      {
        message:
          "Usage aggregation degraded; affected keys use total_usage=0.",
        apiKeyCount: apiKeyIds.length,
      }
    );
  }

  return counts;
}

function mergeAdminApiKeyRows(
  apiKeys: ApiKeyDbRow[],
  emails: Map<string, string | null>,
  usageCounts: Map<string, number>
): AdminApiKeyListItem[] {
  const stage: AdminApiKeysStage = "merge";

  try {
    return apiKeys.map((row) => ({
      id: row.id,
      user_id: row.user_id,
      owner_email: emails.get(row.user_id) ?? null,
      name: row.name,
      prefix: row.prefix,
      status: row.revoked_at ? "revoked" : "active",
      created_at: row.created_at,
      last_used_at: row.last_used_at,
      revoked_at: row.revoked_at,
      total_usage: usageCounts.get(row.id) ?? 0,
    }));
  } catch (error) {
    throw { stage, error };
  }
}

/**
 * Fail-soft admin API keys list:
 * - api_keys query failure → 500
 * - profiles / usage_logs failures → degrade with warn logs
 */
export async function listAdminApiKeysEnriched(
  ctx: AdminApiKeysLogContext
): Promise<AdminApiKeyListItem[]> {
  const overallStarted = performance.now();

  const apiKeys = await fetchAllApiKeys(ctx);

  const userIds = [...new Set(apiKeys.map((row) => row.user_id))];
  const apiKeyIds = apiKeys.map((row) => row.id);

  const [emails, usageCounts] = await Promise.all([
    fetchProfileEmailsByUserIds(ctx, userIds),
    aggregateUsageCountsByApiKeyIds(ctx, apiKeyIds),
  ]);

  try {
    const merged = mergeAdminApiKeyRows(apiKeys, emails, usageCounts);
    log.info("admin_api_keys_list_ok", {
      requestId: ctx.requestId,
      route: ctx.route,
      stage: "merge",
      latencyMs: Math.round(performance.now() - overallStarted),
      message: `rows=${merged.length}`,
    });
    return merged;
  } catch (wrapped: unknown) {
    const stage: AdminApiKeysStage =
      wrapped &&
      typeof wrapped === "object" &&
      (wrapped as { stage?: AdminApiKeysStage }).stage
        ? (wrapped as { stage: AdminApiKeysStage }).stage
        : "merge";
    const error =
      wrapped && typeof wrapped === "object" && "error" in wrapped
        ? (wrapped as { error: unknown }).error
        : wrapped;

    logAdminApiKeysEvent("error", "admin_api_keys_merge_failed", ctx, stage, overallStarted, {
      ...errorFields(error),
    });
    throw ApiError.internal(
      "Failed to assemble API keys list.",
      "admin_api_keys_list_failed"
    );
  }
}
