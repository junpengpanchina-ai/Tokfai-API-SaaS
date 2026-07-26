import { createHash } from "node:crypto";

import { ApiError } from "../errors.js";
import { log } from "../logger.js";
import type { ChatCaller } from "../middleware/chatAuth.js";
import { supabase } from "../supabase.js";
import type { UsageLogInsert } from "../types.js";

const GATEWAY_RATE_LIMIT_CODES = new Set([
  "too_many_requests",
  "too_many_concurrent_requests",
]);

/** Non-reversible short fingerprint of the gateway limit key (never the raw secret). */
export function safeRateLimitKeyHash(limitKey: string): string {
  return createHash("sha256")
    .update(`tokfai:rl:${limitKey}`)
    .digest("hex")
    .slice(0, 16);
}

export async function logGatewayRejection(args: {
  caller: ChatCaller;
  requestId: string;
  err: ApiError;
  limitKey: string;
  keyInflight: number;
  globalInflight: number;
  model?: string;
  route?: string;
  /** Machine reason: ip_rpm | tenant_rpm | key_rpm | key_concurrency */
  reason?: string;
  limit?: number;
  current?: number;
  /** P953: normal | ka_load_test — never log raw API key secrets. */
  rateLimitPolicy?: "normal" | "ka_load_test";
}): Promise<void> {
  const {
    caller,
    requestId,
    err,
    limitKey,
    keyInflight,
    globalInflight,
    model,
    route,
    reason,
    limit,
    current,
    rateLimitPolicy,
  } = args;

  const resolvedRoute = route ?? "/v1/chat/completions";
  const resolvedModel = model ?? "unknown";

  const entry: UsageLogInsert = {
    user_id: caller.userId,
    api_key_id: caller.apiKeyId,
    model: resolvedModel,
    status: GATEWAY_RATE_LIMIT_CODES.has(err.code ?? "")
      ? "rate_limited"
      : "failed",
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    credits_charged: null,
    request_id: requestId,
    upstream_id: null,
    error_code: err.code ?? null,
    error_message: err.publicMessage,
    latency_ms: 0,
    billable: false,
    finish_reason: null,
    upstream_status: null,
    upstream_error_code: null,
    safety_reason: null,
  };

  const { error } = await supabase().from("usage_logs").insert(entry);
  if (error) {
    log.warn("usage_log_insert_failed", {
      requestId,
      route: resolvedRoute,
      status: 500,
      code: "usage_log_insert_failed",
      message: "Failed to write gateway usage log.",
    });
  }

  log.warn("chat_gateway_rejected", {
    requestId,
    route: resolvedRoute,
    status: err.status,
    code: err.code ?? "gateway_rejected",
    message: err.publicMessage,
    userId: caller.userId,
    apiKeyId: caller.apiKeyId ?? undefined,
    limitKey,
    keyInflight,
    globalInflight,
  });

  if (GATEWAY_RATE_LIMIT_CODES.has(err.code ?? "")) {
    log.warn("rate_limit_rejected", {
      route: resolvedRoute,
      model: resolvedModel,
      reason: reason ?? err.code ?? "rate_limited",
      limit: limit ?? null,
      current: current ?? keyInflight,
      key_hash: safeRateLimitKeyHash(limitKey),
      request_id: requestId,
      rate_limit_policy: rateLimitPolicy ?? "normal",
    });
  }
}

export async function logGatewayOverloaded(args: {
  caller: ChatCaller;
  requestId: string;
  err: ApiError;
  limitKey: string;
  keyInflight: number;
  globalInflight: number;
  requestedModel: string;
  startedAt: number;
}): Promise<void> {
  const {
    caller,
    requestId,
    err,
    limitKey,
    keyInflight,
    globalInflight,
    requestedModel,
    startedAt,
  } = args;

  const entry: UsageLogInsert = {
    user_id: caller.userId,
    api_key_id: caller.apiKeyId,
    model: requestedModel,
    status: "failed",
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    credits_charged: null,
    request_id: requestId,
    upstream_id: null,
    error_code: err.code ?? null,
    error_message: err.publicMessage,
    latency_ms: Date.now() - startedAt,
    billable: false,
    finish_reason: null,
    upstream_status: 503,
    upstream_error_code: err.code ?? null,
    safety_reason: null,
  };

  const { error } = await supabase().from("usage_logs").insert(entry);
  if (error) {
    log.warn("usage_log_insert_failed", {
      requestId,
      route: "/v1/chat/completions",
      status: 500,
      code: "usage_log_insert_failed",
      message: "Failed to write gateway overload usage log.",
    });
  }

  log.warn("chat_gateway_overloaded", {
    requestId,
    route: "/v1/chat/completions",
    status: err.status,
    code: err.code ?? "gateway_overloaded",
    message: err.publicMessage,
    userId: caller.userId,
    apiKeyId: caller.apiKeyId ?? undefined,
    limitKey,
    keyInflight,
    globalInflight,
    requestedModel,
    latencyMs: Date.now() - startedAt,
  });
}
