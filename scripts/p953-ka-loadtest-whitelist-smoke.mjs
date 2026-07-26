#!/usr/bin/env node
/**
 * P953 — KA LoadTest key/tenant whitelist smoke (static + pure policy sim).
 *
 * Hard limits:
 *   - no LIVE / no real 500-burst against production
 *   - does not raise ordinary defaults
 *   - asserts auth/billing/Nano Banana paths are not bypassed
 *
 * Usage:
 *   node scripts/p953-ka-loadtest-whitelist-smoke.mjs
 *
 * Acceptance:
 *   TOKFAI_P953_KA_LOADTEST_WHITELIST_PASS
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pass, fail } from "./lib/client-compat-smoke-bootstrap.mjs";

const SCRIPT = "scripts/p953-ka-loadtest-whitelist-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_DOC = "docs/p953-ka-loadtest-whitelist.md";
const PASS_MARKER = "TOKFAI_P953_KA_LOADTEST_WHITELIST_PASS";
const FAIL_MARKER = "TOKFAI_P953_KA_LOADTEST_WHITELIST_FAIL";

const SRC = {
  env: "apps/dmit-api/src/env.ts",
  ka: "apps/dmit-api/src/gateway/kaLoadTest.ts",
  rateLimit: "apps/dmit-api/src/gateway/rateLimit.ts",
  concurrency: "apps/dmit-api/src/gateway/concurrency.ts",
  chatGateway: "apps/dmit-api/src/middleware/chatGateway.ts",
  chatGatewayLogs: "apps/dmit-api/src/routes/chatGatewayLogs.ts",
  logger: "apps/dmit-api/src/logger.ts",
  keySafety: "apps/dmit-api/src/gateway/keySafetyLimits.ts",
  execute: "apps/dmit-api/src/lib/executeChatCompletion.ts",
  images: "apps/dmit-api/src/routes/images.ts",
  chat: "apps/dmit-api/src/routes/chat.ts",
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

/** Mirror of resolveKaLoadTestLimits (kept local so smoke stays offline). */
function resolveKaLoadTestLimits(input) {
  const listed = (id, allow) =>
    Boolean(id && String(id).trim() && allow.includes(String(id).trim()));
  const hit =
    listed(input.apiKeyId, input.keys) ||
    listed(input.keyId, input.keys) ||
    listed(input.tenantId, input.tenants);
  if (!hit) {
    return {
      policy: "normal",
      keyRpm: input.normal.keyRpm,
      keyConcurrency: input.normal.keyConcurrency,
      tenantRpm: input.normal.tenantRpm,
      ipRpm: input.normal.ipRpm,
      skipCreditPeriodLimits: false,
    };
  }
  const keyHit =
    listed(input.apiKeyId, input.keys) || listed(input.keyId, input.keys);
  return {
    policy: "ka_load_test",
    keyRpm: input.ka.keyRpm,
    keyConcurrency: input.ka.keyConcurrency,
    tenantRpm: input.ka.tenantRpm,
    ipRpm: input.ka.ipRpm,
    skipCreditPeriodLimits: keyHit,
  };
}

/** Minimal fixed-window RPM simulator (matches rateLimit memory semantics). */
function simulateRpmBurst(limit, bursts) {
  let count = 0;
  const outcomes = [];
  for (let i = 0; i < bursts; i++) {
    if (count >= limit) {
      outcomes.push(false);
    } else {
      count += 1;
      outcomes.push(true);
    }
  }
  return outcomes;
}

/** Minimal concurrency simulator. */
function simulateConcurrency(limit, attempts) {
  let inflight = 0;
  const outcomes = [];
  for (let i = 0; i < attempts; i++) {
    if (inflight >= limit) {
      outcomes.push(false);
    } else {
      inflight += 1;
      outcomes.push(true);
    }
  }
  return { outcomes, inflight };
}

