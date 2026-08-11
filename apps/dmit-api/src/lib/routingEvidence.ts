/**
 * P984 — Model routing evidence for customer / sales / support reconciliation.
 *
 * Safe for client responses: no API keys, no upstream secrets.
 * Provider ids are opaque labels (e.g. "grsai"), never credentials.
 */

import {
  MODEL_ALIAS_CHAINS,
  type ModelAliasId,
} from "../upstream/modelAliases.js";
import {
  resolveUsageRouteAudit,
  usageRouteAuditLogFields,
  usageRouteAuditSnapshotFields,
} from "./usageRouteAudit.js";

export type TokfaiRoutingEvidence = {
  request_id: string;
  requested_model: string;
  resolved_model: string | null;
  routing_strategy: string;
  attempted_models: string[];
  fallback_attempts: number;
  latency_ms: number;
  billing_status: "charged" | "not_billable";
  credits_charged: number;
  /** Present on failures / fallbacks when known. */
  fallback_reason?: string | null;
  error_code?: string | null;
};

export type RoutingLogFields = {
  requestId: string;
  requestedModel: string;
  resolvedModel: string | null;
  attemptedModel: string | null;
  attemptedModels: string[];
  providerId: string | null;
  providerLabel: string | null;
  route: string;
  /** P1084 */
  clientRoute: string;
  upstreamRoute: string;
  wireApi: string;
  billingTokenSchema: string;
  status: number | string | null;
  upstreamStatus: number | null;
  upstreamErrorCode: string | null;
  fallbackAttempts: number;
  fallbackReason: string | null;
  latencyMs: number;
  billing_status: "charged" | "not_billable" | string;
  credits_charged: number;
};

/**
 * Human-readable strategy id for screenshots.
 * auto-* aliases keep their id; other alias chains → alias_chain; else direct.
 */
export function resolveRoutingStrategy(args: {
  requestedRaw: string;
  canonicalId: string;
  isAlias: boolean;
}): string {
  const { requestedRaw, canonicalId, isAlias } = args;
  if (isAlias && canonicalId in MODEL_ALIAS_CHAINS) {
    if (
      canonicalId === "auto-fast" ||
      canonicalId === "auto-pro" ||
      canonicalId === "auto-cheap"
    ) {
      return canonicalId;
    }
    return `alias:${canonicalId}`;
  }
  if (requestedRaw.trim() !== canonicalId) {
    return "compat_rewrite";
  }
  return "direct";
}

export function aliasAttemptChain(canonicalId: string): string[] | null {
  if (canonicalId in MODEL_ALIAS_CHAINS) {
    return [...MODEL_ALIAS_CHAINS[canonicalId as ModelAliasId]];
  }
  return null;
}

export function buildSuccessRoutingEvidence(args: {
  requestId: string;
  requestedRaw: string;
  canonicalId: string;
  isAlias: boolean;
  resolvedModel: string;
  attemptedModels: string[];
  fallbackAttempts: number;
  latencyMs: number;
  creditsCharged: number;
  billingStatus?: "charged" | "not_billable";
}): TokfaiRoutingEvidence {
  return {
    request_id: args.requestId,
    requested_model: args.requestedRaw,
    resolved_model: args.resolvedModel,
    routing_strategy: resolveRoutingStrategy({
      requestedRaw: args.requestedRaw,
      canonicalId: args.canonicalId,
      isAlias: args.isAlias,
    }),
    attempted_models: [...args.attemptedModels],
    fallback_attempts: Math.max(0, args.fallbackAttempts),
    latency_ms: Math.max(0, Math.trunc(args.latencyMs)),
    billing_status: args.billingStatus ?? "charged",
    credits_charged: Number(args.creditsCharged) || 0,
  };
}

export function buildFailureRoutingEvidence(args: {
  requestId: string;
  requestedRaw: string;
  canonicalId: string;
  isAlias: boolean;
  resolvedModel?: string | null;
  attemptedModels: string[];
  fallbackAttempts?: number;
  latencyMs: number;
  fallbackReason?: string | null;
  errorCode?: string | null;
}): TokfaiRoutingEvidence {
  const attempts = args.attemptedModels.length
    ? args.attemptedModels
    : [args.canonicalId || args.requestedRaw].filter(Boolean);
  return {
    request_id: args.requestId,
    requested_model: args.requestedRaw,
    resolved_model: args.resolvedModel ?? null,
    routing_strategy: resolveRoutingStrategy({
      requestedRaw: args.requestedRaw,
      canonicalId: args.canonicalId,
      isAlias: args.isAlias,
    }),
    attempted_models: [...attempts],
    fallback_attempts:
      args.fallbackAttempts != null
        ? Math.max(0, args.fallbackAttempts)
        : Math.max(0, attempts.length),
    latency_ms: Math.max(0, Math.trunc(args.latencyMs)),
    billing_status: "not_billable",
    credits_charged: 0,
    fallback_reason: args.fallbackReason ?? args.errorCode ?? null,
    error_code: args.errorCode ?? null,
  };
}

