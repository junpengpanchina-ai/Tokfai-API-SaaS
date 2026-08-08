/**
 * P1062R4 — REAL HTTP ENTRY canary for transport + early SSE cancel.
 *
 * HTTP → production chatRoutes → executeChatCompletion → providerFetch
 * Fake upstream on localhost (no GRSAI, no real debit).
 *
 * Auth/billing/db mocked. providerFetch / earlySseStream / executeChatCompletion
 * are the REAL production modules (not reimplemented). Runtime evidence via
 * upstream TCP hits + production log messages + response wire.
 *
 *   npx tsx scripts/p1062r4-real-entry-transport-sse-canary.mts
 *
 * Marker: TOKFAI_P1062R4_REAL_ENTRY_PASS
 */

import { spawnSync } from "node:child_process";
import http from "node:http";
import { mock } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Writable } from "node:stream";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const PASS = "TOKFAI_P1062R4_REAL_ENTRY_PASS";
const FAIL = "TOKFAI_P1062R4_REAL_ENTRY_FAIL";
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

// ── Process-level observers (installed after app bootstrap) ─────────────────
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
  // Only count process-level faults. Production may *log* ERR_INVALID_STATE
  // from the early SSE safeEnqueue guard (early_sse_enqueue_failed) — that is
  // the fix working, not an uncaught crash.
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

// ── Fake upstream (real TCP/HTTP) ──────────────────────────────────────────
type UpstreamMode = "normal" | "http400" | "destroy" | "hang" | "capture";

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
    if (upstreamMode === "http400") {
      const body = JSON.stringify({
        error: {
          message: "request body storage capacity exhausted",
          type: "invalid_request_error",
          code: "invalid_request_error",
        },
      });
      res.writeHead(400, {
        "content-type": "application/json",
        "content-length": Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }

    const model =
      typeof lastUpstreamParsed?.model === "string"
        ? lastUpstreamParsed.model
        : "gpt-5.5";
    const body = JSON.stringify({
      id: "chatcmpl-p1062r4",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "P1062R4_NORMAL_OK" },
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

// ── Env BEFORE production module load ──────────────────────────────────────
process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role_test_key_p1062r4xxxx";
process.env.SUPABASE_JWT_SECRET = "p1062r4-test-jwt-secret-32chars-min!";
process.env.TOKEN_PEPPER = "p1062r4-test-token-pepper-32chars-min!";
process.env.GRSAI_API_KEY = "p1062r4-test-grsai-key";
process.env.GRSAI_BASE_URL = UPSTREAM_BASE;
process.env.GRSAI_CHAT_COMPLETIONS_PATH = "/v1/chat/completions";
process.env.STRIPE_SECRET_KEY = "sk_test_p1062r4_dummy_key_xx";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_p1062r4_test_only_secret";
process.env.TOKFAI_UPSTREAM_SECONDARY_ENABLED = "false";
process.env.TOKFAI_REDIS_ENABLED = "false";
process.env.TOKFAI_UNLIMITED_BILLING_ENABLED = "false";
process.env.TOKFAI_TRIAL_GUARD_ENABLED = "false";
process.env.TOKFAI_HEAVY_QUEUE_ENABLED = "false";
process.env.LOG_LEVEL = "info";
// Short attempt timeout so hang/cancel leftovers finish without long stall.
process.env.TOKFAI_UPSTREAM_TIMEOUT_MS = "8000";

const CALLER = {
  userId: "user-p1062r4",
  apiKeyId: "key-uuid-p1062r4",
  keyId: "abcd1234efgh",
  tenantId: null as string | null,
};

// Production default heartbeat is 10s — wait 2× + margin (do not change prod default).
const PROD_HEARTBEAT_MS = 10_000;
const CANCEL_WAIT_MS = 2 * PROD_HEARTBEAT_MS + 1_500;

const logLines: Array<Record<string, unknown>> = [];

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
    // Do not treat guarded early_sse_enqueue_failed logs as process faults.
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
          resolve({ data: null, error: { message: "p1062r4_no_db" } })
        );
      return empty;
    },
    rpc: async () => ({ data: null, error: null }),
  };
}

console.log("P1062R4: installing auth/billing mocks…");

