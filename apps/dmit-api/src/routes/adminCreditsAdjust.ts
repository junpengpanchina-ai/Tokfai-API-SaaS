import type { Context } from "hono";

import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import type { AdminUserContext } from "../middleware/requireAdminV1.js";
import { supabase } from "../supabase.js";

const IDEMPOTENCY_KEY_MAX_LEN = 128;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

export type AdminCreditAdjustmentInput = {
  user_id?: unknown;
  amount?: unknown;
  direction?: unknown;
  reason?: unknown;
};

export type ParsedCreditAdjustment =
  | {
      userId: string;
      amount: number;
      direction: "add" | "deduct";
      reason: string;
    }
  | {
      error:
        | "missing_user_id"
        | "invalid_user_id"
        | "invalid_amount"
        | "invalid_direction"
        | "missing_reason"
        | "invalid_reason";
    };

type AdminAdjustCreditsSuccess = {
  ok: true;
  user_id: string;
  previous_credits: number | string;
  delta: number | string;
  credits: number | string;
  balance_after: number | string;
  reason: string;
  reference_id: string;
  credit_ledger_id: string;
  admin_audit_log_id?: string;
  idempotent_replay?: boolean;
};

type AdminAdjustCreditsFailure = {
  ok: false;
  error: string;
  current_credits?: number | string;
  requested_amount?: number | string;
  idempotent_replay?: boolean;
};

type AdminAdjustCreditsResult =
  | AdminAdjustCreditsSuccess
  | AdminAdjustCreditsFailure;

function jsonError(
  c: Context,
  status: 400 | 401 | 403 | 404 | 500,
  error: string,
  extra?: Record<string, unknown>
) {
  return c.json({ error, ...(extra ?? {}) }, status);
}

export function parseCreditAdjustment(
  body: AdminCreditAdjustmentInput
): ParsedCreditAdjustment {
  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  const amount = Number(body.amount);
  const reason =
    typeof body.reason === "string" ? body.reason.trim() : "";

  if (!userId) {
    return { error: "missing_user_id" as const };
  }

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      userId
    )
  ) {
    return { error: "invalid_user_id" as const };
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    return { error: "invalid_amount" as const };
  }

  if (body.direction !== "add" && body.direction !== "deduct") {
    return { error: "invalid_direction" as const };
  }

  const direction = body.direction;

  if (!reason) {
    return { error: "missing_reason" as const };
  }

  if (reason.length > 200) {
    return { error: "invalid_reason" as const };
  }

  return { userId, amount, direction, reason };
}

export function parseIdempotencyKey(
  header: string | undefined
):
  | { ok: true; key: string }
  | { ok: false; error: "missing_idempotency_key" | "invalid_idempotency_key" } {
  const key = header?.trim() ?? "";
  if (!key) {
    return { ok: false, error: "missing_idempotency_key" };
  }
  if (key.length > IDEMPOTENCY_KEY_MAX_LEN || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    return { ok: false, error: "invalid_idempotency_key" };
  }
  return { ok: true, key };
}

function toNumber(value: number | string | null | undefined): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function clientIp(c: Context): string | null {
  const forwarded = c.req.header("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return c.req.header("x-real-ip") ?? null;
}

async function callAdminAdjustCredits(args: {
  adminUser: AdminUserContext;
  input: Extract<ParsedCreditAdjustment, { userId: string }>;
  idempotencyKey: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<AdminAdjustCreditsResult> {
  const { adminUser, input, idempotencyKey, ipAddress, userAgent } = args;

  const { data, error } = await supabase().rpc("admin_adjust_credits", {
    p_actor_user_id: adminUser.userId,
    p_actor_email: adminUser.email ?? "",
    p_target_user_id: input.userId,
    p_amount: input.amount,
    p_direction: input.direction,
    p_reason: input.reason,
    p_idempotency_key: idempotencyKey,
    p_ip_address: ipAddress,
    p_user_agent: userAgent,
  });

  if (error) {
    throw ApiError.internal(
      `admin_adjust_credits RPC failed: ${error.message}`,
      "admin_adjust_credits_rpc_failed"
    );
  }

  if (!data || typeof data !== "object") {
    throw ApiError.internal(
      "admin_adjust_credits RPC returned empty payload.",
      "admin_adjust_credits_empty"
    );
  }

  return data as AdminAdjustCreditsResult;
}

export async function handleAdminCreditsAdjust(c: Context) {
  const idempotency = parseIdempotencyKey(
    c.req.header("idempotency-key") ?? c.req.header("Idempotency-Key")
  );
  if (!idempotency.ok) {
    return jsonError(c, 400, idempotency.error);
  }

  const adminUser = c.get("adminUser" as never) as AdminUserContext | undefined;
  if (!adminUser) {
    return jsonError(c, 403, "admin_not_authorized");
  }

  const body = (await c.req.json().catch(() => ({}))) as AdminCreditAdjustmentInput;
  const input = parseCreditAdjustment(body);
  if ("error" in input) {
    return jsonError(c, 400, input.error);
  }

  const result = await callAdminAdjustCredits({
    adminUser,
    input,
    idempotencyKey: idempotency.key,
    ipAddress: clientIp(c),
    userAgent: c.req.header("user-agent") ?? null,
  });

  if (!result.ok) {
    if (result.error === "target_user_not_found") {
      return jsonError(c, 404, result.error);
    }
    if (result.error === "insufficient_credits") {
      return jsonError(c, 400, result.error, {
        current_credits: toNumber(result.current_credits),
        requested_amount: toNumber(result.requested_amount),
        ...(result.idempotent_replay ? { idempotent_replay: true } : {}),
      });
    }
    return jsonError(c, 400, result.error);
  }

  log.info("admin_credits_adjust_succeeded", {
    requestId: c.get("requestId" as never),
    route: `${c.req.method} ${c.req.path}`,
    code: "admin_credits_adjust_succeeded",
    message: "Admin credit adjustment succeeded.",
    userId: result.user_id,
    adminUserId: adminUser.adminUserId ?? undefined,
    authSource: adminUser.authSource,
  });

  return c.json({
    ok: true,
    user_id: result.user_id,
    previous_credits: toNumber(result.previous_credits),
    delta: toNumber(result.delta),
    credits: toNumber(result.credits),
    balance_after: toNumber(result.balance_after),
    reason: result.reason,
    reference_id: result.reference_id,
    credit_ledger_id: result.credit_ledger_id,
    admin_audit_log_id: result.admin_audit_log_id ?? null,
    ...(result.idempotent_replay ? { idempotent_replay: true } : {}),
  });
}