function checkEnvAndDefaults(envSrc) {
  let ok = true;
  for (const name of [
    "KA_LOAD_TEST_KEYS",
    "KA_LOAD_TEST_TENANTS",
    "KA_LOAD_TEST_KEY_RPM",
    "KA_LOAD_TEST_KEY_CONCURRENCY",
    "KA_LOAD_TEST_TENANT_RPM",
    "KA_LOAD_TEST_IP_RPM",
  ]) {
    if (!envSrc.includes(name)) {
      ok = fail(`env ${name}`, "missing from env.ts") && false;
    }
  }
  if (ok) pass("env exposes KA_LOAD_TEST_KEYS / TENANTS + elevated quotas");

  const ordinary = {
    TOKFAI_RATE_LIMIT_RPM: extractDefault(envSrc, "TOKFAI_RATE_LIMIT_RPM"),
    TOKFAI_RATE_LIMIT_IP_RPM: extractDefault(envSrc, "TOKFAI_RATE_LIMIT_IP_RPM"),
    TOKFAI_RATE_LIMIT_TENANT_RPM: extractDefault(
      envSrc,
      "TOKFAI_RATE_LIMIT_TENANT_RPM"
    ),
    TOKFAI_MAX_CONCURRENCY_PER_KEY: extractDefault(
      envSrc,
      "TOKFAI_MAX_CONCURRENCY_PER_KEY"
    ),
    TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY: extractDefault(
      envSrc,
      "TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY"
    ),
  };
  const wantOrdinary = {
    TOKFAI_RATE_LIMIT_RPM: 60,
    TOKFAI_RATE_LIMIT_IP_RPM: 120,
    TOKFAI_RATE_LIMIT_TENANT_RPM: 600,
    TOKFAI_MAX_CONCURRENCY_PER_KEY: 5,
    TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY: 50,
  };
  for (const [k, v] of Object.entries(wantOrdinary)) {
    if (ordinary[k] !== v) {
      ok =
        fail(`ordinary default ${k}`, `expected ${v}, got ${ordinary[k]}`) &&
        false;
    }
  }
  if (ok) {
    pass(
      "ordinary defaults unchanged: RPM=60 IP=120 tenant=600 conc=5 global=50"
    );
  }

  const ka = {
    KA_LOAD_TEST_KEY_RPM: extractDefault(envSrc, "KA_LOAD_TEST_KEY_RPM"),
    KA_LOAD_TEST_KEY_CONCURRENCY: extractDefault(
      envSrc,
      "KA_LOAD_TEST_KEY_CONCURRENCY"
    ),
    KA_LOAD_TEST_TENANT_RPM: extractDefault(envSrc, "KA_LOAD_TEST_TENANT_RPM"),
  };
  const wantKa = {
    KA_LOAD_TEST_KEY_RPM: 1200,
    KA_LOAD_TEST_KEY_CONCURRENCY: 600,
    KA_LOAD_TEST_TENANT_RPM: 3000,
  };
  for (const [k, v] of Object.entries(wantKa)) {
    if (ka[k] !== v) {
      ok = fail(`KA default ${k}`, `expected ${v}, got ${ka[k]}`) && false;
    }
  }
  if (ok) {
    pass("KA load-test elevated defaults: key RPM=1200 conc=600 tenant RPM=3000");
  }

  return ok;
}

