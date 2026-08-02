/**
 * P995 — Image quota parity unit + static checks (no live upstream / no charge).
 *
 *   npx tsx scripts/p995-image-quota-parity-unit.mts
 *
 * Marker: TOKFAI_P995_IMAGE_QUOTA_PARITY_PASS
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS = "TOKFAI_P995_IMAGE_QUOTA_PARITY_PASS";
const FAIL = "TOKFAI_P995_IMAGE_QUOTA_PARITY_FAIL";

/** Dummy env so importing dmit-api modules does not exit (no real secrets / no network). */
function ensureDummyEnv(): void {
  const set = (k: string, v: string) => {
    if (!process.env[k]) process.env[k] = v;
  };
  set("NODE_ENV", "test");
  set("SUPABASE_URL", "https://example.supabase.co");
  set("SUPABASE_JWT_SECRET", "p995-test-jwt-secret-32chars-min!!");
  set("TOKEN_PEPPER", "p995-test-token-pepper-32chars-min!");
  set("GRSAI_API_KEY", "p995-test-grsai-key");
  set("STRIPE_WEBHOOK_SECRET", "whsec_p995_test_only");
  set("TOKFAI_TRIAL_GUARD_ENABLED", "true");
}

ensureDummyEnv();

const { ApiError } = await import("../apps/dmit-api/src/errors.ts");
const {
  __imageQuotaGuardsTestSet,
  assertImageQuotaGuards,
} = await import("../apps/dmit-api/src/images/imageQuotaGuards.ts");

let failed = 0;

function pass(label: string) {
  console.log(`PASS  ${label}`);
}
function fail(label: string, detail?: string) {
  failed += 1;
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) pass(label);
  else fail(label, detail);
}

type CallLog = {
  hasCredits: number;
  period: number;
  trial: number;
  insertTask: number;
  enqueue: number;
  providerGenerate: number;
  failTask: number;
  debit: number;
};

function freshLog(): CallLog {
  return {
    hasCredits: 0,
    period: 0,
    trial: 0,
    insertTask: 0,
    enqueue: 0,
    providerGenerate: 0,
    failTask: 0,
    debit: 0,
  };
}

function makeThrowingGuard(
  code: string,
  status: number
): () => Promise<never> {
  return async () => {
    throw new ApiError({
      status,
      message: code,
      code,
      type:
        code === "trial_model_not_allowed"
          ? "invalid_request_error"
          : code === "insufficient_credits"
            ? "billing_error"
            : "rate_limit_error",
      publicMessage: code,
    });
  };
}

/**
 * Simulate POST create path: quota guard → insert/enqueue.
 * Mirrors routes/images.ts ordering without Hono/DB.
 */
async function simulatePostCreate(args: {
  log: CallLog;
}): Promise<{ accepted: true }> {
  const log = args.log;

  __imageQuotaGuardsTestSet({
    assertHasCredits: async () => {
      log.hasCredits += 1;
    },
    assertCreditPeriodLimits: async () => {
      log.period += 1;
    },
    assertTrialQuotaGuards: async () => {
      log.trial += 1;
    },
  });

  try {
    await assertImageQuotaGuards({
      userId: "user-1",
      apiKeyId: "key-uuid",
      keyId: "abcd1234efgh",
      tenantId: "tenant-1",
      model: "nano-banana",
      requestedRaw: "nano-banana",
      requestId: "req-post-1",
      route: "/v1/images/generations",
    });
  } finally {
    __imageQuotaGuardsTestSet(null);
  }

  log.insertTask += 1;
  log.enqueue += 1;
  return { accepted: true };
}

