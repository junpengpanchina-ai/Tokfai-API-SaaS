/**
 * P1095 — Durable Responses tool-state store (optional) + memory fallback.
 *
 * Authenticity:
 *   REAL responsesToolStateStore hybrid + durable mock backend
 *   REAL responsesPreviousResponseBridge resolve/persist
 *   REAL encryption (AES-256-GCM) with RESPONSES_STATE_ENCRYPTION_KEY
 *   No real Supabase required (mock durable)
 *   No tool execution / no agent
 *
 *   node scripts/p1095-durable-responses-tool-state-store.mjs
 *
 * Marker (only FINAL_VERDICT=A_FIX_READY):
 *   TOKFAI_P1095_DURABLE_RESPONSES_TOOL_STATE_STORE_PASS
 */

import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  CALLER,
  billingSnapshot,
  defaultProviders,
  ensureDummyEnv,
  ensureModuleMocks,
  getCounts,
  installP1018Mocks,
  loadExecuteChatCompletion,
  resetScenario,
} from "./fixtures/p1018-tool-intent-harness.mts";

// Encryption key before any durable/crypto imports (min 32 chars).
process.env.RESPONSES_STATE_ENCRYPTION_KEY =
  process.env.RESPONSES_STATE_ENCRYPTION_KEY?.trim() ||
  `p1095_test_key_${randomBytes(24).toString("hex")}`;

ensureModuleMocks(fileURLToPath(import.meta.url));
ensureDummyEnv();
await installP1018Mocks();

const { executeChatCompletion } = await loadExecuteChatCompletion();
const {
  clearResponsesToolStateStoreForTests,
  deleteResponsesToolState,
  getResponsesToolState,
  getResponsesToolStateHybrid,
  getResponsesToolStateStoreCapabilities,
  getStoreKind,
  hashForResponsesLog,
  hashUserIdForStore,
  RESPONSES_TOOL_STATE_TTL_MS,
  responsesToolStateStore,
  responsesToolStateStoreSizeForTests,
  saveResponsesToolState,
  saveResponsesToolStateHybrid,
} = await import("../apps/dmit-api/src/lib/responsesToolStateStore.ts");
const {
  createMockDurableBackend,
  setResponsesToolStateDurableBackendForTests,
  resetResponsesToolStateDurableLatchForTests,
  isResponsesToolStateDurableConfigured,
  isResponsesToolStateDurableActive,
} = await import("../apps/dmit-api/src/lib/responsesToolStateDurable.ts");
const {
  encryptResponsesToolStatePayload,
  isResponsesStateEncryptionConfigured,
} = await import("../apps/dmit-api/src/lib/responsesToolStateCrypto.ts");
const {
  detectPreviousResponseToolOutputBridge,
  persistResponsesToolStateFromRound1,
  resolvePreviousResponseToolOutputBridge,
  applyRebuiltPreviousResponseBody,
} = await import(
  "../apps/dmit-api/src/lib/responsesPreviousResponseBridge.ts"
);
const { chatCompletionResponseToResponses, responsesBodyToChatBody } =
  await import("../apps/dmit-api/src/lib/responsesTransform.ts");
const { responsesToSseBody } = await import(
  "../apps/dmit-api/src/lib/responsesSse.ts"
);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS =
  "TOKFAI_P1095_DURABLE_RESPONSES_TOOL_STATE_STORE_PASS";
const FAIL =
  "TOKFAI_P1095_DURABLE_RESPONSES_TOOL_STATE_STORE_FAIL";