/** Flatten for structured logs (camelCase keys used elsewhere in chat logs). */
export function routingEvidenceToLogFields(
  evidence: TokfaiRoutingEvidence,
  extras?: Partial<RoutingLogFields> & {
    upstreamChatPath?: string | null;
  }
): RoutingLogFields {
  const route = extras?.route ?? "/v1/chat/completions";
  const audit = resolveUsageRouteAudit({
    clientRoute: extras?.clientRoute ?? route,
    upstreamRoute: extras?.upstreamRoute ?? extras?.upstreamChatPath ?? null,
  });
  const routeLog = usageRouteAuditLogFields(audit);
  return {
    requestId: evidence.request_id,
    requestedModel: evidence.requested_model,
    resolvedModel: evidence.resolved_model,
    attemptedModel:
      extras?.attemptedModel ??
      evidence.attempted_models[evidence.attempted_models.length - 1] ??
      evidence.resolved_model,
    attemptedModels: evidence.attempted_models,
    providerId: extras?.providerId ?? null,
    providerLabel: extras?.providerLabel ?? extras?.providerId ?? null,
    route,
    clientRoute: extras?.clientRoute ?? routeLog.clientRoute,
    upstreamRoute: extras?.upstreamRoute ?? routeLog.upstreamRoute,
    wireApi: extras?.wireApi ?? routeLog.wireApi,
    billingTokenSchema:
      extras?.billingTokenSchema ?? routeLog.billingTokenSchema,
    status: extras?.status ?? null,
    upstreamStatus: extras?.upstreamStatus ?? null,
    upstreamErrorCode: extras?.upstreamErrorCode ?? null,
    fallbackAttempts: evidence.fallback_attempts,
    fallbackReason: evidence.fallback_reason ?? extras?.fallbackReason ?? null,
    latencyMs: evidence.latency_ms,
    billing_status: evidence.billing_status,
    credits_charged: evidence.credits_charged,
  };
}

/** Merge routing into existing tokfai object without dropping billing fields. */
export function mergeTokfaiRouting(
  existing: Record<string, unknown> | null | undefined,
  evidence: TokfaiRoutingEvidence,
  routeAudit?: {
    clientRoute?: string | null;
    upstreamRoute?: string | null;
  }
): Record<string, unknown> {
  const base = existing && typeof existing === "object" ? { ...existing } : {};
  const audit = resolveUsageRouteAudit({
    clientRoute:
      routeAudit?.clientRoute ??
      (typeof base.client_route === "string" ? base.client_route : null) ??
      "/v1/chat/completions",
    upstreamRoute: routeAudit?.upstreamRoute ?? null,
  });
  return {
    ...base,
    request_id: evidence.request_id,
    requested_model: evidence.requested_model,
    resolved_model: evidence.resolved_model,
    routing_strategy: evidence.routing_strategy,
    attempted_models: evidence.attempted_models,
    fallback_attempts: evidence.fallback_attempts,
    latency_ms: evidence.latency_ms,
    billing_status: evidence.billing_status,
    credits_charged: evidence.credits_charged,
    ...usageRouteAuditSnapshotFields(audit),
    ...(evidence.fallback_reason != null
      ? { fallback_reason: evidence.fallback_reason }
      : {}),
    ...(evidence.error_code != null ? { error_code: evidence.error_code } : {}),
  };
}

/** Snapshot stored on usage_logs.response_snapshot for Admin (no secrets). */
export function routingEvidenceSnapshot(
  evidence: TokfaiRoutingEvidence,
  routeAudit?: {
    clientRoute?: string | null;
    upstreamRoute?: string | null;
  }
): Record<string, unknown> {
  return { tokfai: mergeTokfaiRouting({}, evidence, routeAudit) };
}
