/**
 * P1067 — REAL HTTP ENTRY harness for Azure OpenAI Cursor ingress.
 *
 * HTTP → azureOpenAiRoutes / chatRoutes → runChatCompletionsHttp →
 *   executeChatCompletion → providerFetch / createEarlySseResponse
 *
 * Fake upstream on localhost (no GRSAI, no real debit).
 * Auth uses REAL azureAuth / chatAuth with mocked verifyApiKeyToken.
 *
 *   npx tsx scripts/p1067-cursor-azure-ingress-real-entry.mts
 *
 * Marker: TOKFAI_P1067_CURSOR_AZURE_INGRESS_PASS
 */

import { spawnSync } from "node:child_process";
import http from "node:http";
import { mock } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Writable } from "node:stream";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const PASS = "TOKFAI_P1067_CURSOR_AZURE_INGRESS_PASS";
const FAIL = "TOKFAI_P1067_CURSOR_AZURE_INGRESS_FAIL";
const fileUrl = (rel: string) => pathToFileURL(join(ROOT, rel)).href;

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

let uncaughtExceptionCount = 0;
let unhandledRejectionCount = 0;
let errInvalidStateCount = 0;
const processErrors: string[] = [];
let observeProcessFaults = false;

function noteProcessFault(kind: string, err: unknown) {
  const text =
    err instanceof Error
      ? `${err.name}: ${err.message}\n${err.stack ?? ""}`
      : String(err);
  processErrors.push(`${kind}: ${text.slice(0, 500)}`);
  if (
    (kind === "uncaughtException" || kind === "unhandledRejection") &&
    (text.includes("ERR_INVALID_STATE") || text.includes("Invalid state"))
  ) {
    errInvalidStateCount += 1;
  }
}

function installProcessFaultObservers() {
  observeProcessFaults = true;
  process.on("uncaughtException", (err) => {
    if (!observeProcessFaults) return;
    uncaughtExceptionCount += 1;
    noteProcessFault("uncaughtException", err);
  });
  process.on("unhandledRejection", (err) => {
    if (!observeProcessFaults) return;
    unhandledRejectionCount += 1;
    noteProcessFault("unhandledRejection", err);
  });
}

type UpstreamMode = "normal" | "destroy" | "hang" | "capture";

let upstreamMode: UpstreamMode = "normal";
let lastUpstreamRawBody = "";
let lastUpstreamParsed: Record<string, unknown> | null = null;
let upstreamHitCount = 0;
const upstreamSockets = new Set<import("node:net").Socket>();

const upstreamServer = http.createServer((req, res) => {
  upstreamHitCount += 1;
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
  req.on("end", () => {
    lastUpstreamRawBody = Buffer.concat(chunks).toString("utf8");
    try {
      lastUpstreamParsed = JSON.parse(lastUpstreamRawBody) as Record<
        string,
        unknown
      >;
    } catch {
      lastUpstreamParsed = null;
    }

    if (upstreamMode === "destroy") {
      req.socket.destroy();
      return;
    }
    if (upstreamMode === "hang") {
      return;
    }

    const model =
      typeof lastUpstreamParsed?.model === "string"
        ? lastUpstreamParsed.model
        : "gpt-5.5";
    const body = JSON.stringify({
      id: "chatcmpl-p1067",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "P1067_NORMAL_OK" },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        total_tokens: 15,
      },
    });
    res.writeHead(200, {
      "content-type": "application/json",
      "content-length": Buffer.byteLength(body),
      "x-request-id": `fake-up-${upstreamHitCount}`,
    });
    res.end(body);
  });
});

upstreamServer.on("connection", (socket) => {
  upstreamSockets.add(socket);
  socket.on("close", () => upstreamSockets.delete(socket));
});

await new Promise<void>((resolve) => {
  upstreamServer.listen(0, "127.0.0.1", () => resolve());
});
const upstreamAddr = upstreamServer.address();
if (!upstreamAddr || typeof upstreamAddr === "string") {
  throw new Error("failed to bind fake upstream");
}
const UPSTREAM_BASE = `http://127.0.0.1:${upstreamAddr.port}`;