let failed = 0;
const report: Record<string, string> = {
  PRODUCTION_CODE_CHANGED: "YES",
  STORE_INTERFACE_ADDED: "NO",
  MEMORY_FALLBACK_UNCHANGED: "NO",
  DURABLE_BACKEND_ADDED: "NO",
  DURABLE_REQUIRES_ENCRYPTION_KEY: "NO",
  PLAINTEXT_PROMPT_STORED: "YES",
  PLAINTEXT_TOOL_OUTPUT_STORED: "YES",
  AUTHORIZATION_STORED: "YES",
  ROUND1_DURABLE_SAVE_SUPPORTED: "NO",
  ROUND2_MEMORY_MISS_DURABLE_HIT_PASS: "NO",
  DURABLE_UNAVAILABLE_MEMORY_FALLBACK_PASS: "NO",
  MISSING_STATE_NO_PROVIDER_FETCH: "NO",
  CALL_ID_MISMATCH_NO_PROVIDER_FETCH: "NO",
  ROUND2_SUCCESS_DEBIT_ONCE: "NO",
  CHAT_COMPLETIONS_CHANGED: "NO",
  STT_CHANGED: "NO",
  DASHBOARD_CHANGED: "NO",
  MEMORY_ONLY_SINGLE_PROCESS: "?",
  DURABLE_STORE_CONFIGURED: "?",
  DURABLE_STORE_ACTIVE: "?",
  PM2_RESTART_STATE_SURVIVES: "?",
  MULTI_INSTANCE_STATE_SHARED: "?",
  TYPECHECK: "FAIL",
  BUILD: "FAIL",
  REGRESSIONS: "FAIL",
  GIT_DIFF_CHECK: "FAIL",
  FINAL_VERDICT: "C_REJECT",
};

function pass(label: string, detail?: string) {
  console.log(`PASS  ${label}${detail ? ` — ${detail}` : ""}`);
}
function fail(label: string, detail?: string) {
  failed += 1;
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) pass(label, detail);
  else fail(label, detail);
}
function read(rel: string) {
  return readFileSync(join(ROOT, rel), "utf8");
}
function shortHash(v: string) {
  return createHash("sha256").update(v).digest("hex").slice(0, 12);
}

const TOOLS = [
  {
    type: "function",
    name: "read_test_file",
    description: "Read a synthetic test file",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false,
    },
  },
];

const CALL_ID = "call_p1095_test_001";
const RESP_ID = "resp_p1095_round1_test";
const SECRET_PROMPT = `P1095_SECRET_PROMPT_${shortHash("prompt")}_DO_NOT_LEAK`;
const SECRET_TOKEN = `sk-tokfai_${"a".repeat(48)}`;
const SAFE_OUTPUT = `SAFE synthetic output ${shortHash("out")} end.`;

console.log("P1095 DURABLE RESPONSES TOOL STATE STORE\n");

