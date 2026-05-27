import { randomUUID } from "node:crypto";

import { supabase } from "../supabase.js";

export type AdminAuditStatus = "succeeded" | "failed";

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
  const now = new Date().toISOString();
  const idempotencyKey =
    args.idempotencyKey?.trim() ||
    `${args.action}:${args.resourceId}:${randomUUID()}`;

  const { data, error } = await supabase()
    .from("admin_audit_logs")
    .insert({
      actor_user_id: args.actorUserId,
      actor_email: args.actorEmail ?? "",
      action: args.action,
      resource_type: args.resourceType,
      resource_id: args.resourceId,
      idempotency_key: idempotencyKey.slice(0, 128),
      request_payload: args.requestPayload,
      status: args.status,
      result_payload: args.resultPayload,
      ip_address: args.ipAddress ?? null,
      user_agent: args.userAgent ?? null,
      completed_at: now,
    })
    .select("id")
    .maybeSingle();

  if (error) {
    return null;
  }

  return typeof data?.id === "string" ? data.id : null;
}
