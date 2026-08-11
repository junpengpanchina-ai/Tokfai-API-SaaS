/**
 * P1084 — Client vs upstream route display helpers for Usage dashboard.
 * Mirrors dmit-api usageRouteAudit semantics without importing server code.
 */

export type DashboardUsageWireApi =
  | "responses"
  | "chat_completions"
  | "images"
  | "other";

export type DashboardBillingTokenSchema = "responses" | "chat_compat";

export type DashboardUsageRouteAudit = {
  client_route: string;
  upstream_route: string;
  wire_api: DashboardUsageWireApi;
  billing_token_schema: DashboardBillingTokenSchema;
};

const DEFAULT_CHAT = "/v1/chat/completions";
const RESPONSES = "/v1/responses";
const IMAGES = "/v1/images/generations";

function normalizeRoute(route: string | null | undefined): string | null {
  if (typeof route !== "string") return null;
  const trimmed = route.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** Legacy fallback when usage_logs.endpoint is missing (pre-P765 / old rows). */
export function dashboardInferUsageRouteFromModel(
  model: string | null | undefined
): string {
  if (model) {
    const id = model.toLowerCase();
    if (
      id.startsWith("nano-banana") ||
      id.startsWith("gpt-image") ||
      id.includes("image")
    ) {
      return IMAGES;
    }
  }
  return DEFAULT_CHAT;
}

/**
 * Prefer stored client inbound endpoint; fall back to model inference.
 * Never invents /v1/responses from model alone (old rows stay chat unless endpoint set).
 */
export function resolveDashboardUsageRouteAudit(args: {
  endpoint?: string | null;
  client_route?: string | null;
  upstream_route?: string | null;
  wire_api?: string | null;
  billing_token_schema?: string | null;
  model?: string | null;
}): DashboardUsageRouteAudit {
  const storedClient =
    normalizeRoute(args.client_route) ?? normalizeRoute(args.endpoint);
  const client_route =
    storedClient ?? dashboardInferUsageRouteFromModel(args.model);

  const storedUpstream = normalizeRoute(args.upstream_route);
  const storedWire = normalizeRoute(args.wire_api);
  const storedSchema = normalizeRoute(args.billing_token_schema);

  if (client_route === RESPONSES) {
    return {
      client_route,
      upstream_route: storedUpstream ?? DEFAULT_CHAT,
      wire_api:
        storedWire === "responses" ||
        storedWire === "chat_completions" ||
        storedWire === "images" ||
        storedWire === "other"
          ? storedWire
          : "responses",
      billing_token_schema:
        storedSchema === "responses" || storedSchema === "chat_compat"
          ? storedSchema
          : "responses",
    };
  }

  if (client_route === IMAGES || client_route.includes("/images/")) {
    return {
      client_route,
      upstream_route: storedUpstream ?? client_route,
      wire_api: "images",
      billing_token_schema: "chat_compat",
    };
  }

  return {
    client_route,
    upstream_route: storedUpstream ?? client_route,
    wire_api:
      storedWire === "responses" ||
      storedWire === "chat_completions" ||
      storedWire === "images" ||
      storedWire === "other"
        ? storedWire
        : "chat_completions",
    billing_token_schema: "chat_compat",
  };
}

/** Show secondary upstream only when it differs from the client inbound route. */
export function dashboardShouldShowUpstreamRoute(
  audit: DashboardUsageRouteAudit
): boolean {
  return audit.upstream_route !== audit.client_route;
}

export function dashboardIsResponsesUsageRoute(
  audit: DashboardUsageRouteAudit
): boolean {
  return (
    audit.wire_api === "responses" || audit.client_route === RESPONSES
  );
}