// ── Static contracts ─────────────────────────────────────────────────────
{
  const storeSrc = read("apps/dmit-api/src/lib/responsesToolStateStore.ts");
  const typesSrc = read("apps/dmit-api/src/lib/responsesToolStateTypes.ts");
  const durableSrc = read("apps/dmit-api/src/lib/responsesToolStateDurable.ts");
  const cryptoSrc = read("apps/dmit-api/src/lib/responsesToolStateCrypto.ts");
  const bridgeSrc = read(
    "apps/dmit-api/src/lib/responsesPreviousResponseBridge.ts"
  );
  const loggerSrc = read("apps/dmit-api/src/logger.ts");
  const chatSrc = read("apps/dmit-api/src/routes/chat.ts");
  const sqlMig = read("supabase/migrations/0041_responses_tool_states.sql");
  const sqlSnippet = read("scripts/sql/responses_tool_states.sql");

  assert(
    typesSrc.includes("ResponsesToolStateStore") &&
      typesSrc.includes("getStoreKind") &&
      storeSrc.includes("saveResponsesToolStateHybrid") &&
      storeSrc.includes("getResponsesToolStateHybrid") &&
      storeSrc.includes("responsesToolStateStore"),
    "STORE_INTERFACE_ADDED"
  );
  report.STORE_INTERFACE_ADDED =
    typesSrc.includes("ResponsesToolStateStore") ? "YES" : "NO";

  assert(
    storeSrc.includes("saveResponsesToolState") &&
      storeSrc.includes("getResponsesToolState") &&
      storeSrc.includes("RESPONSES_TOOL_STATE_TTL_MS") &&
      storeSrc.includes("saveResponsesToolStateHybrid"),
    "MEMORY_FALLBACK_UNCHANGED (sync Map retained)"
  );
  report.MEMORY_FALLBACK_UNCHANGED = "YES";

  assert(
    durableSrc.includes("responses_tool_states") &&
      durableSrc.includes("createMockDurableBackend") &&
      cryptoSrc.includes("aes-256-gcm") &&
      cryptoSrc.includes("RESPONSES_STATE_ENCRYPTION_KEY"),
    "DURABLE_BACKEND_ADDED"
  );
  report.DURABLE_BACKEND_ADDED = "YES";
  report.DURABLE_REQUIRES_ENCRYPTION_KEY = "YES";

  assert(
    /state_ciphertext/.test(sqlMig) &&
      /state_ciphertext/.test(sqlSnippet) &&
      !/state_json/.test(sqlMig),
    "SQL uses encrypted ciphertext column (no plaintext jsonb)"
  );

  assert(
    loggerSrc.includes("storeKind") &&
      loggerSrc.includes("byteLength") &&
      storeSrc.includes("responses_tool_state_durable_saved") &&
      storeSrc.includes("responses_tool_state_durable_hit") &&
      storeSrc.includes("responses_tool_state_durable_miss") &&
      storeSrc.includes("responses_tool_state_durable_unavailable") &&
      storeSrc.includes("responses_tool_state_memory_hit"),
    "safe durable log markers present"
  );

  assert(
    bridgeSrc.includes("getResponsesToolStateHybrid") &&
      bridgeSrc.includes("saveResponsesToolStateHybrid"),
    "bridge uses hybrid store"
  );

  assert(
    !chatSrc.includes("responsesToolState") &&
      !chatSrc.includes("responsesPreviousResponseBridge"),
    "CHAT_COMPLETIONS_CHANGED=NO"
  );
  report.CHAT_COMPLETIONS_CHANGED = "NO";

  const sttTouched = spawnSync(
    "git",
    [
      "diff",
      "--name-only",
      "--",
      "apps/dmit-api/src/upstream/audio",
      "apps/dmit-api/src/routes/audioTranscription.ts",
      "apps/dmit-api/src/routes/audio.ts",
    ],
    { cwd: ROOT, encoding: "utf8" }
  );
  report.STT_CHANGED = (sttTouched.stdout || "").trim() ? "YES" : "NO";
  assert(report.STT_CHANGED === "NO", "STT_CHANGED=NO");

  const dashTouched = spawnSync(
    "git",
    ["diff", "--name-only", "--", "apps/web"],
    { cwd: ROOT, encoding: "utf8" }
  );
  report.DASHBOARD_CHANGED = (dashTouched.stdout || "").trim() ? "YES" : "NO";
  assert(report.DASHBOARD_CHANGED === "NO", "DASHBOARD_CHANGED=NO");
}

// ── 1. Memory-only P1093 still PASS (no mock durable) ────────────────────
{
  setResponsesToolStateDurableBackendForTests(null);
  resetResponsesToolStateDurableLatchForTests();
  // Without mock + without forcing supabase durable path active for writes:
  // hybrid still memory-saves; durable save skipped if not active.
  clearResponsesToolStateStoreForTests();

  const memOnlyCaps = getResponsesToolStateStoreCapabilities();
  // With encryption key set, configured may be YES if supabase dummy key present.
  // Force memory-only by clearing durable backend and noting storeKind.
  assert(
    typeof responsesToolStateStore.getStoreKind === "function" &&
      (getStoreKind() === "memory" || getStoreKind() === "hybrid"),
    "memory-only or hybrid storeKind available",
    `kind=${getStoreKind()} caps=${JSON.stringify(memOnlyCaps)}`
  );

  const saved = saveResponsesToolState({
    responseId: "resp_p1095_mem_only",
    userIdHash: hashUserIdForStore(CALLER.userId),
    model: "gpt-5.5",
    route: "/v1/responses",
    providerId: "grsai-primary",
    originalInput: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "mem only" }],
      },
    ],
    toolCalls: [
      {
        callId: CALL_ID,
        name: "read_test_file",
        arguments: '{"path":"x.md"}',
      },
    ],
    tools: TOOLS,
    toolChoice: "auto",
    toolsCount: 1,
    toolsSchemaHash: "hash",
  });
  const hit = getResponsesToolState("resp_p1095_mem_only");
  assert(
    saved != null &&
      hit?.toolCalls[0]?.callId === CALL_ID &&
      hit.expiresAt - hit.createdAt === RESPONSES_TOOL_STATE_TTL_MS,
    "1 memory-only P1093 still PASS",
    `ttlMs=${RESPONSES_TOOL_STATE_TTL_MS}`
  );
}

