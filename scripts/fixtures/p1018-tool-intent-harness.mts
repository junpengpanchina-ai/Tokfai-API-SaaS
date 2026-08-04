/**
 * P1018 shared REAL ENTRY harness.
 *
 * Loads production executeChatCompletion / chat routes with mocks only at:
 * - Provider fetch boundary
 * - Auth / gateway middleware
 * - DB / RPC / debit boundary
 * - Credit / trial precheck leaves
 *
 * Does NOT reimplement runProviderAttempts / compiler / parser.
 */

import { spawnSync } from "node:child_process";
import { mock } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
export const fileUrl = (rel: string) => pathToFileURL(join(ROOT, rel)).href;

export const CALLER = {
  userId: "user-p1018",
  apiKeyId: "key-uuid-p1018",
  keyId: "abcd1234efgh",
  tenantId: null as string | null,
};

export const WEATHER_TOOLS = [
  {
    type: "function",
    function: {
      name: "get_weather",
      description: "Get weather",
      parameters: {
        type: "object",
        properties: {
          city: { type: "string" },
          unit: { type: "string" },
        },
        required: ["city"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_time",
      description: "Get time",
      parameters: {
        type: "object",
        properties: { tz: { type: "string" } },
        required: ["tz"],
        additionalProperties: false,
      },
    },
  },
] as const;

export type Counts = {
  providerCallCount: number;
  repairCallCount: number;
  fallbackCount: number;
  debitCallCount: number;
  usageLogInsertCount: number;
  compilerSeenCount: number;
  lastProviderIds: string[];
  lastDebitEntry: Record<string, unknown> | null;
  /** timeoutMs passed into each providerFetch call (P1019 budget proof). */
  fetchTimeoutMs: number[];
};

export type ProviderReply =
  | {
      kind: "completion";
      content: string | null;
      model?: string;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
      tool_calls?: unknown;
      finish_reason?: string;
      delayMs?: number;
    }
  | {
      kind: "error";
      status?: number;
      code: string;
      message?: string;
      delayMs?: number;
    };

export type ProviderScript = (ctx: {
  providerId: string;
  attemptModel: string | null;
  json: Record<string, unknown>;
  callIndex: number;
  isRepair: boolean;
  hasCompiler: boolean;
}) => ProviderReply | Promise<ProviderReply>;

const EMULATED_MARKER =
  "You are a strict JSON Tool Intent emitter for Tokfai Emulated Tool Calling.";
const REPAIR_MARKER =
  "Your previous reply was not valid Tool Intent JSON.";

let counts: Counts = freshCounts();
let providerScripts: ProviderScript[] = [];
let providerScriptIndex = 0;
let fixedProviders:
  | Array<{ id: string; label: string; baseUrl: string; apiKey: string; chatPath: string; enabled: boolean; priority: number; weight: number; timeoutMs: number; supportedModels: "*" }>
  | null = null;

export function freshCounts(): Counts {
  return {
    providerCallCount: 0,
    repairCallCount: 0,
    fallbackCount: 0,
    debitCallCount: 0,
    usageLogInsertCount: 0,
    compilerSeenCount: 0,
    lastProviderIds: [],
    lastDebitEntry: null,
    fetchTimeoutMs: [],
  };
}

export function getCounts(): Counts {
  return {
    ...counts,
    lastProviderIds: [...counts.lastProviderIds],
    fetchTimeoutMs: [...counts.fetchTimeoutMs],
  };
}

export type TimeoutPolicyOverride = {
  upstreamTimeoutMs: number;
  idleTimeoutMs: number;
  totalTimeoutMs: number;
};

let timeoutPolicyOverride: TimeoutPolicyOverride | null = null;

export function setTimeoutPolicyOverride(
  policy: TimeoutPolicyOverride | null
): void {
  timeoutPolicyOverride = policy;
}

export function resetScenario(opts?: {
  scripts?: ProviderScript[];
  providers?: typeof fixedProviders;
  timeoutPolicy?: TimeoutPolicyOverride | null;
}): void {
  counts = freshCounts();
  providerScripts = opts?.scripts ? [...opts.scripts] : [];
  providerScriptIndex = 0;
  if (opts && "providers" in opts) {
    fixedProviders = opts.providers ?? null;
  }
  if (opts && "timeoutPolicy" in opts) {
    timeoutPolicyOverride = opts.timeoutPolicy ?? null;
  } else {
    timeoutPolicyOverride = null;
  }
}

export function ensureModuleMocks(selfUrl: string): void {
  if (typeof mock.module === "function") return;
  const loader = join(ROOT, "apps/dmit-api/node_modules/tsx/dist/loader.mjs");
  const r = spawnSync(
    process.execPath,
    [
      "--experimental-test-module-mocks",
      "--import",
      loader,
      selfUrl,
      ...process.argv.slice(2),
    ],
    { stdio: "inherit", cwd: ROOT, env: process.env }
  );
  process.exit(r.status ?? 1);
}

export function ensureDummyEnv(): void {
  const set = (k: string, v: string) => {
    if (!process.env[k]) process.env[k] = v;
  };
  process.env.NODE_ENV = "test";
  set("SUPABASE_URL", "https://example.supabase.co");
  set("SUPABASE_SERVICE_ROLE_KEY", "service_role_test_key_xxxxxxxx");
  set("SUPABASE_JWT_SECRET", "p1018-test-jwt-secret-32chars-min!!");
  set("TOKEN_PEPPER", "p1018-test-token-pepper-32chars-min!");
  set("GRSAI_API_KEY", "p1018-test-grsai-key");
  set("GRSAI_BASE_URL", "https://grsai-p1018.test");
  set("STRIPE_SECRET_KEY", "sk_test_p1018_dummy");
  set("STRIPE_WEBHOOK_SECRET", "whsec_p1018_test_only_secret");
  // Force single primary unless a test overrides providers via mock.
  process.env.TOKFAI_UPSTREAM_SECONDARY_ENABLED = "false";
  process.env.TOKFAI_REDIS_ENABLED = "false";
  process.env.TOKFAI_UNLIMITED_BILLING_ENABLED = "false";
  process.env.VERIFIED_TOOLS_CAPABLE_MODEL_IDS = "";
  process.env.TOKFAI_TRIAL_GUARD_ENABLED = "false";
  set("LOG_LEVEL", "error");
}

function completionBody(reply: Extract<ProviderReply, { kind: "completion" }>) {
  const message: Record<string, unknown> = {
    role: "assistant",
    content: reply.content,
  };
  if (reply.tool_calls) message.tool_calls = reply.tool_calls;
  return {
    id: `chatcmpl-p1018-${counts.providerCallCount}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: reply.model ?? "gpt-5.5",
    choices: [
      {
        index: 0,
        message,
        finish_reason: reply.finish_reason ?? (reply.tool_calls ? "tool_calls" : "stop"),
      },
    ],
    usage: reply.usage ?? {
      prompt_tokens: 12,
      completion_tokens: 8,
      total_tokens: 20,
    },
  };
}

function makeApiError(mod: any, reply: Extract<ProviderReply, { kind: "error" }>) {
  const ApiError = mod.ApiError;
  return new ApiError({
    status: reply.status ?? 502,
    message: reply.message ?? reply.code,
    publicMessage: reply.message ?? reply.code,
    code: reply.code,
    type: "upstream_error",
    upstreamStatus: reply.status ?? 502,
  });
}

export async function installP1018Mocks(): Promise<void> {
  const errorsUrl = fileUrl("apps/dmit-api/src/errors.ts");

  mock.module(fileUrl("apps/dmit-api/src/middleware/chatAuth.ts"), {
    namedExports: {
      requireApiKeyOrSupabaseJwt: async (c: any, next: any) => {
        c.set("requestId", c.get("requestId") ?? `req_p1018_${Date.now()}`);
        c.set("apiKey", { ...CALLER });
        c.set("tenantId", CALLER.tenantId);
        await next();
      },
      getChatCaller: () => ({ ...CALLER }),
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/middleware/chatGateway.ts"), {
    namedExports: {
      chatGatewayMiddleware: async (_c: any, next: any) => {
        await next();
      },
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/lib/usageBilling.ts"), {
    namedExports: {
      lookupBillingIdempotency: async () => null,
      recordSuccessfulUsageAndDebit: async (entry: Record<string, unknown>) => {
        counts.debitCallCount += 1;
        counts.lastDebitEntry = { ...entry };
        return {
          balanceAfter: 99,
          debitLedgerId: `ledger_p1018_${counts.debitCallCount}`,
          idempotentReplay: false,
        };
      },
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/supabase.ts"), {
    namedExports: {
      isSupabaseAdminConfigured: () => false,
      warnSupabaseAdminConfig: () => {},
      supabase: () => createSupabaseMock(),
      supabaseAdmin: () => createSupabaseMock(),
    },
  });

  mock.module(fileUrl("apps/dmit-api/src/gateway/trialQuotaGuard.ts"), {
    namedExports: {
      TRIAL_QUOTA_ERROR_CODES: new Set([
        "quota_exceeded",
        "daily_limit_exceeded",
        "monthly_limit_exceeded",
        "trial_limit_exceeded",
        "trial_model_not_allowed",
      ]),
      assertTrialQuotaGuards: async () => {},
      logCommercialRequestTrace: () => {},
      parseTrialAllowedModels: () => [],
      isModelAllowedForTrial: () => true,
    },
  });

  // Stub DB-backed asserts; unlimited off for debit proofs.
  mock.module(fileUrl("apps/dmit-api/src/gateway/keySafetyLimits.ts"), {
    namedExports: {
      resolveMaxOutputTokens: (requested: number | undefined | null) => {
        if (
          requested === undefined ||
          requested === null ||
          !Number.isFinite(requested)
        ) {
          return 4096;
        }
        const n = Math.trunc(requested);
        return n > 0 ? Math.min(n, 8192) : 4096;
      },
      isUnlimitedBillingUser: () => false,
      logUnlimitedBillingGranted: () => {},
      assertCreditPeriodLimits: async () => {},
      assertTokenBudget: async () => {},
    },
  });

  // Default single primary; tests may override via resetScenario({ providers }).
  mock.module(fileUrl("apps/dmit-api/src/upstream/providers.ts"), {
    namedExports: {
      resolveProviderAttempts: (_model: string) => {
        if (fixedProviders) return fixedProviders;
        return defaultProviders(["grsai-primary"]);
      },
      getProviderById: (id: string) =>
        defaultProviders([id])[0] ?? undefined,
      listProviders: () => defaultProviders(["grsai-primary"]),
      listEnabledProviders: () => defaultProviders(["grsai-primary"]),
      describeProviders: () => [],
    },
  });

  // Optional short budgets for repair timeout proof (scenario E).
  mock.module(fileUrl("apps/dmit-api/src/lib/upstreamTimeoutPolicy.ts"), {
    namedExports: {
      UPSTREAM_TIMEOUT_DEFAULTS: {
        chat: 60_000,
        streamIdle: 60_000,
        responses: 60_000,
        heavy: 180_000,
      },
      isHeavyResponsesModel: () => false,
      isSlowChatGemini3Model: () => false,
      hasHeavyBodySignals: () => false,
      resolveUpstreamTimeoutPolicy: () => {
        const o = timeoutPolicyOverride;
        return {
          tier: "standard",
          isHeavy: false,
          upstreamTimeoutMs: o?.upstreamTimeoutMs ?? 60_000,
          idleTimeoutMs: o?.idleTimeoutMs ?? 60_000,
          totalTimeoutMs: o?.totalTimeoutMs ?? 60_000,
          reason: o ? "p1018_timeout_override" : "p1018_default",
        };
      },
    },
  });

  // Mocked providerFetch boundary (no network). Fallback eligibility mirrored
  // from production grsai.ts P1017 list for realistic attempt chaining.
  mock.module(fileUrl("apps/dmit-api/src/upstream/grsai.ts"), {
    namedExports: {
      isChatFallbackEligible: (err: any) => {
        const code = err?.code;
        if (
          !code ||
          code === "upstream_auth_error" ||
          code === "insufficient_credits"
        ) {
          return false;
        }
        if (code === "upstream_error") {
          return (err.upstreamStatus ?? 502) >= 500;
        }
        return [
          "upstream_model_busy",
          "upstream_model_unavailable",
          "model_not_available",
          "model_not_supported",
          "upstream_timeout",
          "upstream_rate_limited",
          "tool_call_not_generated",
          "provider_tool_call_not_supported",
          "tool_intent_not_generated",
          "required_tool_call_missing",
          "tool_emulation_unavailable",
          "tool_intent_invalid_json",
        ].includes(code);
      },
      providerFetch: async (
        provider: { id: string },
        _path: string,
        options: {
          json?: Record<string, unknown>;
          timeoutMs?: number;
          idleTimeoutMs?: number;
        } = {},
        logContext: { model?: string } = {}
      ) => {
        const errorsMod = await import(errorsUrl);
        counts.providerCallCount += 1;
        counts.lastProviderIds.push(provider.id);
        if (typeof options.timeoutMs === "number") {
          counts.fetchTimeoutMs.push(options.timeoutMs);
        }
        if (
          counts.lastProviderIds.length >= 2 &&
          counts.lastProviderIds[counts.lastProviderIds.length - 1] !==
            counts.lastProviderIds[counts.lastProviderIds.length - 2]
        ) {
          counts.fallbackCount += 1;
        }

        const json = (options.json ?? {}) as Record<string, unknown>;
        const messages = Array.isArray(json.messages) ? json.messages : [];
        const flat = messages
          .map((m) => {
            if (!m || typeof m !== "object") return "";
            const c = (m as { content?: unknown }).content;
            return typeof c === "string" ? c : JSON.stringify(c ?? "");
          })
          .join("\n");
        const hasCompiler = flat.includes(EMULATED_MARKER);
        const isRepair = flat.includes(REPAIR_MARKER);
        if (hasCompiler) counts.compilerSeenCount += 1;
        if (isRepair) counts.repairCallCount += 1;

        const script =
          providerScripts[providerScriptIndex] ??
          providerScripts[providerScripts.length - 1];
        if (!script) {
          throw new Error("P1018 harness: no provider script configured");
        }
        if (providerScriptIndex < providerScripts.length - 1) {
          providerScriptIndex += 1;
        }

        const reply = await script({
          providerId: provider.id,
          attemptModel:
            typeof logContext.model === "string" ? logContext.model : null,
          json,
          callIndex: counts.providerCallCount,
          isRepair,
          hasCompiler,
        });

        if (reply.delayMs && reply.delayMs > 0) {
          await new Promise((r) => setTimeout(r, reply.delayMs));
        }

        if (reply.kind === "error") {
          throw makeApiError(errorsMod, reply);
        }
        return {
          data: completionBody(reply),
          upstreamId: `up_p1018_${counts.providerCallCount}`,
        };
      },
      grsaiFetch: async () => {
        throw new Error("grsaiFetch must not be called in P1018");
      },
      mapUpstreamError: () => {
        throw new Error("mapUpstreamError must not be called in P1018");
      },
    },
  });
}

function createSupabaseMock() {
  return {
    from: (table: string) => {
      // profiles: credit precheck only
      if (table === "profiles") {
        const chain: any = {
          select: () => chain,
          eq: () => chain,
          maybeSingle: async () => ({
            data: { credits_balance: 1000 },
            error: null,
          }),
        };
        return chain;
      }
      // models / pricing / etc.: force static catalog fallback (no DB truth).
      const empty: any = {
        select: () => empty,
        insert: async () => {
          counts.usageLogInsertCount += 1;
          return { error: null };
        },
        update: () => empty,
        eq: () => empty,
        gte: () => empty,
        gt: () => empty,
        limit: () => empty,
        order: () => empty,
        maybeSingle: async () => ({ data: null, error: null }),
        then: undefined,
      };
      // Make thenable queries resolve to empty list / error so catalog falls back.
      empty.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(
          resolve({ data: null, error: { message: "p1018_no_db" } })
        );
      return empty;
    },
    rpc: async () => ({ data: null, error: null }),
  };
}

export function makeToolCallIntent(
  name: string,
  args: Record<string, unknown>
): string {
  return JSON.stringify({
    type: "tool_call",
    tool_calls: [{ name, arguments: args }],
  });
}

export function makeAssistantTextIntent(content: string): string {
  return JSON.stringify({ type: "assistant_text", content });
}

export function makeParallelToolCallIntent(): string {
  return JSON.stringify({
    type: "tool_call",
    tool_calls: [
      { name: "get_weather", arguments: { city: "Shanghai" } },
      { name: "get_time", arguments: { tz: "Asia/Shanghai" } },
    ],
  });
}

/** OpenAI-native message.tool_calls payload for gpt-5.5 / gpt-5.4 mocks. */
export function makeNativeToolCalls(
  name: string,
  args: Record<string, unknown>,
  id = `call_native_${name}`
): NonNullable<Extract<ProviderReply, { kind: "completion" }>["tool_calls"]> {
  return [
    {
      id,
      type: "function",
      function: {
        name,
        arguments: JSON.stringify(args),
      },
    },
  ];
}

export function nativeToolCompletion(
  name: string,
  args: Record<string, unknown>,
  opts?: { model?: string; id?: string }
): Extract<ProviderReply, { kind: "completion" }> {
  return {
    kind: "completion",
    content: null,
    tool_calls: makeNativeToolCalls(name, args, opts?.id),
    finish_reason: "tool_calls",
    ...(opts?.model ? { model: opts.model } : {}),
  };
}

export async function loadExecuteChatCompletion() {
  return import(fileUrl("apps/dmit-api/src/lib/executeChatCompletion.ts"));
}

export async function loadChatRoutes() {
  const mod = await import(fileUrl("apps/dmit-api/src/routes/chat.ts"));
  const { errorHandler } = await import(
    fileUrl("apps/dmit-api/src/middleware/error.ts")
  );
  mod.chatRoutes.onError(errorHandler);
  return mod.chatRoutes;
}

export async function loadRespondEarlySse() {
  return import(fileUrl("apps/dmit-api/src/lib/respondEarlySse.ts"));
}

export function defaultProviders(ids: string[] = ["grsai-primary"]) {
  return ids.map((id, i) => ({
    id,
    label: id,
    baseUrl: `https://${id}.p1018.test`,
    apiKey: `key-${id}`,
    chatPath: "/v1/chat/completions",
    enabled: true,
    priority: i + 1,
    weight: 100,
    timeoutMs: 30_000,
    supportedModels: "*" as const,
  }));
}

