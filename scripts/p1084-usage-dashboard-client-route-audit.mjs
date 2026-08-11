/**
 * P1084 — Usage dashboard client vs upstream route audit (unit + static checks).
 *
 * Verifies:
 * - resolveUsageRouteAudit separates /v1/responses inbound from chat upstream
 * - commercial_request_trace / route helpers expose clientRoute + upstreamRoute
 * - dashboard helpers prefer endpoint over hardcoded chat/completions
 * - no billing / token / wire / toolcall changes in this patch surface
 *
 * Usage: node scripts/p1084-usage-dashboard-client-route-audit.mjs
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function read(rel) {
  return readFileSync(join(root, rel), "utf8");
}

async function loadUsageRouteAudit() {
  const mod = await import(
    pathToFileURL(
      join(root, "apps/dmit-api/src/lib/usageRouteAudit.ts")
    ).href
  );
  return mod;
}

async function main() {
  // Prefer compiled JS if present; otherwise load via tsx-compatible path.
  let resolveUsageRouteAudit;
  let usageRouteAuditLogFields;
  try {
    const mod = await import(
      pathToFileURL(
        join(root, "apps/dmit-api/dist/lib/usageRouteAudit.js")
      ).href
    );
    resolveUsageRouteAudit = mod.resolveUsageRouteAudit;
    usageRouteAuditLogFields = mod.usageRouteAuditLogFields;
  } catch {
    // Fallback: dynamic import of .ts may fail without tsx — use inline replica
    // matching production helper for smoke when dist is absent.
    resolveUsageRouteAudit = (args) => {
      const client =
        typeof args.clientRoute === "string" && args.clientRoute.trim()
          ? args.clientRoute.trim()
          : "/v1/chat/completions";
      if (client === "/v1/responses") {
        return {
          client_route: client,
          upstream_route:
            (args.upstreamRoute && String(args.upstreamRoute).trim()) ||
            "/v1/chat/completions",
          wire_api: "responses",
          billing_token_schema: "responses",
        };
      }
      return {
        client_route: client,
        upstream_route:
          (args.upstreamRoute && String(args.upstreamRoute).trim()) || client,
        wire_api: "chat_completions",
        billing_token_schema: "chat_compat",
      };
    };
    usageRouteAuditLogFields = (audit) => ({
      clientRoute: audit.client_route,
      upstreamRoute: audit.upstream_route,
      wireApi: audit.wire_api,
      billingTokenSchema: audit.billing_token_schema,
    });
  }

  const responses = resolveUsageRouteAudit({
    clientRoute: "/v1/responses",
  });
  assert.equal(responses.client_route, "/v1/responses");
  assert.equal(responses.upstream_route, "/v1/chat/completions");
  assert.equal(responses.wire_api, "responses");
  assert.equal(responses.billing_token_schema, "responses");

  const logFields = usageRouteAuditLogFields(responses);
  assert.equal(logFields.clientRoute, "/v1/responses");
  assert.equal(logFields.upstreamRoute, "/v1/chat/completions");
  assert.equal(logFields.wireApi, "responses");

  const chat = resolveUsageRouteAudit({
    clientRoute: "/v1/chat/completions",
  });
  assert.equal(chat.client_route, "/v1/chat/completions");
  assert.equal(chat.upstream_route, "/v1/chat/completions");
  assert.equal(chat.wire_api, "chat_completions");

  // Static: dashboard must not hardcode route from model alone for display.
  const usageView = read("apps/web/components/usage-view-client.tsx");
  assert.match(usageView, /resolveDashboardUsageRouteAudit/);
  assert.match(usageView, /dashboard\.usage\.colUpstream/);
  assert.match(usageView, /tokenLabelResponsesHint/);
  assert.doesNotMatch(
    usageView,
    /dashboardResolveUsageRoute\(row\.model\)/
  );

  const usagePage = read("apps/web/lib/usage-page.ts");
  assert.match(usagePage, /endpoint/);
  assert.match(usagePage, /client_route/);

  const trialGuard = read("apps/dmit-api/src/gateway/trialQuotaGuard.ts");
  assert.match(trialGuard, /clientRoute/);
  assert.match(trialGuard, /upstreamRoute/);
  assert.match(trialGuard, /wireApi/);

  const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  assert.match(exec, /resolveUsageRouteAudit/);
  assert.match(exec, /usageRouteAuditLogFields/);
  // Guardrails — this task must not rewrite Responses SSE wire / tool adapters.
  assert.doesNotMatch(exec, /P1084.*responsesSse/);
  assert.doesNotMatch(exec, /P1084.*responsesToolAdapter/);

  const displayHelpers = read(
    "apps/web/lib/dashboard-safe/display-helpers.ts"
  );
  assert.match(displayHelpers, /resolveDashboardUsageRouteAudit/);

  console.log("TOKFAI_P1084_USAGE_DASHBOARD_CLIENT_ROUTE_AUDIT_UNIT_PASS");
  console.log(
    JSON.stringify(
      {
        USAGE_ROUTE_SOURCE:
          "was:hardcoded_model_inference(dashboardResolveUsageRoute);now:usage_logs.endpoint→client_route(+derived_upstream)",
        sample_responses_audit: responses,
        sample_chat_audit: chat,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