async function simulatePostReject(
  reject:
    | "insufficient_credits"
    | "daily_limit_exceeded"
    | "quota_exceeded"
    | "trial_model_not_allowed"
    | "trial_limit_exceeded",
  log: CallLog,
  opts?: { hasApiKeyId?: boolean }
): Promise<{ status: number; code: string }> {
  const statusMap: Record<string, number> = {
    insufficient_credits: 402,
    daily_limit_exceeded: 429,
    quota_exceeded: 429,
    trial_model_not_allowed: 403,
    trial_limit_exceeded: 429,
  };

  __imageQuotaGuardsTestSet({
    assertHasCredits: async () => {
      log.hasCredits += 1;
      if (reject === "insufficient_credits") {
        await makeThrowingGuard(reject, statusMap[reject]!)();
      }
    },
    assertCreditPeriodLimits: async () => {
      log.period += 1;
      if (reject === "daily_limit_exceeded" || reject === "quota_exceeded") {
        await makeThrowingGuard(reject, statusMap[reject]!)();
      }
    },
    assertTrialQuotaGuards: async (gArgs) => {
      log.trial += 1;
      if (!gArgs.apiKeyId) return;
      if (
        reject === "trial_model_not_allowed" ||
        reject === "trial_limit_exceeded"
      ) {
        await makeThrowingGuard(reject, statusMap[reject]!)();
      }
    },
  });

  try {
    await assertImageQuotaGuards({
      userId: "user-1",
      apiKeyId: opts?.hasApiKeyId === false ? null : "key-uuid",
      keyId: opts?.hasApiKeyId === false ? null : "abcd1234efgh",
      tenantId: "tenant-1",
      model: "nano-banana",
      requestedRaw: "nano-banana",
      requestId: "req-post-reject",
      route: "/v1/images/generations",
    });
    log.insertTask += 1;
    log.enqueue += 1;
    throw new Error("expected_reject");
  } catch (err) {
    if (err instanceof ApiError) {
      return { status: err.status, code: err.code ?? "unknown" };
    }
    throw err;
  } finally {
    __imageQuotaGuardsTestSet(null);
  }
}

/**
 * Simulate worker billing_check → failTask without provider.
 */
async function simulateWorkerBillingCheck(args: {
  log: CallLog;
  reject?:
    | "insufficient_credits"
    | "daily_limit_exceeded"
    | "quota_exceeded"
    | "trial_limit_exceeded";
}): Promise<{
  failed: boolean;
  errorCode: string | null;
  billing_status: string;
  credits_charged: number;
}> {
  const log = args.log;

  __imageQuotaGuardsTestSet({
    assertHasCredits: async () => {
      log.hasCredits += 1;
      if (args.reject === "insufficient_credits") {
        await makeThrowingGuard("insufficient_credits", 402)();
      }
    },
    assertCreditPeriodLimits: async () => {
      log.period += 1;
      if (
        args.reject === "daily_limit_exceeded" ||
        args.reject === "quota_exceeded"
      ) {
        await makeThrowingGuard(args.reject, 429)();
      }
    },
    assertTrialQuotaGuards: async () => {
      log.trial += 1;
      if (args.reject === "trial_limit_exceeded") {
        await makeThrowingGuard("trial_limit_exceeded", 429)();
      }
    },
  });

  try {
    await assertImageQuotaGuards({
      userId: "user-1",
      apiKeyId: "key-uuid",
      keyId: null,
      tenantId: "tenant-1",
      model: "nano-banana",
      requestedRaw: "nano-banana",
      requestId: "req-worker-1",
      route: "/v1/images/generations",
    });
  } catch (err) {
    if (err instanceof ApiError) {
      log.failTask += 1;
      return {
        failed: true,
        errorCode: err.code ?? null,
        billing_status: "not_billable",
        credits_charged: 0,
      };
    }
    throw err;
  } finally {
    __imageQuotaGuardsTestSet(null);
  }

  log.providerGenerate += 1;
  log.debit += 1;
  return {
    failed: false,
    errorCode: null,
    billing_status: "charged",
    credits_charged: 1,
  };
}

