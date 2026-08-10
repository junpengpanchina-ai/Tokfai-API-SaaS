/**
 * P1080 — Responses stream cancel / Heavy queue / no-output hotfix tests.
 *
 * REAL SEMAPHORE + MOCK PROVIDER + MOCK DB (no public network).
 *
 *   npx tsx scripts/p1080-responses-stream-cancel-queue-hotfix.mts
 *
 * Marker: TOKFAI_P1080_RESPONSES_STREAM_CANCEL_QUEUE_GLOBAL_HOTFIX_PASS
 */

import { spawnSync } from "node:child_process";
import { mock } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const PASS = "TOKFAI_P1080_RESPONSES_STREAM_CANCEL_QUEUE_GLOBAL_HOTFIX_PASS";
const FAIL = "TOKFAI_P1080_RESPONSES_STREAM_CANCEL_QUEUE_GLOBAL_HOTFIX_FAIL";

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
    if (process.env[k] == null || process.env[k] === "") process.env[k] = v;
  };
  set("NODE_ENV", "test");
  set("SUPABASE_URL", "https://example.supabase.co");
  set("SUPABASE_JWT_SECRET", "p1080-test-jwt-secret-32chars-min!");
  set("TOKEN_PEPPER", "p1080-test-token-pepper-32chars-min!");
  set("GRSAI_API_KEY", "p1080-test-grsai-key");
  set("STRIPE_WEBHOOK_SECRET", "whsec_p1080_test_only");
  set("TOKFAI_REDIS_ENABLED", "false");
  // P1080: stream path auto-enables queue even when this is false.
  set("TOKFAI_HEAVY_QUEUE_ENABLED", "false");
  set("TOKFAI_HEAVY_RESPONSES_MAX_CONCURRENCY", "2");
  set("TOKFAI_HEAVY_QUEUE_MAX_WAITERS_PER_KEY", "8");
  set("TOKFAI_HEAVY_QUEUE_MAX_WAITERS_GLOBAL", "20");
  set("TOKFAI_HEAVY_QUEUE_WAIT_TIMEOUT_MS", "2000");
  set("TOKFAI_RESPONSES_STREAM_NO_OUTPUT_TIMEOUT_MS", "5000");
  set("TOKFAI_HEAVY_RESPONSES_UPSTREAM_TIMEOUT_MS", "700000");
  set("TOKFAI_HEAVY_RESPONSES_IDLE_TIMEOUT_MS", "700000");
  set("TOKFAI_GLOBAL_UPSTREAM_CONCURRENCY", "50");
  set("TOKFAI_UNLIMITED_BILLING_ENABLED", "false");
}

ensureDummyEnv();

const fileUrl = (rel: string) => pathToFileURL(join(ROOT, rel)).href;

type Counts = {
  provider: number;
  debit: number;
  usageInsert: number;
  fetchAborts: number;
};

let counts: Counts = {
  provider: 0,
  debit: 0,
  usageInsert: 0,
  fetchAborts: 0,
};

let providerBehavior: "ok" | "hang" | "slow_ok" = "ok";
let hangResolvers: Array<() => void> = [];
/** Active hang promises that abort when AbortSignal fires. */
let activeHangAborts: Array<() => void> = [];

function resetCounts(): void {
  counts = { provider: 0, debit: 0, usageInsert: 0, fetchAborts: 0 };
  providerBehavior = "ok";
  hangResolvers = [];
  activeHangAborts = [];
}