export type AssertMeta = {
  providerCallCount: number;
  repairCallCount: number;
  fallbackCount: number;
  debitCallCount: number;
  billing_status?: string | null;
  credits_charged?: number | null;
  httpStatus?: number | null;
  errorCode?: string | null;
  [k: string]: unknown;
};

export function billingSnapshot(
  result: any,
  httpStatus?: number
): AssertMeta {
  const c = getCounts();
  if (result?.ok) {
    const tokfai = (result.response as any)?.tokfai ?? {};
    return {
      providerCallCount: c.providerCallCount,
      repairCallCount: c.repairCallCount,
      fallbackCount: c.fallbackCount,
      debitCallCount: c.debitCallCount,
      billing_status: tokfai.billing_status ?? null,
      credits_charged:
        typeof result.creditsCharged === "number"
          ? result.creditsCharged
          : Number((result.response as any)?.credits_charged ?? 0),
      httpStatus: httpStatus ?? 200,
      errorCode: null,
      compilerSeenCount: c.compilerSeenCount,
      lastProviderIds: c.lastProviderIds,
    };
  }
  return {
    providerCallCount: c.providerCallCount,
    repairCallCount: c.repairCallCount,
    fallbackCount: c.fallbackCount,
    debitCallCount: c.debitCallCount,
    billing_status: "not_billable",
    credits_charged: 0,
    httpStatus: httpStatus ?? result?.httpStatus ?? null,
    errorCode: result?.errorCode ?? null,
    compilerSeenCount: c.compilerSeenCount,
    lastProviderIds: c.lastProviderIds,
  };
}