async function runBehavioralTests(): Promise<void> {
  // 1) POST insufficient credits
  {
    const log = freshLog();
    const r = await simulatePostReject("insufficient_credits", log);
    assert(
      r.status === 402 &&
        r.code === "insufficient_credits" &&
        log.insertTask === 0 &&
        log.enqueue === 0 &&
        log.providerGenerate === 0 &&
        log.debit === 0,
      "1. POST insufficient_credits → reject, no task/upstream/debit"
    );
  }

  // 2) POST daily limit
  {
    const log = freshLog();
    const r = await simulatePostReject("daily_limit_exceeded", log);
    assert(
      r.status === 429 &&
        r.code === "daily_limit_exceeded" &&
        log.insertTask === 0 &&
        log.enqueue === 0 &&
        log.debit === 0,
      "2. POST daily_limit_exceeded → 429, no task/upstream/debit"
    );
  }

  // 3) POST monthly quota
  {
    const log = freshLog();
    const r = await simulatePostReject("quota_exceeded", log);
    assert(
      r.status === 429 &&
        r.code === "quota_exceeded" &&
        log.insertTask === 0 &&
        log.enqueue === 0 &&
        log.debit === 0,
      "3. POST quota_exceeded → 429, no task/upstream/debit"
    );
  }

  // 4) POST trial model not allowed
  {
    const log = freshLog();
    const r = await simulatePostReject("trial_model_not_allowed", log);
    assert(
      r.status === 403 &&
        r.code === "trial_model_not_allowed" &&
        log.insertTask === 0 &&
        log.debit === 0,
      "4. POST trial_model_not_allowed → 403, no task/debit"
    );
  }

  // 5) POST trial limit exceeded
  {
    const log = freshLog();
    const r = await simulatePostReject("trial_limit_exceeded", log);
    assert(
      r.status === 429 &&
        r.code === "trial_limit_exceeded" &&
        log.insertTask === 0 &&
        log.debit === 0,
      "5. POST trial_limit_exceeded → 429, no task/debit"
    );
  }

  // 6) Worker: caps exhausted after enqueue
  {
    const log = freshLog();
    const r = await simulateWorkerBillingCheck({
      log,
      reject: "daily_limit_exceeded",
    });
    assert(
      r.failed &&
        r.errorCode === "daily_limit_exceeded" &&
        r.billing_status === "not_billable" &&
        r.credits_charged === 0 &&
        log.failTask === 1 &&
        log.providerGenerate === 0 &&
        log.debit === 0,
      "6. Worker period exhausted → failTask, provider=0, not_billable"
    );
  }

  // 7) Happy path formal key — single debit after guards
  {
    const log = freshLog();
    const post = await simulatePostCreate({ log });
    assert(
      "accepted" in post &&
        log.hasCredits === 1 &&
        log.period === 1 &&
        log.trial === 1 &&
        log.insertTask === 1,
      "7a. POST formal key passes all three guards once"
    );
    const wlog = freshLog();
    const wr = await simulateWorkerBillingCheck({ log: wlog });
    assert(
      !wr.failed &&
        wr.credits_charged === 1 &&
        wlog.debit === 1 &&
        wlog.providerGenerate === 1,
      "7b. Worker success path single debit after guards"
    );
  }

  // 8) Failure paths never debit (timeout / URL gate / circuit skip)
  {
    const worker = readFileSync(
      join(ROOT, "apps/dmit-api/src/images/worker.ts"),
      "utf8"
    );
    const debitIdx = worker.indexOf("await recordImageUsageAndDebit");
    const failTaskDef = worker.indexOf("async function failTask");
    const assetGateFail = worker.indexOf("ASSET_GATE_ERROR_CODES");
    const circuitSkip = worker.includes('result: "skipped"');
    assert(
      debitIdx > 0 &&
        failTaskDef > 0 &&
        !worker
          .slice(failTaskDef, failTaskDef + 800)
          .includes("recordImageUsageAndDebit") &&
        assetGateFail > 0 &&
        circuitSkip &&
        worker.includes("credits_charged: 0"),
      "8. timeout/URL-gate/circuit-skip paths stay not_billable (no debit in failTask)"
    );
  }

  // 9) Idempotency existing-task returns before quota / insert
  {
    const routes = readFileSync(
      join(ROOT, "apps/dmit-api/src/routes/images.ts"),
      "utf8"
    );
    const idemIdx = routes.indexOf("await lookupImageTaskByIdempotency");
    const guardIdx = routes.indexOf("await assertImageQuotaGuards");
    const insertIdx = routes.indexOf("await insertImageTask");
    assert(
      idemIdx >= 0 &&
        guardIdx > idemIdx &&
        insertIdx > guardIdx &&
        routes.includes("enqueueImageGeneration(existing.request_id)"),
      "9. Idempotency existing-task before quota guard; no duplicate insert"
    );
  }

  // 10) JWT / no apiKeyId: period runs; trial skips
  {
    const log = freshLog();
    let trialSawNullKey = false;
    __imageQuotaGuardsTestSet({
      assertHasCredits: async () => {
        log.hasCredits += 1;
      },
      assertCreditPeriodLimits: async () => {
        log.period += 1;
      },
      assertTrialQuotaGuards: async (gArgs) => {
        log.trial += 1;
        trialSawNullKey = gArgs.apiKeyId == null;
        if (!gArgs.apiKeyId) return;
        await makeThrowingGuard("trial_model_not_allowed", 403)();
      },
    });
    try {
      await assertImageQuotaGuards({
        userId: "user-jwt",
        apiKeyId: null,
        keyId: null,
        tenantId: "tenant-1",
        model: "nano-banana",
        requestedRaw: "nano-banana",
        requestId: "req-jwt",
        route: "/v1/images/generations",
      });
      assert(
        log.hasCredits === 1 &&
          log.period === 1 &&
          log.trial === 1 &&
          trialSawNullKey,
        "10. JWT path: balance+period run; trial guard sees null apiKeyId (skip)"
      );
    } finally {
      __imageQuotaGuardsTestSet(null);
    }
  }

  // Call order: hasCredits → period → trial; stop on first failure
  {
    const order: string[] = [];
    __imageQuotaGuardsTestSet({
      assertHasCredits: async () => {
        order.push("hasCredits");
      },
      assertCreditPeriodLimits: async () => {
        order.push("period");
        await makeThrowingGuard("daily_limit_exceeded", 429)();
      },
      assertTrialQuotaGuards: async () => {
        order.push("trial");
      },
    });
    try {
      await assertImageQuotaGuards({
        userId: "u",
        apiKeyId: "k",
        model: "nano-banana",
        requestId: "r",
      });
      fail("order.stop", "should have thrown");
    } catch (err) {
      assert(
        err instanceof ApiError &&
          err.code === "daily_limit_exceeded" &&
          order.join(">") === "hasCredits>period",
        "guard order hasCredits→period→trial; stop before trial on period fail"
      );
    } finally {
      __imageQuotaGuardsTestSet(null);
    }
  }
}

