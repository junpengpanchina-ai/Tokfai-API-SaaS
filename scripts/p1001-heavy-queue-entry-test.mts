/**
 * P1001 — REAL ENTRY tests for Heavy queue via executeChatCompletion.
 *
 * No public network. MOCK PROVIDER + MOCK DB.
 *
 *   npx tsx scripts/p1001-heavy-queue-entry-test.mts
 *
 * Marker: TOKFAI_P1001_HEAVY_QUEUE_ENTRY_PASS
 */

import { spawnSync } from "node:child_process";
import { mock } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const PASS = "TOKFAI_P1001_HEAVY_QUEUE_ENTRY_PASS";
const FAIL = "TOKFAI_P1001_HEAVY_QUEUE_ENTRY_FAIL";

function ensureModuleMocks(): void {
  if (typeof mock.module === "function") return;
  const loader = join(ROOT, "apps/dmit-api/node_modules/tsx/dist/loader.mjs");
  const r = spawnSync(
    process.execPath,
    [
      "--experimental-test-module-mocks",
      "--import",
      loader,
      SELF,
      ...process.argv.slice(2),
    ],
    { stdio: "inherit", cwd: ROOT, env: process.env }
  );
  process.exit(r.status ?? 1);
}

ensureModuleMocks();

function ensureDummyEnv(): void {
  const set = (k: string, v: string) => {
    // Preserve parent overrides (e.g. QUEUE_ENABLED=false for disabled TPM case).
    if (process.env[k] == null || process.env[k] === "") process.env[k] = v;
  };
  set("NODE_ENV", "test");
  set("SUPABASE_URL", "https://example.supabase.co");
  set("SUPABASE_JWT_SECRET", "p1001-test-jwt-secret-32chars-min!");
  set("TOKEN_PEPPER", "p1001-test-token-pepper-32chars-min!");
  set("GRSAI_API_KEY", "p1001-test-grsai-key");
  set("STRIPE_WEBHOOK_SECRET", "whsec_p1001_test_only");
  set("TOKFAI_REDIS_ENABLED", "false");
  set("TOKFAI_HEAVY_QUEUE_ENABLED", "true");
  set("TOKFAI_HEAVY_RESPONSES_MAX_CONCURRENCY", "2");
  set("TOKFAI_HEAVY_QUEUE_MAX_WAITERS_PER_KEY", "4");
  set("TOKFAI_HEAVY_QUEUE_MAX_WAITERS_GLOBAL", "20");
  set("TOKFAI_HEAVY_QUEUE_WAIT_TIMEOUT_MS", "1000");
  set("TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY", "50");
  set("TOKFAI_UNLIMITED_BILLING_ENABLED", "false");
}

ensureDummyEnv();

const fileUrl = (rel: string) => pathToFileURL(join(ROOT, rel)).href;

type Counts = {
  provider: number;
  debit: number;
  usageInsert: number;
  creditChecks: number;
  /** REAL EXECUTE ENTRY: assertTokenBudget invocations (TPM reservation). */
  tpmReservations: number;
};

let counts: Counts = {
  provider: 0,
  debit: 0,
  usageInsert: 0,
  creditChecks: 0,
  tpmReservations: 0,
};

let creditsBalance = 100;
let providerBehavior: "ok" | "fail" | "zero_usage" | "hang" = "ok";
let hangResolvers: Array<() => void> = [];
let idempotencyReplay: {
  responseSnapshot: Record<string, unknown>;
  creditsCharged: number;
  requestId: string;
} | null = null;
/** When true, next assertCreditPeriodLimits throws (secondary guard). */
let failPeriodLimits = false;
/** When true, next assertTrialQuotaGuards throws (secondary guard). */
let failTrialGuards = false;

function resetCounts(): void {
  counts = {
    provider: 0,
    debit: 0,
    usageInsert: 0,
    creditChecks: 0,
    tpmReservations: 0,
  };
  creditsBalance = 100;
  providerBehavior = "ok";
  hangResolvers = [];
  idempotencyReplay = null;
  failPeriodLimits = false;
  failTrialGuards = false;
}