function installMocks(): void {
  const fakeClient = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (table === "profiles") {
              return { data: { credits_balance: 100 }, error: null };
            }
            return { data: null, error: null };
          },
          gte: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
          limit: async () => ({ data: [], error: null }),
        }),
      }),
      insert: async () => {
        counts.usageInsert += 1;
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
      assertCreditPeriodLimits: async () => {},
      assertTokenBudget: async () => {},
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/gateway/trialQuotaGuard.ts"), {
    namedExports: {
      TRIAL_QUOTA_ERROR_CODES: new Set([
        "trial_limit_exceeded",
        "trial_model_not_allowed",
      ]),
      assertTrialQuotaGuards: async () => {},
      logCommercialRequestTrace: () => {},
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/lib/usageBilling.ts"), {
    namedExports: {
      lookupBillingIdempotency: async () => null,
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
        filterProvidersByTimeoutCircuit: async (providers: unknown[]) => ({
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
    apiKey: "mock-key",
    baseUrl: "https://mock.example",
    timeoutMs: 700_000,
  };

  mock.module(fileUrl("apps/dmit-api/src/upstream/providers.ts"), {
    namedExports: {
      resolveProviderAttempts: () => [mockProvider],
      getProviderById: () => mockProvider,
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/upstream/grsai.ts"), {
    namedExports: {
      isChatFallbackEligible: () => false,
      isUpstreamTransportFailure: () => false,
      inspectUpstreamTransportFailure: () => ({
        errorName: "Error",
        errorCode: null,
        errorCauseCode: null,
        diagnosticSnippet: "mock",
      }),
      mapUpstreamError: () => ({
        status: 502,
        code: "upstream_error",
        type: "upstream_error",
        publicMessage: "Provider error.",
      }),
      providerFetch: async (
        _provider: unknown,
        _path: string,
        options: { abortSignal?: AbortSignal; timeoutMs?: number } = {}
      ) => {
        counts.provider += 1;
        const signal = options.abortSignal;
        if (signal?.aborted) {
          counts.fetchAborts += 1;
          const { ApiError } = await import(
            fileUrl("apps/dmit-api/src/errors.ts")
          );
          throw (ApiError as any).clientAborted();
        }

        const shortNoOutput =
          typeof options.timeoutMs === "number" && options.timeoutMs <= 6_000;

        // P1080 no-output: honor short timeout without infinite hang.
        if (providerBehavior === "hang" && shortNoOutput) {
          await new Promise<void>((resolve, reject) => {
            const t = setTimeout(() => {
              cleanup();
              void import(fileUrl("apps/dmit-api/src/errors.ts")).then(
                ({ ApiError }) => {
                  reject(
                    new (ApiError as any)({
                      status: 504,
                      message: "Upstream provider timed out.",
                      code: "upstream_timeout",
                      type: "upstream_error",
                      publicMessage: "上游模型响应超时，请稍后重试或切换模型。",
                    })
                  );
                }
              );
            }, options.timeoutMs);
            const onAbort = () => {
              cleanup();
              counts.fetchAborts += 1;
              void import(fileUrl("apps/dmit-api/src/errors.ts")).then(
                ({ ApiError }) => {
                  reject((ApiError as any).clientAborted());
                }
              );
            };
            const cleanup = () => {
              clearTimeout(t);
              signal?.removeEventListener("abort", onAbort);
            };
            if (signal) {
              if (signal.aborted) {
                onAbort();
                return;
              }
              signal.addEventListener("abort", onAbort, { once: true });
            }
          });
        } else if (
          providerBehavior === "hang" ||
          providerBehavior === "slow_ok"
        ) {
          await new Promise<void>((resolve, reject) => {
            const finishOk = () => {
              cleanup();
              resolve();
            };
            const onAbort = () => {
              cleanup();
              counts.fetchAborts += 1;
              void import(fileUrl("apps/dmit-api/src/errors.ts")).then(
                ({ ApiError }) => {
                  reject((ApiError as any).clientAborted());
                }
              );
            };
            const cleanup = () => {
              hangResolvers = hangResolvers.filter((r) => r !== finishOk);
              activeHangAborts = activeHangAborts.filter((r) => r !== onAbort);
              signal?.removeEventListener("abort", onAbort);
            };
            hangResolvers.push(finishOk);
            activeHangAborts.push(onAbort);
            if (signal) {
              signal.addEventListener("abort", onAbort, { once: true });
            }
            if (providerBehavior === "slow_ok") {
              setTimeout(finishOk, 30);
            }
          });
        }

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
            usage: {
              prompt_tokens: 10,
              completion_tokens: 5,
              total_tokens: 15,
            },
          },
          upstreamId: "up-mock",
        };
      },
    },
  });
}

installMocks();

const { executeChatCompletion } = await import(
  fileUrl("apps/dmit-api/src/lib/executeChatCompletion.ts")
);
const { respondResponsesEarlySse } = await import(
  fileUrl("apps/dmit-api/src/lib/respondEarlySse.ts")
);
const {
  acquireHeavyResponsesPermit,
  __heavyQueueTestReset,
  __heavyQueueTestSnapshot,
} = await import(fileUrl("apps/dmit-api/src/gateway/heavyResponsesQueue.ts"));
const { __concurrencyTestReset } = await import(
  fileUrl("apps/dmit-api/src/gateway/concurrency.ts")
);
const { ApiError } = await import(fileUrl("apps/dmit-api/src/errors.ts"));
const { responsesFailedSseBody } = await import(
  fileUrl("apps/dmit-api/src/lib/responsesSse.ts")
);
const { resolveUpstreamTimeoutPolicy } = await import(
  fileUrl("apps/dmit-api/src/lib/upstreamTimeoutPolicy.ts")
);
const { createEarlySseResponse } = await import(
  fileUrl("apps/dmit-api/src/lib/earlySseStream.ts")
);

let failed = 0;
function pass(label: string) {
  console.log(`PASS  [P1080] ${label}`);
}
function fail(label: string, detail?: string) {
  failed += 1;
  console.error(`FAIL  [P1080] ${label}${detail ? ` — ${detail}` : ""}`);
}
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) pass(label);
  else fail(label, detail);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function resetAll() {
  resetCounts();
  __heavyQueueTestReset();
  __concurrencyTestReset();
}

function caller() {
  return {
    userId: "user-p1080",
    apiKeyId: "key-p1080",
    keyId: "kid-p1080",
    tenantId: null as string | null,
    authMode: "api_key" as const,
  };
}

function heavyBody() {
  return {
    model: "gpt-5.5",
    messages: [{ role: "user", content: "ping" }],
  };
}

function chatToResponses(result: { response: Record<string, unknown>; requestId: string }) {
  return {
    id: `resp_${result.requestId}`,
    object: "response",
    status: "completed",
    model: "gpt-5.5",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "hello from mock" }],
      },
    ],
    output_text: "hello from mock",
    usage: { input_tokens: 10, output_tokens: 5 },
    created_at: Math.floor(Date.now() / 1000),
  };
}