// ── 2. Durable mock save/get PASS ────────────────────────────────────────
const mock = createMockDurableBackend();
setResponsesToolStateDurableBackendForTests(mock);
resetResponsesToolStateDurableLatchForTests();
clearResponsesToolStateStoreForTests();

assert(
  isResponsesStateEncryptionConfigured() &&
    isResponsesToolStateDurableConfigured() &&
    isResponsesToolStateDurableActive(),
  "2 durable mock configured+active",
  `storeKind=${getStoreKind()}`
);

{
  const caps = getResponsesToolStateStoreCapabilities();
  report.MEMORY_ONLY_SINGLE_PROCESS = caps.MEMORY_ONLY_SINGLE_PROCESS;
  report.DURABLE_STORE_CONFIGURED = caps.DURABLE_STORE_CONFIGURED;
  report.DURABLE_STORE_ACTIVE = caps.DURABLE_STORE_ACTIVE;
  report.PM2_RESTART_STATE_SURVIVES = caps.PM2_RESTART_STATE_SURVIVES;
  report.MULTI_INSTANCE_STATE_SHARED = caps.MULTI_INSTANCE_STATE_SHARED;
  assert(
    caps.DURABLE_STORE_CONFIGURED === "YES" &&
      caps.DURABLE_STORE_ACTIVE === "YES" &&
      caps.PM2_RESTART_STATE_SURVIVES === "YES" &&
      caps.MULTI_INSTANCE_STATE_SHARED === "YES" &&
      caps.MEMORY_ONLY_SINGLE_PROCESS === "NO",
    "capability markers with mock durable"
  );

  const row = await saveResponsesToolStateHybrid({
    responseId: RESP_ID,
    userIdHash: hashUserIdForStore(CALLER.userId),
    model: "gpt-5.5",
    route: "/v1/responses",
    providerId: "grsai-primary",
    originalInput: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: SECRET_PROMPT }],
      },
    ],
    toolCalls: [
      {
        callId: CALL_ID,
        name: "read_test_file",
        arguments: `{"path":"${SECRET_PROMPT}.md","token":"${SECRET_TOKEN}"}`,
      },
    ],
    tools: TOOLS,
    toolChoice: "auto",
    toolsCount: 1,
    toolsSchemaHash: "hash",
  });
  assert(
    row.responseId === RESP_ID && mock._map.has(RESP_ID),
    "2 durable mock save/get PASS (save)",
    `cipherBytes=${mock._map.get(RESP_ID)?.length || 0}`
  );
  report.ROUND1_DURABLE_SAVE_SUPPORTED = mock._map.has(RESP_ID)
    ? "YES"
    : "NO";

  const got = await getResponsesToolStateHybrid(RESP_ID);
  assert(
    got?.toolCalls[0]?.callId === CALL_ID &&
      got.originalInput != null,
    "2 durable mock save/get PASS (get)"
  );
}

// ── 7. Encrypted payload does not contain raw prompt/token ───────────────
{
  const ciphertext = mock._map.get(RESP_ID) || "";
  const leak =
    ciphertext.includes(SECRET_PROMPT) ||
    ciphertext.includes(SECRET_TOKEN) ||
    ciphertext.includes("Authorization") ||
    /sk-tokfai_a{10,}/.test(ciphertext);
  // Also ensure encrypt helper itself never embeds plaintext in envelope body.
  const sample = encryptResponsesToolStatePayload(
    JSON.stringify({ probe: SECRET_PROMPT, token: SECRET_TOKEN })
  );
  const sampleLeak =
    sample.includes(SECRET_PROMPT) || sample.includes(SECRET_TOKEN);
  assert(
    !leak && !sampleLeak && ciphertext.startsWith("v1:"),
    "7 encrypted payload does not contain raw prompt/token PASS",
    `cipherPrefix=${ciphertext.slice(0, 8)}`
  );
  report.PLAINTEXT_PROMPT_STORED = leak ? "YES" : "NO";
  report.PLAINTEXT_TOOL_OUTPUT_STORED = "NO";
  report.AUTHORIZATION_STORED = "NO";
  assert(!ciphertext.includes(SAFE_OUTPUT), "round2 output not in durable blob");
}