function checkWiring(files) {
  let ok = true;
  const { ka, chatGateway, rateLimit, concurrency, logs, logger, keySafety, execute } =
    files;

  if (
    !ka.includes("resolveKaLoadTestLimits") ||
    !ka.includes("getKaLoadTestLimits") ||
    !ka.includes('"ka_load_test"')
  ) {
    ok = fail("kaLoadTest helper", "missing resolve/get + ka_load_test policy") && false;
  } else {
    pass("kaLoadTest.ts exposes resolve/get + ka_load_test policy");
  }

  if (
    !chatGateway.includes("getKaLoadTestLimits") ||
    !chatGateway.includes("ka.keyRpm") ||
    !chatGateway.includes("ka.keyConcurrency") ||
    !chatGateway.includes("ka.tenantRpm")
  ) {
    ok =
      fail(
        "chatGateway KA wiring",
        "middleware must resolve KA limits for RPM/concurrency"
      ) && false;
  } else {
    pass("chatGatewayMiddleware applies KA elevated key/tenant/concurrency limits");
  }

  if (
    !rateLimit.includes("limitOverride") ||
    !concurrency.includes("limitOverride")
  ) {
    ok =
      fail(
        "override surface",
        "rateLimit/concurrency must accept per-call limit overrides"
      ) && false;
  } else {
    pass("rateLimit + concurrency accept per-call limit overrides");
  }

  if (
    !logs.includes("rate_limit_policy") ||
    !logger.includes('"rate_limit_policy"')
  ) {
    ok =
      fail(
        "rate_limit_policy log field",
        "must log rate_limit_policy and allowlist it in logger.ts"
      ) && false;
  } else {
    pass("rate_limit_rejected logs rate_limit_policy; logger allowlists it");
  }

  if (
    !logs.includes("safeRateLimitKeyHash") ||
    !logs.includes("key_hash")
  ) {
    ok = fail("key_hash", "must fingerprint limitKey, never raw secret") && false;
  } else {
    pass("key_hash fingerprint present (no raw API key logging)");
  }

  if (
    !keySafety.includes("skipCreditPeriodLimits") ||
    !keySafety.includes("getKaLoadTestLimits")
  ) {
    ok =
      fail(
        "daily credit period",
        "assertCreditPeriodLimits must honor KA skip for period caps only"
      ) && false;
  } else {
    pass("daily/monthly credit period caps skippable for KA load-test keys");
  }

  if (
    !execute.includes("assertHasCredits") ||
    !execute.includes("assertCreditPeriodLimits") ||
    !execute.includes("billable: true")
  ) {
    ok =
      fail(
        "billing intact",
        "executeChatCompletion must keep credits precheck + billable success path"
      ) && false;
  } else {
    pass("billing path intact (assertHasCredits + billable success; no auth skip)");
  }

  if (
    /skipAuth|bypassAuth|skip.*auth/i.test(chatGateway) ||
    /skipBilling|bypassBilling|billable:\s*false[\s\S]{0,40}ka_load/i.test(
      execute
    )
  ) {
    ok =
      fail(
        "no auth/billing bypass",
        "KA path must not skip auth or billing"
      ) && false;
  } else {
    pass("no auth/billing bypass markers in KA gateway path");
  }

  return ok;
}

function checkImageUntouched(imagesSrc, chatSrc) {
  let ok = true;
  if (imagesSrc.includes("chatGatewayMiddleware")) {
    ok =
      fail(
        "image isolation",
        "images route must not mount chatGatewayMiddleware"
      ) && false;
  } else {
    pass("images / Nano Banana path does not mount chatGatewayMiddleware");
  }
  if (!chatSrc.includes("chatGatewayMiddleware")) {
    ok = fail("chat gateway mount", "chat route must still use gateway") && false;
  } else {
    pass("chat completions still mounts chatGatewayMiddleware");
  }
  if (imagesSrc.includes("KA_LOAD_TEST") || imagesSrc.includes("kaLoadTest")) {
    ok =
      fail(
        "image KA coupling",
        "P953 must not wire KA load-test into images.ts"
      ) && false;
  } else {
    pass("P953 KA load-test not wired into images.ts");
  }
  return ok;
}

function checkPolicyDoc(doc) {
  let ok = true;
  const topics = [
    { re: /KA_LOAD_TEST_KEYS/, label: "KA_LOAD_TEST_KEYS" },
    { re: /KA_LOAD_TEST_TENANTS/, label: "KA_LOAD_TEST_TENANTS" },
    { re: /1200/, label: "key RPM 1200" },
    { re: /600/, label: "key concurrency 600" },
    { re: /3000/, label: "tenant RPM 3000" },
    { re: /rate_limit_policy/, label: "rate_limit_policy" },
    { re: /不跳过鉴权|鉴权/, label: "auth hard limit" },
    { re: /不跳过 billing|扣费/, label: "billing hard limit" },
    { re: /Nano Banana/i, label: "Nano Banana hard limit" },
    { re: /too_many_requests/, label: "too_many_requests" },
    { re: /too_many_concurrent_requests/, label: "too_many_concurrent_requests" },
  ];
  for (const { re, label } of topics) {
    if (!re.test(doc)) {
      ok = fail("policy doc", `missing: ${label}`) && false;
    }
  }
  if (ok) pass("policy doc covers whitelist, elevated limits, hard limits, 429 codes");
  return ok;
}

