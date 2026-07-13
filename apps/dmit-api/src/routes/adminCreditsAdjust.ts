import { randomUUID } from "node:crypto";

import type { Context } from "hono";

import { ApiError } from "../errors.js";
import { recordAdminAuditLog } from "../lib/adminAuditLog.js";
import { log } from "../logger.js";
import type { AdminUserContext } from "../middleware/requireAdminV1.js";
import { supabase } from "../supabase.js";

const IDEMPOTENCY_KEY_MAX_LEN = 128;
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
/** Matches credit_ledger / profiles numeric scale after widen migration. */
const CREDIT_AMOUNT_SCALE = 6;
const MAX_CREDIT_AMOUNT = 99_999_999_999.999999;

export type AdminCreditAdjustPurpose =
  | "public_beta_invite"
  | "manual_topup"
  | "customer_compensation"
  | "manual_deduct"
  | "offline_payment_topup";

export type AdminCreditAdjustmentInput = {
  user_id?: unknown;
  amount?: unknown;
  direction?: unknown;
  reason?: unknown;
  purpose?: unknown;
};

export type ParsedCreditAdjustment =
  | {
      userId: string;
      amount: number;
      direction: "add" | "deduct";
      reason: string;
      purpose: AdminCreditAdjustPurpose | null;
    }
  | {
      error:
        | "missing_user_id"
        | "invalid_user_id"
        | "invalid_amount"
        | "invalid_direction"
        | "missing_reason"
        | "invalid_reason"
        | "invalid_purpose";
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

const PURPOSES: readonly AdminCreditAdjustPurpose[] = [
  "public_beta_invite",
  "manual_topup",
  "customer_compensation",
  "manual_deduct",
  "offline_payment_topup",
] as const;

function jsonError(
  c: Context,
  status: 400 | 401 | 403 | 404 | 409 | 500,
  error: string,
  extra?: Record<string, unknown>
) {
  return c.json({ error, ...(extra ?? {}) }, status);
}

function countDecimalPlaces(value: number): number {
  if (!Number.isFinite(value) || Number.isInteger(value)) return 0;
  const normalized = value.toString().toLowerCase();
  if (normalized.includes("e")) {
    const [coeff, expRaw] = normalized.split("e");
    const exp = Number(expRaw);
    const decimals = (coeff?.split(".")[1] ?? "").length;
    return Math.max(0, decimals - exp);
  }
  return (normalized.split(".")[1] ?? "").length;
}

export function parseCreditAmount(raw: unknown): number | null {
  if (typeof raw === "string" && raw.trim() === "") return null;
  const amount = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(amount) || Number.isNaN(amount) || amount <= 0) {
    return null;
  }
  if (amount > MAX_CREDIT_AMOUNT) return null;
  if (countDecimalPlaces(amount) > CREDIT_AMOUNT_SCALE) return null;
  return amount;
}

