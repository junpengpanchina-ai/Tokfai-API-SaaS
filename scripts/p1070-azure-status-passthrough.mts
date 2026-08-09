/**
 * P1070 — Azure ingress HTTP status / headers / body passthrough.
 *
 * REAL HTTP ENTRY → azureOpenAiRoutes → runChatCompletionsHttp →
 *   executeChatCompletion / early SSE
 *
 * Fake upstream on localhost (no GRSAI, no real debit).
 * Auth uses REAL azureAuth / chatAuth with mocked verifyApiKeyToken.
 *
 *   npx tsx scripts/p1070-azure-status-passthrough.mts
 *
 * Marker: TOKFAI_P1070_AZURE_STATUS_PASSTHROUGH_PASS
 */

import { spawnSync } from "node:child_process";
import http from "node:http";
import { mock } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Writable } from "node:stream";
import { readFileSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SELF = fileURLToPath(import.meta.url);
const PASS = "TOKFAI_P1070_AZURE_STATUS_PASSTHROUGH_PASS";
const FAIL = "TOKFAI_P1070_AZURE_STATUS_PASSTHROUGH_FAIL";
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

type UpstreamMode = "normal" | "destroy" | "http400" | "hang";

let upstreamMode: UpstreamMode = "normal";
let lastUpstreamParsed: Record<string, unknown> | null = null;
let upstreamHitCount = 0;
const upstreamSockets = new Set<import("node:net").Socket>();

const upstreamServer = http.createServer((req, res) => {
  upstreamHitCount += 1;
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
  req.on("end", () => {
    const raw = Buffer.concat(chunks).toString("utf8");
    try {
      lastUpstreamParsed = JSON.parse(raw) as Record<string, unknown>;
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
          message: "P1070 upstream bad request",
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
      id: "chatcmpl-p1070",
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "P1070_NORMAL_OK" },
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
process.env.SUPABASE_SERVICE_ROLE_KEY = "service_role_test_key_p1070xxxxxxxx";
process.env.SUPABASE_JWT_SECRET = "p1070-test-jwt-secret-32chars-min!!";
process.env.TOKEN_PEPPER = "p1070-test-token-pepper-32chars-min!!";
process.env.GRSAI_API_KEY = "p1070-test-grsai-key";
process.env.GRSAI_BASE_URL = UPSTREAM_BASE;
process.env.GRSAI_CHAT_COMPLETIONS_PATH = "/v1/chat/completions";
process.env.STRIPE_SECRET_KEY = "sk_test_p1070_dummy_key_xx";
process.env.STRIPE_WEBHOOK_SECRET = "whsec_p1070_test_only_secret";
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
  apiKeyId: "key-uuid-p1070",
  userId: "user-p1070",
  name: "p1070-test-key",
  keyId: "aaaaaaaaaaaa",
  prefix: "sk-tokfai_aaaaaaaaaaaa…",
  tenantId: null as string | null,
};

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
          resolve({ data: null, error: { message: "p1070_no_db" } })
        );
      return empty;
    },
    rpc: async () => ({ data: null, error: null }),
  };
}

console.log("P1070: installing auth/billing mocks…");

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
      throw new Error("p1070: generateApiKey unused");
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
      return await next();
    },
  },
});