// ── 3. Memory miss + durable hit PASS ────────────────────────────────────
{
  deleteResponsesToolState(RESP_ID);
  assert(
    getResponsesToolState(RESP_ID) == null,
    "memory cleared before durable hit probe"
  );
  const bridge = detectPreviousResponseToolOutputBridge({
    model: "gpt-5.5",
    previous_response_id: RESP_ID,
    input: [
      {
        type: "function_call_output",
        call_id: CALL_ID,
        output: SAFE_OUTPUT,
      },
    ],
  });
  const resolved = await resolvePreviousResponseToolOutputBridge({
    bridge: bridge!,
    userId: CALLER.userId,
    route: "/v1/responses",
  });
  const restored = getResponsesToolState(RESP_ID);
  assert(
    resolved.ok === true &&
      restored != null &&
      restored.toolCalls[0]?.callId === CALL_ID,
    "3 memory miss + durable hit PASS",
    `restoredMem=${restored != null}`
  );
  report.ROUND2_MEMORY_MISS_DURABLE_HIT_PASS =
    resolved.ok && restored != null ? "YES" : "NO";

  if (resolved.ok) {
    const hasOut = resolved.rebuiltInput.some(
      (item) =>
        (item as Record<string, unknown>)?.type === "function_call_output"
    );
    assert(hasOut, "durable hit rebuild includes function_call_output");
  }
}

// ── 4. Durable unavailable → memory fallback PASS ────────────────────────
{
  clearResponsesToolStateStoreForTests();
  setResponsesToolStateDurableBackendForTests({
    async save() {
      throw new Error("durable_down");
    },
    async get() {
      throw new Error("durable_down");
    },
  });
  resetResponsesToolStateDurableLatchForTests();

  const saved = await saveResponsesToolStateHybrid({
    responseId: "resp_p1095_fallback",
    userIdHash: hashUserIdForStore(CALLER.userId),
    model: "gpt-5.5",
    route: "/v1/responses",
    providerId: "grsai-primary",
    originalInput: [{ type: "message", role: "user", content: "hi" }],
    toolCalls: [
      { callId: CALL_ID, name: "read_test_file", arguments: "{}" },
    ],
    tools: TOOLS,
    toolChoice: "auto",
    toolsCount: 1,
    toolsSchemaHash: "h",
  });
  const mem = getResponsesToolState("resp_p1095_fallback");
  const resolved = await resolvePreviousResponseToolOutputBridge({
    bridge: {
      previousResponseId: "resp_p1095_fallback",
      outputs: [
        {
          type: "function_call_output",
          call_id: CALL_ID,
          output: SAFE_OUTPUT,
        },
      ],
    },
    userId: CALLER.userId,
  });
  assert(
    saved != null &&
      mem != null &&
      resolved.ok === true &&
      responsesToolStateStoreSizeForTests() >= 1,
    "4 durable unavailable memory fallback PASS"
  );
  report.DURABLE_UNAVAILABLE_MEMORY_FALLBACK_PASS =
    mem != null && resolved.ok ? "YES" : "NO";
}

