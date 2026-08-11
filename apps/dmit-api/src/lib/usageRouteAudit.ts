/**
 * P1084 — Distinguish client inbound route vs upstream forward path.
 *
 * Tokfai may accept /v1/responses while forwarding to GRSai /v1/chat/completions.
 * Billing still uses usage_logs prompt/completion columns (chat_compat ledger).
 * Never logs secrets, prompts, tools, or file paths.
 */

export type UsageWireApi =
  | "responses"
  | "chat_completions"
  | "images"
  | "other";

export type BillingTokenSchema = "responses" | "chat_compat";

export type UsageRouteAudit = {
  client_route: string;
  upstream_route: string;
  wire_api: UsageWireApi;
  billing_token_schema: BillingTokenSchema;
};

const DEFAULT_CHAT_UPSTREAM = "/v1/chat/completions";
const RESPONSES_ROUTE = "/v1/responses";
const IMAGES_ROUTE = "/v1/images/generations";

function normalizeRoute(route: string | null | undefined): string {
  const trimmed = typeof route === "string" ? route.trim() : "";
  return trimmed.length > 0 ? trimmed : DEFAULT_CHAT_UPSTREAM;
}

/**
 * Resolve auditable route fields from the client inbound path.
 * upstreamRoute overrides the default forward path when known (provider.chatPath).
 */
export function resolveUsageRouteAudit(args: {
  clientRoute: string | null | undefined;
  upstreamRoute?: string | null;
}): UsageRouteAudit {
  const client_route = normalizeRoute(args.clientRoute);
  const upstreamOverride =
    typeof args.upstreamRoute === "string" && args.upstreamRoute.trim()
      ? args.upstreamRoute.trim()
      : null;

  if (client_route === RESPONSES_ROUTE) {
    return {
      client_route,
      upstream_route: upstreamOverride ?? DEFAULT_CHAT_UPSTREAM,
      wire_api: "responses",
      // Ledger columns remain prompt/completion; wire semantics are input/output.
      billing_token_schema: "responses",
    };
  }

  if (
    client_route === IMAGES_ROUTE ||
    client_route.includes("/images/")
  ) {
    return {
      client_route,
      upstream_route: upstreamOverride ?? client_route,
      wire_api: "images",
      billing_token_schema: "chat_compat",
    };
  }

  if (
    client_route === DEFAULT_CHAT_UPSTREAM ||
    client_route.includes("/chat/completions")
  ) {
    return {
      client_route,
      upstream_route: upstreamOverride ?? client_route,
      wire_api: "chat_completions",
      billing_token_schema: "chat_compat",
    };
  }

  return {
    client_route,
    upstream_route: upstreamOverride ?? client_route,
    wire_api: "other",
    billing_token_schema: "chat_compat",
  };
}

/** Flat camelCase fields for commercial_request_trace / structured logs. */
export function usageRouteAuditLogFields(
  audit: UsageRouteAudit
): {
  clientRoute: string;
  upstreamRoute: string;
  wireApi: UsageWireApi;
  billingTokenSchema: BillingTokenSchema;
} {
  return {
    clientRoute: audit.client_route,
    upstreamRoute: audit.upstream_route,
    wireApi: audit.wire_api,
    billingTokenSchema: audit.billing_token_schema,
  };
}

/** Snake_case fields for tokfai / usage snapshot (admin-auditable). */
export function usageRouteAuditSnapshotFields(
  audit: UsageRouteAudit
): Record<string, string> {
  return {
    client_route: audit.client_route,
    upstream_route: audit.upstream_route,
    wire_api: audit.wire_api,
    billing_token_schema: audit.billing_token_schema,
  };
}