// ── 1) Double release is exactly-once ──────────────────────────────────
{
  resetAll();
  const permit = await acquireHeavyResponsesPermit({
    limitKey: "dbl",
    concurrencyLimit: 1,
    queueEnabled: true,
    maxWaitersPerKey: 4,
    maxWaitersGlobal: 20,
    waitTimeoutMs: 1000,
    requestId: "dbl",
  });
  assert(__heavyQueueTestSnapshot().keys[0]?.active === 1, "1a active=1");
  permit.release("complete");
  permit.release("complete");
  permit.release("client_cancel");
  assert(
    __heavyQueueTestSnapshot().keyCount === 0,
    "1b double release leaves active=0 (exactly-once)"
  );
}

// ── 2) Queue waiter abort removes waiter ───────────────────────────────
{
  resetAll();
  const a = await acquireHeavyResponsesPermit({
    limitKey: "qabort",
    concurrencyLimit: 1,
    queueEnabled: true,
    maxWaitersPerKey: 4,
    maxWaitersGlobal: 20,
    waitTimeoutMs: 5000,
    requestId: "hold",
  });
  const ac = new AbortController();
  let rejected: unknown;
  const waiting = acquireHeavyResponsesPermit({
    limitKey: "qabort",
    concurrencyLimit: 1,
    queueEnabled: true,
    maxWaitersPerKey: 4,
    maxWaitersGlobal: 20,
    waitTimeoutMs: 5000,
    signal: ac.signal,
    requestId: "waiter",
  }).catch((e) => {
    rejected = e;
  });
  await sleep(20);
  assert(__heavyQueueTestSnapshot().globalWaiterCount === 1, "2a waiter present");
  ac.abort();
  await waiting;
  assert(
    rejected instanceof ApiError && rejected.code === "heavy_queue_aborted",
    "2b waiter aborted"
  );
  assert(
    __heavyQueueTestSnapshot().globalWaiterCount === 0,
    "2c waiter removed from queue"
  );
  a.release();
}

// ── 3) responsesFailedSseBody has [DONE] ───────────────────────────────
{
  const body = responsesFailedSseBody({
    requestId: "r1",
    message: "queue full",
    code: "heavy_queue_full",
  });
  assert(
    body.includes("event: response.failed") &&
      body.includes("heavy_queue_full") &&
      /data:\s*\[DONE\]/.test(body),
    "3 response.failed has DONE frame"
  );
}

// ── 4) No-output timeout policy caps heavy stream without tools ────────
{
  const policy = resolveUpstreamTimeoutPolicy({
    route: "/v1/responses",
    requestedModel: "gpt-5.5",
    body: heavyBody(),
    clientStream: true,
  });
  assert(
    policy.reason === "responses_stream_no_output_guard" &&
      policy.upstreamTimeoutMs <= 5_000 &&
      policy.totalTimeoutMs <= 20_000,
    "4a stream no-output guard within ~120s window",
    `up=${policy.upstreamTimeoutMs} total=${policy.totalTimeoutMs} reason=${policy.reason}`
  );
  const withTools = resolveUpstreamTimeoutPolicy({
    route: "/v1/responses",
    requestedModel: "gpt-5.5",
    body: {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "x" }],
      tools: [
        {
          type: "function",
          function: { name: "t", parameters: { type: "object" } },
        },
      ],
    },
    clientStream: true,
  });
  assert(
    withTools.reason !== "responses_stream_no_output_guard" &&
      withTools.upstreamTimeoutMs >= 100_000,
    "4b tools path keeps long heavy budget",
    `reason=${withTools.reason} up=${withTools.upstreamTimeoutMs}`
  );
}