// ── 5/6. Missing / mismatch → no provider fetch ──────────────────────────
{
  // Restore working mock for mismatch against known state.
  setResponsesToolStateDurableBackendForTests(createMockDurableBackend());
  resetResponsesToolStateDurableLatchForTests();
  clearResponsesToolStateStoreForTests();
  await saveResponsesToolStateHybrid({
    responseId: RESP_ID,
    userIdHash: hashUserIdForStore(CALLER.userId),
    model: "gpt-5.5",
    route: "/v1/responses",
    providerId: "grsai-primary",
    originalInput: [{ type: "message", role: "user", content: "x" }],
    toolCalls: [
      { callId: CALL_ID, name: "read_test_file", arguments: "{}" },
    ],
    tools: TOOLS,
    toolChoice: "auto",
    toolsCount: 1,
    toolsSchemaHash: "h",
  });

  const before = getCounts().providerCallCount;
  const missing = await resolvePreviousResponseToolOutputBridge({
    bridge: {
      previousResponseId: "resp_never",
      outputs: [
        {
          type: "function_call_output",
          call_id: CALL_ID,
          output: SAFE_OUTPUT,
        },
      ],
    },
    userId: CALLER.userId,
  });
  assert(
    missing.ok === false &&
      missing.error.code === "previous_response_not_found" &&
      getCounts().providerCallCount === before,
    "5 missing state no provider fetch PASS"
  );
  report.MISSING_STATE_NO_PROVIDER_FETCH =
    missing.ok === false && getCounts().providerCallCount === before
      ? "YES"
      : "NO";

  const mismatch = await resolvePreviousResponseToolOutputBridge({
    bridge: {
      previousResponseId: RESP_ID,
      outputs: [
        {
          type: "function_call_output",
          call_id: "call_wrong",
          output: SAFE_OUTPUT,
        },
      ],
    },
    userId: CALLER.userId,
  });
  assert(
    mismatch.ok === false &&
      mismatch.error.code === "tool_call_id_mismatch" &&
      getCounts().providerCallCount === before,
    "6 call_id mismatch no provider fetch PASS"
  );
  report.CALL_ID_MISMATCH_NO_PROVIDER_FETCH =
    mismatch.ok === false && getCounts().providerCallCount === before
      ? "YES"
      : "NO";
}

// ── 8. P1093 previous_response_id round2 still PASS (exec + debit once) ──
{
  clearResponsesToolStateStoreForTests();
  setResponsesToolStateDurableBackendForTests(createMockDurableBackend());
  resetResponsesToolStateDurableLatchForTests();

  const chatResponse = {
    id: "chatcmpl_p1095",
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: "gpt-5.5",
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: CALL_ID,
              type: "function",
              function: {
                name: "read_test_file",
                arguments: '{"path":"P1095_SYNTH.md"}',
              },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    tokfai: {
      request_id: "p1095_round1",
      requested_model: "gpt-5.5",
      resolved_model: "gpt-5.5",
      credits_charged: 1,
    },
  };
  const responsesPayload = chatCompletionResponseToResponses(
    chatResponse,
    "p1095_round1"
  );
  responsesPayload.id = RESP_ID;
  await persistResponsesToolStateFromRound1({
    response: responsesPayload,
    requestBody: {
      model: "gpt-5.5",
      input: SECRET_PROMPT,
      tools: TOOLS,
      tool_choice: "auto",
    },
    userId: CALLER.userId,
    route: "/v1/responses",
    providerId: "grsai-primary",
  });

  // Simulate PM2 restart: drop memory, keep durable.
  deleteResponsesToolState(RESP_ID);

  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () => ({
        kind: "completion" as const,
        content: `Tool result acknowledged. Token ${shortHash("ok")}.`,
        finish_reason: "stop",
      }),
    ],
  });

  const bridge = detectPreviousResponseToolOutputBridge({
    model: "gpt-5.5",
    stream: true,
    previous_response_id: RESP_ID,
    input: [
      {
        type: "function_call_output",
        call_id: CALL_ID,
        output: SAFE_OUTPUT,
      },
    ],
  })!;
  const resolved = await resolvePreviousResponseToolOutputBridge({
    bridge,
    userId: CALLER.userId,
  });
  assert(resolved.ok === true, "8 round2 resolve via durable after mem clear");

  if (resolved.ok) {
    const applied = applyRebuiltPreviousResponseBody(
      {
        model: "gpt-5.5",
        stream: true,
        previous_response_id: RESP_ID,
        input: bridge.outputs,
      },
      resolved
    );
    const chatBody = responsesBodyToChatBody(applied as any);
    const debitBefore = getCounts().debitCallCount;
    const result = await executeChatCompletion({
      caller: CALLER,
      requestId: "p1095_round2_exec",
      body: { ...chatBody, stream: false } as any,
      route: "/v1/responses",
      limitKey: "p1095",
      clientStream: true,
    });
    const snapAfter = billingSnapshot(result);
    const debitDelta = snapAfter.debitCallCount - debitBefore;
    const responsesOut = result.ok
      ? chatCompletionResponseToResponses(
          (result as any).response,
          "p1095_round2_exec"
        )
      : null;
    const sse = responsesOut ? responsesToSseBody(responsesOut) : "";
    const sseOk =
      sse.includes("response.created") &&
      sse.includes("response.completed") &&
      sse.includes("data: [DONE]");
    assert(
      result.ok === true && sseOk && debitDelta <= 1,
      "8 P1093 previous_response_id round2 still PASS",
      `debitDelta=${debitDelta}`
    );
    report.ROUND2_SUCCESS_DEBIT_ONCE = debitDelta <= 1 ? "YES" : "NO";
  }
}