function destroyHungUpstreamSockets() {
  for (const s of [...upstreamSockets]) {
    try {
      s.destroy();
    } catch {
      // ignore
    }
  }
}

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role_test_key_p1067xxxxxxxx";
process.env.SUPABASE_JWT_SECRET = "p1067-test-jwt-secret-32chars-min!!";
process.env.TOKEN_PEPPER = "p1067-test-token-pepper-32chars-min!!";
process.env.GRSAI_API_KEY = "p1067-test-grsai-key";
process.env.GRSAI_BASE_URL = UPSTREAM_BASE;
process.env.GRSAI_CHAT_COMPLETIONS_PATH = "/v1/chat/completions";
process.env.STRIPE_SECRET_KEY = "sk_test_p1067_dummy_key_xx";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_p1067_test_only_secret";
process.env.TOKFAI_UPSTREAM_SECONDARY_ENABLED = "false";
process.env.TOKFAI_REDIS_ENABLED = "false";
process.env.TOKFAI_UNLIMITED_BILLING_ENABLED = "false";
process.env.TOKFAI_TRIAL_GUARD_ENABLED = "false";
process.env.TOKFAI_HEAVY_QUEUE_ENABLED = "false";
process.env.LOG_LEVEL = "info";
process.env.TOKFAI_UPSTREAM_TIMEOUT_MS = "8000";

const VALID_KEY = `sk-tokfai_${"a".repeat(48)}`;
const INVALID_KEY = `sk-tokfai_${"b".repeat(48)}`;

const CALLER = {
  apiKeyId: "key-uuid-p1067",
  userId: "user-p1067",
  name: "p1067-test-key",
  keyId: "aaaaaaaaaaaa",
  prefix: "sk-tokfai_aaaaaaaaaaaa…",
  tenantId: null as string | null,
};

const PROD_HEARTBEAT_MS = 10_000;
const CANCEL_WAIT_MS = 2 * PROD_HEARTBEAT_MS + 1_500;

const logLines: Array<Record<string, unknown>> = [];
let debitCallCount = 0;

function installLogCapture(): void {
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  const tap = (chunk: unknown) => {
    const text =
      typeof chunk === "string"
        ? chunk
        : Buffer.isBuffer(chunk)
          ? chunk.toString("utf8")
          : String(chunk);
    for (const line of text.split("\n")) {
      const t = line.trim();
      if (!t.startsWith("{")) continue;
      try {
        logLines.push(JSON.parse(t) as Record<string, unknown>);
      } catch {
        // ignore
      }
    }
  };
  (process.stdout as Writable).write = ((
    chunk: unknown,
    enc?: unknown,
    cb?: unknown
  ) => {
    tap(chunk);
    return (origOut as Function)(chunk, enc, cb);
  }) as typeof process.stdout.write;
  (process.stderr as Writable).write = ((
    chunk: unknown,
    enc?: unknown,
    cb?: unknown
  ) => {
    tap(chunk);
    return (origErr as Function)(chunk, enc, cb);
  }) as typeof process.stderr.write;
}

function createSupabaseMock() {
  return {
    from: (table: string) => {
      if (table === "profiles") {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.maybeSingle = async () => ({
          data: { credits_balance: 1000 },
          error: null,
        });
        return chain;
      }
      const empty: Record<string, unknown> = {};
      empty.select = () => empty;
      empty.insert = async () => ({ error: null });
      empty.update = () => empty;
      empty.eq = () => empty;
      empty.gte = () => empty;
      empty.gt = () => empty;
      empty.limit = () => empty;
      empty.order = () => empty;
      empty.maybeSingle = async () => ({ data: null, error: null });
      empty.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(
          resolve({ data: null, error: { message: "p1067_no_db" } })
        );
      return empty;
    },
    rpc: async () => ({ data: null, error: null }),
  };
}

console.log("P1067: installing auth/billing mocks…");

const { ApiError } = await import(fileUrl("apps/dmit-api/src/errors.ts"));

