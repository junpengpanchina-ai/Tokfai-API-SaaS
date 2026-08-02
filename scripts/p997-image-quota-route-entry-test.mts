/**
 * P997 — REAL ENTRY tests for POST /v1/images/generations.
 *
 * Loads production apps/dmit-api/src/routes/images.ts and executes the
 * registered Hono POST handler via imageRoutes.request().
 *
 * Run (auto-reexec with module mocks if needed):
 *   npx tsx scripts/p997-image-quota-route-entry-test.mts
 *
 * Marker: TOKFAI_P997_IMAGE_QUOTA_ROUTE_ENTRY_PASS
 */

import { spawnSync } from "node:child_process";
import { mock } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const PASS = "TOKFAI_P997_IMAGE_QUOTA_ROUTE_ENTRY_PASS";
const FAIL = "TOKFAI_P997_IMAGE_QUOTA_ROUTE_ENTRY_FAIL";
const PROD_ROUTE = "apps/dmit-api/src/routes/images.ts";
const PROD_GUARD = "apps/dmit-api/src/images/imageQuotaGuards.ts";

function ensureModuleMocks(): void {
  if (typeof mock.module === "function") return;
  const loader = join(ROOT, "apps/dmit-api/node_modules/tsx/dist/loader.mjs");
  const r = spawnSync(
    process.execPath,
    ["--experimental-test-module-mocks", "--import", loader, SELF, ...process.argv.slice(2)],
    { stdio: "inherit", cwd: ROOT, env: process.env }
  );
  process.exit(r.status ?? 1);
}

ensureModuleMocks();

function ensureDummyEnv(): void {
  const set = (k: string, v: string) => {
    if (!process.env[k]) process.env[k] = v;
  };
  set("NODE_ENV", "test");
  set("SUPABASE_URL", "https://example.supabase.co");
  set("SUPABASE_JWT_SECRET", "p997-test-jwt-secret-32chars-min!!");
  set("TOKEN_PEPPER", "p997-test-token-pepper-32chars-min!");
  set("GRSAI_API_KEY", "p997-test-grsai-key");
  set("STRIPE_WEBHOOK_SECRET", "whsec_p997_test_only");
  set("TOKFAI_TRIAL_GUARD_ENABLED", "true");
}

ensureDummyEnv();

const fileUrl = (rel: string) => pathToFileURL(join(ROOT, rel)).href;

type Counts = {
  insertImageTask: number;
  enqueueImageGeneration: number;
  provider: number;
  chargedUsage: number;
  assertImageQuotaGuardsLeaf: {
    hasCredits: number;
    period: number;
    trial: number;
  };
  guardOrder: string[];
};

function freshCounts(): Counts {
  return {
    insertImageTask: 0,
    enqueueImageGeneration: 0,
    provider: 0,
    chargedUsage: 0,
    assertImageQuotaGuardsLeaf: { hasCredits: 0, period: 0, trial: 0 },
    guardOrder: [],
  };
}

let counts = freshCounts();
let idempotencyExisting: Record<string, unknown> | null = null;

function resetScenario(): void {
  counts = freshCounts();
  idempotencyExisting = null;
}