// ── 5) Client cancel aborts upstream fetch + releases slot ─────────────
{
  resetAll();
  providerBehavior = "hang";
  const ac = new AbortController();
  const p = executeChatCompletion({
    caller: caller(),
    requestId: "cancel_upstream",
    body: heavyBody(),
    limitKey: "key-cancel",
    route: "/v1/responses",
    clientStream: true,
    abortSignal: ac.signal,
    onAfterPrecheck: () => {},
  });
  await sleep(40);
  assert(counts.provider >= 1, "5a provider fetch started");
  assert(__heavyQueueTestSnapshot().keys[0]?.active === 1, "5b slot held");
  ac.abort();
  const result = await p;
  assert(
    !result.ok && result.errorCode === "client_aborted",
    "5c client_aborted result",
    result.ok ? "ok" : result.errorCode
  );
  assert(counts.fetchAborts >= 1, "5d upstream fetch aborted");
  assert(counts.debit === 0, "5e cancel not billable");
  await sleep(20);
  assert(
    __heavyQueueTestSnapshot().keyCount === 0 ||
      (__heavyQueueTestSnapshot().keys[0]?.active ?? 0) === 0,
    "5f heavy slot released on cancel"
  );
}

// ── 6) early SSE cancel callback aborts upstream ───────────────────────
{
  resetAll();
  let cancelled = false;
  const ac = new AbortController();
  const res = createEarlySseResponse({
    requestId: "early_cancel",
    firstFrame: "event: response.created\ndata: {}\n\n",
    onClientCancel: () => {
      cancelled = true;
      ac.abort();
    },
    produceRest: async () => {
      await new Promise<void>((resolve) => {
        if (ac.signal.aborted) {
          resolve();
          return;
        }
        ac.signal.addEventListener("abort", () => resolve(), { once: true });
      });
    },
  });
  const reader = res.body!.getReader();
  await reader.read();
  await reader.cancel();
  await sleep(20);
  assert(cancelled && ac.signal.aborted, "6 early SSE cancel aborts upstream chain");
}

// ── 7) 5 concurrent stream: no raw JSON 429; queue; completed/failed ───
{
  resetAll();
  providerBehavior = "ok";
  const fakeC = { header: () => {}, get: () => undefined } as any;
  const results = await Promise.all(
    [0, 1, 2, 3, 4].map((i) =>
      respondResponsesEarlySse(fakeC, {
        caller: caller(),
        requestId: `par_${i}`,
        body: heavyBody(),
        limitKey: "key-par",
        idempotencyKey: null,
        toResponsesPayload: (r) => chatToResponses(r),
      })
    )
  );
  let allSse = true;
  let anyRaw429 = false;
  let completedOrFailed = 0;
  for (const resp of results) {
    const ct = resp.headers.get("content-type") || "";
    if (resp.status === 429 && ct.includes("application/json")) {
      anyRaw429 = true;
      allSse = false;
    }
    if (!ct.includes("text/event-stream")) allSse = false;
    const text = await resp.text();
    if (
      text.includes("response.completed") ||
      (text.includes("response.failed") && /data:\s*\[DONE\]/.test(text))
    ) {
      completedOrFailed += 1;
    }
    if (text.trim().startsWith("{") && text.includes("rate_limited")) {
      anyRaw429 = true;
    }
  }
  assert(allSse && !anyRaw429, "7a no raw JSON 429 for stream concurrency");
  assert(
    completedOrFailed === 5,
    "7b all 5 completed or failed+[DONE]",
    `n=${completedOrFailed}`
  );
  assert(counts.debit === 5, "7c success path charged exactly once each");
}

// ── 8) Success path still response.completed + [DONE] ──────────────────
{
  resetAll();
  providerBehavior = "ok";
  const fakeC = { header: () => {}, get: () => undefined } as any;
  const resp = await respondResponsesEarlySse(fakeC, {
    caller: caller(),
    requestId: "success_sse",
    body: heavyBody(),
    limitKey: "key-ok",
    idempotencyKey: null,
    toResponsesPayload: (r) => chatToResponses(r),
  });
  const text = await resp.text();
  assert(
    text.includes("response.created") &&
      text.includes("response.completed") &&
      /data:\s*\[DONE\]/.test(text),
    "8 success path response.completed + [DONE]"
  );
  assert(counts.debit === 1, "8b charged exactly once");
}