mock.module(fileUrl("apps/dmit-api/src/auth/apiKey.ts"), {
  namedExports: {
    isValidApiKeyFormat: (raw: string) =>
      typeof raw === "string" && /^sk-tokfai_[0-9a-f]{48}$/.test(raw),
    verifyApiKeyToken: async (raw: string) => {
      if (raw !== VALID_KEY) {
        throw ApiError.unauthorized(
          "API key not recognised.",
          "invalid_token"
        );
      }
      return { ...CALLER };
    },
    generateApiKey: () => {
      throw new Error("p1067: generateApiKey unused");
    },
    maskTokenPrefix: (raw: string) =>
      raw.length <= 14 ? `${raw.slice(0, 6)}…` : `${raw.slice(0, 14)}…`,
    maskApiKeyId: (id: string) =>
      id.length <= 8 ? `${id.slice(0, 4)}…` : `${id.slice(0, 6)}…`,
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
    recordSuccessfulUsageAndDebit: async () => {
      debitCallCount += 1;
      return {
        balanceAfter: 999,
        debitLedgerId: "ledger_p1067_spy",
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
    supabaseAuth: () => createSupabaseMock(),
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

type CaseEvidence = {
  executeChatCompletion: boolean;
  providerFetch: boolean;
  createEarlySseResponse: boolean;
  authExecuted: boolean;
  azureIngress: boolean;
  normalizedModel: string | null;
  azureDeployment: string | null;
  upstreamHits: number;
  logSliceStart: number;
};

function beginEvidence(): CaseEvidence {
  return {
    executeChatCompletion: false,
    providerFetch: false,
    createEarlySseResponse: false,
    authExecuted: false,
    azureIngress: false,
    normalizedModel: null,
    azureDeployment: null,
    upstreamHits: upstreamHitCount,
    logSliceStart: logLines.length,
  };
}

function finalizeEvidence(
  ev: CaseEvidence,
  opts?: { sseResponse?: boolean }
): CaseEvidence {
  const slice = logLines.slice(ev.logSliceStart);
  const msgs = slice.map((l) => String(l.msg ?? ""));
  const execHit = msgs.some(
    (m) =>
      m === "chat_completion_succeeded" ||
      m === "chat_completion_failed" ||
      m === "chat_request_capability" ||
      m === "chat_provider_attempt_budget" ||
      m === "provider_fetch_stage_timing" ||
      m === "model_resolved"
  );
  const fetchHit =
    upstreamHitCount > ev.upstreamHits ||
    msgs.some(
      (m) =>
        m === "upstream_provider_failed" ||
        m === "upstream_provider_timeout" ||
        m === "upstream_provider_transport_failed" ||
        m === "chat_provider_attempt_budget" ||
        m === "provider_fetch_stage_timing"
    );
  const sseHit =
    opts?.sseResponse === true ||
    msgs.some(
      (m) =>
        m === "early_sse_terminal" ||
        m === "early_sse_heartbeat_skipped_terminal" ||
        m === "cursor_tool_sse_completed"
    );
  const azureLog = slice.find((l) => l.msg === "azure_openai_ingress");
  return {
    executeChatCompletion: execHit,
    providerFetch: fetchHit,
    createEarlySseResponse: sseHit,
    authExecuted: true,
    azureIngress: Boolean(azureLog),
    normalizedModel:
      typeof azureLog?.normalizedModel === "string"
        ? azureLog.normalizedModel
        : null,
    azureDeployment:
      typeof azureLog?.azureDeployment === "string"
        ? azureLog.azureDeployment
        : null,
    upstreamHits: upstreamHitCount - ev.upstreamHits,
    logSliceStart: ev.logSliceStart,
  };
}

console.log("P1067: loading production azure + chat routes…");
const importTimer = setTimeout(() => {
  console.error("P1067: route import timed out");
  process.exit(2);
}, 20_000);

const { azureOpenAiRoutes } = await import(
  fileUrl("apps/dmit-api/src/routes/azureOpenAi.ts")
);
const { chatRoutes } = await import(fileUrl("apps/dmit-api/src/routes/chat.ts"));
const { errorHandler } = await import(
  fileUrl("apps/dmit-api/src/middleware/error.ts")
);
const { requestIdMiddleware } = await import(
  fileUrl("apps/dmit-api/src/middleware/requestId.ts")
);
const { Hono } = await import(
  pathToFileURL(join(ROOT, "apps/dmit-api/node_modules/hono/dist/index.js")).href
);
clearTimeout(importTimer);

const app = new Hono();
app.use("*", requestIdMiddleware);
app.route("/", chatRoutes);
app.route("/", azureOpenAiRoutes);
app.onError(errorHandler);
console.log("P1067: app ready");

installLogCapture();

const tokfaiServer = http.createServer(async (req, res) => {
  try {
    const host = req.headers.host ?? "127.0.0.1";
    const url = `http://${host}${req.url ?? "/"}`;
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") headers.set(k, v);
      else if (Array.isArray(v)) headers.set(k, v.join(","));
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const raw = Buffer.concat(chunks);
    const request = new Request(url, {
      method: req.method,
      headers,
      body:
        req.method === "GET" || req.method === "HEAD"
          ? undefined
          : raw.length
            ? raw
            : undefined,
    });
    const response = await app.fetch(request);
    const outHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      outHeaders[key] = value;
    });
    res.writeHead(response.status, outHeaders);
    if (!response.body) {
      res.end();
      return;
    }
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    noteProcessFault("tokfai_http_adapter", err);
    if (!res.headersSent) res.writeHead(500);
    res.end("internal");
  }
});
await new Promise<void>((resolve, reject) => {
  tokfaiServer.once("error", reject);
  tokfaiServer.listen(0, "127.0.0.1", () => resolve());
});
const tokfaiAddr = tokfaiServer.address();
if (!tokfaiAddr || typeof tokfaiAddr === "string") {
  throw new Error("failed to bind tokfai test server");
}
const TOKFAI_BASE = `http://127.0.0.1:${tokfaiAddr.port}`;
installProcessFaultObservers();
console.log(`P1067: Tokfai listening on ${TOKFAI_BASE}`);
console.log(`P1067: fake upstream on ${UPSTREAM_BASE}`);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const AZURE_PATH =
  "/v1/openai/deployments/GPT-5.4/chat/completions?api-version=2024-12-01-preview";

async function postAzure(
  body: Record<string, unknown>,
  opts?: {
    signal?: AbortSignal;
    headers?: Record<string, string>;
    deployment?: string;
  }
): Promise<Response> {
  const deployment = opts?.deployment ?? "GPT-5.4";
  const path = `/v1/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=2024-12-01-preview`;
  return fetch(`${TOKFAI_BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Cursor/1.0",
      "api-key": VALID_KEY,
      ...(opts?.headers ?? {}),
    },
    body: JSON.stringify(body),
    signal: opts?.signal,
  });
}

async function postChat(
  body: Record<string, unknown>,
  opts?: { signal?: AbortSignal; headers?: Record<string, string> }
): Promise<Response> {
  return fetch(`${TOKFAI_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${VALID_KEY}`,
      ...(opts?.headers ?? {}),
    },
    body: JSON.stringify(body),
    signal: opts?.signal,
  });
}

function makeCursorTools(count: number) {
  const tools = [];
  for (let i = 0; i < count; i++) {
    tools.push({
      type: "function",
      function: {
        name: i === 0 ? "Read" : i === 1 ? "Write" : `CursorTool_${i}`,
        description: `Cursor agent tool ${i} schema for real-entry payload`,
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: `path ${i}` },
            query: { type: "string", description: `query ${i}` },
            nested: {
              type: "object",
              properties: { a: { type: "string" }, b: { type: "number" } },
            },
          },
          required: ["path"],
          additionalProperties: false,
        },
      },
    });
  }
  return tools;
}

let failed = 0;
const casePass: Record<string, boolean> = {};

function passCase(id: string, marker: string, meta: Record<string, unknown>) {
  casePass[id] = true;
  console.log(`PASS  ${marker}`);
  console.log(
    JSON.stringify({ CASE: id, TYPE: "REAL_ENTRY_TEST", ...meta }, null, 2)
  );
}
function failCase(id: string, marker: string, detail: string) {
  failed += 1;
  casePass[id] = false;
  console.error(`FAIL  ${marker} — ${detail}`);
}

function classify(ev: CaseEvidence, extra: Record<string, unknown> = {}) {
  return {
    TYPE: "REAL_ENTRY_TEST",
    HTTP_ENTRY_EXECUTED: true,
    AUTH_EXECUTED: ev.authExecuted,
    EXECUTE_CHAT_COMPLETION_EXECUTED: ev.executeChatCompletion,
    PROVIDER_FETCH_EXECUTED: ev.providerFetch,
    EARLY_SSE_EXECUTED: ev.createEarlySseResponse,
    AZURE_INGRESS: ev.azureIngress,
    NORMALIZED_MODEL: ev.normalizedModel,
    AZURE_DEPLOYMENT: ev.azureDeployment,
    UPSTREAM_HITS: ev.upstreamHits,
    ...extra,
  };
}

console.log("P1067 CURSOR AZURE INGRESS REAL ENTRY\n");
console.log(`AZURE_PATH=${AZURE_PATH}`);

// ── CASE A — api-key, messages only, no model ─────────────────────────────
{
  const ev0 = beginEvidence();
  upstreamMode = "normal";
  const res = await postAzure({
    messages: [{ role: "user", content: "ping p1067 A" }],
  });
  const json = (await res.json()) as any;
  const content = json?.choices?.[0]?.message?.content;
  const ev = finalizeEvidence(ev0);
  const ok =
    res.status === 200 &&
    content === "P1067_NORMAL_OK" &&
    ev.executeChatCompletion &&
    ev.providerFetch &&
    ev.azureIngress &&
    ev.normalizedModel === "gpt-5.4" &&
    ev.azureDeployment === "GPT-5.4";
  if (ok) {
    passCase("A", "CASE_A_AZURE_API_KEY_MESSAGES_ONLY_PASS", classify(ev));
  } else {
    failCase(
      "A",
      "CASE_A_AZURE_API_KEY_MESSAGES_ONLY_PASS",
      JSON.stringify({ status: res.status, content, ev })
    );
  }
}

// ── CASE B — stream=true → createEarlySseResponse ─────────────────────────
{
  const ev0 = beginEvidence();
  upstreamMode = "normal";
  const res = await postAzure({
    messages: [{ role: "user", content: "ping p1067 B stream" }],
    stream: true,
  });
  const text = await res.text();
  const sse = (res.headers.get("content-type") ?? "").includes(
    "text/event-stream"
  );
  const doneCount = (text.match(/data:\s*\[DONE\]/gi) ?? []).length;
  const ev = finalizeEvidence(ev0, { sseResponse: sse });
  const ok =
    res.status === 200 &&
    sse &&
    doneCount === 1 &&
    ev.executeChatCompletion &&
    ev.providerFetch &&
    ev.createEarlySseResponse &&
    ev.normalizedModel === "gpt-5.4";
  if (ok) {
    passCase(
      "B",
      "CASE_B_AZURE_EARLY_SSE_PASS",
      classify(ev, { doneCount, sseBytes: text.length })
    );
  } else {
    failCase(
      "B",
      "CASE_B_AZURE_EARLY_SSE_PASS",
      JSON.stringify({
        status: res.status,
        sse,
        doneCount,
        ev,
        snippet: text.slice(0, 300),
      })
    );
  }
}

// ── CASE C — 20 tools preserved to upstream ───────────────────────────────
{
  const ev0 = beginEvidence();
  upstreamMode = "capture";
  lastUpstreamParsed = null;
  const tools = makeCursorTools(20);
  const res = await postAzure({
    messages: [{ role: "user", content: "ping p1067 C tools" }],
    tools,
    tool_choice: "auto",
    parallel_tool_calls: true,
  });
  await res.text();
  const upTools = Array.isArray(lastUpstreamParsed?.tools)
    ? (lastUpstreamParsed!.tools as unknown[])
    : [];
  const ev = finalizeEvidence(ev0);
  const ok =
    res.status === 200 &&
    upTools.length === 20 &&
    ev.providerFetch &&
    ev.executeChatCompletion;
  if (ok) {
    passCase(
      "C",
      "CASE_C_AZURE_TOOLS_20_PRESERVED_PASS",
      classify(ev, { upstreamToolCount: upTools.length })
    );
  } else {
    failCase(
      "C",
      "CASE_C_AZURE_TOOLS_20_PRESERVED_PASS",
      JSON.stringify({
        status: res.status,
        upstreamToolCount: upTools.length,
        ev,
      })
    );
  }
  upstreamMode = "normal";
}

// ── CASE D — invalid api-key → 401, no provider, no billing ───────────────
{
  const ev0 = beginEvidence();
  const beforeHits = upstreamHitCount;
  const beforeDebit = debitCallCount;
  upstreamMode = "normal";
  const res = await postAzure(
    { messages: [{ role: "user", content: "ping p1067 D" }] },
    { headers: { "api-key": INVALID_KEY } }
  );
  const json = (await res.json()) as any;
  const code = json?.error?.code ?? json?.code;
  const ev = finalizeEvidence(ev0);
  const ok =
    res.status === 401 &&
    upstreamHitCount === beforeHits &&
    debitCallCount === beforeDebit &&
    !ev.providerFetch;
  if (ok) {
    passCase(
      "D",
      "CASE_D_INVALID_API_KEY_401_PASS",
      classify(ev, {
        status: res.status,
        code,
        debitCallCountDelta: debitCallCount - beforeDebit,
        upstreamHitDelta: upstreamHitCount - beforeHits,
      })
    );
  } else {
    failCase(
      "D",
      "CASE_D_INVALID_API_KEY_401_PASS",
      JSON.stringify({
        status: res.status,
        code,
        debitDelta: debitCallCount - beforeDebit,
        hitDelta: upstreamHitCount - beforeHits,
        ev,
      })
    );
  }
}

// ── CASE E — Authorization Bearer on Azure path still works ───────────────
{
  const ev0 = beginEvidence();
  upstreamMode = "normal";
  const resBearer = await fetch(
    `${TOKFAI_BASE}/v1/openai/deployments/GPT-5.4/chat/completions?api-version=2024-12-01-preview`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Cursor/1.0",
        authorization: `Bearer ${VALID_KEY}`,
      },
      body: JSON.stringify({
        messages: [{ role: "user", content: "ping p1067 E bearer" }],
      }),
    }
  );
  const json = (await resBearer.json()) as any;
  const ev = finalizeEvidence(ev0);
  const ok =
    resBearer.status === 200 &&
    json?.choices?.[0]?.message?.content === "P1067_NORMAL_OK" &&
    ev.executeChatCompletion &&
    ev.providerFetch;
  if (ok) {
    passCase("E", "CASE_E_AZURE_BEARER_AUTH_PASS", classify(ev));
  } else {
    failCase(
      "E",
      "CASE_E_AZURE_BEARER_AUTH_PASS",
      JSON.stringify({ status: resBearer.status, json, ev })
    );
  }
}

// ── CASE F — original /v1/chat/completions unchanged ──────────────────────
{
  const ev0 = beginEvidence();
  upstreamMode = "normal";
  const res = await postChat({
    model: "gpt-5.5",
    messages: [{ role: "user", content: "ping p1067 F chat" }],
  });
  const json = (await res.json()) as any;
  const ev = finalizeEvidence(ev0);
  const ok =
    res.status === 200 &&
    json?.choices?.[0]?.message?.content === "P1067_NORMAL_OK" &&
    ev.executeChatCompletion &&
    ev.providerFetch &&
    !ev.azureIngress;
  if (ok) {
    passCase("F", "CASE_F_EXISTING_CHAT_ROUTE_UNCHANGED_PASS", classify(ev));
  } else {
    failCase(
      "F",
      "CASE_F_EXISTING_CHAT_ROUTE_UNCHANGED_PASS",
      JSON.stringify({ status: res.status, ev, json })
    );
  }
}

// ── CASE G — mixed-case deployment GPT-5.4 → gpt-5.4 ─────────────────────
{
  const ev0 = beginEvidence();
  upstreamMode = "normal";
  const res = await postAzure(
    {
      // Conflicting body.model must NOT win over deployment.
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "ping p1067 G case" }],
    },
    { deployment: "GPT-5.4" }
  );
  const json = (await res.json()) as any;
  const ev = finalizeEvidence(ev0);
  const ok =
    res.status === 200 &&
    json?.choices?.[0]?.message?.content === "P1067_NORMAL_OK" &&
    ev.normalizedModel === "gpt-5.4" &&
    ev.azureDeployment === "GPT-5.4";
  if (ok) {
    passCase(
      "G",
      "CASE_G_DEPLOYMENT_MIXED_CASE_PASS",
      classify(ev, { bodyModelIgnored: "gpt-4o-mini" })
    );
  } else {
    failCase(
      "G",
      "CASE_G_DEPLOYMENT_MIXED_CASE_PASS",
      JSON.stringify({ status: res.status, ev })
    );
  }
}

// ── CASE H — transport socket failure → 502 upstream_transport_error ──────
// Use a single-attempt concrete model (gpt-5.5) so alias exhaustion does not
// remap the preserved upstream_transport_error into all_upstreams_unavailable.
{
  const ev0 = beginEvidence();
  upstreamMode = "destroy";
  const res = await postAzure(
    {
      messages: [{ role: "user", content: "ping p1067 H transport" }],
    },
    { deployment: "gpt-5.5" }
  );
  const json = (await res.json()) as any;
  const code = json?.error?.code ?? json?.code;
  const ev = finalizeEvidence(ev0);
  const transportLog = logLines
    .slice(ev0.logSliceStart)
    .some(
      (l) =>
        l.msg === "upstream_provider_transport_failed" ||
        l.upstreamErrorCode === "upstream_transport_error"
    );
  const ok =
    res.status === 502 &&
    code === "upstream_transport_error" &&
    transportLog &&
    ev.executeChatCompletion;
  if (ok) {
    passCase(
      "H",
      "CASE_H_TRANSPORT_502_PASS",
      classify(ev, { status: res.status, code, transportLog })
    );
  } else {
    failCase(
      "H",
      "CASE_H_TRANSPORT_502_PASS",
      JSON.stringify({ status: res.status, code, transportLog, ev, json })
    );
  }
  destroyHungUpstreamSockets();
  upstreamMode = "normal";
}

// ── CASE I — SSE client cancel survival ───────────────────────────────────
{
  const ev0 = beginEvidence();
  upstreamMode = "hang";
  const beforeUncaught = uncaughtExceptionCount;
  const beforeUnhandled = unhandledRejectionCount;
  const beforeInvalid = errInvalidStateCount;
  const ac = new AbortController();

  console.log(
    `P1067: CASE I cancel wait ${CANCEL_WAIT_MS}ms (2× prod heartbeat + margin)`
  );

  const resPromise = postAzure(
    {
      stream: true,
      messages: [{ role: "user", content: "ping p1067 I stream" }],
    },
    { signal: ac.signal }
  );

  let firstFrame = "";
  let gotFrame = false;
  let sseContentType = false;
  try {
    const res = await resPromise;
    sseContentType = (res.headers.get("content-type") ?? "").includes(
      "text/event-stream"
    );
    if (res.body) {
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      const { value } = await reader.read();
      firstFrame = value ? dec.decode(value) : "";
      gotFrame =
        firstFrame.includes('"role"') ||
        firstFrame.includes("delta") ||
        firstFrame.length > 0;
      await reader.cancel();
    }
  } catch (err) {
    if (!(err instanceof Error && err.name === "AbortError")) {
      processErrors.push(`CASE_I_read: ${String(err)}`);
    }
  }
  try {
    ac.abort();
  } catch {
    // ignore
  }

  await sleep(CANCEL_WAIT_MS);
  destroyHungUpstreamSockets();
  await sleep(100);

  upstreamMode = "normal";
  const evRec0 = beginEvidence();
  const recovery = await postAzure({
    messages: [{ role: "user", content: "ping p1067 I recovery" }],
  });
  const recoveryJson = (await recovery.json()) as any;
  const evRec = finalizeEvidence(evRec0);
  const recoveryOk =
    recovery.status === 200 &&
    recoveryJson?.choices?.[0]?.message?.content === "P1067_NORMAL_OK" &&
    evRec.executeChatCompletion &&
    evRec.providerFetch;

  const ev = finalizeEvidence(ev0, { sseResponse: sseContentType || gotFrame });
  const ok =
    gotFrame &&
    sseContentType &&
    recoveryOk &&
    uncaughtExceptionCount === beforeUncaught &&
    unhandledRejectionCount === beforeUnhandled &&
    errInvalidStateCount === beforeInvalid;

  if (ok) {
    passCase(
      "I",
      "CASE_I_SSE_CANCEL_SURVIVAL_PASS",
      classify(ev, {
        firstFrameBytes: firstFrame.length,
        recoveryStatus: recovery.status,
        CANCEL_WAIT_MS,
      })
    );
  } else {
    failCase(
      "I",
      "CASE_I_SSE_CANCEL_SURVIVAL_PASS",
      JSON.stringify({
        gotFrame,
        sseContentType,
        recoveryOk,
        uncaughtExceptionCount,
        errInvalidStateCount,
        unhandledRejectionCount,
        processErrors,
        ev,
      })
    );
  }
}

// ── Summary ───────────────────────────────────────────────────────────────
const cases = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
const passCount = cases.filter((c) => casePass[c]).length;
console.log("\n── P1067 CASE MATRIX ──");
for (const c of cases) {
  console.log(`CASE_${c}=${casePass[c] ? "PASS" : "FAIL"}`);
}
console.log(`REAL_ENTRY_TEST_COUNT=${passCount}/${cases.length}`);

tokfaiServer.close();
upstreamServer.close();

if (failed === 0 && passCount === cases.length) {
  console.log(PASS);
  process.exit(0);
}
console.error(FAIL);
process.exit(1);