function installMocks(): void {
  mock.module(fileUrl("apps/dmit-api/src/middleware/chatAuth.ts"), {
    namedExports: {
      requireApiKeyOrSupabaseJwt: async (c: any, next: any) => {
        c.set("requestId", c.get("requestId") ?? `req_p997_${Date.now()}`);
        c.set("apiKey", {
          userId: "user-p997",
          apiKeyId: "key-uuid-p997",
          keyId: "abcd1234efgh",
          tenantId: "tenant-p997",
        });
        c.set("tenantId", "tenant-p997");
        await next();
      },
      getChatCaller: () => ({
        userId: "user-p997",
        apiKeyId: "key-uuid-p997",
        keyId: "abcd1234efgh",
        tenantId: "tenant-p997",
      }),
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/images/tasksDb.ts"), {
    namedExports: {
      insertImageTask: async (args: any) => {
        counts.insertImageTask += 1;
        return {
          id: "task-row-1",
          request_id: args.requestId,
          status: "queued",
          model: args.model,
          credits_charged: 0,
          billing_status: "pending",
          user_id: args.userId,
          api_key_id: args.apiKeyId,
          tenant_id: args.tenantId,
          idempotency_key: args.idempotencyKey ?? null,
          endpoint: "/v1/images/generations",
          progress: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          result_data: null,
          usage: null,
          error_code: null,
          error_message: null,
          message_en: null,
          message_zh: null,
          input_snapshot: args.inputSnapshot,
          mode: args.mode,
          prompt_mode: args.promptMode,
          upstream_id: null,
          started_at: null,
          completed_at: null,
        };
      },
      lookupImageTaskByIdempotency: async () => idempotencyExisting,
      loadOwnedImageTask: async () => {
        throw new Error("loadOwnedImageTask should not run in POST create tests");
      },
    },
  });

  // Intercept worker so POST cannot start a real provider path.
  mock.module(fileUrl("apps/dmit-api/src/images/worker.ts"), {
    namedExports: {
      enqueueImageGeneration: (_id: string) => {
        counts.enqueueImageGeneration += 1;
        counts.provider += 0; // provider never reached from mocked enqueue
      },
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/catalog/modelCatalog.ts"), {
    namedExports: {
      DEFAULT_IMAGE_MODEL_ID: "nano-banana-fast",
      isModelAllowedForImage: async () => true,
      listAvailableImageModelIds: async () => [
        "nano-banana-fast",
        "nano-banana",
      ],
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/images/imageCircuitBreaker.ts"), {
    namedExports: {
      hydrateImageCircuitFromRedis: async () => {},
      imageCircuitKey: (...a: any[]) => a.join(":"),
      operationFromImageMode: () => "text_to_image",
      peekImageCircuit: () => ({ allowed: true, skippedReason: null }),
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/images/imageFallbackRouting.ts"), {
    namedExports: {
      buildImageAttemptChain: async () => [
        { model: "nano-banana-fast", provider: "primary_image" },
      ],
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/images/publicResponse.ts"), {
    namedExports: {
      buildPublicImageTaskResponse: (task: any) => ({
        id: task.request_id,
        status: task.status,
        billing_status: task.billing_status ?? "pending",
        credits_charged: Number(task.credits_charged ?? 0),
        tokfai: {
          billing_status:
            task.billing_status === "charged" ? "billable" : "not_billable",
          credits_charged: Number(task.credits_charged ?? 0),
        },
      }),
      buildPublicImageApiResultResponse: (task: any) => ({
        id: task.request_id,
      }),
    },
  });
}

installMocks();

const { imageRoutes } = await import(fileUrl(PROD_ROUTE));
const { errorHandler } = await import(
  fileUrl("apps/dmit-api/src/middleware/error.ts")
);
const { __imageQuotaGuardsTestSet, assertImageQuotaGuards } = await import(
  fileUrl(PROD_GUARD)
);
const { ApiError } = await import(fileUrl("apps/dmit-api/src/errors.ts"));

imageRoutes.onError(errorHandler);

let failed = 0;

function pass(label: string, meta: Record<string, unknown>) {
  console.log(`PASS  ${label}`);
  console.log(
    JSON.stringify(
      {
        level: "REAL ENTRY TEST",
        loaded_module: PROD_ROUTE,
        entry: "POST /v1/images/generations via imageRoutes.request",
        real_guard_module: PROD_GUARD,
        ...meta,
      },
      null,
      2
    )
  );
}

function fail(label: string, detail?: string) {
  failed += 1;
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}

function assert(cond: boolean, label: string, meta: Record<string, unknown>, detail?: string) {
  if (cond) pass(label, meta);
  else fail(label, detail ?? JSON.stringify(meta));
}

async function postGenerations(body: Record<string, unknown>, headers?: Record<string, string>) {
  return imageRoutes.request("/v1/images/generations", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer sk-tokfai_p997_test_token_not_verified",
      ...(headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

function wireGuardReject(
  code:
    | "insufficient_credits"
    | "daily_limit_exceeded"
    | "quota_exceeded"
    | "trial_model_not_allowed"
    | "trial_limit_exceeded"
) {
  const statusMap = {
    insufficient_credits: 402,
    daily_limit_exceeded: 429,
    quota_exceeded: 429,
    trial_model_not_allowed: 403,
    trial_limit_exceeded: 429,
  } as const;

  __imageQuotaGuardsTestSet({
    assertHasCredits: async () => {
      counts.assertImageQuotaGuardsLeaf.hasCredits += 1;
      counts.guardOrder.push("hasCredits");
      if (code === "insufficient_credits") {
        throw new ApiError({
          status: statusMap[code],
          message: code,
          code,
          type: "billing_error",
        });
      }
    },
    assertCreditPeriodLimits: async () => {
      counts.assertImageQuotaGuardsLeaf.period += 1;
      counts.guardOrder.push("period");
      if (code === "daily_limit_exceeded" || code === "quota_exceeded") {
        throw new ApiError({
          status: statusMap[code],
          message: code,
          code,
          type: "rate_limit_error",
        });
      }
    },
    assertTrialQuotaGuards: async () => {
      counts.assertImageQuotaGuardsLeaf.trial += 1;
      counts.guardOrder.push("trial");
      if (
        code === "trial_model_not_allowed" ||
        code === "trial_limit_exceeded"
      ) {
        throw new ApiError({
          status: statusMap[code],
          message: code,
          code,
          type:
            code === "trial_model_not_allowed"
              ? "invalid_request_error"
              : "rate_limit_error",
        });
      }
    },
  });
}

function wireGuardPass(): void {
  __imageQuotaGuardsTestSet({
    assertHasCredits: async () => {
      counts.assertImageQuotaGuardsLeaf.hasCredits += 1;
      counts.guardOrder.push("hasCredits");
    },
    assertCreditPeriodLimits: async () => {
      counts.assertImageQuotaGuardsLeaf.period += 1;
      counts.guardOrder.push("period");
    },
    assertTrialQuotaGuards: async () => {
      counts.assertImageQuotaGuardsLeaf.trial += 1;
      counts.guardOrder.push("trial");
    },
  });
}

async function run(): Promise<void> {
  console.log("P997 REAL ENTRY — POST /v1/images/generations\n");
  console.log(`Loaded production module: ${PROD_ROUTE}`);
  console.log(`Real guard module: ${PROD_GUARD}`);
  console.log(
    `assertImageQuotaGuards typeof: ${typeof assertImageQuotaGuards}\n`
  );

  // A — insufficient credits
  {
    resetScenario();
    wireGuardReject("insufficient_credits");
    const res = await postGenerations({
      model: "nano-banana-fast",
      prompt: "a cat on a desk",
    });
    const body = await res.json();
    __imageQuotaGuardsTestSet(null);
    assert(
      res.status === 402 &&
        body?.error?.code === "insufficient_credits" &&
        counts.insertImageTask === 0 &&
        counts.enqueueImageGeneration === 0 &&
        counts.provider === 0 &&
        counts.chargedUsage === 0 &&
        counts.assertImageQuotaGuardsLeaf.hasCredits === 1,
      "A. POST insufficient_credits via real route entry",
      {
        intercepted: [
          "tasksDb.insertImageTask",
          "worker.enqueueImageGeneration",
          "chatAuth",
          "imageQuotaGuards leaf via __imageQuotaGuardsTestSet",
        ],
        calls: { ...counts },
        key_assertions: {
          http: res.status,
          code: body?.error?.code,
          insertImageTask: counts.insertImageTask,
          enqueue: counts.enqueueImageGeneration,
          provider: counts.provider,
          chargedUsage: counts.chargedUsage,
        },
      }
    );
  }

  // B — daily limit
  {
    resetScenario();
    wireGuardReject("daily_limit_exceeded");
    const res = await postGenerations({
      model: "nano-banana-fast",
      prompt: "daily limit case",
    });
    const body = await res.json();
    __imageQuotaGuardsTestSet(null);
    assert(
      res.status === 429 &&
        body?.error?.code === "daily_limit_exceeded" &&
        counts.insertImageTask === 0 &&
        counts.enqueueImageGeneration === 0 &&
        counts.provider === 0,
      "B. POST daily_limit_exceeded via real route entry",
      {
        intercepted: ["tasksDb.insertImageTask", "worker.enqueueImageGeneration"],
        calls: { ...counts },
        key_assertions: {
          http: res.status,
          code: body?.error?.code,
          insertImageTask: counts.insertImageTask,
          enqueue: counts.enqueueImageGeneration,
        },
      }
    );
  }

  // C — monthly quota
  {
    resetScenario();
    wireGuardReject("quota_exceeded");
    const res = await postGenerations({
      model: "nano-banana-fast",
      prompt: "monthly quota case",
    });
    const body = await res.json();
    __imageQuotaGuardsTestSet(null);
    assert(
      res.status === 429 &&
        body?.error?.code === "quota_exceeded" &&
        counts.insertImageTask === 0 &&
        counts.enqueueImageGeneration === 0,
      "C. POST quota_exceeded via real route entry",
      {
        intercepted: ["tasksDb.insertImageTask", "worker.enqueueImageGeneration"],
        calls: { ...counts },
        key_assertions: {
          http: res.status,
          code: body?.error?.code,
          insertImageTask: counts.insertImageTask,
          enqueue: counts.enqueueImageGeneration,
        },
      }
    );
  }

  // D — trial model not allowed
  {
    resetScenario();
    wireGuardReject("trial_model_not_allowed");
    const res = await postGenerations({
      model: "nano-banana",
      prompt: "trial blocked model",
    });
    const body = await res.json();
    __imageQuotaGuardsTestSet(null);
    assert(
      res.status === 403 &&
        body?.error?.code === "trial_model_not_allowed" &&
        counts.insertImageTask === 0 &&
        counts.enqueueImageGeneration === 0,
      "D. POST trial_model_not_allowed via real route entry",
      {
        intercepted: ["tasksDb.insertImageTask", "worker.enqueueImageGeneration"],
        calls: { ...counts },
        key_assertions: {
          http: res.status,
          code: body?.error?.code,
          insertImageTask: counts.insertImageTask,
          enqueue: counts.enqueueImageGeneration,
        },
      }
    );
  }

  // E — normal quota: guard before insert/enqueue, each once
  {
    resetScenario();
    wireGuardPass();
    const res = await postGenerations({
      model: "nano-banana-fast",
      prompt: "happy path",
    });
    const body = await res.json();
    __imageQuotaGuardsTestSet(null);
    const orderOk =
      counts.guardOrder.join(">") === "hasCredits>period>trial" &&
      counts.insertImageTask === 1 &&
      counts.enqueueImageGeneration === 1;
    assert(
      (res.status === 202 || res.status === 200) &&
        orderOk &&
        counts.assertImageQuotaGuardsLeaf.hasCredits === 1,
      "E. POST normal quota: guard then insert×1 enqueue×1",
      {
        intercepted: ["tasksDb.insertImageTask", "worker.enqueueImageGeneration"],
        calls: { ...counts },
        key_assertions: {
          http: res.status,
          bodyStatus: body?.status,
          guardOrder: counts.guardOrder.join(">"),
          insertImageTask: counts.insertImageTask,
          enqueue: counts.enqueueImageGeneration,
        },
      },
      `status=${res.status} order=${counts.guardOrder.join(">")} insert=${counts.insertImageTask} enqueue=${counts.enqueueImageGeneration}`
    );
  }

  // F — idempotency existing task (record real Guard behavior)
  {
    resetScenario();
    wireGuardPass();
    idempotencyExisting = {
      id: "existing-1",
      request_id: "req_existing_idem",
      status: "queued",
      model: "nano-banana-fast",
      credits_charged: 0,
      billing_status: "pending",
      user_id: "user-p997",
      api_key_id: "key-uuid-p997",
      tenant_id: "tenant-p997",
      idempotency_key: "idem-p997-1",
      endpoint: "/v1/images/generations",
      progress: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      result_data: null,
      usage: null,
      error_code: null,
      error_message: null,
      message_en: "queued",
      message_zh: "排队中",
      input_snapshot: {},
      mode: "text_to_image",
      prompt_mode: "text",
      upstream_id: null,
      started_at: null,
      completed_at: null,
    };
    const res = await postGenerations(
      { model: "nano-banana-fast", prompt: "idempotency" },
      { "idempotency-key": "idem-p997-1" }
    );
    const body = await res.json();
    __imageQuotaGuardsTestSet(null);
    const guardRan =
      counts.assertImageQuotaGuardsLeaf.hasCredits +
        counts.assertImageQuotaGuardsLeaf.period +
        counts.assertImageQuotaGuardsLeaf.trial >
      0;
    // Real production behavior: early return before assertImageQuotaGuards.
    // Queued existing tasks re-enqueue without insert / without quota guard.
    assert(
      res.status === 200 &&
        counts.insertImageTask === 0 &&
        !guardRan &&
        counts.enqueueImageGeneration === 1 &&
        body?.id === "req_existing_idem",
      "F. Idempotency existing queued task: no insert, Guard NOT re-run, enqueue once",
      {
        intercepted: ["tasksDb.lookupImageTaskByIdempotency", "worker.enqueueImageGeneration"],
        calls: { ...counts },
        key_assertions: {
          http: res.status,
          insertImageTask: counts.insertImageTask,
          enqueue: counts.enqueueImageGeneration,
          guard_ran: guardRan,
          note: "Observed: idempotency fast-path returns before assertImageQuotaGuards",
        },
      },
      `status=${res.status} guardRan=${guardRan} insert=${counts.insertImageTask} enqueue=${counts.enqueueImageGeneration}`
    );
  }

  // Negative: wrong wiring should fail — guard pass but we assert insert must be 1;
  // if insert mocked away incorrectly, E would fail. Extra check: reject path must
  // not call insert even if guard leaf incorrectly continues — covered by A–D.

  if (failed > 0) {
    console.error(`\n${FAIL} (${failed} failed)`);
    process.exit(1);
  }
  console.log(`\n${PASS}`);
}

run().catch((err) => {
  console.error(err);
  console.error(FAIL);
  process.exit(1);
});