mock.module(fileUrl("apps/dmit-api/src/lib/usageBilling.ts"), {
  namedExports: {
    lookupBillingIdempotency: async () => null,
    recordSuccessfulUsageAndDebit: async () => ({
      balanceAfter: 999,
      debitLedgerId: "ledger_p1070_spy",
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

console.log("P1070: loading production azure + chat routes…");
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

const app = new Hono();
app.use("*", requestIdMiddleware);
app.route("/", chatRoutes);
app.route("/", azureOpenAiRoutes);
app.onError(errorHandler);

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
    // Outer HTTP status must match shared Response.status exactly.
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
  } catch {
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
console.log(`P1070: Tokfai listening on ${TOKFAI_BASE}`);
console.log(`P1070: fake upstream on ${UPSTREAM_BASE}`);

async function postAzure(
  body: Record<string, unknown>,
  opts?: {
    headers?: Record<string, string>;
    deployment?: string;
    apiKey?: string;
  }
): Promise<Response> {
  const deployment = opts?.deployment ?? "GPT-5.4";
  const path = `/v1/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=2024-12-01-preview`;
  return fetch(`${TOKFAI_BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "user-agent": "Cursor/1.0",
      "api-key": opts?.apiKey ?? VALID_KEY,
      ...(opts?.headers ?? {}),
    },
    body: JSON.stringify(body),
  });
}

async function postChat(
  body: Record<string, unknown>
): Promise<Response> {
  return fetch(`${TOKFAI_BASE}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${VALID_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

function sourceHasNoJsonRewrap(): boolean {
  const src = readFileSync(
    join(ROOT, "apps/dmit-api/src/routes/azureOpenAi.ts"),
    "utf8"
  );
  return (
    src.includes("passThroughSharedChatResponse") &&
    !src.includes("await sharedResponse.json(") &&
    !src.includes("await response.json(") &&
    !/\.json\(\)\s*;?\s*\n\s*return c\.json/.test(src)
  );
}

let failed = 0;
const flags: Record<string, boolean> = {
  AZURE_STATUS_PASSTHROUGH_FIXED: false,
  AZURE_200_SUCCESS_PRESERVED: false,
  AZURE_400_PRESERVED: false,
  AZURE_401_PRESERVED: false,
  AZURE_502_PRESERVED: false,
  AZURE_503_PRESERVED: false,
  AZURE_SSE_PRESERVED: false,
  ORIGINAL_CHAT_ROUTE_CHANGED: true,
};

function pass(id: string, marker: string, detail?: Record<string, unknown>) {
  console.log(`PASS  ${marker}`);
  if (detail) console.log(JSON.stringify({ CASE: id, ...detail }));
}
function fail(id: string, marker: string, detail: unknown) {
  failed += 1;
  console.error(`FAIL  ${marker} — ${JSON.stringify(detail)}`);
}

console.log("\nP1070 AZURE STATUS PASSTHROUGH REAL ENTRY\n");

// ── A — fake upstream 200 → Azure outer 200 ───────────────────────────────
{
  upstreamMode = "normal";
  const res = await postAzure({
    messages: [{ role: "user", content: "ping p1070 A" }],
  });
  const json = (await res.json()) as any;
  const ok =
    res.status === 200 &&
    json?.choices?.[0]?.message?.content === "P1070_NORMAL_OK";
  if (ok) {
    flags.AZURE_200_SUCCESS_PRESERVED = true;
    pass("A", "CASE_A_AZURE_200_SUCCESS_PASS", { status: res.status });
  } else {
    fail("A", "CASE_A_AZURE_200_SUCCESS_PASS", {
      status: res.status,
      json,
    });
  }
}

// ── B — transport failure: 502 (gpt-5.5) + 503 (GPT-5.4 alias exhaust) ───
{
  upstreamMode = "destroy";
  const res502 = await postAzure(
    { messages: [{ role: "user", content: "ping p1070 B502" }] },
    { deployment: "gpt-5.5" }
  );
  const json502 = (await res502.json()) as any;
  const code502 = json502?.error?.code ?? json502?.code;
  const ok502 =
    res502.status === 502 && code502 === "upstream_transport_error";
  destroyHungUpstreamSockets();

  const res503 = await postAzure({
    messages: [{ role: "user", content: "ping p1070 B503" }],
  });
  const json503 = (await res503.json()) as any;
  const code503 = json503?.error?.code ?? json503?.code;
  // GPT-5.4 → gpt-5 chain exhausts → all_upstreams_unavailable (503)
  const ok503 =
    res503.status === 503 &&
    code503 === "all_upstreams_unavailable" &&
    res503.status !== 200;
  destroyHungUpstreamSockets();
  upstreamMode = "normal";

  if (ok502) {
    flags.AZURE_502_PRESERVED = true;
    pass("B1", "CASE_B_TRANSPORT_502_PASS", {
      status: res502.status,
      code: code502,
    });
  } else {
    fail("B1", "CASE_B_TRANSPORT_502_PASS", {
      status: res502.status,
      code: code502,
      json502,
    });
  }
  if (ok503) {
    flags.AZURE_503_PRESERVED = true;
    pass("B2", "CASE_B_TRANSPORT_503_PASS", {
      status: res503.status,
      code: code503,
    });
  } else {
    fail("B2", "CASE_B_TRANSPORT_503_PASS", {
      status: res503.status,
      code: code503,
      json503,
    });
  }
}

// ── C — invalid Tokfai key → 401 ──────────────────────────────────────────
{
  upstreamMode = "normal";
  const beforeHits = upstreamHitCount;
  const res = await postAzure(
    { messages: [{ role: "user", content: "ping p1070 C" }] },
    { apiKey: INVALID_KEY }
  );
  const json = (await res.json()) as any;
  const ok =
    res.status === 401 &&
    upstreamHitCount === beforeHits &&
    (json?.error?.code === "invalid_token" ||
      json?.error?.type === "authentication_error" ||
      typeof json?.error?.message === "string");
  if (ok) {
    flags.AZURE_401_PRESERVED = true;
    pass("C", "CASE_C_INVALID_KEY_401_PASS", { status: res.status });
  } else {
    fail("C", "CASE_C_INVALID_KEY_401_PASS", {
      status: res.status,
      json,
      upstreamDelta: upstreamHitCount - beforeHits,
    });
  }
}

// ── D — upstream HTTP 400 → Azure outer 400 ───────────────────────────────
{
  upstreamMode = "http400";
  const res = await postAzure(
    { messages: [{ role: "user", content: "ping p1070 D" }] },
    { deployment: "gpt-5.5" }
  );
  const json = (await res.json()) as any;
  const ok = res.status === 400;
  upstreamMode = "normal";
  if (ok) {
    flags.AZURE_400_PRESERVED = true;
    pass("D", "CASE_D_UPSTREAM_400_PASS", {
      status: res.status,
      code: json?.error?.code,
    });
  } else {
    fail("D", "CASE_D_UPSTREAM_400_PASS", { status: res.status, json });
  }
}

// ── E — stream=true: text/event-stream, body not buffered ─────────────────
{
  upstreamMode = "normal";
  const res = await postAzure({
    stream: true,
    messages: [{ role: "user", content: "ping p1070 E stream" }],
  });
  const ct = res.headers.get("content-type") ?? "";
  const contentLength = res.headers.get("content-length");
  let firstChunk = "";
  let chunkCount = 0;
  if (res.body) {
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    // Read incrementally — proves body is a stream, not a fully buffered string
    // rebuilt after the fact.
    for (let i = 0; i < 4; i++) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunkCount += 1;
        const text = dec.decode(value, { stream: true });
        if (!firstChunk) firstChunk = text;
      }
    }
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }
  const ok =
    res.status === 200 &&
    ct.includes("text/event-stream") &&
    contentLength === null &&
    chunkCount >= 1 &&
    (firstChunk.includes("data:") || firstChunk.includes("assistant"));
  if (ok) {
    flags.AZURE_SSE_PRESERVED = true;
    pass("E", "CASE_E_SSE_STREAM_PRESERVED_PASS", {
      status: res.status,
      contentType: ct,
      contentLength,
      chunkCount,
      firstChunkPreview: firstChunk.slice(0, 80),
    });
  } else {
    fail("E", "CASE_E_SSE_STREAM_PRESERVED_PASS", {
      status: res.status,
      ct,
      contentLength,
      chunkCount,
      firstChunk: firstChunk.slice(0, 200),
    });
  }
}

// ── F — original /v1/chat/completions unchanged ───────────────────────────
{
  upstreamMode = "normal";
  const res = await postChat({
    model: "gpt-5.5",
    messages: [{ role: "user", content: "ping p1070 F chat" }],
  });
  const json = (await res.json()) as any;
  const chatSrc = readFileSync(
    join(ROOT, "apps/dmit-api/src/routes/chat.ts"),
    "utf8"
  );
  const chatUnchanged =
    chatSrc.includes('route: "/v1/chat/completions"') &&
    chatSrc.includes("runChatCompletionsHttp") &&
    !chatSrc.includes("passThroughSharedChatResponse") &&
    !chatSrc.includes("azureOpenAi");
  const ok =
    res.status === 200 &&
    json?.choices?.[0]?.message?.content === "P1070_NORMAL_OK" &&
    chatUnchanged;
  if (ok) {
    flags.ORIGINAL_CHAT_ROUTE_CHANGED = false;
    pass("F", "CASE_F_ORIGINAL_CHAT_UNCHANGED_PASS", {
      status: res.status,
      chatUnchanged,
    });
  } else {
    fail("F", "CASE_F_ORIGINAL_CHAT_UNCHANGED_PASS", {
      status: res.status,
      chatUnchanged,
      json,
    });
  }
}

flags.AZURE_STATUS_PASSTHROUGH_FIXED =
  sourceHasNoJsonRewrap() &&
  flags.AZURE_200_SUCCESS_PRESERVED &&
  flags.AZURE_400_PRESERVED &&
  flags.AZURE_401_PRESERVED &&
  flags.AZURE_502_PRESERVED &&
  flags.AZURE_503_PRESERVED &&
  flags.AZURE_SSE_PRESERVED &&
  flags.ORIGINAL_CHAT_ROUTE_CHANGED === false;

console.log("\n── P1070 FLAGS ──");
for (const [k, v] of Object.entries(flags)) {
  const label =
    k === "ORIGINAL_CHAT_ROUTE_CHANGED"
      ? v
        ? "YES"
        : "NO"
      : v
        ? "YES"
        : "NO";
  console.log(`${k}=${label}`);
}

destroyHungUpstreamSockets();
upstreamServer.close();
tokfaiServer.close();

const allOk =
  failed === 0 &&
  flags.AZURE_STATUS_PASSTHROUGH_FIXED &&
  flags.AZURE_200_SUCCESS_PRESERVED &&
  flags.AZURE_400_PRESERVED &&
  flags.AZURE_401_PRESERVED &&
  flags.AZURE_502_PRESERVED &&
  flags.AZURE_503_PRESERVED &&
  flags.AZURE_SSE_PRESERVED &&
  flags.ORIGINAL_CHAT_ROUTE_CHANGED === false;

if (allOk) {
  console.log(PASS);
  process.exit(0);
}
console.error(FAIL);
process.exit(1);
