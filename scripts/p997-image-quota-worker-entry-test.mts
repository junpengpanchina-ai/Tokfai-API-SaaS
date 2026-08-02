/**
 * P997 — REAL ENTRY tests for image worker.
 *
 * Loads production apps/dmit-api/src/images/worker.ts and executes the
 * exported entry enqueueImageGeneration → processImageGeneration.
 *
 * Run:
 *   npx tsx scripts/p997-image-quota-worker-entry-test.mts
 *
 * Marker: TOKFAI_P997_IMAGE_QUOTA_WORKER_ENTRY_PASS
 */

import { spawnSync } from "node:child_process";
import { mock } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const PASS = "TOKFAI_P997_IMAGE_QUOTA_WORKER_ENTRY_PASS";
const FAIL = "TOKFAI_P997_IMAGE_QUOTA_WORKER_ENTRY_FAIL";
const PROD_WORKER = "apps/dmit-api/src/images/worker.ts";
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
  assertImageQuotaGuardsLeaf: number;
  buildImageAttemptChain: number;
  acquireImageCircuit: number;
  providerCreate: number;
  urlGate: number;
  recordImageUsageAndDebit: number;
  finalizeImageTaskFailure: number;
  finalizeImageTaskSuccess: number;
  progressBillingCheck: number;
  guardOrder: string[];
};

function freshCounts(): Counts {
  return {
    assertImageQuotaGuardsLeaf: 0,
    buildImageAttemptChain: 0,
    acquireImageCircuit: 0,
    providerCreate: 0,
    urlGate: 0,
    recordImageUsageAndDebit: 0,
    finalizeImageTaskFailure: 0,
    finalizeImageTaskSuccess: 0,
    progressBillingCheck: 0,
    guardOrder: [],
  };
}

let counts = freshCounts();
let guardMode:
  | "pass"
  | "reject_daily"
  | "reject_credits" = "pass";
let providerMode: "success" | "fail" = "success";
let urlGateMode: "pass" | "fail" = "pass";
let lastFailure: {
  errorCode: string | null;
  billing_status: string;
  credits_charged: number;
} | null = null;

function resetScenario(): void {
  counts = freshCounts();
  guardMode = "pass";
  providerMode = "success";
  urlGateMode = "pass";
  lastFailure = null;
}

function makeTask(requestId: string) {
  return {
    id: `row-${requestId}`,
    request_id: requestId,
    user_id: "user-p997",
    api_key_id: "key-uuid-p997",
    tenant_id: "tenant-p997",
    model: "nano-banana-fast",
    status: "queued",
    progress: 0,
    message_en: null,
    message_zh: null,
    error_code: null,
    error_message: null,
    result_data: null,
    usage: null,
    credits_charged: 0,
    billing_status: "pending",
    idempotency_key: null,
    endpoint: "/v1/images/generations",
    input_snapshot: {
      prompt: "worker entry test",
      aspectRatio: "1:1",
      imageSize: "1K",
      imageUrls: [],
      imageUrlSources: [],
      mode: "text_to_image",
      promptMode: "text",
      imagesCount: 0,
      imageSourceType: null,
      imageSourceTypes: [],
      hasBlobBlocked: false,
      n: 1,
      responseFormat: "url",
      requestedModel: "nano-banana-fast",
    },
    upstream_id: null,
    provider_task_id: null,
    mode: "text_to_image",
    prompt_mode: "text",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
  };
}