export function parseCreditAdjustment(
  body: AdminCreditAdjustmentInput
): ParsedCreditAdjustment {
  const userId = typeof body.user_id === "string" ? body.user_id.trim() : "";
  const amount = parseCreditAmount(body.amount);
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

  if (amount == null) {
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

  let purpose: AdminCreditAdjustPurpose | null = null;
  if (body.purpose != null && body.purpose !== "") {
    if (
      typeof body.purpose !== "string" ||
      !PURPOSES.includes(body.purpose as AdminCreditAdjustPurpose)
    ) {
      return { error: "invalid_purpose" as const };
    }
    purpose = body.purpose as AdminCreditAdjustPurpose;
  }

  return { userId, amount, direction, reason, purpose };
}

export function parseIdempotencyKey(
  header: string | undefined
):
  | { ok: true; key: string }
  | { ok: false; error: "invalid_idempotency_key" } {
  const key = header?.trim() ?? "";
  if (!key) {
    return { ok: true, key: "" };
  }
  if (key.length > IDEMPOTENCY_KEY_MAX_LEN || !IDEMPOTENCY_KEY_PATTERN.test(key)) {
    return { ok: false, error: "invalid_idempotency_key" };
  }
  return { ok: true, key };
}

export function buildAdminAdjustIdempotencyKey(args: {
  userId: string;
  direction: "add" | "deduct";
  amount: number;
  requestId: string;
}): string {
  const base = `admin-adjust:${args.userId}:${args.direction}:${args.amount}:${args.requestId}`;
  return base.slice(0, IDEMPOTENCY_KEY_MAX_LEN);
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

function resolveAuditAction(args: {
  direction: "add" | "deduct";
  purpose: AdminCreditAdjustPurpose | null;
}): string {
  if (args.purpose === "public_beta_invite") {
    return "credits.adjust.public_beta_invite";
  }
  return args.direction === "add"
    ? "credits.adjust.add"
    : "credits.adjust.deduct";
}

function mapPublicFailureCode(rpcError: string): string {
  if (rpcError === "target_user_not_found") return "user_not_found";
  if (rpcError === "insufficient_credits") {
    return "insufficient_credits_for_deduct";
  }
  return rpcError;
}

async function callAdminAdjustCredits(args: {
  c: Context;
  adminUser: AdminUserContext;
  input: Extract<ParsedCreditAdjustment, { userId: string }>;
  idempotencyKey: string;
  ipAddress: string | null;
  userAgent: string | null;
}): Promise<AdminAdjustCreditsResult> {
  const { c, adminUser, input, idempotencyKey, ipAddress, userAgent } = args;

  // DMIT → RPC body (must match public.admin_adjust_credits in 0013):
  //   p_actor_user_id / p_actor_email / p_target_user_id / p_amount /
  //   p_direction / p_reason / p_idempotency_key / p_ip_address / p_user_agent
  const rpcBody = {
    p_actor_user_id: adminUser.userId,
    p_actor_email: adminUser.email ?? "",
    p_target_user_id: input.userId,
    p_amount: input.amount,
    p_direction: input.direction,
    p_reason: input.reason,
    p_idempotency_key: idempotencyKey,
    p_ip_address: ipAddress,
    p_user_agent: userAgent,
  };

  const { data, error } = await supabase().rpc("admin_adjust_credits", rpcBody);

  if (error) {
    // Admin-only internal log — never expose SQL details to clients.
    console.error("admin_adjust_credits_rpc_failed_debug", {
      request_id: c.get("requestId" as never),
      actor_email: adminUser.email ?? null,
      target_user_id: input.userId,
      direction: input.direction,
      amount: input.amount,
      rpc_error_code: error.code ?? null,
      rpc_error_message: error.message,
      rpc_error_details: error.details ?? null,
      rpc_error_hint: error.hint ?? null,
    });
    log.error("admin_adjust_credits_rpc_failed", {
      requestId: c.get("requestId" as never),
      route: `${c.req.method} ${c.req.path}`,
      code: "admin_adjust_credits_rpc_failed",
      message: error.message,
      userId: input.userId,
    });

    const overflow =
      /numeric field overflow|value overflows/i.test(error.message) ||
      /numeric field overflow|value overflows/i.test(error.details ?? "");

    if (overflow) {
      throw ApiError.badRequest(
        "Amount or resulting balance exceeds platform precision.",
        "invalid_amount"
      );
    }

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
  const requestId =
    (c.get("requestId" as never) as string | undefined) ?? randomUUID();

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

  const idempotencyKey =
    idempotency.key ||
    buildAdminAdjustIdempotencyKey({
      userId: input.userId,
      direction: input.direction,
      amount: input.amount,
      requestId,
    });

  const ipAddress = clientIp(c);
  const userAgent = c.req.header("user-agent") ?? null;
  const auditAction = resolveAuditAction({
    direction: input.direction,
    purpose: input.purpose,
  });

  const requestPayload = {
    target_user_id: input.userId,
    amount: input.amount,
    direction: input.direction,
    reason: input.reason,
    purpose: input.purpose,
    request_id: requestId,
  };

  let result: AdminAdjustCreditsResult;
  try {
    result = await callAdminAdjustCredits({
      c,
      adminUser,
      input,
      idempotencyKey,
      ipAddress,
      userAgent,
    });
  } catch (err) {
    await recordAdminAuditLog({
      actorUserId: adminUser.userId,
      actorEmail: adminUser.email,
      action: auditAction,
      resourceType: "profile",
      resourceId: input.userId,
      requestPayload,
      status: "failed",
      resultPayload: {
        error:
          err instanceof ApiError
            ? err.code ?? "admin_adjust_credits_rpc_failed"
            : "admin_adjust_credits_rpc_failed",
        request_id: requestId,
      },
      ipAddress,
      userAgent,
      idempotencyKey: `${idempotencyKey}:dmit`,
    });
    throw err;
  }

  if (!result.ok) {
    const publicError = mapPublicFailureCode(result.error);
    const failureExtra = {
      ...(result.current_credits != null
        ? { current_credits: toNumber(result.current_credits) }
        : {}),
      ...(result.requested_amount != null
        ? { requested_amount: toNumber(result.requested_amount) }
        : {}),
      ...(result.idempotent_replay ? { idempotent_replay: true } : {}),
      request_id: requestId,
    };

    await recordAdminAuditLog({
      actorUserId: adminUser.userId,
      actorEmail: adminUser.email,
      action: auditAction,
      resourceType: "profile",
      resourceId: input.userId,
      requestPayload,
      status: "failed",
      resultPayload: {
        error: publicError,
        balance_before:
          result.current_credits != null
            ? toNumber(result.current_credits)
            : null,
        request_id: requestId,
      },
      ipAddress,
      userAgent,
      idempotencyKey: `${idempotencyKey}:dmit`,
    });

    if (publicError === "user_not_found") {
      return jsonError(c, 404, publicError, failureExtra);
    }
    if (publicError === "insufficient_credits_for_deduct") {
      return jsonError(c, 400, publicError, failureExtra);
    }
    if (result.idempotent_replay) {
      return jsonError(c, 409, "idempotent_replay", failureExtra);
    }
    return jsonError(c, 400, publicError, failureExtra);
  }

  const balanceBefore = toNumber(result.previous_credits);
  const balanceAfter = toNumber(result.balance_after);
  const delta = toNumber(result.delta);
  const amount = Math.abs(delta);

  await recordAdminAuditLog({
    actorUserId: adminUser.userId,
    actorEmail: adminUser.email,
    action: auditAction,
    resourceType: "profile",
    resourceId: input.userId,
    requestPayload,
    status: "succeeded",
    resultPayload: {
      target_user_id: result.user_id,
      amount,
      direction: input.direction,
      reason: result.reason,
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      request_id: requestId,
      ledger_id: result.credit_ledger_id,
      idempotent_replay: Boolean(result.idempotent_replay),
    },
    ipAddress,
    userAgent,
    idempotencyKey: `${idempotencyKey}:dmit`,
  });

  log.info("admin_credits_adjust_succeeded", {
    requestId,
    route: `${c.req.method} ${c.req.path}`,
    code: "admin_credits_adjust_succeeded",
    message: "Admin credit adjustment succeeded.",
    userId: result.user_id,
    adminUserId: adminUser.adminUserId ?? undefined,
    authSource: adminUser.authSource,
    direction: input.direction,
    amount,
    purpose: input.purpose,
    idempotentReplay: Boolean(result.idempotent_replay),
  });

  return c.json({
    ok: true,
    user_id: result.user_id,
    direction: input.direction,
    amount,
    delta,
    balance_before: balanceBefore,
    balance_after: balanceAfter,
    ledger_id: result.credit_ledger_id,
    request_id: requestId,
    // Backward-compatible aliases for existing Admin UI consumers.
    previous_credits: balanceBefore,
    credits: balanceAfter,
    reason: result.reason,
    reference_id: result.reference_id,
    credit_ledger_id: result.credit_ledger_id,
    admin_audit_log_id: result.admin_audit_log_id ?? null,
    purpose: input.purpose,
    ...(result.idempotent_replay ? { idempotent_replay: true } : {}),
  });
}