function runStaticGuards(): void {
  const routes = readFileSync(
    join(ROOT, "apps/dmit-api/src/routes/images.ts"),
    "utf8"
  );
  const worker = readFileSync(
    join(ROOT, "apps/dmit-api/src/images/worker.ts"),
    "utf8"
  );
  const guards = readFileSync(
    join(ROOT, "apps/dmit-api/src/images/imageQuotaGuards.ts"),
    "utf8"
  );
  const exec = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/executeChatCompletion.ts"),
    "utf8"
  );
  const billing = readFileSync(
    join(ROOT, "apps/dmit-api/src/images/imageBilling.ts"),
    "utf8"
  );

  assert(
    guards.includes("assertHasCredits") &&
      guards.includes("assertCreditPeriodLimits") &&
      guards.includes("assertTrialQuotaGuards") &&
      guards.includes("assertImageQuotaGuards") &&
      guards.indexOf("await hasCredits") <
        guards.indexOf("await periodLimits") &&
      guards.indexOf("await periodLimits") <
        guards.indexOf("await trialGuards"),
    "S1. imageQuotaGuards wraps three guards in order"
  );
  assert(
    !guards.includes("sumChargedCredits") &&
      !guards.includes("TOKFAI_DAILY_CREDIT_LIMIT"),
    "S2. wrapper does not reimplement period math"
  );

  const sizeIdx = routes.indexOf("resolveImageSizeFields({");
  const guardIdx = routes.indexOf("await assertImageQuotaGuards");
  const prepIdx = routes.indexOf("prepareResolvedImages(");
  const insertIdx = routes.indexOf("await insertImageTask");
  assert(
    sizeIdx >= 0 &&
      guardIdx > sizeIdx &&
      prepIdx > guardIdx &&
      insertIdx > guardIdx,
    "S3. POST guard after size resolve, before prepareResolvedImages + insert"
  );

  const billingCheck = worker.indexOf('status: "billing_check"');
  const workerGuard = worker.indexOf("await assertImageQuotaGuards");
  const attemptChain = worker.indexOf("await buildImageAttemptChain");
  assert(
    billingCheck >= 0 &&
      workerGuard > billingCheck &&
      attemptChain > workerGuard &&
      !worker.includes("async function assertHasCredits"),
    "S4. Worker guard in billing_check before attempt chain; local assertHasCredits removed"
  );

  assert(
    exec.includes("assertCreditPeriodLimits") &&
      exec.includes("assertTrialQuotaGuards") &&
      !exec.includes("imageQuotaGuards"),
    "S5. chat/responses quota logic untouched"
  );

  assert(
    billing.includes("debitImageCreditsIdempotent") &&
      billing.includes("imageTaskLedgerReferenceId"),
    "S6. imageBilling idempotent debit unchanged"
  );

  assert(
    guards.includes("overshoot") || routes.includes("overshoot"),
    "S7. soft-check concurrency boundary documented"
  );
}

async function main(): Promise<void> {
  console.log("P995 image quota parity unit tests\n");
  await runBehavioralTests();
  runStaticGuards();
  if (failed > 0) {
    console.error(`\n${FAIL} (${failed} failed)`);
    process.exit(1);
  }
  console.log(`\n${PASS}`);
}

main().catch((err) => {
  console.error(err);
  console.error(FAIL);
  process.exit(1);
});
