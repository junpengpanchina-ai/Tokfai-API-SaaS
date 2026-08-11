/**
 * P1084 unit — usage route audit + dashboard resolve helpers.
 * Run: npx tsx scripts/p1084-usage-route-audit-unit.mts
 */

import assert from "node:assert/strict";

import {
  resolveUsageRouteAudit,
  usageRouteAuditLogFields,
  usageRouteAuditSnapshotFields,
} from "../apps/dmit-api/src/lib/usageRouteAudit.ts";
import {
  dashboardIsResponsesUsageRoute,
  dashboardShouldShowUpstreamRoute,
  resolveDashboardUsageRouteAudit,
} from "../apps/web/lib/dashboard-safe/usage-route-audit.ts";

const responses = resolveUsageRouteAudit({ clientRoute: "/v1/responses" });
assert.equal(responses.client_route, "/v1/responses");
assert.equal(responses.upstream_route, "/v1/chat/completions");
assert.equal(responses.wire_api, "responses");
assert.equal(responses.billing_token_schema, "responses");

const log = usageRouteAuditLogFields(responses);
assert.deepEqual(log, {
  clientRoute: "/v1/responses",
  upstreamRoute: "/v1/chat/completions",
  wireApi: "responses",
  billingTokenSchema: "responses",
});

const snap = usageRouteAuditSnapshotFields(responses);
assert.equal(snap.client_route, "/v1/responses");
assert.equal(snap.upstream_route, "/v1/chat/completions");

const chat = resolveUsageRouteAudit({
  clientRoute: "/v1/chat/completions",
});
assert.equal(chat.upstream_route, "/v1/chat/completions");
assert.equal(chat.wire_api, "chat_completions");

const dashResponses = resolveDashboardUsageRouteAudit({
  endpoint: "/v1/responses",
  model: "gpt-5.5",
});
assert.equal(dashResponses.client_route, "/v1/responses");
assert.equal(dashResponses.upstream_route, "/v1/chat/completions");
assert.ok(dashboardShouldShowUpstreamRoute(dashResponses));
assert.ok(dashboardIsResponsesUsageRoute(dashResponses));

const dashLegacy = resolveDashboardUsageRouteAudit({
  endpoint: null,
  model: "gpt-5.5",
});
assert.equal(dashLegacy.client_route, "/v1/chat/completions");
assert.equal(dashLegacy.upstream_route, "/v1/chat/completions");
assert.equal(dashboardShouldShowUpstreamRoute(dashLegacy), false);

const dashImage = resolveDashboardUsageRouteAudit({
  endpoint: null,
  model: "nano-banana",
});
assert.equal(dashImage.client_route, "/v1/images/generations");

console.log("TOKFAI_P1084_USAGE_ROUTE_AUDIT_UNIT_PASS");