function installMocks(): void {
  const fakeClient = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === "profiles") {
              return {
                data: { credits_balance: creditsBalance },
                error: null,
              };
            }
            return { data: null, error: null };
          },
          gte: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
          limit: async () => ({ data: [], error: null }),
        }),
      }),
      insert: async (row: unknown) => {
        counts.usageInsert += 1;
        void row;
        return { error: null };
      },
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
    rpc: async (name: string) => {
      if (name === "record_usage_and_debit" || name === "debit_credits") {
        counts.debit += 1;
      }
      return { data: null, error: null };
    },
  };

  mock.module(fileUrl("apps/dmit-api/src/supabase.ts"), {
    namedExports: {
      isSupabaseAdminConfigured: () => true,
      warnSupabaseAdminConfig: () => {},
      supabaseAdmin: () => fakeClient,
      supabaseAuth: () => fakeClient,
      supabase: () => fakeClient,
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/catalog/modelCatalog.ts"), {
    namedExports: {
      isModelAllowedForChat: async () => true,
      listAvailableChatModelIds: async () => ["gpt-5.5", "gpt-5-pro"],
      priceCreditsFor: async () => 0.01,
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/tenants/resolve.ts"), {
    namedExports: {
      isModelEnabledForTenant: async () => true,
      resolveTenantByHost: async () => ({ tenant: null }),
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/gateway/keySafetyLimits.ts"), {
    namedExports: {
      resolveMaxOutputTokens: (n: number | undefined | null) =>
        typeof n === "number" && n > 0 ? Math.min(n, 4096) : 4096,
      isUnlimitedBillingUser: () => false,
      logUnlimitedBillingGranted: () => {},
      assertCreditPeriodLimits: async () => {
        counts.creditChecks += 1;
        if (failPeriodLimits) {
          const { ApiError } = await import(
            fileUrl("apps/dmit-api/src/errors.ts")
          );
          throw new (ApiError as any)({
            status: 429,
            message: "Daily credit limit exceeded.",
            code: "daily_limit_exceeded",
            type: "rate_limit_error",
            publicMessage: "今日额度已用尽。",
          });
        }
      },
      assertTokenBudget: async () => {
        counts.tpmReservations += 1;
      },
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/gateway/trialQuotaGuard.ts"), {
    namedExports: {
      TRIAL_QUOTA_ERROR_CODES: new Set([
        "trial_limit_exceeded",
        "trial_model_not_allowed",
      ]),
      assertTrialQuotaGuards: async () => {
        counts.creditChecks += 1;
        if (failTrialGuards) {
          const { ApiError } = await import(
            fileUrl("apps/dmit-api/src/errors.ts")
          );
          throw new (ApiError as any)({
            status: 429,
            message: "Trial credit limit exceeded.",
            code: "trial_limit_exceeded",
            type: "rate_limit_error",
            publicMessage: "试用额度已用尽。",
          });
        }
      },
      logCommercialRequestTrace: () => {},
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/lib/usageBilling.ts"), {
    namedExports: {
      lookupBillingIdempotency: async () => idempotencyReplay,
      recordSuccessfulUsageAndDebit: async () => {
        counts.debit += 1;
        counts.usageInsert += 1;
      },
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/upstream/modelCircuitBreaker.ts"), {
    namedExports: {
      filterAttemptsByCircuitBreaker: async (attempts: string[]) => attempts,
      recordModelFailure: async () => {},
      recordModelSuccess: async () => {},
    },
  });

  mock.module(
    fileUrl("apps/dmit-api/src/upstream/providerModelCircuitBreaker.ts"),
    {
      namedExports: {
        filterProvidersByTimeoutCircuit: async (
          providers: unknown[]
        ) => ({
          providers,
          skippedDegraded: [],
          allDegraded: false,
        }),
        recordProviderModelSuccess: async () => {},
        recordProviderModelTimeout: async () => {},
      },
    }
  );

  const mockProvider = {
    id: "grsai-primary",
    label: "mock",
    enabled: true,
    chatPath: "/v1/chat/completions",
  };

  mock.module(fileUrl("apps/dmit-api/src/upstream/providers.ts"), {
    namedExports: {
      resolveProviderAttempts: () => [mockProvider],
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/upstream/grsai.ts"), {
    namedExports: {
      isChatFallbackEligible: () => false,
      providerFetch: async () => {
        counts.provider += 1;
        if (providerBehavior === "hang") {
          await new Promise<void>((resolve) => {
            hangResolvers.push(resolve);
          });
        }
        if (providerBehavior === "fail") {
          const { ApiError } = await import(
            fileUrl("apps/dmit-api/src/errors.ts")
          );
          throw new (ApiError as any)({
            status: 502,
            message: "upstream failed",
            code: "upstream_error",
            type: "upstream_error",
            publicMessage: "上游错误。",
          });
        }
        const usage =
          providerBehavior === "zero_usage"
            ? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }
            : { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 };
        return {
          data: {
            id: "chatcmpl-mock",
            object: "chat.completion",
            model: "gpt-5.5",
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "hello from mock" },
                finish_reason: "stop",
              },
            ],
            usage,
          },
          upstreamId: "up-mock",
        };
      },
    },
  });

  mock.module(
    fileUrl("apps/dmit-api/src/upstream/providerFetchChatStreamAssembled.ts"),
    {
      namedExports: {
        providerFetchChatPreferNativeNonStream: async () => {
          throw new Error("should not use gemini stream assemble in p1001");
        },
      },
    }
  );
}

installMocks();

const { executeChatCompletion } = await import(
  "../apps/dmit-api/src/lib/executeChatCompletion.ts"
);
const {
  __heavyQueueTestReset,
  __heavyQueueTestSnapshot,
} = await import("../apps/dmit-api/src/gateway/heavyResponsesQueue.ts");
const { __concurrencyTestReset } = await import(
  "../apps/dmit-api/src/gateway/concurrency.ts"
);
const { ApiError } = await import("../apps/dmit-api/src/errors.ts");
const { respondResponsesEarlySse } = await import(
  "../apps/dmit-api/src/lib/respondEarlySse.ts"
);

let failed = 0;
function pass(label: string, kind = "REAL ENTRY TEST") {
  console.log(`PASS  [${kind}] ${label}`);
}
function fail(label: string, detail?: string, kind = "REAL ENTRY TEST") {
  failed += 1;
  console.error(`FAIL  [${kind}] ${label}${detail ? ` — ${detail}` : ""}`);
}
function assert(cond: boolean, label: string, detail?: string, kind?: string) {
  if (cond) pass(label, kind);
  else fail(label, detail, kind);
}

function caller(key = "key-uuid-p1001") {
  return {
    userId: "user-p1001",
    apiKeyId: key,
    keyId: "abcd1234efgh",
    tenantId: "tenant-p1001",
  };
}

function heavyBody() {
  return {
    model: "gpt-5.5",
    messages: [{ role: "user" as const, content: "ping" }],
  };
}

function resetAll(): void {
  resetCounts();
  __heavyQueueTestReset();
  __concurrencyTestReset();
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

const TPM_PASS = "TOKFAI_P1001_SINGLE_TPM_RESERVATION_PASS";
const TPM_FAIL = "TOKFAI_P1001_SINGLE_TPM_RESERVATION_FAIL";

// Child-only: Queue disabled Heavy success → assertTokenBudget exactly once.
if (process.argv.includes("--tpm-disabled-case")) {
  resetAll();
  providerBehavior = "ok";
  const r = await executeChatCompletion({
    caller: caller(),
    requestId: "tpm_disabled_ok",
    body: heavyBody(),
    limitKey: "key-tpm-disabled",
    route: "/v1/responses",
  });
  let ok = true;
  const check = (cond: boolean, label: string, detail?: string) => {
    if (cond) console.log(`PASS  [REAL EXECUTE ENTRY][SINGLE TPM] ${label}`);
    else {
      ok = false;
      console.error(
        `FAIL  [REAL EXECUTE ENTRY][SINGLE TPM] ${label}${detail ? ` — ${detail}` : ""}`
      );
    }
  };
  check(r.ok === true, "1 disabled Heavy success");
  check(
    counts.tpmReservations === 1,
    "1 assertTokenBudget=1",
    `tpm=${counts.tpmReservations}`
  );
  check(counts.provider === 1, "1 Provider=1");
  check(counts.debit === 1, "1 Debit=1");
  if (!ok) {
    console.error(TPM_FAIL);
    process.exit(1);
  }
  console.log(TPM_PASS);
  process.exit(0);
}

// ── 1) concurrency=2: two occupy, third waits, then runs ───────────────
{
  resetAll();
  providerBehavior = "hang";
  let afterPrecheck = 0;
  const run = (id: string) =>
    executeChatCompletion({
      caller: caller(),
      requestId: id,
      body: heavyBody(),
      limitKey: "key-uuid-p1001",
      route: "/v1/responses",
      clientStream: false,
      onAfterPrecheck: () => {
        afterPrecheck += 1;
      },
    });

  const pA = run("req_A");
  const pB = run("req_B");
  await sleep(30);
  assert(counts.provider === 2, "1a two providers hanging (A/B)", undefined, "REAL SEMAPHORE TEST");
  assert(afterPrecheck === 2, "1b onAfterPrecheck for A/B only", undefined, "REAL ENTRY TEST");

  let cDone = false;
  const pC = run("req_C").then((r) => {
    cDone = true;
    return r;
  });
  await sleep(40);
  assert(cDone === false, "1c C still waiting", undefined, "REAL SEMAPHORE TEST");
  assert(counts.provider === 2, "1d C has not called Provider", undefined, "MOCK PROVIDER");

  hangResolvers.shift()?.();
  const rA = await pA;
  hangResolvers.shift()?.();
  const rB = await pB;
  // C was waiting; after A released it entered Provider hang — release it too.
  await sleep(20);
  while (hangResolvers.length) hangResolvers.shift()?.();
  const rC = await pC;
  assert(rA.ok && rB.ok && rC.ok, "1e all succeed", undefined, "REAL ENTRY TEST");
  assert(counts.provider === 3, "1f Provider called 3 times", undefined, "MOCK PROVIDER");
  assert(counts.debit === 3, "1g Debit 3", undefined, "MOCK DB");
}

// ── 2) Queue full ──────────────────────────────────────────────────────
{
  resetAll();
  providerBehavior = "hang";
  // env: maxWaitersPerKey=4 → 2 active + 4 waiters, next → heavy_queue_full
  const holds = [0, 1].map((i) =>
    executeChatCompletion({
      caller: caller(),
      requestId: `full_hold_${i}`,
      body: heavyBody(),
      limitKey: "key-full",
      route: "/v1/responses",
    })
  );
  await sleep(30);
  const waiters = [0, 1, 2, 3].map((i) =>
    executeChatCompletion({
      caller: caller(),
      requestId: `full_wait_${i}`,
      body: heavyBody(),
      limitKey: "key-full",
      route: "/v1/responses",
    })
  );
  await sleep(30);
  const providerBefore = counts.provider;
  const debitBefore = counts.debit;
  const full = await executeChatCompletion({
    caller: caller(),
    requestId: "full_reject",
    body: heavyBody(),
    limitKey: "key-full",
    route: "/v1/responses",
  });
  assert(
    !full.ok && full.errorCode === "heavy_queue_full",
    "2a heavy_queue_full",
    full.ok ? "ok" : full.errorCode
  );
  assert(full.httpStatus === 429, "2c HTTP 429");
  assert(
    typeof full.retryAfterSeconds === "number" && full.retryAfterSeconds === 30,
    "2c2 Retry-After seconds=30"
  );
  assert(counts.provider === providerBefore, "2b Provider+0 on full", undefined, "MOCK PROVIDER");
  assert(counts.debit === debitBefore, "2d Debit+0 on full", undefined, "MOCK DB");
  // Cleanup waiters/holds without waiting on timeouts.
  __heavyQueueTestReset();
  while (hangResolvers.length) hangResolvers.shift()?.();
  await Promise.allSettled([...holds, ...waiters]);
}

// ── 3) Wait timeout ────────────────────────────────────────────────────
{
  resetAll();
  providerBehavior = "hang";
  const a = executeChatCompletion({
    caller: caller(),
    requestId: "to_a",
    body: heavyBody(),
    limitKey: "key-to",
    route: "/v1/responses",
  });
  const b = executeChatCompletion({
    caller: caller(),
    requestId: "to_b",
    body: heavyBody(),
    limitKey: "key-to",
    route: "/v1/responses",
  });
  await sleep(20);
  const providerBefore = counts.provider;
  const debitBefore = counts.debit;
  const c = await executeChatCompletion({
    caller: caller(),
    requestId: "to_c",
    body: heavyBody(),
    limitKey: "key-to",
    route: "/v1/responses",
  });
  assert(
    !c.ok && c.errorCode === "heavy_queue_timeout",
    "3a heavy_queue_timeout",
    c.ok ? "ok" : c.errorCode
  );
  assert(counts.provider === providerBefore, "3b Provider+0 on timeout", undefined, "MOCK PROVIDER");
  assert(counts.debit === debitBefore, "3c Debit+0 on timeout", undefined, "MOCK DB");
  while (hangResolvers.length) hangResolvers.shift()?.();
  await Promise.allSettled([a, b]);
}

// ── 4) Client abort ────────────────────────────────────────────────────
{
  resetAll();
  providerBehavior = "hang";
  const a = executeChatCompletion({
    caller: caller(),
    requestId: "ab_a",
    body: heavyBody(),
    limitKey: "key-ab",
    route: "/v1/responses",
  });
  const b = executeChatCompletion({
    caller: caller(),
    requestId: "ab_b",
    body: heavyBody(),
    limitKey: "key-ab",
    route: "/v1/responses",
  });
  await sleep(20);
  const ac = new AbortController();
  const providerBefore = counts.provider;
  const debitBefore = counts.debit;
  const cP = executeChatCompletion({
    caller: caller(),
    requestId: "ab_c",
    body: heavyBody(),
    limitKey: "key-ab",
    route: "/v1/responses",
    abortSignal: ac.signal,
  });
  await sleep(20);
  ac.abort();
  const c = await cP;
  assert(
    !c.ok && c.errorCode === "heavy_queue_aborted",
    "4a aborted",
    c.ok ? "ok" : c.errorCode
  );
  assert(counts.provider === providerBefore, "4b Provider+0", undefined, "MOCK PROVIDER");
  assert(counts.debit === debitBefore, "4c Debit+0", undefined, "MOCK DB");
  assert(__heavyQueueTestSnapshot().globalWaiterCount === 0, "4d waiter cleaned", undefined, "REAL SEMAPHORE TEST");
  while (hangResolvers.length) hangResolvers.shift()?.();
  await Promise.allSettled([a, b]);
}

// ── 5) Credits depleted during wait → secondary guard fails ────────────
{
  resetAll();
  providerBehavior = "hang";
  const a = executeChatCompletion({
    caller: caller(),
    requestId: "cr_a",
    body: heavyBody(),
    limitKey: "key-cr",
    route: "/v1/responses",
  });
  const b = executeChatCompletion({
    caller: caller(),
    requestId: "cr_b",
    body: heavyBody(),
    limitKey: "key-cr",
    route: "/v1/responses",
  });
  await sleep(20);
  const cP = executeChatCompletion({
    caller: caller(),
    requestId: "cr_c",
    body: heavyBody(),
    limitKey: "key-cr",
    route: "/v1/responses",
  });
  await sleep(30);
  creditsBalance = 0;
  const providerBefore = counts.provider;
  hangResolvers.shift()?.();
  await a;
  const c = await cP;
  assert(!c.ok, "5a secondary guard failed", c.ok ? "ok" : c.errorCode);
  assert(
    counts.provider === providerBefore,
    "5b Provider+0 after secondary fail",
    `provider=${counts.provider}`,
    "MOCK PROVIDER"
  );
  while (hangResolvers.length) hangResolvers.shift()?.();
  await Promise.allSettled([b]);
}

// ── 6) Prior provider failure releases permit for next ─────────────────
{
  resetAll();
  providerBehavior = "fail";
  const a = await executeChatCompletion({
    caller: caller(),
    requestId: "pf_a",
    body: heavyBody(),
    limitKey: "key-pf",
    route: "/v1/responses",
  });
  assert(!a.ok, "6a first fails");
  assert(counts.debit === 0, "6b fail not billed", undefined, "MOCK DB");
  providerBehavior = "ok";
  const b = await executeChatCompletion({
    caller: caller(),
    requestId: "pf_b",
    body: heavyBody(),
    limitKey: "key-pf",
    route: "/v1/responses",
  });
  assert(b.ok === true, "6c next executes after release");
  assert(counts.provider >= 2, "6d provider called for both", undefined, "MOCK PROVIDER");
}

// ── 7) Normal success ──────────────────────────────────────────────────
{
  resetAll();
  providerBehavior = "ok";
  const r = await executeChatCompletion({
    caller: caller(),
    requestId: "ok_1",
    body: heavyBody(),
    limitKey: "key-ok",
    route: "/v1/responses",
  });
  assert(r.ok === true, "7a success");
  assert(counts.provider === 1, "7b Provider 1", undefined, "MOCK PROVIDER");
  assert(counts.debit === 1, "7c Debit 1", undefined, "MOCK DB");
  assert(counts.usageInsert >= 1, "7d usage log 1", undefined, "MOCK DB");
}

// ── 8) Idempotency replay ──────────────────────────────────────────────
{
  resetAll();
  idempotencyReplay = {
    requestId: "replayed",
    creditsCharged: 0.02,
    responseSnapshot: {
      id: "chatcmpl-replay",
      object: "chat.completion",
      model: "gpt-5.5",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "replay" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    },
  };
  const r = await executeChatCompletion({
    caller: caller(),
    requestId: "idem_1",
    body: heavyBody(),
    limitKey: "key-idem",
    route: "/v1/responses",
    idempotencyKey: "idem-p1001-1",
  });
  assert(r.ok === true, "8a replay ok");
  assert(counts.provider === 0, "8b Provider 0", undefined, "MOCK PROVIDER");
  assert(counts.debit === 0, "8c Debit 0", undefined, "MOCK DB");
  assert(__heavyQueueTestSnapshot().globalWaiterCount === 0, "8d not queued", undefined, "REAL SEMAPHORE TEST");
}

// ── 9) P998 zero usage estimate ────────────────────────────────────────
{
  resetAll();
  providerBehavior = "zero_usage";
  const r = await executeChatCompletion({
    caller: caller(),
    requestId: "p998_1",
    body: heavyBody(),
    limitKey: "key-p998",
    route: "/v1/responses",
  });
  assert(r.ok === true, "9a success with zero upstream usage");
  if (r.ok) {
    assert(
      typeof r.creditsCharged === "number" && r.creditsCharged > 0,
      "9b charged > 0",
      String(r.creditsCharged)
    );
  }
  assert(counts.debit === 1, "9c Debit 1", undefined, "MOCK DB");
}

// ── 10) stream=false already covered above ─────────────────────────────
{
  assert(true, "10 stream=false covered by cases 1–9");
}

// ── 11) stream=true: timeout before response.created ───────────────────
{
  resetAll();
  providerBehavior = "hang";
  let created = false;
  const a = executeChatCompletion({
    caller: caller(),
    requestId: "sse_a",
    body: heavyBody(),
    limitKey: "key-sse",
    route: "/v1/responses",
    clientStream: true,
    onAfterPrecheck: () => {
      created = true;
    },
  });
  const b = executeChatCompletion({
    caller: caller(),
    requestId: "sse_b",
    body: heavyBody(),
    limitKey: "key-sse",
    route: "/v1/responses",
    clientStream: true,
    onAfterPrecheck: () => {
      created = true;
    },
  });
  await sleep(20);
  let cCreated = false;
  const c = await executeChatCompletion({
    caller: caller(),
    requestId: "sse_c",
    body: heavyBody(),
    limitKey: "key-sse",
    route: "/v1/responses",
    clientStream: true,
    onAfterPrecheck: () => {
      cCreated = true;
    },
  });
  assert(
    !c.ok && c.errorCode === "heavy_queue_timeout",
    "11a stream timeout JSON path",
    c.ok ? "ok" : c.errorCode
  );
  assert(cCreated === false, "11b no onAfterPrecheck / response.created for waiter");
  assert(created === true, "11c A/B did flush precheck");
  while (hangResolvers.length) hangResolvers.shift()?.();
  await Promise.allSettled([a, b]);

  // Also exercise respondResponsesEarlySse earlyDone JSON envelope
  resetAll();
  providerBehavior = "hang";
  const fakeC = {
    header: () => {},
    get: () => undefined,
  } as any;
  const holdA = executeChatCompletion({
    caller: caller(),
    requestId: "sse2_a",
    body: heavyBody(),
    limitKey: "key-sse2",
    route: "/v1/responses",
  });
  const holdB = executeChatCompletion({
    caller: caller(),
    requestId: "sse2_b",
    body: heavyBody(),
    limitKey: "key-sse2",
    route: "/v1/responses",
  });
  await sleep(20);
  const resp = await respondResponsesEarlySse(fakeC, {
    caller: caller(),
    requestId: "sse2_c",
    body: heavyBody(),
    limitKey: "key-sse2",
    idempotencyKey: null,
    toResponsesPayload: (r) => r.response,
  });
  const ct = resp.headers.get("content-type") || "";
  assert(
    resp.status === 429 && ct.includes("application/json"),
    "11d early SSE gate returns JSON envelope on queue timeout",
    `status=${resp.status} ct=${ct}`
  );
  const body = await resp.json();
  assert(
    body?.error?.code === "heavy_queue_timeout",
    "11e JSON error code heavy_queue_timeout",
    JSON.stringify(body?.error ?? {})
  );
  while (hangResolvers.length) hangResolvers.shift()?.();
  await Promise.allSettled([holdA, holdB]);
}

void ApiError;

// ── P1001.1 — single TPM reservation (REAL EXECUTE ENTRY) ──────────────
let tpmFailed = 0;

function tpmPass(label: string) {
  console.log(`PASS  [REAL EXECUTE ENTRY][SINGLE TPM] ${label}`);
}
function tpmFail(label: string, detail?: string) {
  tpmFailed += 1;
  failed += 1;
  console.error(
    `FAIL  [REAL EXECUTE ENTRY][SINGLE TPM] ${label}${detail ? ` — ${detail}` : ""}`
  );
}
function tpmAssert(cond: boolean, label: string, detail?: string) {
  if (cond) tpmPass(label);
  else tpmFail(label, detail);
}

async function holdTwoThenAwaitThird(
  limitKey: string,
  afterQueued: () => void | Promise<void>
) {
  providerBehavior = "hang";
  const a = executeChatCompletion({
    caller: caller(),
    requestId: `${limitKey}_a`,
    body: heavyBody(),
    limitKey,
    route: "/v1/responses",
  });
  const b = executeChatCompletion({
    caller: caller(),
    requestId: `${limitKey}_b`,
    body: heavyBody(),
    limitKey,
    route: "/v1/responses",
  });
  await sleep(30);
  const cP = executeChatCompletion({
    caller: caller(),
    requestId: `${limitKey}_c`,
    body: heavyBody(),
    limitKey,
    route: "/v1/responses",
  });
  await sleep(40);
  await afterQueued();
  // Allow woken waiter / remaining holds to finish without re-hanging.
  providerBehavior = "ok";
  hangResolvers.shift()?.();
  await a;
  const c = await cP;
  while (hangResolvers.length) hangResolvers.shift()?.();
  await Promise.allSettled([b]);
  return c;
}

{
  // 1) Queue disabled — spawn child with TOKFAI_HEAVY_QUEUE_ENABLED=false
  const loader = join(ROOT, "apps/dmit-api/node_modules/tsx/dist/loader.mjs");
  const child = spawnSync(
    process.execPath,
    ["--experimental-test-module-mocks", "--import", loader, SELF, "--tpm-disabled-case"],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        TOKFAI_HEAVY_QUEUE_ENABLED: "false",
      },
      encoding: "utf8",
    }
  );
  const out = `${child.stdout ?? ""}\n${child.stderr ?? ""}`;
  tpmAssert(
    child.status === 0 && out.includes(TPM_PASS),
    "1 Queue disabled Heavy success assertTokenBudget=1 (child)",
    `status=${child.status}`
  );
}

{
  // 2) Queue enabled, immediate permit
  resetAll();
  providerBehavior = "ok";
  const r = await executeChatCompletion({
    caller: caller(),
    requestId: "tpm_imm",
    body: heavyBody(),
    limitKey: "key-tpm-imm",
    route: "/v1/responses",
  });
  tpmAssert(r.ok === true, "2 immediate success");
  tpmAssert(counts.tpmReservations === 1, "2 assertTokenBudget=1", `tpm=${counts.tpmReservations}`);
}

{
  // 3) Queue enabled, queued then success
  resetAll();
  const c = await holdTwoThenAwaitThird("key-tpm-qok", async () => {});
  tpmAssert(c.ok === true, "3 queued then success");
  // A+B+C each reserve once = 3 total for 3 requests
  tpmAssert(
    counts.tpmReservations === 3,
    "3 three requests → assertTokenBudget=3 (1 each)",
    `tpm=${counts.tpmReservations}`
  );
}

{
  // 4) Queued then secondary balance fail
  resetAll();
  const c = await holdTwoThenAwaitThird("key-tpm-bal", async () => {
    creditsBalance = 0;
  });
  tpmAssert(!c.ok, "4 secondary balance fail", c.ok ? "ok" : c.errorCode);
  // A+B reserved; C reserved once before queue then secondary fail → 3
  tpmAssert(
    counts.tpmReservations === 3,
    "4 assertTokenBudget=1 per request (incl C)",
    `tpm=${counts.tpmReservations}`
  );
  tpmAssert(counts.provider === 2, "4 Provider=2 (only A/B)", `p=${counts.provider}`);
}

{
  // 5) Queued then secondary period fail
  resetAll();
  const c = await holdTwoThenAwaitThird("key-tpm-per", async () => {
    failPeriodLimits = true;
  });
  tpmAssert(
    !c.ok && c.errorCode === "daily_limit_exceeded",
    "5 secondary period fail",
    c.ok ? "ok" : c.errorCode
  );
  tpmAssert(
    counts.tpmReservations === 3,
    "5 assertTokenBudget=1 each",
    `tpm=${counts.tpmReservations}`
  );
  tpmAssert(counts.provider === 2, "5 Provider only A/B (C=0)", `p=${counts.provider}`);
}

{
  // 6) Queued then secondary trial fail
  resetAll();
  const c = await holdTwoThenAwaitThird("key-tpm-trial", async () => {
    failTrialGuards = true;
  });
  tpmAssert(
    !c.ok && c.errorCode === "trial_limit_exceeded",
    "6 secondary trial fail",
    c.ok ? "ok" : c.errorCode
  );
  tpmAssert(
    counts.tpmReservations === 3,
    "6 assertTokenBudget=1 each",
    `tpm=${counts.tpmReservations}`
  );
  tpmAssert(counts.provider === 2, "6 Provider only A/B (C=0)", `p=${counts.provider}`);
}

{
  // 7) Queue full
  resetAll();
  providerBehavior = "hang";
  const holds = [0, 1].map((i) =>
    executeChatCompletion({
      caller: caller(),
      requestId: `tpm_full_h${i}`,
      body: heavyBody(),
      limitKey: "key-tpm-full",
      route: "/v1/responses",
    })
  );
  await sleep(30);
  const waiters = [0, 1, 2, 3].map((i) =>
    executeChatCompletion({
      caller: caller(),
      requestId: `tpm_full_w${i}`,
      body: heavyBody(),
      limitKey: "key-tpm-full",
      route: "/v1/responses",
    })
  );
  await sleep(30);
  const tpmBeforeReject = counts.tpmReservations;
  const full = await executeChatCompletion({
    caller: caller(),
    requestId: "tpm_full_r",
    body: heavyBody(),
    limitKey: "key-tpm-full",
    route: "/v1/responses",
  });
  tpmAssert(
    !full.ok && full.errorCode === "heavy_queue_full",
    "7 queue full",
    full.ok ? "ok" : full.errorCode
  );
  tpmAssert(
    counts.tpmReservations === tpmBeforeReject + 1,
    "7 reject path assertTokenBudget=+1 only",
    `tpm=${counts.tpmReservations} before=${tpmBeforeReject}`
  );
  tpmAssert(counts.provider === 2, "7 Provider=2 (reject 0)");
  __heavyQueueTestReset();
  while (hangResolvers.length) hangResolvers.shift()?.();
  await Promise.allSettled([...holds, ...waiters]);
}

{
  // 8) Queue timeout
  resetAll();
  providerBehavior = "hang";
  const a = executeChatCompletion({
    caller: caller(),
    requestId: "tpm_to_a",
    body: heavyBody(),
    limitKey: "key-tpm-to",
    route: "/v1/responses",
  });
  const b = executeChatCompletion({
    caller: caller(),
    requestId: "tpm_to_b",
    body: heavyBody(),
    limitKey: "key-tpm-to",
    route: "/v1/responses",
  });
  await sleep(30);
  const tpmBefore = counts.tpmReservations;
  const c = await executeChatCompletion({
    caller: caller(),
    requestId: "tpm_to_c",
    body: heavyBody(),
    limitKey: "key-tpm-to",
    route: "/v1/responses",
  });
  tpmAssert(
    !c.ok && c.errorCode === "heavy_queue_timeout",
    "8 queue timeout",
    c.ok ? "ok" : c.errorCode
  );
  tpmAssert(
    counts.tpmReservations === tpmBefore + 1,
    "8 timeout assertTokenBudget=+1",
    `tpm=${counts.tpmReservations}`
  );
  tpmAssert(counts.provider === 2, "8 Provider unchanged for C");
  while (hangResolvers.length) hangResolvers.shift()?.();
  await Promise.allSettled([a, b]);
}

{
  // 9) Queue abort
  resetAll();
  providerBehavior = "hang";
  const a = executeChatCompletion({
    caller: caller(),
    requestId: "tpm_ab_a",
    body: heavyBody(),
    limitKey: "key-tpm-ab",
    route: "/v1/responses",
  });
  const b = executeChatCompletion({
    caller: caller(),
    requestId: "tpm_ab_b",
    body: heavyBody(),
    limitKey: "key-tpm-ab",
    route: "/v1/responses",
  });
  await sleep(30);
  const tpmBefore = counts.tpmReservations;
  const ac = new AbortController();
  const cP = executeChatCompletion({
    caller: caller(),
    requestId: "tpm_ab_c",
    body: heavyBody(),
    limitKey: "key-tpm-ab",
    route: "/v1/responses",
    abortSignal: ac.signal,
  });
  await sleep(20);
  ac.abort();
  const c = await cP;
  tpmAssert(
    !c.ok && c.errorCode === "heavy_queue_aborted",
    "9 queue abort",
    c.ok ? "ok" : c.errorCode
  );
  tpmAssert(
    counts.tpmReservations === tpmBefore + 1,
    "9 abort assertTokenBudget=+1",
    `tpm=${counts.tpmReservations}`
  );
  tpmAssert(counts.provider === 2, "9 Provider C=0");
  while (hangResolvers.length) hangResolvers.shift()?.();
  await Promise.allSettled([a, b]);
}

{
  // 10) Provider success
  resetAll();
  providerBehavior = "ok";
  const r = await executeChatCompletion({
    caller: caller(),
    requestId: "tpm_ok",
    body: heavyBody(),
    limitKey: "key-tpm-ok",
    route: "/v1/responses",
  });
  tpmAssert(r.ok === true, "10 provider success");
  tpmAssert(counts.tpmReservations === 1, "10 assertTokenBudget=1");
  tpmAssert(counts.provider === 1, "10 Provider=1");
  tpmAssert(counts.debit === 1, "10 Debit=1");
}

{
  // 11) Provider failure
  resetAll();
  providerBehavior = "fail";
  const r = await executeChatCompletion({
    caller: caller(),
    requestId: "tpm_pf",
    body: heavyBody(),
    limitKey: "key-tpm-pf",
    route: "/v1/responses",
  });
  tpmAssert(!r.ok, "11 provider fail");
  tpmAssert(counts.tpmReservations === 1, "11 assertTokenBudget=1");
  tpmAssert(counts.provider === 1, "11 Provider=1");
  tpmAssert(counts.debit === 0, "11 Debit=0");
}

{
  // 12) Idempotency replay — assert real order (TPM after replay lookup)
  resetAll();
  idempotencyReplay = {
    requestId: "replayed-tpm",
    creditsCharged: 0.02,
    responseSnapshot: {
      id: "chatcmpl-replay-tpm",
      object: "chat.completion",
      model: "gpt-5.5",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "replay" },
          finish_reason: "stop",
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    },
  };
  const r = await executeChatCompletion({
    caller: caller(),
    requestId: "tpm_idem",
    body: heavyBody(),
    limitKey: "key-tpm-idem",
    route: "/v1/responses",
    idempotencyKey: "idem-tpm-1",
  });
  tpmAssert(r.ok === true, "12 idempotency replay ok");
  tpmAssert(
    counts.tpmReservations === 0,
    "12 replay before TPM → assertTokenBudget=0",
    `tpm=${counts.tpmReservations}`
  );
  tpmAssert(counts.provider === 0, "12 Provider=0");
  tpmAssert(counts.debit === 0, "12 Debit=0");
}

{
  // 13) P998 zero usage
  resetAll();
  providerBehavior = "zero_usage";
  const r = await executeChatCompletion({
    caller: caller(),
    requestId: "tpm_p998",
    body: heavyBody(),
    limitKey: "key-tpm-p998",
    route: "/v1/responses",
  });
  tpmAssert(r.ok === true, "13 P998 success");
  tpmAssert(counts.tpmReservations === 1, "13 assertTokenBudget=1");
  if (r.ok) {
    tpmAssert(
      typeof r.creditsCharged === "number" && r.creditsCharged > 0,
      "13 charged > 0",
      String(r.creditsCharged)
    );
  }
  tpmAssert(counts.debit === 1, "13 Debit=1");
}

if (tpmFailed === 0) {
  console.log(TPM_PASS);
} else {
  console.error(TPM_FAIL);
}

if (failed > 0) {
  console.error(FAIL);
  process.exit(1);
}
console.log(PASS);
process.exit(0);