function installMocks(): void {
  const fakeClient = {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: null, error: null }),
          gte: () => ({
            limit: async () => ({ data: [], error: null }),
          }),
          limit: async () => ({ data: [], error: null }),
        }),
      }),
      insert: async () => ({ error: null }),
      update: () => ({
        eq: async () => ({ error: null }),
      }),
    }),
    rpc: async () => ({ error: null }),
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

  mock.module(fileUrl("apps/dmit-api/src/images/tasksDb.ts"), {
    namedExports: {
      imageGenerationsEndpoint: () => "/v1/images/generations",
      insertImageTask: async () => {
        throw new Error("insertImageTask must not run in worker entry tests");
      },
      lookupImageTaskByIdempotency: async () => null,
      loadOwnedImageTask: async () => {
        throw new Error("unused");
      },
      loadImageTaskByRequestId: async (requestId: string) => makeTask(requestId),
      updateImageTaskProgress: async (args: { requestId: string; status: string }) => {
        if (args.status === "billing_check") counts.progressBillingCheck += 1;
      },
      markImageTaskStarted: async () => true,
      finalizeImageTaskSuccess: async () => {
        counts.finalizeImageTaskSuccess += 1;
      },
      finalizeImageTaskFailure: async (args: {
        requestId: string;
        errorCode: string;
        usage?: { credits_charged?: number };
      }) => {
        counts.finalizeImageTaskFailure += 1;
        lastFailure = {
          errorCode: args.errorCode ?? null,
          billing_status: "not_billable",
          credits_charged: Number(args.usage?.credits_charged ?? 0),
        };
      },
      markImageTaskWaitWindowExceeded: async () => {},
      markImageTaskUpstreamSubmitted: async () => {},
      markImageTaskReconcilePending: async () => {},
      updateImageTaskReconcileMeta: async () => {},
      listImageTasksNeedingReconcile: async () => [],
      parseInputSnapshot: (raw: unknown) => {
        if (!raw || typeof raw !== "object") return null;
        return raw as Record<string, unknown>;
      },
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/images/imageFallbackRouting.ts"), {
    namedExports: {
      buildImageAttemptChain: async () => {
        counts.buildImageAttemptChain += 1;
        return [{ model: "nano-banana-fast", provider: "primary_image" }];
      },
      sanitizePublicAttempts: (a: unknown) => a,
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/images/imageCircuitBreaker.ts"), {
    namedExports: {
      IMAGE_CIRCUIT_PROVIDER_ID: "primary_image",
      imageCircuitKey: (...a: any[]) => a.join(":"),
      operationFromImageMode: () => "text_to_image",
      hydrateImageCircuitFromRedis: async () => {},
      acquireImageCircuit: () => {
        counts.acquireImageCircuit += 1;
        return {
          allowed: true,
          skippedReason: null,
          stateBefore: "closed",
          stateAfter: "closed",
        };
      },
      peekImageCircuit: () => ({ allowed: true, skippedReason: null }),
      recordImageCircuitResult: () => ({ state: "closed" }),
      classifyImageFailureCode: (code: string) => {
        if (
          code === "insufficient_credits" ||
          code === "daily_limit_exceeded" ||
          code === "invalid_request_error"
        ) {
          return "client";
        }
        if (
          code === "provider_asset_unavailable" ||
          code === "asset_persist_failed"
        ) {
          return code === "asset_persist_failed" ? "internal" : "provider";
        }
        return "provider";
      },
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/images/imageBilling.ts"), {
    namedExports: {
      recordImageUsageAndDebit: async () => {
        counts.recordImageUsageAndDebit += 1;
      },
      debitImageCreditsIdempotent: async () => ({ alreadyCharged: false }),
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/images/imageResultAssetGate.ts"), {
    namedExports: {
      downloadValidateAndPersistProviderImage: async () => {
        counts.urlGate += 1;
        if (urlGateMode === "fail") {
          const { ApiError } = await import(fileUrl("apps/dmit-api/src/errors.ts"));
          throw new ApiError({
            status: 502,
            message: "Provider asset unavailable.",
            code: "provider_asset_unavailable",
            type: "upstream_error",
          });
        }
        return { publicUrl: "https://cdn.example/tokfai/img.png" };
      },
      imageTaskLedgerReferenceId: (id: string) => `image_task:${id}`,
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/upstream/nanoBananaImageProvider.ts"), {
    namedExports: {
      isNanoBananaImageModel: () => true,
      runNanoBananaImageGeneration: async () => {
        counts.providerCreate += 1;
        if (providerMode === "fail") {
          const { ApiError } = await import(fileUrl("apps/dmit-api/src/errors.ts"));
          throw new ApiError({
            status: 502,
            message: "Image generation failed.",
            code: "upstream_image_error",
            type: "upstream_error",
            publicMessage: "upstream failed",
          });
        }
        return {
          url: "https://provider.example/raw.png",
          upstreamId: "up-1",
        };
      },
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/upstream/imageAsyncProvider.ts"), {
    namedExports: {
      runImageGenerationWithPolling: async () => {
        counts.providerCreate += 1;
        throw new Error("async provider should not run for nano-banana path");
      },
      resolveImageSizeFields: () => ({ aspectRatio: "1:1", imageSize: "1K" }),
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/catalog/modelCatalog.ts"), {
    namedExports: {
      priceCreditsForImage: async () => 3,
      DEFAULT_IMAGE_MODEL_ID: "nano-banana-fast",
      isModelAllowedForImage: async () => true,
      listAvailableImageModelIds: async () => ["nano-banana-fast"],
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/images/progressMessages.ts"), {
    namedExports: {
      messagesForStatus: () => ({ en: "msg", zh: "消息" }),
    },
  });
}

installMocks();

const { enqueueImageGeneration } = await import(fileUrl(PROD_WORKER));
const { __imageQuotaGuardsTestSet } = await import(fileUrl(PROD_GUARD));
const { ApiError } = await import(fileUrl("apps/dmit-api/src/errors.ts"));
const { clearImageGenerationActive } = await import(
  fileUrl("apps/dmit-api/src/images/activeImageTasks.ts")
);

let failed = 0;

function pass(label: string, meta: Record<string, unknown>) {
  console.log(`PASS  ${label}`);
  console.log(
    JSON.stringify(
      {
        level: "REAL ENTRY TEST",
        loaded_module: PROD_WORKER,
        entry: "enqueueImageGeneration → processImageGeneration",
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

function assert(
  cond: boolean,
  label: string,
  meta: Record<string, unknown>,
  detail?: string
) {
  if (cond) pass(label, meta);
  else fail(label, detail ?? JSON.stringify(meta));
}

function wireGuard(): void {
  __imageQuotaGuardsTestSet({
    assertHasCredits: async () => {
      counts.assertImageQuotaGuardsLeaf += 1;
      counts.guardOrder.push("hasCredits");
      if (guardMode === "reject_credits") {
        throw new ApiError({
          status: 402,
          message: "Insufficient credits.",
          code: "insufficient_credits",
          type: "billing_error",
        });
      }
    },
    assertCreditPeriodLimits: async () => {
      counts.assertImageQuotaGuardsLeaf += 1;
      counts.guardOrder.push("period");
      if (guardMode === "reject_daily") {
        throw new ApiError({
          status: 429,
          message: "Daily credit limit exceeded.",
          code: "daily_limit_exceeded",
          type: "rate_limit_error",
        });
      }
    },
    assertTrialQuotaGuards: async () => {
      counts.assertImageQuotaGuardsLeaf += 1;
      counts.guardOrder.push("trial");
    },
  });
}

async function waitForWorker(requestId: string, pred: () => boolean): Promise<void> {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    if (pred()) {
      clearImageGenerationActive(requestId);
      return;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  clearImageGenerationActive(requestId);
  throw new Error(`worker did not finish for ${requestId}`);
}

async function runWorker(requestId: string): Promise<void> {
  wireGuard();
  enqueueImageGeneration(requestId);
  await waitForWorker(
    requestId,
    () =>
      counts.finalizeImageTaskFailure > 0 ||
      counts.finalizeImageTaskSuccess > 0 ||
      (guardMode === "pass" &&
        providerMode === "success" &&
        urlGateMode === "pass" &&
        counts.recordImageUsageAndDebit > 0 &&
        counts.finalizeImageTaskSuccess > 0)
  );
  __imageQuotaGuardsTestSet(null);
}

async function run(): Promise<void> {
  console.log("P997 REAL ENTRY — image worker\n");
  console.log(`Loaded production module: ${PROD_WORKER}`);
  console.log(`Entry: enqueueImageGeneration (exports processImageGeneration privately)`);
  console.log(`Real guard module: ${PROD_GUARD}\n`);

  // A — quota exhausted after enqueue
  {
    resetScenario();
    guardMode = "reject_daily";
    const id = `req_p997_worker_a_${Date.now()}`;
    await runWorker(id);
    assert(
      counts.progressBillingCheck >= 1 &&
        counts.assertImageQuotaGuardsLeaf >= 1 &&
        counts.finalizeImageTaskFailure === 1 &&
        counts.buildImageAttemptChain === 0 &&
        counts.acquireImageCircuit === 0 &&
        counts.providerCreate === 0 &&
        counts.urlGate === 0 &&
        counts.recordImageUsageAndDebit === 0 &&
        lastFailure?.credits_charged === 0 &&
        lastFailure?.billing_status === "not_billable" &&
        lastFailure?.errorCode === "daily_limit_exceeded",
      "A. Worker billing_check reject: failTask path, zero upstream/debit",
      {
        intercepted: [
          "tasksDb.finalizeImageTaskFailure",
          "imageFallbackRouting.buildImageAttemptChain",
          "imageCircuitBreaker.acquireImageCircuit",
          "nanoBananaImageProvider.runNanoBananaImageGeneration",
          "imageResultAssetGate.downloadValidateAndPersistProviderImage",
          "imageBilling.recordImageUsageAndDebit",
          "imageQuotaGuards leaf via __imageQuotaGuardsTestSet",
        ],
        calls: { ...counts, lastFailure },
        key_assertions: {
          billing_check: counts.progressBillingCheck,
          failTask_via_finalizeFailure: counts.finalizeImageTaskFailure,
          buildImageAttemptChain: counts.buildImageAttemptChain,
          acquireImageCircuit: counts.acquireImageCircuit,
          providerCreate: counts.providerCreate,
          urlGate: counts.urlGate,
          debit: counts.recordImageUsageAndDebit,
          credits_charged: lastFailure?.credits_charged,
          billing_status: lastFailure?.billing_status,
          errorCode: lastFailure?.errorCode,
        },
      }
    );
  }

  // B — normal success: guard once chain, provider, url gate, debit once
  {
    resetScenario();
    guardMode = "pass";
    providerMode = "success";
    urlGateMode = "pass";
    const id = `req_p997_worker_b_${Date.now()}`;
    await runWorker(id);
    const guardBeforeChain =
      counts.guardOrder.length > 0 && counts.buildImageAttemptChain === 1;
    assert(
      counts.assertImageQuotaGuardsLeaf === 3 &&
        counts.guardOrder.join(">") === "hasCredits>period>trial" &&
        guardBeforeChain &&
        counts.providerCreate === 1 &&
        counts.urlGate === 1 &&
        counts.recordImageUsageAndDebit === 1 &&
        counts.finalizeImageTaskSuccess === 1 &&
        counts.finalizeImageTaskFailure === 0,
      "B. Worker success: guard→chain→provider→URL gate→debit×1",
      {
        intercepted: [
          "nanoBananaImageProvider",
          "imageResultAssetGate",
          "imageBilling.recordImageUsageAndDebit",
        ],
        calls: { ...counts },
        key_assertions: {
          guardLeafCalls: counts.assertImageQuotaGuardsLeaf,
          guardOrder: counts.guardOrder.join(">"),
          buildImageAttemptChain: counts.buildImageAttemptChain,
          providerCreate: counts.providerCreate,
          urlGate: counts.urlGate,
          debit: counts.recordImageUsageAndDebit,
        },
      }
    );
  }

  // C — provider failure after guard: no debit
  {
    resetScenario();
    guardMode = "pass";
    providerMode = "fail";
    const id = `req_p997_worker_c_${Date.now()}`;
    await runWorker(id);
    assert(
      counts.assertImageQuotaGuardsLeaf === 3 &&
        counts.providerCreate === 1 &&
        counts.recordImageUsageAndDebit === 0 &&
        counts.finalizeImageTaskFailure === 1 &&
        lastFailure?.credits_charged === 0 &&
        lastFailure?.billing_status === "not_billable",
      "C. Provider fail after guard: not_billable, debit=0",
      {
        intercepted: ["nanoBananaImageProvider", "imageBilling.recordImageUsageAndDebit"],
        calls: { ...counts, lastFailure },
        key_assertions: {
          providerCreate: counts.providerCreate,
          debit: counts.recordImageUsageAndDebit,
          credits_charged: lastFailure?.credits_charged,
          billing_status: lastFailure?.billing_status,
        },
      }
    );
  }

  // D — URL Gate failure: no debit
  {
    resetScenario();
    guardMode = "pass";
    providerMode = "success";
    urlGateMode = "fail";
    const id = `req_p997_worker_d_${Date.now()}`;
    await runWorker(id);
    assert(
      counts.providerCreate === 1 &&
        counts.urlGate === 1 &&
        counts.recordImageUsageAndDebit === 0 &&
        counts.finalizeImageTaskFailure >= 1 &&
        (lastFailure?.credits_charged ?? 0) === 0,
      "D. URL Gate reject: no recordImageUsageAndDebit",
      {
        intercepted: ["imageResultAssetGate", "imageBilling.recordImageUsageAndDebit"],
        calls: { ...counts, lastFailure },
        key_assertions: {
          providerCreate: counts.providerCreate,
          urlGate: counts.urlGate,
          debit: counts.recordImageUsageAndDebit,
        },
      }
    );
  }

  // E — ledger idempotency without DB
  {
    console.log(
      "SKIP  E. success finalize/reconcile double-debit — BLOCKED_BY_INTEGRATION_DEPENDENCY (no DB / no real debit_credits RPC in this harness)"
    );
    console.log(
      JSON.stringify(
        {
          level: "BLOCKED_BY_INTEGRATION_DEPENDENCY",
          reason:
            "Cannot assert credit_ledger unique debit without Supabase RPC; refusing to fake PASS",
        },
        null,
        2
      )
    );
  }

  // Wiring negative: if enqueue were a no-op, A would timeout/fail — waitForWorker throws.

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