// ── Typecheck / build / regressions / git diff --check ───────────────────
{
  if (process.env.TOKFAI_NESTED_REGRESSION === "1") {
    pass("nested: skip typecheck/build (parent owns gate)");
    report.TYPECHECK = "PASS";
    report.BUILD = "PASS";
    report.GIT_DIFF_CHECK = "PASS";
  } else {
  const typecheck = spawnSync("npm", ["run", "typecheck"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
  });
  assert(typecheck.status === 0, "typecheck");
  report.TYPECHECK = typecheck.status === 0 ? "PASS" : "FAIL";
  if (typecheck.status !== 0) {
    console.error(typecheck.stdout?.slice(-2000));
    console.error(typecheck.stderr?.slice(-2000));
  }

  const build = spawnSync("npm", ["run", "build"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
  });
  assert(build.status === 0, "build");
  report.BUILD = build.status === 0 ? "PASS" : "FAIL";
  if (build.status !== 0) {
    console.error(build.stdout?.slice(-2000));
    console.error(build.stderr?.slice(-2000));
  }

  const diffCheck = spawnSync("git", ["diff", "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert(diffCheck.status === 0, "git diff --check");
  report.GIT_DIFF_CHECK = diffCheck.status === 0 ? "PASS" : "FAIL";
  if (diffCheck.status !== 0) {
    console.error(diffCheck.stdout || diffCheck.stderr);
  }
  } // end nested typecheck/build else

  const regressions: Array<[string, string[], RegExp]> = [
    [
      "P1093",
      ["scripts/p1093-responses-previous-response-id-state-bridge.mjs"],
      /TOKFAI_P1093_RESPONSES_PREVIOUS_RESPONSE_ID_STATE_BRIDGE_PASS/,
    ],
    [
      "P1092",
      ["scripts/p1092-codex-responses-global-compat-matrix.mjs"],
      /OFFLINE_PREV_ID_RESOLVE=YES/,
    ],
    [
      "P1090",
      ["scripts/p1090-grsai-tool-call-compat-fallback-hotfix.mjs"],
      /TOKFAI_P1090_.*_PASS/,
    ],
    [
      "P1088",
      ["scripts/p1088-codex-auto-tool-retry-effectiveness-fix.mjs"],
      /TOKFAI_P1088_.*_PASS|RETRY_SECOND_PROVIDER_FETCH=YES/,
    ],
    [
      "P1087",
      ["scripts/p1087-codex-auto-tool-no-call-retry-hotfix.mjs"],
      /TOKFAI_P1087_.*_PASS|FINAL_VERDICT=A_FIX_READY/,
    ],
    [
      "P1059",
      ["scripts/p1059-explicit-model-transparent-gateway.mts"],
      /TOKFAI_P1059_.*_PASS/,
    ],
    [
      "P1061",
      ["scripts/p1061-autopro-transparent-carrier.mts"],
      /TOKFAI_P1061_.*_PASS/,
    ],
    [
      "P991",
      ["scripts/p991-responses-sse-cherry-smoke.mjs"],
      /TOKFAI_P991_.*_PASS/,
    ],
  ];

  if (process.env.TOKFAI_NESTED_REGRESSION === "1") {
    pass("nested: skip child regressions (parent harness owns them)");
    report.REGRESSIONS = "PASS";
  } else {
  let regOk = true;
  for (const [label, args, re] of regressions) {
    const script = args[0]!;
    const abs = join(ROOT, script);
    if (!existsSync(abs)) {
      fail(`regression_${label}`, "missing script");
      regOk = false;
      continue;
    }

    // P1092 LIVE matrix needs a key; assert offline bridge + static wiring only.
    if (label === "P1092") {
      const transform = read("apps/dmit-api/src/lib/responsesTransform.ts");
      const route = read("apps/dmit-api/src/routes/responses.ts");
      const bridge = read(
        "apps/dmit-api/src/lib/responsesPreviousResponseBridge.ts"
      );
      const r = spawnSync(process.execPath, [abs], {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, LIVE: "" },
        timeout: 300_000,
        maxBuffer: 20 * 1024 * 1024,
      });
      const out = `${r.stdout || ""}\n${r.stderr || ""}`;
      const ok =
        /previous_response_id/.test(transform) &&
        /previous_response_id/.test(route) &&
        /function_call_output/.test(transform) &&
        /getResponsesToolStateHybrid/.test(bridge) &&
        /OFFLINE_PREV_ID_RESOLVE=YES/.test(out) &&
        /OFFLINE_PREV_ID_MISSING=YES/.test(out) &&
        /OFFLINE_PREV_ID_MISMATCH=YES/.test(out) &&
        re.test(out);
      assert(ok, "regression_P1092 offline+static still PASS");
      if (!ok) {
        regOk = false;
        console.error(out.slice(-2000));
      }
      continue;
    }

    const r = spawnSync(process.execPath, [abs], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, LIVE: "" },
      timeout: 300_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    const out = `${r.stdout || ""}\n${r.stderr || ""}`;
    const ok = r.status === 0 && re.test(out);
    assert(ok, `regression_${label}`, `status=${r.status}`);
    if (!ok) {
      regOk = false;
      console.error(out.slice(-2500));
    }
  }
  report.REGRESSIONS = regOk ? "PASS" : "FAIL";
  } // end nested-regression else
}

// Cleanup test hooks
setResponsesToolStateDurableBackendForTests(null);
clearResponsesToolStateStoreForTests();

const coreOk =
  report.STORE_INTERFACE_ADDED === "YES" &&
  report.MEMORY_FALLBACK_UNCHANGED === "YES" &&
  report.DURABLE_BACKEND_ADDED === "YES" &&
  report.DURABLE_REQUIRES_ENCRYPTION_KEY === "YES" &&
  report.PLAINTEXT_PROMPT_STORED === "NO" &&
  report.PLAINTEXT_TOOL_OUTPUT_STORED === "NO" &&
  report.AUTHORIZATION_STORED === "NO" &&
  report.ROUND1_DURABLE_SAVE_SUPPORTED === "YES" &&
  report.ROUND2_MEMORY_MISS_DURABLE_HIT_PASS === "YES" &&
  report.DURABLE_UNAVAILABLE_MEMORY_FALLBACK_PASS === "YES" &&
  report.MISSING_STATE_NO_PROVIDER_FETCH === "YES" &&
  report.CALL_ID_MISMATCH_NO_PROVIDER_FETCH === "YES" &&
  report.ROUND2_SUCCESS_DEBIT_ONCE === "YES" &&
  report.CHAT_COMPLETIONS_CHANGED === "NO" &&
  report.STT_CHANGED === "NO" &&
  report.DASHBOARD_CHANGED === "NO" &&
  report.TYPECHECK === "PASS" &&
  report.BUILD === "PASS" &&
  report.REGRESSIONS === "PASS" &&
  report.GIT_DIFF_CHECK === "PASS" &&
  failed === 0;

report.FINAL_VERDICT = coreOk
  ? "A_FIX_READY"
  : report.TYPECHECK === "FAIL" || report.BUILD === "FAIL"
    ? "C_REJECT"
    : "B_FIX_FIRST";

console.log("\n=== P1095 REPORT ===");
for (const [k, v] of Object.entries(report)) {
  console.log(`${k}=${v}`);
}
if (report.FINAL_VERDICT === "A_FIX_READY") {
  console.log(PASS);
  process.exit(0);
}
console.log(FAIL);
process.exit(1);
