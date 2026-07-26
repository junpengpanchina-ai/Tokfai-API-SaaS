#!/usr/bin/env node
/**
 * P951 — KA load policy / 429 diagnosis smoke (docs + static checks only).
 *
 * Hard limits:
 *   - no LIVE / no real 500-concurrency load
 *   - no billing / Nginx / Nano Banana / GPT-Gemini routing edits required
 *   - does not raise production rate limits
 *
 * Usage:
 *   node scripts/p951-ka-load-policy-smoke.mjs
 *
 * Acceptance:
 *   TOKFAI_P951_KA_LOAD_POLICY_PASS
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pass, fail } from "./lib/client-compat-smoke-bootstrap.mjs";

const SCRIPT = "scripts/p951-ka-load-policy-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_DOC = join(ROOT, "docs/p951-ka-load-policy.md");
const PASS_MARKER = "TOKFAI_P951_KA_LOAD_POLICY_PASS";
const FAIL_MARKER = "TOKFAI_P951_KA_LOAD_POLICY_FAIL";

const SRC = {
  errors: "apps/dmit-api/src/errors.ts",
  env: "apps/dmit-api/src/env.ts",
  rateLimit: "apps/dmit-api/src/gateway/rateLimit.ts",
  concurrency: "apps/dmit-api/src/gateway/concurrency.ts",
  chatGateway: "apps/dmit-api/src/middleware/chatGateway.ts",
  chatGatewayLogs: "apps/dmit-api/src/routes/chatGatewayLogs.ts",
  logger: "apps/dmit-api/src/logger.ts",
  execute: "apps/dmit-api/src/lib/executeChatCompletion.ts",
};

async function readRel(rel) {
  return readFile(join(ROOT, rel), "utf8");
}

function extractDefault(envSrc, name) {
  const re = new RegExp(
    `${name}:\\s*z\\.coerce[\\s\\S]*?\\.default\\((\\d[_\\d]*)\\)`,
    "m"
  );
  const m = envSrc.match(re);
  if (!m) return null;
  return Number(String(m[1]).replace(/_/g, ""));
}

function checkErrorSources(errors, gateway) {
  let ok = true;
  if (
    !errors.includes('code: "too_many_requests"') ||
    !errors.includes("tooManyRequests")
  ) {
    ok = fail("too_many_requests factory", "missing ApiError.tooManyRequests") && false;
  } else {
    pass("too_many_requests sourced from ApiError.tooManyRequests");
  }

  if (
    !errors.includes('code: "too_many_concurrent_requests"') ||
    !errors.includes("tooManyConcurrentRequests")
  ) {
    ok =
      fail(
        "too_many_concurrent_requests factory",
        "missing ApiError.tooManyConcurrentRequests"
      ) && false;
  } else {
    pass(
      "too_many_concurrent_requests sourced from ApiError.tooManyConcurrentRequests"
    );
  }

  if (
    !gateway.includes("ApiError.tooManyRequests()") ||
    !gateway.includes("ApiError.tooManyConcurrentRequests()")
  ) {
    ok =
      fail(
        "chatGateway emits 429 codes",
        "middleware must call tooManyRequests / tooManyConcurrentRequests"
      ) && false;
  } else {
    pass("chatGatewayMiddleware emits both 429 error codes");
  }

  if (
    !gateway.includes('reason: "ip_rpm"') ||
    !gateway.includes('reason: "tenant_rpm"') ||
    !gateway.includes('reason: "key_rpm"') ||
    !gateway.includes('reason: "key_concurrency"')
  ) {
    ok =
      fail(
        "429 reason tags",
        "expected ip_rpm / tenant_rpm / key_rpm / key_concurrency"
      ) && false;
  } else {
    pass("429 reason tags: ip_rpm / tenant_rpm / key_rpm / key_concurrency");
  }

  return ok;
}

function checkDefaultLimits(envSrc, concurrencySrc, executeSrc) {
  const keyRpm = extractDefault(envSrc, "TOKFAI_RATE_LIMIT_RPM");
  const ipRpm = extractDefault(envSrc, "TOKFAI_RATE_LIMIT_IP_RPM");
  const tenantRpm = extractDefault(envSrc, "TOKFAI_RATE_LIMIT_TENANT_RPM");
  const keyConc = extractDefault(envSrc, "TOKFAI_MAX_CONCURRENCY_PER_KEY");
  const globalUp = extractDefault(envSrc, "TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY");

  const expected = {
    TOKFAI_RATE_LIMIT_RPM: 60,
    TOKFAI_RATE_LIMIT_IP_RPM: 120,
    TOKFAI_RATE_LIMIT_TENANT_RPM: 600,
    TOKFAI_MAX_CONCURRENCY_PER_KEY: 5,
    TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY: 50,
  };

  const got = {
    TOKFAI_RATE_LIMIT_RPM: keyRpm,
    TOKFAI_RATE_LIMIT_IP_RPM: ipRpm,
    TOKFAI_RATE_LIMIT_TENANT_RPM: tenantRpm,
    TOKFAI_MAX_CONCURRENCY_PER_KEY: keyConc,
    TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY: globalUp,
  };

  let ok = true;
  for (const [name, want] of Object.entries(expected)) {
    if (got[name] !== want) {
      ok =
        fail(
          `default ${name}`,
          `expected ${want}, got ${got[name] ?? "missing"}`
        ) && false;
    }
  }
  if (ok) {
    pass(
      `defaults: key RPM=${keyRpm}, IP RPM=${ipRpm}, tenant RPM=${tenantRpm}, key concurrency=${keyConc}, global upstream=${globalUp}`
    );
  }

  // Single route: no dedicated route RPM env (shared middleware).
  if (/TOKFAI_RATE_LIMIT_ROUTE_RPM/.test(envSrc)) {
    ok =
      fail(
        "no dedicated route RPM",
        "P951 expects shared key/IP/tenant gates, not TOKFAI_RATE_LIMIT_ROUTE_RPM"
      ) && false;
  } else {
    pass("single route: no dedicated route RPM (shared gateway gates)");
  }

  if (
    !concurrencySrc.includes("TOKFAI_MAX_CONCURRENCY_PER_KEY") ||
    !concurrencySrc.includes("TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY")
  ) {
    ok =
      fail(
        "concurrency wiring",
        "concurrency.ts must reference per-key and global upstream limits"
      ) && false;
  } else {
    pass("concurrency.ts wires per-key + global upstream limits");
  }

  if (
    !executeSrc.includes("tryAcquireGlobalUpstream") ||
    !executeSrc.includes("gatewayOverloaded")
  ) {
    ok =
      fail(
        "global upstream → 503",
        "executeChatCompletion must use gatewayOverloaded on global cap"
      ) && false;
  } else {
    pass("global upstream concurrency returns gateway_overloaded (503, not 429)");
  }

  return ok;
}

function checkRateLimitRejectedLog(logsSrc, loggerSrc) {
  let ok = true;
  if (!logsSrc.includes('"rate_limit_rejected"') && !logsSrc.includes("'rate_limit_rejected'")) {
    ok = fail("rate_limit_rejected event", "missing log event name") && false;
  } else {
    pass("rate_limit_rejected log event present");
  }

  const requiredFields = [
    "route",
    "model",
    "reason",
    "limit",
    "current",
    "key_hash",
    "request_id",
  ];
  const missing = requiredFields.filter((f) => {
    // field must appear near the rate_limit_rejected call
    return !new RegExp(
      `rate_limit_rejected[\\s\\S]{0,400}${f}\\s*:`,
      "m"
    ).test(logsSrc);
  });
  if (missing.length) {
    ok =
      fail(
        "rate_limit_rejected fields",
        `missing: ${missing.join(", ")}`
      ) && false;
  } else {
    pass(
      `rate_limit_rejected fields: ${requiredFields.join(", ")}`
    );
  }

  const allowFields = ["reason", "limit", "current", "key_hash", "request_id"];
  const missingAllow = allowFields.filter((f) => !loggerSrc.includes(`"${f}"`));
  if (missingAllow.length) {
    ok =
      fail(
        "logger allowlist",
        `logger.ts must allow: ${missingAllow.join(", ")}`
      ) && false;
  } else {
    pass("logger allowlist includes rate_limit_rejected fields");
  }

  if (
    !logsSrc.includes("safeRateLimitKeyHash") &&
    !logsSrc.includes("tokfai:rl:")
  ) {
    ok =
      fail(
        "safe key_hash",
        "key_hash must be derived fingerprint, never raw secret"
      ) && false;
  } else {
    pass("key_hash uses non-reversible fingerprint (not raw API key)");
  }

  return ok;
}

function checkPolicyDoc(doc) {
  let ok = true;

  const requiredTopics = [
    { re: /Free\s*\/\s*Beta\s*\/\s*KA|Free[\s\S]{0,80}Beta[\s\S]{0,80}KA/i, label: "Free / Beta / KA tiers" },
    { re: /不能全局取消限流|为什么不能全局取消/i, label: "why not remove global rate limits" },
    { re: /500\s*人在线[\s\S]{0,120}500[\s\S]{0,80}(同毫秒|并发)/i, label: "500 online vs 500 same-ms requests" },
    { re: /白名单|套餐/i, label: "KA whitelist / plan limits" },
    { re: /too_many_requests/, label: "too_many_requests diagnosis" },
    { re: /too_many_concurrent_requests/, label: "too_many_concurrent_requests diagnosis" },
    { re: /TOKFAI_MAX_CONCURRENCY_PER_KEY|单 key 并发/i, label: "per-key concurrency=5" },
    { re: /TOKFAI_RATE_LIMIT_RPM|单 key RPM/i, label: "per-key RPM=60" },
    { re: /TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY|全局上游/i, label: "global upstream concurrency" },
    { re: /rate_limit_rejected/, label: "rate_limit_rejected logging" },
    { re: /Nano Banana/i, label: "Nano Banana hard limit stated" },
    { re: /billing/i, label: "billing hard limit stated" },
    { re: /Nginx/i, label: "Nginx hard limit stated" },
  ];

  for (const { re, label } of requiredTopics) {
    if (!re.test(doc)) {
      ok = fail("policy doc coverage", `missing: ${label}`) && false;
    }
  }
  if (ok) {
    pass("policy doc covers tiers, anti-unlimited, 500-online distinction, KA path, 429 sources");
  }

  // Must not instruct raising defaults in this task / must state defaults unchanged.
  if (!/未改这些默认|不放开默认限流|P951 未改/i.test(doc)) {
    ok =
      fail(
        "defaults unchanged stated",
        "doc must state P951 does not change default limits"
      ) && false;
  } else {
    pass("doc states P951 does not change default limits");
  }

  return ok;
}

function checkNoForbiddenPatterns(files) {
  const forbidden = [
    /Cannot set headers/i,
    /api_error_500/,
    /charged timeout/i,
  ];
  let ok = true;
  for (const [name, src] of Object.entries(files)) {
    for (const re of forbidden) {
      // Allow mentioning forbidden patterns as acceptance negatives in docs/smoke only.
      if (name === "doc" || name === "smoke") continue;
      if (re.test(src)) {
        ok =
          fail(
            "forbidden runtime pattern",
            `${name} unexpectedly contains ${re}`
          ) && false;
      }
    }
  }
  if (ok) pass("changed runtime sources free of Cannot set headers / api_error_500 / charged timeout");
  return ok;
}

async function main() {
  console.log("=== P951 KA load policy / 429 diagnosis (static) ===");
  console.log(`script: ${SCRIPT}`);
  console.log("mode: docs + static checks only (no LIVE, no 500-burst load)");
  console.log("");

  let doc;
  try {
    doc = await readRel("docs/p951-ka-load-policy.md");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail("policy doc readable", message);
    console.log("");
    console.log(FAIL_MARKER);
    process.exit(1);
  }

  if (!doc.trim()) {
    fail("policy doc non-empty", "docs/p951-ka-load-policy.md is empty");
    console.log("");
    console.log(FAIL_MARKER);
    process.exit(1);
  }
  pass("policy doc readable: docs/p951-ka-load-policy.md");

  const errors = await readRel(SRC.errors);
  const envSrc = await readRel(SRC.env);
  const rateLimit = await readRel(SRC.rateLimit);
  const concurrency = await readRel(SRC.concurrency);
  const chatGateway = await readRel(SRC.chatGateway);
  const chatGatewayLogs = await readRel(SRC.chatGatewayLogs);
  const loggerSrc = await readRel(SRC.logger);
  const executeSrc = await readRel(SRC.execute);

  let allOk = true;
  allOk = checkErrorSources(errors, chatGateway) && allOk;
  allOk = checkDefaultLimits(envSrc, concurrency, executeSrc) && allOk;
  allOk = checkRateLimitRejectedLog(chatGatewayLogs, loggerSrc) && allOk;
  allOk = checkPolicyDoc(doc) && allOk;
  allOk =
    checkNoForbiddenPatterns({
      chatGateway,
      chatGatewayLogs,
      rateLimit,
      concurrency,
      logger: loggerSrc,
      doc,
      smoke: "",
    }) && allOk;

  // Rate limit module must still expose key/ip/tenant checks.
  if (
    !rateLimit.includes("checkApiKeyRateLimit") ||
    !rateLimit.includes("checkIpRateLimit") ||
    !rateLimit.includes("checkTenantRateLimit") ||
    !rateLimit.includes("current")
  ) {
    allOk =
      fail(
        "rateLimit surface",
        "expected key/ip/tenant checks + current field"
      ) && false;
  } else {
    pass("rateLimit.ts exposes key/ip/tenant RPM + current");
  }

  console.log("");
  console.log(allOk ? PASS_MARKER : FAIL_MARKER);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  console.log(FAIL_MARKER);
  process.exit(1);
});