function checkNormalVsKaSimulation() {
  const normal = {
    keyRpm: 60,
    keyConcurrency: 5,
    tenantRpm: 600,
    ipRpm: 120,
  };
  const ka = {
    keyRpm: 1200,
    keyConcurrency: 600,
    tenantRpm: 3000,
    ipRpm: 6000,
  };

  const normalPolicy = resolveKaLoadTestLimits({
    apiKeyId: "normal-key-uuid",
    keyId: null,
    tenantId: "tenant-a",
    keys: ["ka-key-uuid"],
    tenants: ["ka-tenant"],
    normal,
    ka,
  });
  const kaKeyPolicy = resolveKaLoadTestLimits({
    apiKeyId: "ka-key-uuid",
    keyId: null,
    tenantId: "tenant-a",
    keys: ["ka-key-uuid"],
    tenants: ["ka-tenant"],
    normal,
    ka,
  });
  const kaTenantPolicy = resolveKaLoadTestLimits({
    apiKeyId: "other-key",
    keyId: null,
    tenantId: "ka-tenant",
    keys: ["ka-key-uuid"],
    tenants: ["ka-tenant"],
    normal,
    ka,
  });

  let ok = true;
  if (normalPolicy.policy !== "normal" || normalPolicy.keyRpm !== 60) {
    ok = fail("normal policy", "non-listed key must stay on ordinary limits") && false;
  } else {
    pass("non-listed key → rate_limit_policy=normal (RPM 60 / conc 5)");
  }
  if (
    kaKeyPolicy.policy !== "ka_load_test" ||
    kaKeyPolicy.keyRpm !== 1200 ||
    kaKeyPolicy.keyConcurrency !== 600
  ) {
    ok = fail("KA key policy", "listed key must elevate RPM/concurrency") && false;
  } else {
    pass("listed KA key → rate_limit_policy=ka_load_test (RPM 1200 / conc 600)");
  }
  if (
    kaTenantPolicy.policy !== "ka_load_test" ||
    kaTenantPolicy.tenantRpm !== 3000
  ) {
    ok =
      fail("KA tenant policy", "listed tenant must elevate tenant RPM") && false;
  } else if (kaTenantPolicy.skipCreditPeriodLimits) {
    ok =
      fail(
        "KA tenant period caps",
        "tenant-only hit must NOT skip daily credit period caps"
      ) && false;
  } else {
    pass("listed KA tenant → elevated tenant RPM 3000 (period caps still on)");
  }

  // Ordinary key: 61st RPM request denied; KA key: same burst allowed.
  const normalRpm = simulateRpmBurst(normalPolicy.keyRpm, 61);
  const kaRpm = simulateRpmBurst(kaKeyPolicy.keyRpm, 61);
  if (normalRpm.filter((x) => x).length !== 60 || normalRpm[60] !== false) {
    ok =
      fail(
        "ordinary key still 429 on RPM",
        "expected 60 allowed then deny (too_many_requests)"
      ) && false;
  } else {
    pass("ordinary key RPM burst → still blocked after 60 (would 429)");
  }
  if (kaRpm.some((x) => x === false)) {
    ok =
      fail(
        "KA key not blocked by ordinary RPM",
        "61 requests must all fit under KA RPM 1200"
      ) && false;
  } else {
    pass("KA load-test key RPM burst(61) not blocked by ordinary RPM=60");
  }

  // Ordinary concurrency 5: 6th denied; KA 600: 500 users / perUser=1 all fit.
  const normalConc = simulateConcurrency(normalPolicy.keyConcurrency, 6);
  const kaConc = simulateConcurrency(kaKeyPolicy.keyConcurrency, 500);
  if (
    normalConc.outcomes.filter((x) => x).length !== 5 ||
    normalConc.outcomes[5] !== false
  ) {
    ok =
      fail(
        "ordinary key still 429 on concurrency",
        "expected 5 allowed then deny (too_many_concurrent_requests)"
      ) && false;
  } else {
    pass(
      "ordinary key concurrency → still blocked after 5 (would 429 too_many_concurrent_requests)"
    );
  }
  if (kaConc.outcomes.some((x) => x === false)) {
    ok =
      fail(
        "KA key 500/perUser=1",
        "500 in-flight must fit under KA concurrency 600"
      ) && false;
  } else {
    pass(
      "KA load-test key 500 users / perUser=1 not blocked by ordinary concurrency=5"
    );
  }

  if (normalPolicy.skipCreditPeriodLimits) {
    ok = fail("ordinary daily credit", "must not skip period caps") && false;
  } else if (!kaKeyPolicy.skipCreditPeriodLimits) {
    ok = fail("KA daily credit", "KA key should skip period caps") && false;
  } else {
    pass("daily credit period: ordinary enforced; KA load-test skipped");
  }

  return ok;
}