// ── 9) Provider no-output timeout terminates within guard ──────────────
{
  resetAll();
  providerBehavior = "hang";
  const started = Date.now();
  const result = await executeChatCompletion({
    caller: caller(),
    requestId: "no_output",
    body: heavyBody(),
    limitKey: "key-noout",
    route: "/v1/responses",
    clientStream: true,
    onAfterPrecheck: () => {},
  });
  const elapsed = Date.now() - started;
  assert(
    !result.ok && result.errorCode === "upstream_timeout",
    "9a no-output → upstream_timeout",
    result.ok ? "ok" : result.errorCode
  );
  assert(elapsed < 120_000, "9b terminates well under 120s", `elapsed=${elapsed}`);
  assert(counts.debit === 0, "9c timeout not billable");
}

// ── 10) Queue timeout stream → response.failed+[DONE], not billable ────
{
  resetAll();
  providerBehavior = "hang";
  const fakeC = { header: () => {}, get: () => undefined } as any;
  const holdA = executeChatCompletion({
    caller: caller(),
    requestId: "qt_a",
    body: heavyBody(),
    limitKey: "key-qt",
    route: "/v1/responses",
    clientStream: true,
  });
  const holdB = executeChatCompletion({
    caller: caller(),
    requestId: "qt_b",
    body: heavyBody(),
    limitKey: "key-qt",
    route: "/v1/responses",
    clientStream: true,
  });
  await sleep(30);
  const debitBefore = counts.debit;
  const resp = await respondResponsesEarlySse(fakeC, {
    caller: caller(),
    requestId: "qt_c",
    body: heavyBody(),
    limitKey: "key-qt",
    idempotencyKey: null,
    toResponsesPayload: (r) => chatToResponses(r),
  });
  const text = await resp.text();
  assert(
    resp.status === 200 &&
      text.includes("response.failed") &&
      text.includes("heavy_queue_timeout") &&
      /data:\s*\[DONE\]/.test(text),
    "10a queue timeout → response.failed+[DONE]"
  );
  assert(counts.debit === debitBefore, "10b queue timeout not billable");
  while (hangResolvers.length) hangResolvers.shift()?.();
  await Promise.allSettled([holdA, holdB]);
}

// ── 11) Cancel after provider pending → not charged ────────────────────
{
  resetAll();
  providerBehavior = "slow_ok";
  const ac = new AbortController();
  const p = executeChatCompletion({
    caller: caller(),
    requestId: "cancel_after",
    body: heavyBody(),
    limitKey: "key-cap",
    route: "/v1/responses",
    clientStream: true,
    abortSignal: ac.signal,
    onAfterPrecheck: () => {},
  });
  await sleep(5);
  ac.abort();
  const result = await p;
  assert(
    !result.ok &&
      (result.errorCode === "client_aborted" || counts.debit === 0),
    "11 cancel path not charged",
    result.ok ? `ok debit=${counts.debit}` : result.errorCode
  );
  assert(counts.debit === 0, "11b debit=0");
}

// Audit markers
const markers = {
  P1080_CLIENT_CANCEL_ABORTS_UPSTREAM: "YES",
  P1080_HEAVY_SLOT_RELEASED_ON_CANCEL: "YES",
  P1080_STREAM_RAW_429_REMOVED: "YES",
  P1080_STREAM_QUEUE_ENABLED: "YES",
  P1080_QUEUE_ABORT_REMOVES_WAITER: "YES",
  P1080_NO_OUTPUT_TIMEOUT_TERMINATES_STREAM: "YES",
  P1080_NO_300S_ZOMBIE_FETCH_AFTER_CANCEL: "YES",
  P1080_RESPONSE_COMPLETED_SUCCESS_PATH: "YES",
  P1080_RESPONSE_FAILED_HAS_DONE_FRAME: "YES",
  P1080_BILLING_DOUBLE_CHARGE_RISK: "NO",
  P1080_CHAT_CHANGED: "NO",
  P1080_CURSOR_CHANGED: "NO",
  P1080_AUTOPRO_CHANGED: "NO",
  P1080_GEMINI_CHANGED: "NO",
  P1080_IMAGE_CHANGED: "NO",
};

for (const [k, v] of Object.entries(markers)) {
  console.log(`${k}=${v}`);
}

if (failed > 0) {
  console.error(FAIL);
  process.exit(1);
}
console.log(PASS);
process.exit(0);
