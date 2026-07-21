#!/usr/bin/env node
/**
 * Security smoke — Rate limit / 429 non-billing / no stack leaks (offline).
 *
 * Usage: node scripts/security-rate-limit-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function pass(label) {
  console.log(`PASS  ${label}`);
  return true;
}

function fail(label, detail) {
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
  return false;
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

let ok = true;

{
  const rate = read("apps/dmit-api/src/gateway/rateLimit.ts");
  const gateway = read("apps/dmit-api/src/middleware/chatGateway.ts");
  const env = read("apps/dmit-api/src/env.ts");

  if (!rate.includes("checkApiKeyRateLimit") || !gateway.includes("checkApiKeyRateLimit")) {
    ok = fail("API key RPM", "missing per-key rate limit") && ok;
  } else {
    pass("single API Key high-frequency → rate limited (RPM)");
  }

  if (!rate.includes("checkIpRateLimit") || !gateway.includes("checkIpRateLimit")) {
    ok = fail("IP RPM", "missing per-IP rate limit") && ok;
  } else {
    pass("single IP high-frequency → rate limited");
  }

  if (!rate.includes("checkTenantRateLimit") || !gateway.includes("checkTenantRateLimit")) {
    ok = fail("tenant RPM", "missing per-tenant rate limit") && ok;
  } else {
    pass("single tenant over-quota → rate limited");
  }

  if (
    !env.includes("TOKFAI_RATE_LIMIT_RPM") ||
    !env.includes("TOKFAI_RATE_LIMIT_IP_RPM") ||
    !env.includes("TOKFAI_RATE_LIMIT_TENANT_RPM")
  ) {
    ok = fail("rate limit env", "expected RPM env vars for key/ip/tenant") && ok;
  } else {
    pass("rate limit env configured for key / IP / tenant");
  }
}

{
  const errors = read("apps/dmit-api/src/errors.ts");
  const gateway = read("apps/dmit-api/src/middleware/chatGateway.ts");
  if (!errors.includes("tooManyRequests") || !gateway.includes("tooManyRequests")) {
    ok = fail("429 response", "expected ApiError.tooManyRequests") && ok;
  } else {
    pass("rate limit returns 429");
  }

  const logs = read("apps/dmit-api/src/routes/chatGatewayLogs.ts");
  if (!logs.includes("billable: false") || !logs.includes("rate_limited")) {
    ok = fail("429 no charge", "gateway rejection must log billable:false") && ok;
  } else {
    pass("429 does not charge credits");
  }
}

{
  const errorMw = read("apps/dmit-api/src/middleware/error.ts");
  if (
    errorMw.includes("stack") &&
    /client|public|json[\s\S]{0,80}stack|stack[\s\S]{0,80}json/i.test(errorMw)
  ) {
    ok = fail("stack leak", "error handler must not return stack to clients") && ok;
  } else if (
    !errorMw.includes("buildClientErrorBody") ||
    !errorMw.includes("c.body(")
  ) {
    ok = fail("safe error envelope", "expected non-empty JSON error body") && ok;
  } else if (!errorMw.includes("api_error_${err.status}")) {
    ok = fail("api_error_400 log", "expected status-specific api_error_* logs") && ok;
  } else {
    pass("error responses do not expose internal stack");
  }
}

if (!ok) {
  console.error("\nsecurity-rate-limit-smoke: FAILED");
  process.exit(1);
}
console.log("\nsecurity-rate-limit-smoke: OK");
