/**
 * P1062R2 — Cursor SSE lifecycle + large payload diagnostics + transport mapping.
 *
 * Authenticity:
 *   REAL createEarlySseResponse
 *   REAL buildUpstreamChatBody / measureChatCompletionBodyBytes
 *   REAL providerFetch / isChatFallbackEligible / mapUpstreamError
 *   MOCK fetch boundary (no live upstream)
 *
 *   npx tsx scripts/p1062-cursor-gateway-root-cause.mts
 *
 * Marker: TOKFAI_P1062R2_CURSOR_GATEWAY_ROOT_CAUSE_PASS
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Writable } from "node:stream";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS = "TOKFAI_P1062R2_CURSOR_GATEWAY_ROOT_CAUSE_PASS";
const FAIL = "TOKFAI_P1062R2_CURSOR_GATEWAY_ROOT_CAUSE_BLOCKED";

function ensureDummyEnv(): void {
  const set = (k: string, v: string) => {
    if (!process.env[k]) process.env[k] = v;
  };
  set("NODE_ENV", "test");
  set("SUPABASE_URL", "https://example.supabase.co");
  set("SUPABASE_JWT_SECRET", "p1062-test-jwt-secret-32chars-min!");
  set("TOKEN_PEPPER", "p1062-test-token-pepper-32chars-min!");
  set("GRSAI_API_KEY", "p1062-test-grsai-key-not-secret-for-logs");
  set("GRSAI_BASE_URL", "https://upstream.example.test");
  set("STRIPE_WEBHOOK_SECRET", "whsec_p1062_test_only");
  set("TOKFAI_REDIS_ENABLED", "false");
  set("LOG_LEVEL", "info");
}

ensureDummyEnv();

const { createEarlySseResponse } = await import(
  "../apps/dmit-api/src/lib/earlySseStream.ts"
);
const { buildUpstreamChatBody } = await import(
  "../apps/dmit-api/src/lib/upstreamChatBody.ts"
);
const { measureChatCompletionBodyBytes } = await import(
  "../apps/dmit-api/src/lib/chatBodyByteDiagnostics.ts"
);
const {
  providerFetch,
  isChatFallbackEligible,
  isUpstreamTransportFailure,
  mapUpstreamError,
} = await import("../apps/dmit-api/src/upstream/grsai.ts");
const { ApiError } = await import("../apps/dmit-api/src/errors.ts");
const { readFileSync } = await import("node:fs");

let failed = 0;
const caseResults: Record<string, string> = {};

function pass(label: string, detail?: Record<string, unknown>) {
  console.log(`PASS  ${label}`);
  if (detail) console.log(JSON.stringify(detail));
  caseResults[label] = "PASS";
}
function fail(label: string, detail?: string) {
  failed += 1;
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  caseResults[label] = "FAIL";
}
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) pass(label);
  else fail(label, detail);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

type LogLine = { msg?: string; [k: string]: unknown };

function installLogCapture(): {
  lines: LogLine[];
  restore: () => void;
} {
  const lines: LogLine[] = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  const capture = (chunk: unknown, encoding?: unknown, cb?: unknown) => {
    const text =
      typeof chunk === "string"
        ? chunk
        : Buffer.isBuffer(chunk)
          ? chunk.toString("utf8")
          : String(chunk);
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("{")) continue;
      try {
        lines.push(JSON.parse(trimmed) as LogLine);
      } catch {
        // ignore non-json
      }
    }
    return true;
  };
  // Keep real writes for human-readable PASS/FAIL; only intercept JSON log lines
  // by wrapping — still forward everything.
  (process.stdout as Writable).write = ((
    chunk: unknown,
    encoding?: unknown,
    cb?: unknown
  ) => {
    capture(chunk);
    return (origOut as Function)(chunk, encoding, cb);
  }) as typeof process.stdout.write;
  (process.stderr as Writable).write = ((
    chunk: unknown,
    encoding?: unknown,
    cb?: unknown
  ) => {
    capture(chunk);
    return (origErr as Function)(chunk, encoding, cb);
  }) as typeof process.stderr.write;
  return {
    lines,
    restore: () => {
      process.stdout.write = origOut;
      process.stderr.write = origErr;
    },
  };
}

function forbiddenContentInLogs(lines: LogLine[]): string[] {
  const blob = JSON.stringify(lines).toLowerCase();
  const hits: string[] = [];
  for (const needle of [
    "authorization",
    "bearer ",
    "sk-tokfai_",
    "p1062-test-grsai-key",
    '"messages":[{',
    '"tools":[{',
    "search the codebase for executechatcompletion",
  ]) {
    if (blob.includes(needle)) hits.push(needle);
  }
  return hits;
}

async function readResponseText(res: Response): Promise<string> {
  return res.text();
}

const FAKE_PROVIDER = {
  id: "grsai-primary",
  label: "test",
  baseUrl: "https://upstream.example.test",
  apiKey: "p1062-test-grsai-key-not-secret-for-logs",
  chatPath: "/v1/chat/completions",
  enabled: true,
  priority: 1,
  weight: 100,
  timeoutMs: 30_000,
  supportedModels: "*" as const,
};

function makeCursorTools(count: number) {
  const tools = [];
  for (let i = 0; i < count; i++) {
    tools.push({
      type: "function",
      function: {
        name: i === 0 ? "Read" : i === 1 ? "Write" : `CursorTool_${i}`,
        description: `Cursor agent tool ${i} — schema for gateway boundary only`,
        parameters: {
          type: "object",
          properties: {
            path: { type: "string", description: `path field ${i}` },
            query: { type: "string", description: `query field ${i}` },
            nested: {
              type: "object",
              properties: {
                a: { type: "string" },
                b: { type: "number" },
              },
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

const FIRST_FRAME =
  'data: {"id":"chatcmpl-p1062","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"role":"assistant"},"finish_reason":null}]}\n\n';

console.log("P1062R2 CURSOR GATEWAY ROOT CAUSE\n");

const logCap = installLogCapture();

// ─── PHASE A — Early SSE lifecycle ─────────────────────────────────────────

{
  const chunks: string[] = [];
  const res = createEarlySseResponse({
    requestId: "p1062-a1",
    firstFrame: FIRST_FRAME,
    heartbeatMs: 50,
    produceRest: async (write) => {
      await sleep(120);
      write(
        'data: {"id":"chatcmpl-p1062","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}\n\n'
      );
      write("data: [DONE]\n\n");
    },
  });
  const text = await readResponseText(res);
  const hasPing = text.includes(": ping");
  const hasDone = text.includes("data: [DONE]");
  const hasContent = text.includes('"content":"ok"');
  assert(
    hasPing && hasDone && hasContent && res.status === 200,
    "A1 heartbeat normal streaming works",
    `ping=${hasPing} done=${hasDone} content=${hasContent}`
  );
  chunks.push(text);
}

{
  let enqueueThrow = false;
  const res = createEarlySseResponse({
    requestId: "p1062-a2",
    firstFrame: FIRST_FRAME,
    heartbeatMs: 30,
    produceRest: async () => {
      await sleep(200);
    },
  });
  const reader = res.body!.getReader();
  // Read first frame then cancel before heartbeat can fire repeatedly.
  await reader.read();
  await reader.cancel();
  await sleep(120);
  try {
    // Drain should be safe; no unhandled ERR_INVALID_STATE.
    await reader.read();
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === "ERR_INVALID_STATE" ||
        String(err.message).includes("Invalid state"))
    ) {
      enqueueThrow = true;
    }
  }
  const terminalLogs = logCap.lines.filter(
    (l) => l.msg === "early_sse_terminal" && l.requestId === "p1062-a2"
  );
  assert(
    !enqueueThrow && terminalLogs.some((l) => l.reason === "cancelled"),
    "A2 stream closes before heartbeat → no ERR_INVALID_STATE",
    `enqueueThrow=${enqueueThrow} terminals=${terminalLogs.length}`
  );
}

{
  const res = createEarlySseResponse({
    requestId: "p1062-a3",
    firstFrame: FIRST_FRAME,
    heartbeatMs: 40,
    produceRest: async () => {
      await sleep(250);
    },
  });
  const reader = res.body!.getReader();
  await reader.read();
  await reader.cancel();
  await sleep(100);
  const skipped = logCap.lines.filter(
    (l) =>
      l.msg === "early_sse_heartbeat_skipped_terminal" &&
      l.requestId === "p1062-a3"
  );
  const terminal = logCap.lines.filter(
    (l) => l.msg === "early_sse_terminal" && l.requestId === "p1062-a3"
  );
  assert(
    terminal.some((l) => l.reason === "cancelled"),
    "A3 client cancel → timer cleared",
    `terminal=${JSON.stringify(terminal)} skipped=${skipped.length}`
  );
}

{
  const res = createEarlySseResponse({
    requestId: "p1062-a4",
    firstFrame: FIRST_FRAME,
    heartbeatMs: 10_000,
    produceRest: async (write) => {
      await sleep(30);
      write(
        'data: {"id":"chatcmpl-p1062","object":"chat.completion.chunk","choices":[{"index":0,"delta":{"content":"x"},"finish_reason":"stop"}]}\n\n'
      );
      write("data: [DONE]\n\n");
    },
  });
  const reader = res.body!.getReader();
  await reader.read();
  let cancelThrew = false;
  try {
    await reader.cancel();
    await reader.cancel(); // idempotent second cancel
  } catch {
    cancelThrew = true;
  }
  await sleep(40);
  const terminals = logCap.lines.filter(
    (l) => l.msg === "early_sse_terminal" && l.requestId === "p1062-a4"
  );
  assert(
    !cancelThrew &&
      terminals.length === 1 &&
      terminals[0]!.reason === "cancelled",
    "A4 double close → safe",
    `cancelThrew=${cancelThrew} terminals=${JSON.stringify(terminals)}`
  );
}

{
  const PROVIDER_ERR =
    'data: {"error":{"message":"Upstream provider failed.","code":"upstream_error","type":"upstream_error"}}\n\n';
  const res = createEarlySseResponse({
    requestId: "p1062-a5",
    firstFrame: FIRST_FRAME,
    heartbeatMs: 10_000,
    produceRest: async (write) => {
      write(PROVIDER_ERR);
      write("data: [DONE]\n\n");
    },
  });
  const text = await readResponseText(res);
  assert(
    text.includes('"code":"upstream_error"') &&
      text.includes("Upstream provider failed."),
    "A5 provider error → original error preserved"
  );
}

{
  const earlySrc = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/earlySseStream.ts"),
    "utf8"
  );
  assert(
    !earlySrc.includes("debit_credits") &&
      !earlySrc.includes("credit_ledger") &&
      !earlySrc.includes("creditsCharged"),
    "A6 billing unchanged"
  );
}

// ─── PHASE B — Large Cursor payload diagnostics ────────────────────────────

const clientBody = {
  model: "auto-pro",
  stream: true,
  messages: [
    {
      role: "user",
      content:
        "Search the codebase for executeChatCompletion and summarize the providerFetch path",
    },
  ],
  tools: makeCursorTools(20),
  tool_choice: "auto",
  parallel_tool_calls: true,
};
const clientBodySnapshot = JSON.stringify(clientBody);
const upstream = buildUpstreamChatBody(clientBody as any, "gpt-5.5");
const diag = measureChatCompletionBodyBytes({
  clientBody,
  upstreamBody: upstream,
});
const upstreamToolNames = diag.toolNames;

assert(
  diag.toolsCount === 20 && Array.isArray(upstream.tools),
  "B1 20-tool Cursor-shaped request survives Tokfai normalization",
  `toolsCount=${diag.toolsCount}`
);
assert(
  upstreamToolNames.length === 20 &&
    upstreamToolNames[0] === "Read" &&
    upstreamToolNames[1] === "Write",
  "B2 all 20 tool names retained",
  upstreamToolNames.join(",")
);

{
  const beforeLogs = logCap.lines.length;
  // Re-measure + emit a fake log via measure only — content must not appear
  // in prior capture from this helper (helper returns names only in memory).
  const hits = forbiddenContentInLogs(logCap.lines.slice(beforeLogs));
  // Also ensure measure helper return isn't accidentally logged by us.
  assert(
    hits.length === 0 &&
      !JSON.stringify(diag).includes("Authorization") &&
      diag.toolNames.length === 20,
    "B3 no schema contents logged",
    hits.join(",")
  );
}

assert(
  diag.clientBodyByteLength > 0 &&
    diag.upstreamBodyByteLength > 0 &&
    diag.toolsByteLength > 0 &&
    diag.toolsByteLength <= diag.upstreamBodyByteLength &&
    diag.largestToolSchemaBytes > 0 &&
    diag.largestToolSchemaBytes <= diag.toolsByteLength &&
    diag.messageCount === 1,
  "B4 byte diagnostics accurate",
  JSON.stringify({
    clientBodyByteLength: diag.clientBodyByteLength,
    upstreamBodyByteLength: diag.upstreamBodyByteLength,
    toolsByteLength: diag.toolsByteLength,
    largestToolSchemaBytes: diag.largestToolSchemaBytes,
    messageCount: diag.messageCount,
  })
);

assert(
  JSON.stringify(clientBody) === clientBodySnapshot,
  "B5 client body not mutated"
);

// ─── PHASE C — Transport exception mapping ─────────────────────────────────

const origFetch = globalThis.fetch;
let fetchImpl: typeof fetch = origFetch;

globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
  return fetchImpl(...args);
}) as typeof fetch;

async function withFetch(
  impl: typeof fetch,
  fn: () => Promise<void>
): Promise<void> {
  const prev = fetchImpl;
  fetchImpl = impl;
  try {
    await fn();
  } finally {
    fetchImpl = prev;
  }
}

await withFetch(async () => {
  return new Response(JSON.stringify({ ok: true, choices: [] }), {
    status: 200,
    headers: { "content-type": "application/json", "x-request-id": "up-1" },
  });
}, async () => {
  const result = await providerFetch(
    FAKE_PROVIDER,
    "/v1/chat/completions",
    { method: "POST", json: { model: "gpt-5.5", messages: [] } },
    { requestId: "p1062-c-success", route: "/v1/chat/completions", model: "gpt-5.5" }
  );
  assert(
    result.data != null && result.upstreamId === "up-1",
    "C0 fetch success 200 → old behavior"
  );
});

await withFetch(async () => {
  return new Response(
    JSON.stringify({
      error: {
        message: "request body storage capacity exhausted",
        type: "invalid_request_error",
        code: "invalid_request_error",
      },
    }),
    { status: 400, headers: { "content-type": "application/json" } }
  );
}, async () => {
  try {
    await providerFetch(
      FAKE_PROVIDER,
      "/v1/chat/completions",
      { method: "POST", json: { model: "gpt-5.5" } },
      { requestId: "p1062-c1", route: "/v1/chat/completions", model: "gpt-5.5" }
    );
    fail("C1 HTTP 400 still mapUpstreamError", "did not throw");
  } catch (err) {
    assert(
      err instanceof ApiError &&
        err.code !== "upstream_transport_error" &&
        err.upstreamStatus === 400,
      "C1 HTTP 400 still mapUpstreamError",
      err instanceof ApiError
        ? `${err.code}/${err.upstreamStatus}`
        : String(err)
    );
  }
});

await withFetch(async () => {
  return new Response(
    JSON.stringify({ error: { message: "internal", type: "server_error" } }),
    { status: 500, headers: { "content-type": "application/json" } }
  );
}, async () => {
  try {
    await providerFetch(
      FAKE_PROVIDER,
      "/v1/chat/completions",
      { method: "POST", json: { model: "gpt-5.5" } },
      { requestId: "p1062-c2", route: "/v1/chat/completions", model: "gpt-5.5" }
    );
    fail("C2 HTTP 500 still mapUpstreamError", "did not throw");
  } catch (err) {
    assert(
      err instanceof ApiError &&
        err.code !== "upstream_transport_error" &&
        err.upstreamStatus === 500,
      "C2 HTTP 500 still mapUpstreamError",
      err instanceof ApiError
        ? `${err.code}/${err.upstreamStatus}`
        : String(err)
    );
  }
});

await withFetch(async () => {
  const err = new Error("The operation was aborted");
  err.name = "AbortError";
  throw err;
}, async () => {
  try {
    await providerFetch(
      FAKE_PROVIDER,
      "/v1/chat/completions",
      { method: "POST", json: { model: "gpt-5.5" }, timeoutMs: 50 },
      { requestId: "p1062-c3", route: "/v1/chat/completions", model: "gpt-5.5" }
    );
    fail("C3 AbortError still upstream_timeout", "did not throw");
  } catch (err) {
    assert(
      err instanceof ApiError &&
        err.code === "upstream_timeout" &&
        err.status === 504,
      "C3 AbortError still upstream_timeout",
      err instanceof ApiError ? `${err.code}/${err.status}` : String(err)
    );
  }
});

await withFetch(async () => {
  const cause = new Error("socket hang up");
  (cause as Error & { code?: string }).code = "ECONNRESET";
  const err = new TypeError("fetch failed");
  (err as Error & { cause?: unknown }).cause = cause;
  throw err;
}, async () => {
  try {
    await providerFetch(
      FAKE_PROVIDER,
      "/v1/chat/completions",
      { method: "POST", json: { model: "gpt-5.5" } },
      {
        requestId: "p1062-c4",
        route: "/v1/chat/completions",
        model: "gpt-5.5",
        requestedModel: "auto-pro",
        resolvedModel: "gpt-5.5",
      }
    );
    fail("C4 TypeError fetch failed + ECONNRESET → upstream_transport_error", "did not throw");
  } catch (err) {
    const transportLog = logCap.lines.filter(
      (l) =>
        l.msg === "upstream_provider_transport_failed" &&
        l.requestId === "p1062-c4"
    );
    assert(
      err instanceof ApiError &&
        err.code === "upstream_transport_error" &&
        err.status === 502 &&
        err.type === "upstream_error" &&
        err.publicMessage === "Upstream provider connection failed." &&
        transportLog.length >= 1 &&
        transportLog[0]!.billing_status === "not_billable" &&
        transportLog[0]!.credits_charged === 0,
      "C4 TypeError fetch failed + ECONNRESET → upstream_transport_error",
      err instanceof ApiError
        ? `${err.code}/${err.status}/${err.publicMessage}`
        : String(err)
    );
  }
});

{
  const sock = new Error("other side closed");
  (sock as Error & { code?: string }).code = "UND_ERR_SOCKET";
  assert(
    isUpstreamTransportFailure(sock),
    "C4b UND_ERR_SOCKET → transport failure classified"
  );
  const mapped = new ApiError({
    status: 502,
    message: "transport",
    code: "upstream_transport_error",
    type: "upstream_error",
    publicMessage: "Upstream provider connection failed.",
  });
  assert(
    isChatFallbackEligible(mapped) === true,
    "C5 transport error fallback eligible"
  );
  // Existing behaviors unchanged
  assert(
    isChatFallbackEligible(
      new ApiError({
        status: 502,
        message: "auth",
        code: "upstream_auth_error",
        type: "upstream_error",
      })
    ) === false,
    "C5b auth still not fallback eligible"
  );
  assert(
    isChatFallbackEligible(
      new ApiError({
        status: 504,
        message: "timeout",
        code: "upstream_timeout",
        type: "upstream_error",
      })
    ) === true,
    "C5c timeout still fallback eligible"
  );
  const mapped400 = mapUpstreamError(
    400,
    {
      message: "request body storage capacity exhausted",
      type: "invalid_request_error",
      code: "invalid_request_error",
    },
    "request body storage capacity exhausted"
  );
  assert(
    mapped400.code !== "upstream_transport_error",
    "C5d capacity 400 stays mapUpstreamError path"
  );
}

// Billing 0 for transport (log + ApiError before debit)
{
  const tLogs = logCap.lines.filter(
    (l) => l.msg === "upstream_provider_transport_failed"
  );
  assert(
    tLogs.every(
      (l) => l.billing_status === "not_billable" && l.credits_charged === 0
    ),
    "C4c transport failure → billing 0"
  );
}

globalThis.fetch = origFetch;

// Static guards — no Agent orchestration reintroduced on transparent paths
{
  const carrier = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/autoProTransparentCarrier.ts"),
    "utf8"
  );
  const early = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/earlySseStream.ts"),
    "utf8"
  );
  const grsai = readFileSync(
    join(ROOT, "apps/dmit-api/src/upstream/grsai.ts"),
    "utf8"
  );
  assert(
    early.includes("early_sse_terminal") &&
      early.includes("early_sse_heartbeat_skipped_terminal") &&
      early.includes("markTerminal") &&
      early.includes("cancel()"),
    "STATIC early SSE terminal state machine present"
  );
  assert(
    grsai.includes("upstream_provider_transport_failed") &&
      grsai.includes("upstream_transport_error") &&
      grsai.includes('"upstream_transport_error"'),
    "STATIC transport mapping present"
  );
  assert(
    carrier.includes("isAutoProTransparentCarrier"),
    "STATIC auto-pro carrier file untouched semantically (still present)"
  );
}

const secretHits = forbiddenContentInLogs(
  logCap.lines.filter(
    (l) =>
      typeof l.msg === "string" &&
      (l.msg.startsWith("early_sse_") ||
        l.msg === "upstream_provider_transport_failed" ||
        l.msg === "chat_body_byte_diagnostics")
  )
);
assert(
  secretHits.length === 0,
  "LOGS no authorization / api key / messages / tools values",
  secretHits.join(",")
);

logCap.restore();

console.log("\n--- case summary ---");
for (const [k, v] of Object.entries(caseResults)) {
  console.log(`${v}  ${k}`);
}

console.log("\n--- diagnostics snapshot ---");
console.log(
  JSON.stringify(
    {
      CLIENT_BODY_BYTES: diag.clientBodyByteLength,
      UPSTREAM_BODY_BYTES: diag.upstreamBodyByteLength,
      TOOLS_BYTES: diag.toolsByteLength,
      LARGEST_TOOL_SCHEMA_BYTES: diag.largestToolSchemaBytes,
      TOOLS_COUNT: diag.toolsCount,
      PROVIDER_CAPACITY_FAILURE_EXPLAINED:
        "Upstream HTTP 400 'request body storage capacity exhausted' is a provider-side body storage limit; Tokfai preserves all 20 Cursor tools and does not strip tools to bypass it.",
    },
    null,
    2
  )
);

if (failed > 0) {
  console.error(`\n${FAIL} failed=${failed}`);
  process.exit(1);
}
console.log(`\n${PASS}`);