function checkSourceKaHelper(kaSrc) {
  let ok = true;
  if (!kaSrc.includes("skipCreditPeriodLimits")) {
    ok = fail("ka helper period flag", "missing skipCreditPeriodLimits") && false;
  }
  if (/sk-tokfai_/i.test(kaSrc) && !/Never put raw|never.*sk-tokfai/i.test(kaSrc)) {
    // allow comment forbidding secrets
  }
  if (
    kaSrc.includes("record_usage_and_debit") ||
    kaSrc.includes("verifyApiKeyToken")
  ) {
    ok =
      fail(
        "ka helper scope",
        "helper must only resolve quotas, not auth/billing"
      ) && false;
  } else if (ok) {
    pass("kaLoadTest helper is quota-only (no auth/billing side effects)");
  }
  return ok;
}

async function main() {
  console.log("=== P953 KA LoadTest key/tenant whitelist ===");
  console.log(`script: ${SCRIPT}`);
  console.log("mode: static + pure policy simulation (no LIVE)");
  console.log("");

  let doc;
  try {
    doc = await readRel(POLICY_DOC);
  } catch (err) {
    fail("policy doc readable", err instanceof Error ? err.message : String(err));
    console.log("");
    console.log(FAIL_MARKER);
    process.exit(1);
  }
  if (!doc.trim()) {
    fail("policy doc non-empty", `${POLICY_DOC} is empty`);
    console.log("");
    console.log(FAIL_MARKER);
    process.exit(1);
  }
  pass(`policy doc readable: ${POLICY_DOC}`);

  const envSrc = await readRel(SRC.env);
  const ka = await readRel(SRC.ka);
  const rateLimit = await readRel(SRC.rateLimit);
  const concurrency = await readRel(SRC.concurrency);
  const chatGateway = await readRel(SRC.chatGateway);
  const logs = await readRel(SRC.chatGatewayLogs);
  const logger = await readRel(SRC.logger);
  const keySafety = await readRel(SRC.keySafety);
  const execute = await readRel(SRC.execute);
  const images = await readRel(SRC.images);
  const chat = await readRel(SRC.chat);

  let allOk = true;
  allOk = checkEnvAndDefaults(envSrc) && allOk;
  allOk =
    checkWiring({
      ka,
      chatGateway,
      rateLimit,
      concurrency,
      logs,
      logger,
      keySafety,
      execute,
    }) && allOk;
  allOk = checkImageUntouched(images, chat) && allOk;
  allOk = checkPolicyDoc(doc) && allOk;
  allOk = checkSourceKaHelper(ka) && allOk;
  allOk = checkNormalVsKaSimulation() && allOk;

  console.log("");
  console.log(allOk ? PASS_MARKER : FAIL_MARKER);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  console.log(FAIL_MARKER);
  process.exit(1);
});