mock.module(fileUrl("apps/dmit-api/src/middleware/chatAuth.ts"), {
  namedExports: {
    requireApiKeyOrSupabaseJwt: async (c: any, next: any) => {
      c.set("requestId", c.get("requestId") ?? `req_p1062r4_${Date.now()}`);
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
    recordSuccessfulUsageAndDebit: async () => ({
      balanceAfter: 999,
      debitLedgerId: "ledger_p1062r4_spy",
      idempotentReplay: false,
    }),
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

// Runtime call counters via production log msgs (unique to those modules).
type CaseEvidence = {
  executeChatCompletion: boolean;
  providerFetch: boolean;
  createEarlySseResponse: boolean;
  upstreamHits: number;
  logSliceStart: number;
};

function beginEvidence(): CaseEvidence {
  return {
    executeChatCompletion: false,
    providerFetch: false,
    createEarlySseResponse: false,
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
  return {
    executeChatCompletion: execHit,
    providerFetch: fetchHit,
    createEarlySseResponse: sseHit,
    upstreamHits: upstreamHitCount - ev.upstreamHits,
    logSliceStart: ev.logSliceStart,
  };
}

console.log("P1062R4: loading production chatRoutes (real exec/providerFetch/SSE)…");
const importTimer = setTimeout(() => {
  console.error("P1062R4: chatRoutes import timed out");
  process.exit(2);
}, 20_000);
// Import via dmit-api package resolution (hono lives under apps/dmit-api/node_modules).
// Serve the production chatRoutes app directly — still REAL HTTP route entry.
const { chatRoutes } = await import(fileUrl("apps/dmit-api/src/routes/chat.ts"));
const { errorHandler } = await import(
  fileUrl("apps/dmit-api/src/middleware/error.ts")
);
clearTimeout(importTimer);
chatRoutes.onError(errorHandler);
console.log("P1062R4: chat route app ready");

installLogCapture();

// Ephemeral Node HTTP server → production chatRoutes.fetch (real HTTP entry).
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
    const response = await chatRoutes.fetch(request);
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
console.log(`P1062R4: Tokfai listening on ${TOKFAI_BASE}`);
console.log(`P1062R4: fake upstream on ${UPSTREAM_BASE}`);

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function postChat(
  body: Record<string, unknown>,
  opts?: { signal?: AbortSignal }
): Promise<Response> {
  return fetch(`${TOKFAI_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: "Bearer sk-tokfai_p1062r4_test_dummy_key",
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
  // Keep TYPE reserved for REAL_ENTRY_TEST; put error type in ERROR_TYPE.
  const { TYPE: errorType, ...rest } = extra as {
    TYPE?: unknown;
    [k: string]: unknown;
  };
  return {
    TYPE: "REAL_ENTRY_TEST",
    HTTP_ENTRY_EXECUTED: true,
    EXECUTE_CHAT_COMPLETION_EXECUTED: ev.executeChatCompletion,
    PROVIDER_FETCH_EXECUTED: ev.providerFetch,
    EARLY_SSE_EXECUTED: ev.createEarlySseResponse,
    REAL_SOCKET_USED: true,
    UPSTREAM_HITS: ev.upstreamHits,
    PRODUCTION_SYMBOLS: {
      executeChatCompletion: ev.executeChatCompletion,
      providerFetch: ev.providerFetch,
      createEarlySseResponse: ev.createEarlySseResponse,
    },
    ...rest,
    ...(errorType !== undefined ? { ERROR_TYPE: errorType } : {}),
  };
}

console.log("P1062R4 REAL ENTRY TRANSPORT/SSE CANARY\n");

// ── CASE A ─────────────────────────────────────────────────────────────────
{
  const ev0 = beginEvidence();
  upstreamMode = "normal";
  const res = await postChat({
    model: "gpt-5.5",
    stream: false,
    messages: [{ role: "user", content: "ping p1062r4 A" }],
  });
  const json = (await res.json()) as any;
  const content = json?.choices?.[0]?.message?.content;
  const ev = finalizeEvidence(ev0, { sseResponse: false });
  const ct = res.headers.get("content-type") ?? "";
  const ok =
    res.status === 200 &&
    content === "P1062R4_NORMAL_OK" &&
    ev.executeChatCompletion &&
    ev.providerFetch &&
    !ct.includes("text/event-stream") &&
    !ev.createEarlySseResponse &&
    (json?.error?.code ?? null) !== "upstream_transport_error";
  if (ok) {
    passCase(
      "A",
      "CASE_A_REAL_ENTRY_NORMAL_PASS",
      classify(ev, { STATUS: res.status, content })
    );
  } else {
    failCase(
      "A",
      "CASE_A_REAL_ENTRY_NORMAL_PASS",
      JSON.stringify({ status: res.status, content, ev, ct })
    );
  }
}

// ── CASE B ─────────────────────────────────────────────────────────────────
{
  const ev0 = beginEvidence();
  upstreamMode = "http400";
  const res = await postChat({
    model: "gpt-5.5",
    stream: false,
    messages: [{ role: "user", content: "ping p1062r4 B" }],
  });
  const json = (await res.json()) as any;
  const code = json?.error?.code ?? null;
  const type = json?.error?.type ?? null;
  const ev = finalizeEvidence(ev0);
  console.log(JSON.stringify({ STATUS: res.status, CODE: code, TYPE: type }));
  const ok =
    ev.executeChatCompletion &&
    ev.providerFetch &&
    code !== "upstream_transport_error" &&
    res.status >= 400;
  if (ok) {
    passCase(
      "B",
      "CASE_B_HTTP_400_NOT_TRANSPORT_PASS",
      classify(ev, { STATUS: res.status, CODE: code, TYPE: type })
    );
  } else {
    failCase(
      "B",
      "CASE_B_HTTP_400_NOT_TRANSPORT_PASS",
      JSON.stringify({ status: res.status, code, type, ev })
    );
  }
}

// ── CASE C ─────────────────────────────────────────────────────────────────
{
  const ev0 = beginEvidence();
  upstreamMode = "destroy";
  const beforeUncaught = uncaughtExceptionCount;
  const beforeReject = unhandledRejectionCount;
  const res = await postChat({
    model: "gpt-5.5",
    stream: false,
    messages: [{ role: "user", content: "ping p1062r4 C" }],
  });
  const json = (await res.json()) as any;
  const code = json?.error?.code;
  const type = json?.error?.type;
  const ev = finalizeEvidence(ev0);
  const transportLog = logLines
    .slice(ev0.logSliceStart)
    .some((l) => l.msg === "upstream_provider_transport_failed");
  const ok =
    res.status === 502 &&
    code === "upstream_transport_error" &&
    type === "upstream_error" &&
    ev.executeChatCompletion &&
    ev.providerFetch &&
    transportLog &&
    uncaughtExceptionCount === beforeUncaught &&
    unhandledRejectionCount === beforeReject;
  if (ok) {
    passCase(
      "C",
      "CASE_C_REAL_SOCKET_TRANSPORT_502_PASS",
      classify(ev, { STATUS: res.status, CODE: code, TYPE: type })
    );
  } else {
    failCase(
      "C",
      "CASE_C_REAL_SOCKET_TRANSPORT_502_PASS",
      JSON.stringify({
        status: res.status,
        code,
        type,
        ev,
        transportLog,
        processErrors,
      })
    );
  }
  destroyHungUpstreamSockets();
}

// ── CASE D — SSE cancel survival ───────────────────────────────────────────
{
  const ev0 = beginEvidence();
  upstreamMode = "hang";
  const beforeUncaught = uncaughtExceptionCount;
  const beforeInvalid = errInvalidStateCount;
  const ac = new AbortController();

  console.log(
    `P1062R4: CASE D cancel wait ${CANCEL_WAIT_MS}ms (2× prod heartbeat + margin)`
  );

  const resPromise = postChat(
    {
      model: "gpt-5.5",
      stream: true,
      messages: [{ role: "user", content: "ping p1062r4 D stream" }],
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
      processErrors.push(`CASE_D_read: ${String(err)}`);
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

  // Recovery must succeed (critical)
  upstreamMode = "normal";
  const evRec0 = beginEvidence();
  const recovery = await postChat({
    model: "gpt-5.5",
    stream: false,
    messages: [{ role: "user", content: "ping p1062r4 D recovery" }],
  });
  const recoveryJson = (await recovery.json()) as any;
  const evRec = finalizeEvidence(evRec0);
  const recoveryOk =
    recovery.status === 200 &&
    recoveryJson?.choices?.[0]?.message?.content === "P1062R4_NORMAL_OK" &&
    evRec.executeChatCompletion &&
    evRec.providerFetch;

  const ev = finalizeEvidence(ev0, { sseResponse: sseContentType || gotFrame });
  const ok =
    gotFrame &&
    sseContentType &&
    recoveryOk &&
    uncaughtExceptionCount === beforeUncaught &&
    errInvalidStateCount === beforeInvalid;

  if (ok) {
    passCase(
      "D",
      "CASE_D_REAL_SSE_CANCEL_SURVIVAL_PASS",
      classify(ev, {
        EARLY_SSE_EXECUTED: true,
        firstFrameBytes: firstFrame.length,
        recoveryStatus: recovery.status,
        CANCEL_WAIT_MS,
        PROD_HEARTBEAT_MS,
      })
    );
  } else {
    failCase(
      "D",
      "CASE_D_REAL_SSE_CANCEL_SURVIVAL_PASS",
      JSON.stringify({
        gotFrame,
        sseContentType,
        firstFrame: firstFrame.slice(0, 200),
        recoveryOk,
        recoveryStatus: recovery.status,
        ev,
        processErrors,
      })
    );
  }
}

// ── CASE E — SSE normal completion ─────────────────────────────────────────
{
  const ev0 = beginEvidence();
  upstreamMode = "normal";
  const beforeInvalid = errInvalidStateCount;
  const res = await postChat({
    model: "gpt-5.5",
    stream: true,
    messages: [{ role: "user", content: "ping p1062r4 E stream" }],
  });
  const text = await res.text();
  const doneCount = (text.match(/data:\s*\[DONE\]/gi) ?? []).length;
  const hasPayload =
    text.includes("chat.completion") ||
    text.includes('"delta"') ||
    text.includes("P1062R4_NORMAL_OK");
  const sse = (res.headers.get("content-type") ?? "").includes(
    "text/event-stream"
  );
  const ev = finalizeEvidence(ev0, { sseResponse: sse });

  const recovery = await postChat({
    model: "gpt-5.5",
    stream: false,
    messages: [{ role: "user", content: "ping p1062r4 E recovery" }],
  });

  const ok =
    res.status === 200 &&
    sse &&
    hasPayload &&
    doneCount === 1 &&
    ev.executeChatCompletion &&
    ev.providerFetch &&
    ev.createEarlySseResponse &&
    errInvalidStateCount === beforeInvalid &&
    recovery.status === 200;

  if (ok) {
    passCase(
      "E",
      "CASE_E_REAL_SSE_COMPLETION_PASS",
      classify(ev, {
        doneCount,
        sseBytes: text.length,
        recoveryStatus: recovery.status,
      })
    );
  } else {
    failCase(
      "E",
      "CASE_E_REAL_SSE_COMPLETION_PASS",
      JSON.stringify({
        status: res.status,
        doneCount,
        hasPayload,
        sse,
        ev,
        recoveryStatus: recovery.status,
        snippet: text.slice(0, 400),
      })
    );
  }
}

// ── CASE F — Cursor-size tools preserved ───────────────────────────────────
{
  const ev0 = beginEvidence();
  upstreamMode = "capture";
  lastUpstreamRawBody = "";
  lastUpstreamParsed = null;
  const tools = makeCursorTools(20);
  const clientBody = {
    model: "gpt-5.5",
    stream: false,
    tool_choice: "auto" as const,
    messages: [
      {
        role: "user",
        content:
          "Search the codebase for executeChatCompletion and summarize providerFetch",
      },
    ],
    tools,
  };
  const clientBytes = Buffer.byteLength(JSON.stringify(clientBody), "utf8");
  const res = await postChat(clientBody);
  const json = (await res.json()) as any;
  const ev = finalizeEvidence(ev0);
  const upstreamTools = Array.isArray(lastUpstreamParsed?.tools)
    ? (lastUpstreamParsed!.tools as unknown[])
    : [];
  const upstreamBytes = Buffer.byteLength(lastUpstreamRawBody, "utf8");
  const clientToolCount = tools.length;
  const upstreamToolCount = upstreamTools.length;
  const toolChoice = lastUpstreamParsed?.tool_choice;
  const ok =
    res.status === 200 &&
    clientBytes >= 8_000 &&
    clientToolCount === 20 &&
    upstreamToolCount === 20 &&
    Array.isArray(lastUpstreamParsed?.messages) &&
    typeof lastUpstreamParsed?.model === "string" &&
    (toolChoice === "auto" || toolChoice === undefined) &&
    ev.executeChatCompletion &&
    ev.providerFetch &&
    json?.choices?.[0]?.message?.content === "P1062R4_NORMAL_OK";

  console.log(
    JSON.stringify({
      CLIENT_TOOL_COUNT: clientToolCount,
      UPSTREAM_TOOL_COUNT: upstreamToolCount,
      CLIENT_BODY_BYTES: clientBytes,
      UPSTREAM_BODY_BYTES: upstreamBytes,
      TOOLS_PRESERVED: upstreamToolCount === 20 ? "YES" : "NO",
    })
  );

  if (ok) {
    passCase(
      "F",
      "CASE_F_REAL_CURSOR_PAYLOAD_PASS",
      classify(ev, {
        CLIENT_TOOL_COUNT: clientToolCount,
        UPSTREAM_TOOL_COUNT: upstreamToolCount,
        CLIENT_BODY_BYTES: clientBytes,
        UPSTREAM_BODY_BYTES: upstreamBytes,
        TOOLS_PRESERVED: "YES",
      })
    );
  } else {
    failCase(
      "F",
      "CASE_F_REAL_CURSOR_PAYLOAD_PASS",
      JSON.stringify({
        status: res.status,
        clientBytes,
        upstreamBytes,
        clientToolCount,
        upstreamToolCount,
        toolChoice,
        ev,
      })
    );
  }
}

// ── CASE G — transport then recovery ───────────────────────────────────────
{
  const ev1 = beginEvidence();
  upstreamMode = "destroy";
  const first = await postChat({
    model: "gpt-5.5",
    stream: false,
    messages: [{ role: "user", content: "ping p1062r4 G fail" }],
  });
  const firstJson = (await first.json()) as any;
  const evFirst = finalizeEvidence(ev1);
  const firstOk =
    first.status === 502 &&
    firstJson?.error?.code === "upstream_transport_error" &&
    evFirst.providerFetch;

  destroyHungUpstreamSockets();
  upstreamMode = "normal";
  const ev2 = beginEvidence();
  const second = await postChat({
    model: "gpt-5.5",
    stream: false,
    messages: [{ role: "user", content: "ping p1062r4 G ok" }],
  });
  const secondJson = (await second.json()) as any;
  const evSecond = finalizeEvidence(ev2);
  const secondOk =
    second.status === 200 &&
    secondJson?.choices?.[0]?.message?.content === "P1062R4_NORMAL_OK" &&
    evSecond.executeChatCompletion &&
    evSecond.providerFetch;

  if (firstOk && secondOk) {
    passCase(
      "G",
      "CASE_G_TRANSPORT_RECOVERY_PASS",
      classify(evSecond, {
        firstStatus: first.status,
        secondStatus: second.status,
        EXECUTE_CHAT_COMPLETION_EXECUTED:
          evFirst.executeChatCompletion && evSecond.executeChatCompletion,
        PROVIDER_FETCH_EXECUTED:
          evFirst.providerFetch && evSecond.providerFetch,
      })
    );
  } else {
    failCase(
      "G",
      "CASE_G_TRANSPORT_RECOVERY_PASS",
      JSON.stringify({
        firstStatus: first.status,
        firstCode: firstJson?.error?.code,
        secondStatus: second.status,
        evFirst,
        evSecond,
      })
    );
  }
}

destroyHungUpstreamSockets();
await new Promise<void>((resolve) => upstreamServer.close(() => resolve()));
await new Promise<void>((resolve) => {
  try {
    (tokfaiServer as any).close?.(() => resolve());
    setTimeout(() => resolve(), 300);
  } catch {
    resolve();
  }
});

const realEntryCount = Object.values(casePass).filter(Boolean).length;
console.log("\n--- CASE CLASSIFICATION ---");
for (const id of ["A", "B", "C", "D", "E", "F", "G"]) {
  console.log(
    JSON.stringify({
      CASE: id,
      TYPE: "REAL_ENTRY_TEST",
      HTTP_ENTRY_EXECUTED: true,
      PASS: casePass[id] === true,
    })
  );
}
console.log(
  JSON.stringify({
    REAL_ENTRY_TEST_COUNT: realEntryCount,
    UNCAUGHT_EXCEPTION_COUNT: uncaughtExceptionCount,
    UNHANDLED_REJECTION_COUNT: unhandledRejectionCount,
    ERR_INVALID_STATE_COUNT: errInvalidStateCount,
    PROCESS_ERRORS: processErrors.slice(0, 10),
  })
);

const allCasesPass =
  casePass.A === true &&
  casePass.B === true &&
  casePass.C === true &&
  casePass.D === true &&
  casePass.E === true &&
  casePass.F === true &&
  casePass.G === true &&
  realEntryCount >= 7 &&
  uncaughtExceptionCount === 0 &&
  unhandledRejectionCount === 0 &&
  errInvalidStateCount === 0 &&
  failed === 0;

if (!allCasesPass) {
  console.error(
    JSON.stringify({
      casePass,
      realEntryCount,
      uncaughtExceptionCount,
      unhandledRejectionCount,
      errInvalidStateCount,
      failed,
    })
  );
  console.error(`\n${FAIL}`);
  process.exit(1);
}

console.log(`\nCANARY_CASES_PASS — typecheck/build/regressions…`);

function run(cmd: string, args: string[], cwd?: string): number {
  const r = spawnSync(cmd, args, {
    cwd: cwd ?? ROOT,
    stdio: "inherit",
    env: process.env,
  });
  return r.status ?? 1;
}

let regFailed = 0;
if (run("npm", ["run", "typecheck"], join(ROOT, "apps/dmit-api")) !== 0) {
  regFailed += 1;
  console.error("TYPECHECK=FAIL");
} else console.log("TYPECHECK=PASS");
if (run("npm", ["run", "build"], join(ROOT, "apps/dmit-api")) !== 0) {
  regFailed += 1;
  console.error("BUILD=FAIL");
} else console.log("BUILD=PASS");

const scripts = [
  "p1033-cursor-round2-tool-result-resume.mts",
  "p1036-cursor-round2-multi-tool-continuation.mts",
  "p1040-cursor-resume-transcript-emulation.mts",
  "p1043-cursor-native-resume-fastpath.mts",
  "p1046-cursor-resume-tail-detection.mts",
  "p1047-native-single-pass-arbitration.mts",
  "p1048-auto-tool-intent-repair.mts",
  "p1049-cursor-multistep-continuation.mts",
  "p1051-gemini-provider-adapter.mts",
  "p1053-gemini-tool-resume-wiring.mts",
  "p1055-native-tool-repair.mts",
  "p1059-explicit-model-transparent-gateway.mts",
  "p1061-autopro-transparent-carrier.mts",
  "p1062-cursor-gateway-root-cause.mts",
];
for (const s of scripts) {
  console.log(`======== ${s} ========`);
  if (run("npx", ["tsx", `scripts/${s}`]) !== 0) {
    regFailed += 1;
    console.error(`REGRESSION_FAIL ${s}`);
  }
}

const diffCheck = spawnSync("git", ["diff", "--check"], {
  cwd: ROOT,
  encoding: "utf8",
});
if ((diffCheck.status ?? 1) !== 0) {
  regFailed += 1;
  console.error("GIT_DIFF_CHECK=FAIL");
  console.error(diffCheck.stdout || diffCheck.stderr);
} else console.log("GIT_DIFF_CHECK=PASS");

if (regFailed > 0) {
  console.error(`\n${FAIL} regressions_failed=${regFailed}`);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      CASE_A: "PASS",
      CASE_B: "PASS",
      CASE_C: "PASS",
      CASE_D: "PASS",
      CASE_E: "PASS",
      CASE_F: "PASS",
      CASE_G: "PASS",
      REAL_ENTRY_TEST_COUNT: 7,
      UNCAUGHT_EXCEPTION_COUNT: 0,
      UNHANDLED_REJECTION_COUNT: 0,
      ERR_INVALID_STATE_COUNT: 0,
      TYPECHECK: "PASS",
      BUILD: "PASS",
      REGRESSIONS: "PASS",
      GIT_DIFF_CHECK: "PASS",
    },
    null,
    2
  )
);
console.log(`\n${PASS}`);
