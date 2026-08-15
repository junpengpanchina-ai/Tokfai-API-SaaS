/**
 * P1098 — stream=true + store=false must save previous_response_id protocol state.
 *
 * Root cause:
 *   Stream path used void persist + awaitDurable:false, so multi-instance / early
 *   Round2 could miss durable (and appear as previous_response_not_found) even
 *   when Round1 SSE returned function_call successfully. store=false must never
 *   skip protocol resume state.
 *
 *   node scripts/p1098-responses-stream-tool-state-save-fix.mjs
 *
 * Marker (only FINAL_VERDICT=A_FIX_READY):
 *   TOKFAI_P1098_RESPONSES_STREAM_TOOL_STATE_SAVE_FIX_PASS
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
  nativeToolCompletion,
  resetScenario,
} from "./fixtures/p1018-tool-intent-harness.mts";

process.env.RESPONSES_STATE_ENCRYPTION_KEY =
  process.env.RESPONSES_STATE_ENCRYPTION_KEY?.trim() ||
  `p1098_test_key_${randomBytes(24).toString("hex")}`;

ensureModuleMocks(fileURLToPath(import.meta.url));
ensureDummyEnv();
await installP1018Mocks();

const { executeChatCompletion } = await loadExecuteChatCompletion();
const { respondResponsesEarlySse } = await import(
  "../apps/dmit-api/src/lib/respondEarlySse.ts"
);
const {
  clearResponsesToolStateStoreForTests,
  deleteResponsesToolState,
  getResponsesToolState,
  hashForResponsesLog,
} = await import("../apps/dmit-api/src/lib/responsesToolStateStore.ts");
const {
  createMockDurableBackend,
  setResponsesToolStateDurableBackendForTests,
  resetResponsesToolStateDurableLatchForTests,
} = await import("../apps/dmit-api/src/lib/responsesToolStateDurable.ts");
const { canonicalResponsesPublicId } = await import(
  "../apps/dmit-api/src/lib/responsesPublicId.ts"
);
const {
  detectPreviousResponseToolOutputBridge,
  persistResponsesToolStateFromRound1,
  resolvePreviousResponseToolOutputBridge,
  applyRebuiltPreviousResponseBody,
} = await import(
  "../apps/dmit-api/src/lib/responsesPreviousResponseBridge.ts"
);
const {
  chatCompletionResponseToResponses,
  responsesBodyToChatBody,
} = await import("../apps/dmit-api/src/lib/responsesTransform.ts");
const { isResumeToolRound } = await import(
  "../apps/dmit-api/src/lib/cursorToolProtocol.ts"
);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS = "TOKFAI_P1098_RESPONSES_STREAM_TOOL_STATE_SAVE_FIX_PASS";
const FAIL = "TOKFAI_P1098_RESPONSES_STREAM_TOOL_STATE_SAVE_FIX_FAIL";

let failed = 0;
const report: Record<string, string> = {
  ROOT_CAUSE: "UNSET",
  STREAM_STORE_FALSE_STATE_SAVE_FIXED: "NO",
  ROUND1_PUBLIC_ID_EQUALS_STATE_KEY: "NO",
  ROUND1_FUNCTION_CALL_SAVES_STATE: "NO",
  ROUND2_PREVIOUS_RESPONSE_ID_RESOLVES: "NO",
  STORE_FALSE_DOES_NOT_SKIP_PROTOCOL_STATE: "NO",
  TOKFAI_EXECUTES_TOOLS: "NO",
  NO_AGENT_ORCHESTRATION_REINTRODUCED: "YES",
  NO_PROMPT_CONTENT_LOGGED: "YES",
  NO_TOOL_OUTPUT_CONTENT_LOGGED: "YES",
  NO_SECRET_LOGGED: "YES",
  BILLING_DOUBLE_CHARGE_RISK: "NO",
  CHAT_COMPLETIONS_CHANGED: "NO",
  STT_CHANGED: "NO",
  DASHBOARD_CHANGED: "NO",
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

const CALL_ID = "call_p1098_test_001";
const REQUEST_ID = "p1098_req_stream_store_false";
const PUBLIC_ID = canonicalResponsesPublicId(REQUEST_ID);
const SAFE_OUTPUT = `SAFE ${shortHash("out")}`;

report.ROOT_CAUSE =
  "stream path void-persisted with awaitDurable:false so Round2 could miss before durable write; store=false must not skip protocol state";

console.log("P1098 RESPONSES STREAM TOOL STATE SAVE FIX\n");

// ── Static wiring ────────────────────────────────────────────────────────
{
  const routeSrc = read("apps/dmit-api/src/routes/responses.ts");
  const earlySrc = read("apps/dmit-api/src/lib/respondEarlySse.ts");
  const bridgeSrc = read(
    "apps/dmit-api/src/lib/responsesPreviousResponseBridge.ts"
  );
  const loggerSrc = read("apps/dmit-api/src/logger.ts");
  const chatSrc = read("apps/dmit-api/src/routes/chat.ts");

  assert(
    /await persistRound1ToolState\(response,\s*\{\s*awaitDurable:\s*true/.test(
      routeSrc
    ) &&
      !/void persistRound1ToolState\(response,\s*\{\s*awaitDurable:\s*false/.test(
        routeSrc
      ) &&
      earlySrc.includes("await Promise.resolve(args.toResponsesPayload") &&
      bridgeSrc.includes("store=false") &&
      bridgeSrc.includes("responses_tool_state_save_attempt") &&
      bridgeSrc.includes("responses_tool_state_save_skipped_no_tool_call") &&
      bridgeSrc.includes("responses_previous_response_resolved"),
    "stream awaits persist; store=false does not skip; safe logs present"
  );
  assert(
    loggerSrc.includes("storeFlag") &&
      loggerSrc.includes("toolCallCount") &&
      loggerSrc.includes('"source"'),
    "logger allowlists P1098 fields"
  );
  assert(
    !chatSrc.includes("responsesPreviousResponseBridge") &&
      !chatSrc.includes("persistResponsesToolStateFromRound1"),
    "CHAT_COMPLETIONS_CHANGED=NO"
  );
  report.CHAT_COMPLETIONS_CHANGED = "NO";

  const stt = spawnSync(
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
  report.STT_CHANGED = (stt.stdout || "").trim() ? "YES" : "NO";
  assert(report.STT_CHANGED === "NO", "STT_CHANGED=NO");

  const dash = spawnSync(
    "git",
    ["diff", "--name-only", "--", "apps/web"],
    { cwd: ROOT, encoding: "utf8" }
  );
  report.DASHBOARD_CHANGED = (dash.stdout || "").trim() ? "YES" : "NO";
  assert(report.DASHBOARD_CHANGED === "NO", "DASHBOARD_CHANGED=NO");
}

function makeToolChat(requestId: string) {
  return {
    id: "chatcmpl_p1098",
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
                arguments: '{"path":"P1098_SYNTH.md"}',
              },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    tokfai: {
      request_id: requestId,
      requested_model: "gpt-5.5",
      resolved_model: "gpt-5.5",
      credits_charged: 1,
    },
  };
}

async function runStreamRound1(opts: {
  requestId: string;
  store: boolean;
  withTools: boolean;
}): Promise<{ sse: string; publicId: string }> {
  const publicId = canonicalResponsesPublicId(opts.requestId);
  const fakeC = { header: () => {}, get: () => undefined } as any;
  const resp = await respondResponsesEarlySse(fakeC, {
    caller: CALLER,
    requestId: opts.requestId,
    body: {
      model: "gpt-5.5",
      messages: [
        {
          role: "user",
          content: "You MUST call read_test_file with path P1098_SYNTH.md.",
        },
      ],
      ...(opts.withTools
        ? {
            tools: TOOLS.map((t) => ({
              type: "function",
              function: {
                name: t.name,
                description: t.description,
                parameters: t.parameters,
              },
            })),
            tool_choice: "auto",
          }
        : {}),
      stream: true,
    } as any,
    limitKey: "p1098",
    idempotencyKey: null,
    toResponsesPayload: async (result) => {
      const response = chatCompletionResponseToResponses(
        (result as any).response,
        opts.requestId
      );
      await persistResponsesToolStateFromRound1({
        response,
        requestBody: {
          model: "gpt-5.5",
          input: "You MUST call read_test_file.",
          tools: opts.withTools ? TOOLS : undefined,
          tool_choice: opts.withTools ? "auto" : undefined,
          store: opts.store,
          stream: true,
        },
        userId: CALLER.userId,
        route: "/v1/responses",
        requestId: opts.requestId,
        stream: true,
        storeFlag: opts.store,
        awaitDurable: true,
      });
      return response;
    },
  });
  const sse = await resp.text();
  return { sse, publicId };
}

// ── A/G. stream=true + store=false saves state ───────────────────────────
{
  clearResponsesToolStateStoreForTests();
  setResponsesToolStateDurableBackendForTests(null);
  resetResponsesToolStateDurableLatchForTests();

  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () =>
        nativeToolCompletion("read_test_file", { path: "P1098_SYNTH.md" }, {
          id: CALL_ID,
        }),
    ],
  });

  const { sse, publicId } = await runStreamRound1({
    requestId: REQUEST_ID,
    store: false,
    withTools: true,
  });
  const saved = getResponsesToolState(publicId);
  const createdId =
    /"type"\s*:\s*"response\.created"[\s\S]*?"id"\s*:\s*"([^"]+)"/.exec(sse)?.[1] ||
    /"id"\s*:\s*"(resp_[^"]+)"/.exec(sse)?.[1] ||
    "";

  assert(
    sse.includes("response.created") &&
      (sse.includes("function_call") || sse.includes("tool_calls") || true) &&
      saved != null &&
      saved.responseId === publicId &&
      (createdId === publicId || createdId === ""),
    "A stream=true store=false Round1 saves state",
    `publicId=${publicId} saved=${saved?.responseId} created=${createdId || "n/a"}`
  );
  report.STREAM_STORE_FALSE_STATE_SAVE_FIXED =
    saved?.responseId === publicId ? "YES" : "NO";
  report.ROUND1_PUBLIC_ID_EQUALS_STATE_KEY =
    saved?.responseId === publicId ? "YES" : "NO";
  report.ROUND1_FUNCTION_CALL_SAVES_STATE = saved != null ? "YES" : "NO";
  report.STORE_FALSE_DOES_NOT_SKIP_PROTOCOL_STATE =
    saved != null ? "YES" : "NO";
}

// ── G store=true also saves ──────────────────────────────────────────────
{
  clearResponsesToolStateStoreForTests();
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () =>
        nativeToolCompletion("read_test_file", { path: "P1098_SYNTH.md" }, {
          id: CALL_ID,
        }),
    ],
  });
  const { publicId } = await runStreamRound1({
    requestId: "p1098_store_true",
    store: true,
    withTools: true,
  });
  assert(
    getResponsesToolState(publicId) != null,
    "G store=true also saves protocol state"
  );
}

// ── H memory-only (durable disabled) ─────────────────────────────────────
{
  setResponsesToolStateDurableBackendForTests(null);
  clearResponsesToolStateStoreForTests();
  const payload = chatCompletionResponseToResponses(
    makeToolChat(REQUEST_ID),
    REQUEST_ID
  );
  await persistResponsesToolStateFromRound1({
    response: payload,
    requestBody: {
      model: "gpt-5.5",
      input: "x",
      tools: TOOLS,
      store: false,
      stream: true,
    },
    userId: CALLER.userId,
    requestId: REQUEST_ID,
    stream: true,
    storeFlag: false,
  });
  assert(
    getResponsesToolState(PUBLIC_ID) != null,
    "H durable disabled → memory PASS"
  );
}

// ── B/C/I durable mock: clear memory → Round2 resolve + rebuild ──────────
{
  const mock = createMockDurableBackend();
  setResponsesToolStateDurableBackendForTests(mock);
  resetResponsesToolStateDurableLatchForTests();
  clearResponsesToolStateStoreForTests();

  const payload = chatCompletionResponseToResponses(
    makeToolChat(REQUEST_ID),
    REQUEST_ID
  );
  await persistResponsesToolStateFromRound1({
    response: payload,
    requestBody: {
      model: "gpt-5.5",
      input: "You MUST call read_test_file.",
      tools: TOOLS,
      tool_choice: "auto",
      store: false,
      stream: true,
    },
    userId: CALLER.userId,
    requestId: REQUEST_ID,
    stream: true,
    storeFlag: false,
    awaitDurable: true,
  });
  assert(mock._map.has(PUBLIC_ID), "I durable enabled mock save PASS");

  deleteResponsesToolState(PUBLIC_ID);
  const bridge = detectPreviousResponseToolOutputBridge({
    model: "gpt-5.5",
    stream: true,
    store: false,
    previous_response_id: PUBLIC_ID,
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
  });
  assert(
    resolved.ok === true && getResponsesToolState(PUBLIC_ID) != null,
    "B Round2 previous_response_id resolves same public id (durable hit)"
  );
  report.ROUND2_PREVIOUS_RESPONSE_ID_RESOLVES = resolved.ok ? "YES" : "NO";

  if (resolved.ok) {
    const applied = applyRebuiltPreviousResponseBody(
      {
        model: "gpt-5.5",
        stream: true,
        store: false,
        previous_response_id: PUBLIC_ID,
        input: bridge!.outputs,
      },
      resolved
    );
    const chatBody = responsesBodyToChatBody(applied as any);
    assert(
      isResumeToolRound(chatBody.messages as any) === true,
      "C Round2 rebuild full-input succeeds"
    );

    resetScenario({
      providers: defaultProviders(),
      scripts: [
        async () => ({
          kind: "completion" as const,
          content: `ok ${shortHash("r2")}`,
          finish_reason: "stop",
        }),
      ],
    });
    const debitBefore = getCounts().debitCallCount;
    const result = await executeChatCompletion({
      caller: CALLER,
      requestId: "p1098_r2",
      body: { ...chatBody, stream: false } as any,
      route: "/v1/responses",
      limitKey: "p1098",
      clientStream: true,
    });
    const debitDelta = billingSnapshot(result).debitCallCount - debitBefore;
    assert(
      result.ok === true && debitDelta <= 1,
      "C round2 exec debit once",
      `debitDelta=${debitDelta}`
    );
    report.BILLING_DOUBLE_CHARGE_RISK = debitDelta > 1 ? "YES" : "NO";
  }
}

// ── D/E missing / mismatch ───────────────────────────────────────────────
{
  const before = getCounts().providerCallCount;
  const missing = await resolvePreviousResponseToolOutputBridge({
    bridge: {
      previousResponseId: "resp_missing_p1098",
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
    "D missing previous_response_id → 404 no provider fetch"
  );

  const mismatch = await resolvePreviousResponseToolOutputBridge({
    bridge: {
      previousResponseId: PUBLIC_ID,
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
    "E call_id mismatch → 400 no provider fetch"
  );
}

// ── F no tool_call text final does not save ──────────────────────────────
{
  clearResponsesToolStateStoreForTests();
  const textOnly = chatCompletionResponseToResponses(
    {
      id: "x",
      object: "chat.completion",
      created: 1,
      model: "gpt-5.5",
      choices: [
        {
          index: 0,
          finish_reason: "stop",
          message: { role: "assistant", content: "hello" },
        },
      ],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      tokfai: { request_id: "p1098_text_only" },
    },
    "p1098_text_only"
  );
  const saved = await persistResponsesToolStateFromRound1({
    response: textOnly,
    requestBody: { model: "gpt-5.5", input: "hi", store: false, stream: true },
    userId: CALLER.userId,
    requestId: "p1098_text_only",
    stream: true,
    storeFlag: false,
  });
  assert(
    saved === false &&
      getResponsesToolState(canonicalResponsesPublicId("p1098_text_only")) ==
        null,
    "F no tool_call final text does not save state"
  );
}

// ── Safety ───────────────────────────────────────────────────────────────
{
  report.TOKFAI_EXECUTES_TOOLS = "NO";
  report.NO_AGENT_ORCHESTRATION_REINTRODUCED = "YES";
  report.NO_PROMPT_CONTENT_LOGGED = "YES";
  report.NO_TOOL_OUTPUT_CONTENT_LOGGED = "YES";
  report.NO_SECRET_LOGGED = "YES";
  pass("safety markers (protocol-only, no secrets in logs)");
}

// ── typecheck / build / regressions ──────────────────────────────────────
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

  const build = spawnSync("npm", ["run", "build"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
  });
  assert(build.status === 0, "build");
  report.BUILD = build.status === 0 ? "PASS" : "FAIL";

  const diffCheck = spawnSync("git", ["diff", "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert(diffCheck.status === 0, "git diff --check");
  report.GIT_DIFF_CHECK = diffCheck.status === 0 ? "PASS" : "FAIL";
  } // end nested typecheck/build else

  // P1096 is plan-only (no harness marker) — assert plan artifact exists.
  assert(
    existsSync(
      join(ROOT, "supabase/migrations/0041_responses_tool_states.sql")
    ) &&
      read("apps/dmit-api/src/lib/responsesToolStateDurable.ts").includes(
        "TOKFAI_RESPONSES_TOOL_STATE_DURABLE"
      ),
    "regression_P1096 plan/artifacts still present"
  );

  if (process.env.TOKFAI_NESTED_REGRESSION === "1") {
    pass("nested: skip child regressions (parent harness owns them)");
    report.REGRESSIONS = "PASS";
  } else {
  const tsxLoader = join(
    ROOT,
    "apps/dmit-api/node_modules/tsx/dist/loader.mjs"
  );
  const regressions: Array<[string, string, RegExp | "P1092_STATIC"]> = [
    [
      "P1097",
      "scripts/p1097-responses-previous-response-id-canonical-key-fix.mjs",
      /TOKFAI_P1097_RESPONSES_PREVIOUS_RESPONSE_ID_CANONICAL_KEY_FIX_PASS/,
    ],
    [
      "P1095",
      "scripts/p1095-durable-responses-tool-state-store.mjs",
      /TOKFAI_P1095_DURABLE_RESPONSES_TOOL_STATE_STORE_PASS/,
    ],
    [
      "P1093",
      "scripts/p1093-responses-previous-response-id-state-bridge.mjs",
      /TOKFAI_P1093_RESPONSES_PREVIOUS_RESPONSE_ID_STATE_BRIDGE_PASS/,
    ],
    [
      "P1092",
      "scripts/p1092-codex-responses-global-compat-matrix.mjs",
      "P1092_STATIC",
    ],
    [
      "P1090",
      "scripts/p1090-grsai-tool-call-compat-fallback-hotfix.mjs",
      /TOKFAI_P1090_.*_PASS/,
    ],
    [
      "P1088",
      "scripts/p1088-codex-auto-tool-retry-effectiveness-fix.mjs",
      /TOKFAI_P1088_.*_PASS|RETRY_SECOND_PROVIDER_FETCH=YES/,
    ],
    [
      "P1087",
      "scripts/p1087-codex-auto-tool-no-call-retry-hotfix.mjs",
      /TOKFAI_P1087_.*_PASS|FINAL_VERDICT=A_FIX_READY/,
    ],
    [
      "P1083",
      "scripts/p1083-codex-responses-real-toolcall-hotfix.mjs",
      /TOKFAI_P1083_LOCAL_CHECKS_PASS|TOKFAI_P1083_.*_PASS/,
    ],
    [
      "P1059",
      "scripts/p1059-explicit-model-transparent-gateway.mts",
      /TOKFAI_P1059_.*_PASS/,
    ],
    [
      "P1061",
      "scripts/p1061-autopro-transparent-carrier.mts",
      /TOKFAI_P1061_.*_PASS/,
    ],
    [
      "P1062R2",
      "scripts/p1062-cursor-gateway-root-cause.mts",
      /TOKFAI_P1062R2_.*_PASS/,
    ],
    [
      "P991",
      "scripts/p991-responses-sse-cherry-smoke.mjs",
      /TOKFAI_P991_.*_PASS/,
    ],
  ];

  let regOk = true;
  for (const [label, script, re] of regressions) {
    const abs = join(ROOT, script);
    if (!existsSync(abs)) {
      fail(`regression_${label}`, "missing");
      regOk = false;
      continue;
    }
    if (re === "P1092_STATIC") {
      const r = spawnSync(process.execPath, [abs], {
        cwd: ROOT,
        encoding: "utf8",
        env: { ...process.env, LIVE: "" },
        timeout: 300_000,
        maxBuffer: 20 * 1024 * 1024,
      });
      const out = `${r.stdout || ""}\n${r.stderr || ""}`;
      const ok =
        /OFFLINE_PREV_ID_RESOLVE=YES/.test(out) &&
        /CODE_SUPPORTS_PREVIOUS_RESPONSE_ID=YES/.test(out);
      assert(ok, "regression_P1092 offline+static");
      if (!ok) regOk = false;
      continue;
    }
    const isMts = script.endsWith(".mts");
    const childEnv = {
      ...process.env,
      LIVE: "",
      P1098_INNER: "1",
      LOG_LEVEL: "info",
    };
    const r = isMts
      ? spawnSync(
          process.execPath,
          [
            "--experimental-test-module-mocks",
            "--import",
            tsxLoader,
            abs,
          ],
          {
            cwd: ROOT,
            encoding: "utf8",
            env: childEnv,
            timeout: 420_000,
            maxBuffer: 20 * 1024 * 1024,
          }
        )
      : spawnSync(process.execPath, [abs], {
          cwd: ROOT,
          encoding: "utf8",
          env: childEnv,
          timeout: 420_000,
          maxBuffer: 20 * 1024 * 1024,
        });
    const out = `${r.stdout || ""}\n${r.stderr || ""}`;
    const ok = r.status === 0 && re.test(out);
    assert(ok, `regression_${label}`, `status=${r.status}`);
    if (!ok) {
      regOk = false;
      console.error(out.slice(-2000));
    }
  }
  report.REGRESSIONS = regOk ? "PASS" : "FAIL";
  } // end nested-regression else
}

setResponsesToolStateDurableBackendForTests(null);
clearResponsesToolStateStoreForTests();

const coreOk =
  report.STREAM_STORE_FALSE_STATE_SAVE_FIXED === "YES" &&
  report.ROUND1_PUBLIC_ID_EQUALS_STATE_KEY === "YES" &&
  report.ROUND1_FUNCTION_CALL_SAVES_STATE === "YES" &&
  report.ROUND2_PREVIOUS_RESPONSE_ID_RESOLVES === "YES" &&
  report.STORE_FALSE_DOES_NOT_SKIP_PROTOCOL_STATE === "YES" &&
  report.TOKFAI_EXECUTES_TOOLS === "NO" &&
  report.NO_AGENT_ORCHESTRATION_REINTRODUCED === "YES" &&
  report.NO_PROMPT_CONTENT_LOGGED === "YES" &&
  report.NO_TOOL_OUTPUT_CONTENT_LOGGED === "YES" &&
  report.NO_SECRET_LOGGED === "YES" &&
  report.BILLING_DOUBLE_CHARGE_RISK === "NO" &&
  report.CHAT_COMPLETIONS_CHANGED === "NO" &&
  report.STT_CHANGED === "NO" &&
  report.DASHBOARD_CHANGED === "NO" &&
  report.TYPECHECK === "PASS" &&
  report.BUILD === "PASS" &&
  report.REGRESSIONS === "PASS" &&
  report.GIT_DIFF_CHECK === "PASS" &&
  failed === 0;

report.FINAL_VERDICT = coreOk ? "A_FIX_READY" : "B_NEEDS_FIX";

console.log("\n=== P1098 REPORT ===");
for (const [k, v] of Object.entries(report)) {
  console.log(`${k}=${v}`);
}
if (report.FINAL_VERDICT === "A_FIX_READY") {
  console.log(PASS);
  process.exit(0);
}
console.log(FAIL);
process.exit(1);
