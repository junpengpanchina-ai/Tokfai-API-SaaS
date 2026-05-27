import { randomUUID } from "node:crypto";

import { log } from "../logger.js";
import { supabase } from "../supabase.js";

export type AdminAuditStatus = "succeeded" | "failed";

function buildDefaultIdempotencyKey(action: string): string {
  const random = randomUUID().replace(/-/g, "").slice(0, 8);
  return `admin-models-${action}-${Date.now()}-${random}`.slice(0, 128);
}

function toJsonSafe(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

export async function recordAdminAuditLog(args: {
  actorUserId: string;
  actorEmail: string | null;
  action: string;
  resourceType: string;
  resourceId: string;
  requestPayload: Record<string, unknown>;
  status: AdminAuditStatus;
  resultPayload: Record<string, unknown>;
  ipAddress?: string | null;
  userAgent?: string | null;
  idempotencyKey?: string;
}): Promise<string | null> {
  const idempotencyKey = (
    args.idempotencyKey?.trim() || buildDefaultIdempotencyKey(args.action)
  ).slice(0, 128);

  const { data, error } = await supabase()
    .from("admin_audit_logs")
    .insert({
      actor_user_id: args.actorUserId,
      actor_email: args.actorEmail?.trim() || "",
      action: args.action,
      resource_type: args.resourceType,
      resource_id: args.resourceId,
      idempotency_key: idempotencyKey,
      request_payload: toJsonSafe(args.requestPayload ?? {}),
      status: args.status,
      result_payload: toJsonSafe(args.resultPayload ?? {}),
      ip_address: args.ipAddress ?? null,
      user_agent: args.userAgent ?? null,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    console.error("admin_audit_write_failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      action: args.action,
      resourceType: args.resourceType,
      resourceId: args.resourceId,
    });
    log.error("admin_audit_write_failed", {
      code: "admin_audit_write_failed",
      message: error.message,
      route: `audit:${args.action}`,
    });
    return null;
  }

  return typeof data?.id === "string" ? data.id : null;
}
