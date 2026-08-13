/**
 * P1093 — Responses previous_response_id + function_call_output state bridge.
 *
 * Authenticity:
 *   REAL responsesToolStateStore + responsesPreviousResponseBridge
 *   REAL responsesBodyToChatBody / chatCompletionResponseToResponses / SSE
 *   REAL executeChatCompletion ENTRY for round2 resume (mocked provider)
 *   No tool execution / no file IO / no agent orchestration
 *
 *   node scripts/p1093-responses-previous-response-id-state-bridge.mjs
 *
 * Marker (only FINAL_VERDICT=A_FIX_READY):
 *   TOKFAI_P1093_RESPONSES_PREVIOUS_RESPONSE_ID_STATE_BRIDGE_PASS
 */

import { createHash } from "node:crypto";
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

ensureModuleMocks(fileURLToPath(import.meta.url));
ensureDummyEnv();
await installP1018Mocks();

const { executeChatCompletion } = await loadExecuteChatCompletion();
const {
  clearResponsesToolStateStoreForTests,
  getResponsesToolState,
  hashForResponsesLog,
  responsesToolStateStoreSizeForTests,
  saveResponsesToolState,
  RESPONSES_TOOL_STATE_TTL_MS,
} = await import("../apps/dmit-api/src/lib/responsesToolStateStore.ts");
const {
  applyRebuiltPreviousResponseBody,
  detectPreviousResponseToolOutputBridge,
  persistResponsesToolStateFromRound1,
  resolvePreviousResponseToolOutputBridge,
} = await import(
  "../apps/dmit-api/src/lib/responsesPreviousResponseBridge.ts"
);
const {
  chatCompletionResponseToResponses,
  responsesBodyToChatBody,
} = await import("../apps/dmit-api/src/lib/responsesTransform.ts");
const { responsesToSseBody } = await import(
  "../apps/dmit-api/src/lib/responsesSse.ts"
);
const { isResumeToolRound } = await import(
  "../apps/dmit-api/src/lib/cursorToolProtocol.ts"
);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS =
  "TOKFAI_P1093_RESPONSES_PREVIOUS_RESPONSE_ID_STATE_BRIDGE_PASS";
const FAIL =
  "TOKFAI_P1093_RESPONSES_PREVIOUS_RESPONSE_ID_STATE_BRIDGE_FAIL";

let failed = 0;
const report: Record<string, string> = {
  PREVIOUS_RESPONSE_ID_SUPPORTED: "NO",
  ROUND1_TOOL_STATE_SAVED: "NO",
  ROUND2_PREVIOUS_RESPONSE_ID_RESOLVED: "NO",
  ROUND2_REBUILT_FULL_INPUT: "NO",
  ROUND2_PREVIOUS_RESPONSE_ID_PASS: "NO",
  ROUND2_FULL_INPUT_STILL_PASS: "NO",
  TOKFAI_EXECUTES_TOOLS: "NO",
  NO_AGENT_ORCHESTRATION_REINTRODUCED: "YES",
  NO_PROMPT_CONTENT_LOGGED: "YES",
  NO_TOOL_OUTPUT_CONTENT_LOGGED: "YES",
  NO_SCHEMA_CONTENT_LOGGED: "YES",
  MISSING_STATE_NO_PROVIDER_FETCH: "NO",
  CALL_ID_MISMATCH_NO_PROVIDER_FETCH: "NO",
  BILLING_DOUBLE_CHARGE_RISK: "NO",
  CHAT_COMPLETIONS_CHANGED: "NO",
  STT_CHANGED: "NO",
  DASHBOARD_CHANGED: "NO",
  TYPECHECK: "FAIL",
  BUILD: "FAIL",
  REGRESSIONS: "FAIL",
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

const CALL_ID = "call_p1093_test_001";
const RESP_ID = "resp_p1093_round1_test";
const SYNTH = `P1093_SYNTH_${shortHash("seed")}`;
const SAFE_OUTPUT = `SAFE synthetic token ${SYNTH} end.`;

console.log("P1093 RESPONSES PREVIOUS_RESPONSE_ID STATE BRIDGE\n");

clearResponsesToolStateStoreForTests();

// ── Static wiring / safety ───────────────────────────────────────────────
{
  const routeSrc = read("apps/dmit-api/src/routes/responses.ts");
  const bridgeSrc = read(
    "apps/dmit-api/src/lib/responsesPreviousResponseBridge.ts"
  );
  const storeSrc = read("apps/dmit-api/src/lib/responsesToolStateStore.ts");
  const transformSrc = read("apps/dmit-api/src/lib/responsesTransform.ts");
  const loggerSrc = read("apps/dmit-api/src/logger.ts");
  const chatSrc = read("apps/dmit-api/src/routes/chat.ts");
  const execSrc = read("apps/dmit-api/src/lib/executeChatCompletion.ts");

  assert(
    routeSrc.includes("detectPreviousResponseToolOutputBridge") &&
      routeSrc.includes("resolvePreviousResponseToolOutputBridge") &&
      routeSrc.includes("persistResponsesToolStateFromRound1") &&
      routeSrc.includes("previous_response_not_found"),
    "responses route wires P1093 bridge"
  );
  assert(
    storeSrc.includes("RESPONSES_TOOL_STATE_TTL_MS") &&
      storeSrc.includes("saveResponsesToolState") &&
      /Does NOT execute tools/.test(storeSrc),
    "state store is memory Map + TTL, protocol-only"
  );
  assert(
    bridgeSrc.includes("responses_tool_state_saved") &&
      bridgeSrc.includes("responses_previous_response_id_resolved") &&
      bridgeSrc.includes("responses_tool_output_round2_rebuilt") &&
      bridgeSrc.includes("tool_call_id_mismatch") &&
      /Does NOT execute tools/.test(bridgeSrc) &&
      !bridgeSrc.includes("detectExplicitToolExecutionIntent") &&
      !bridgeSrc.includes("incomplete_tool_task") &&
      !bridgeSrc.includes("readFileSync") &&
      !bridgeSrc.includes("writeFileSync"),
    "bridge protocol-only (no agent / file IO)"
  );
  assert(
    transformSrc.includes("previous_response_id: _previousResponseId"),
    "responsesBodyToChatBody strips previous_response_id"
  );
  assert(
    loggerSrc.includes("responseIdHash") &&
      loggerSrc.includes("callIdHash") &&
      loggerSrc.includes("outputByteLength") &&
      loggerSrc.includes("ttlMs"),
    "logger allowlists P1093 safe fields"
  );
  assert(
    !chatSrc.includes("responsesPreviousResponseBridge") &&
      !chatSrc.includes("responsesToolStateStore") &&
      !execSrc.includes("responsesPreviousResponseBridge") &&
      !execSrc.includes("responsesToolStateStore"),
    "CHAT_COMPLETIONS_CHANGED=NO (no bridge import in chat/exec)"
  );
  report.PREVIOUS_RESPONSE_ID_SUPPORTED = "YES";
  report.TOKFAI_EXECUTES_TOOLS = "NO";
  report.NO_AGENT_ORCHESTRATION_REINTRODUCED = "YES";
  report.NO_PROMPT_CONTENT_LOGGED = "YES";
  report.NO_TOOL_OUTPUT_CONTENT_LOGGED = "YES";
  report.NO_SCHEMA_CONTENT_LOGGED = "YES";
  report.CHAT_COMPLETIONS_CHANGED = "NO";
}

// ── A. Round1 persist ────────────────────────────────────────────────────
{
  clearResponsesToolStateStoreForTests();
  const chatResponse = {
    id: "chatcmpl_p1093",
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
                arguments: '{"path":"P1093_SYNTH.md"}',
              },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    tokfai: {
      request_id: "p1093_round1_test",
      requested_model: "gpt-5.5",
      resolved_model: "gpt-5.5",
      credits_charged: 1,
    },
  };
  const responsesPayload = chatCompletionResponseToResponses(
    chatResponse,
    "p1093_round1_test"
  );
  // Force stable id for store key.
  responsesPayload.id = RESP_ID;

  const saved = persistResponsesToolStateFromRound1({
    response: responsesPayload,
    requestBody: {
      model: "gpt-5.5",
      input: "You MUST call read_test_file with path P1093_SYNTH.md.",
      tools: TOOLS,
      tool_choice: "auto",
    },
    userId: CALLER.userId,
    route: "/v1/responses",
    providerId: "grsai-primary",
    requestedModel: "gpt-5.5",
    resolvedModel: "gpt-5.5",
  });
  const row = getResponsesToolState(RESP_ID);
  assert(
    saved === true &&
      row != null &&
      row.toolCalls[0]?.callId === CALL_ID &&
      row.toolCalls[0]?.name === "read_test_file" &&
      row.expiresAt - row.createdAt === RESPONSES_TOOL_STATE_TTL_MS &&
      responsesToolStateStoreSizeForTests() === 1,
    "ROUND1_TOOL_STATE_SAVED",
    `responseIdHash=${hashForResponsesLog(RESP_ID)} callIdHash=${hashForResponsesLog(CALL_ID)} ttlMs=${RESPONSES_TOOL_STATE_TTL_MS}`
  );
  report.ROUND1_TOOL_STATE_SAVED =
    saved && row != null ? "YES" : "NO";

  // no tools / text final must not save
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
    },
    "no_tools"
  );
  textOnly.id = "resp_no_tools";
  const noSave = persistResponsesToolStateFromRound1({
    response: textOnly,
    requestBody: { model: "gpt-5.5", input: "hi" },
    userId: CALLER.userId,
  });
  assert(noSave === false, "no-tools text final does not save state");
}

// ── B/C. Round2 resolve + rebuild ────────────────────────────────────────
{
  const bridge = detectPreviousResponseToolOutputBridge({
    model: "gpt-5.5",
    stream: true,
    store: false,
    previous_response_id: RESP_ID,
    input: [
      {
        type: "function_call_output",
        call_id: CALL_ID,
        output: SAFE_OUTPUT,
      },
    ],
  });
  assert(
    bridge != null && bridge.previousResponseId === RESP_ID,
    "detect previous_response_id + function_call_output"
  );

  const resolved = resolvePreviousResponseToolOutputBridge({
    bridge: bridge!,
    userId: CALLER.userId,
    route: "/v1/responses",
  });
  assert(resolved.ok === true, "ROUND2_PREVIOUS_RESPONSE_ID_RESOLVED");
  report.ROUND2_PREVIOUS_RESPONSE_ID_RESOLVED = resolved.ok
    ? "YES"
    : "NO";

  if (resolved.ok) {
    const rebuilt = resolved.rebuiltInput;
    const hasUser = rebuilt.some((item) => {
      const r = item as Record<string, unknown>;
      return r?.type === "message" || r?.role === "user";
    });
    const hasFc = rebuilt.some(
      (item) => (item as Record<string, unknown>)?.type === "function_call"
    );
    const hasOut = rebuilt.some(
      (item) =>
        (item as Record<string, unknown>)?.type === "function_call_output"
    );
    assert(
      hasUser && hasFc && hasOut && rebuilt.length >= 3,
      "ROUND2_REBUILT_FULL_INPUT",
      `items=${rebuilt.length}`
    );
    report.ROUND2_REBUILT_FULL_INPUT =
      hasUser && hasFc && hasOut ? "YES" : "NO";

    const applied = applyRebuiltPreviousResponseBody(
      {
        model: "gpt-5.5",
        stream: true,
        store: false,
        previous_response_id: RESP_ID,
        input: [
          {
            type: "function_call_output",
            call_id: CALL_ID,
            output: SAFE_OUTPUT,
          },
        ],
      },
      resolved
    );
    assert(
      applied.previous_response_id === undefined &&
        Array.isArray(applied.input) &&
        applied.tools != null,
      "apply rebuild strips previous_response_id + restores tools"
    );

    const chatBody = responsesBodyToChatBody(applied as any);
    const resume = isResumeToolRound(chatBody.messages as any);
    assert(
      resume === true,
      "rebuilt chat messages are resumeToolRound",
      `messages=${chatBody.messages?.length}`
    );

    // Round2 full-input shape still converts the same way
    const fullInputBody = responsesBodyToChatBody({
      model: "gpt-5.5",
      stream: true,
      store: false,
      tool_choice: "auto",
      tools: TOOLS,
      input: rebuilt,
    } as any);
    const fullResume = isResumeToolRound(fullInputBody.messages as any);
    assert(fullResume === true, "ROUND2_FULL_INPUT_STILL_PASS (shape)");
    report.ROUND2_FULL_INPUT_STILL_PASS = fullResume ? "YES" : "NO";
  }
}

// ── D. Missing / mismatch / invalid → no provider fetch ──────────────────
{
  const before = getCounts().providerCallCount;

  const missing = resolvePreviousResponseToolOutputBridge({
    bridge: {
      previousResponseId: "resp_missing_never_saved",
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
      !missing.ok &&
      missing.error.code === "previous_response_not_found" &&
      missing.error.status === 404 &&
      getCounts().providerCallCount === before,
    "MISSING_STATE_NO_PROVIDER_FETCH",
    `code=${!missing.ok ? missing.error.code : "?"}`
  );
  report.MISSING_STATE_NO_PROVIDER_FETCH =
    missing.ok === false && getCounts().providerCallCount === before
      ? "YES"
      : "NO";

  const mismatch = resolvePreviousResponseToolOutputBridge({
    bridge: {
      previousResponseId: RESP_ID,
      outputs: [
        {
          type: "function_call_output",
          call_id: "call_wrong_id",
          output: SAFE_OUTPUT,
        },
      ],
    },
    userId: CALLER.userId,
  });
  assert(
    mismatch.ok === false &&
      !mismatch.ok &&
      mismatch.error.code === "tool_call_id_mismatch" &&
      mismatch.error.status === 400 &&
      getCounts().providerCallCount === before,
    "CALL_ID_MISMATCH_NO_PROVIDER_FETCH"
  );
  report.CALL_ID_MISMATCH_NO_PROVIDER_FETCH =
    mismatch.ok === false && getCounts().providerCallCount === before
      ? "YES"
      : "NO";

  let invalidThrown = false;
  try {
    detectPreviousResponseToolOutputBridge({
      model: "gpt-5.5",
      previous_response_id: RESP_ID,
      input: [{ type: "function_call_output", call_id: CALL_ID }],
    });
  } catch (err: any) {
    invalidThrown =
      err?.code === "invalid_function_call_output" && err?.status === 400;
  }
  assert(
    invalidThrown && getCounts().providerCallCount === before,
    "invalid output shape → 400 no provider fetch"
  );
}

// ── E. Round2 executeChatCompletion + SSE (mocked provider) ──────────────
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () => ({
        kind: "completion" as const,
        content: `Tool result acknowledged. Token ${SYNTH}.`,
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
  const resolved = resolvePreviousResponseToolOutputBridge({
    bridge,
    userId: CALLER.userId,
  });
  assert(resolved.ok === true, "round2 resolve before exec");

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
      requestId: "p1093_round2_exec",
      body: { ...chatBody, stream: false } as any,
      route: "/v1/responses",
      limitKey: "p1093",
      clientStream: true,
    });
    const snapAfter = billingSnapshot(result);
    const ok =
      result.ok === true &&
      typeof (result as any).response?.choices?.[0]?.message?.content ===
        "string" &&
      String(
        (result as any).response.choices[0].message.content
      ).includes(SYNTH);
    const responsesPayload = result.ok
      ? chatCompletionResponseToResponses(
          (result as any).response,
          "p1093_round2_exec"
        )
      : null;
    const sse = responsesPayload
      ? responsesToSseBody(responsesPayload)
      : "";
    const sseOk =
      sse.includes("response.created") &&
      (sse.includes("response.output_text.delta") ||
        sse.includes("output_text")) &&
      sse.includes("response.completed") &&
      sse.includes("data: [DONE]") &&
      !/response\.completed[\s\S]*"status"\s*:\s*"failed"/.test(sse);

    const debitDelta = snapAfter.debitCallCount - debitBefore;
    assert(
      ok && sseOk && debitDelta <= 1,
      "ROUND2_PREVIOUS_RESPONSE_ID_PASS",
      `ok=${ok} sse=${sseOk} debitDelta=${debitDelta} providerCalls=${getCounts().providerCallCount}`
    );
    report.ROUND2_PREVIOUS_RESPONSE_ID_PASS = ok && sseOk ? "YES" : "NO";
    report.BILLING_DOUBLE_CHARGE_RISK = debitDelta > 1 ? "YES" : "NO";
  }
}

// ── F. Full-input path still works via exec ──────────────────────────────
{
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () => ({
        kind: "completion" as const,
        content: `Full-input ok ${SYNTH}`,
        finish_reason: "stop",
      }),
    ],
  });
  const chatBody = responsesBodyToChatBody({
    model: "gpt-5.5",
    tools: TOOLS,
    tool_choice: "auto",
    input: [
      {
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "Continue with tool result." }],
      },
      {
        type: "function_call",
        call_id: CALL_ID,
        name: "read_test_file",
        arguments: '{"path":"P1093_SYNTH.md"}',
      },
      {
        type: "function_call_output",
        call_id: CALL_ID,
        output: SAFE_OUTPUT,
      },
    ],
  } as any);
  const result = await executeChatCompletion({
    caller: CALLER,
    requestId: "p1093_full_input",
    body: { ...chatBody, stream: false } as any,
    route: "/v1/responses",
    limitKey: "p1093",
    clientStream: true,
  });
  const ok =
    result.ok === true &&
    String(
      (result as any).response?.choices?.[0]?.message?.content || ""
    ).includes(SYNTH);
  assert(ok, "full-input round2 exec still PASS");
  if (ok) report.ROUND2_FULL_INPUT_STILL_PASS = "YES";
}

// ── G. Scope + typecheck/build/regressions ───────────────────────────────
{
  const chatTouched = spawnSync(
    "git",
    [
      "diff",
      "--name-only",
      "--",
      "apps/dmit-api/src/routes/chat.ts",
      "apps/dmit-api/src/lib/runChatCompletionsHttp.ts",
    ],
    { cwd: ROOT, encoding: "utf8" }
  );
  assert(
    (chatTouched.stdout || "").trim() === "",
    "CHAT_COMPLETIONS_CHANGED=NO"
  );

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
  assert((sttTouched.stdout || "").trim() === "", "STT_CHANGED=NO");
  report.STT_CHANGED = (sttTouched.stdout || "").trim() ? "YES" : "NO";

  const dashTouched = spawnSync(
    "git",
    ["diff", "--name-only", "--", "apps/web"],
    { cwd: ROOT, encoding: "utf8" }
  );
  assert((dashTouched.stdout || "").trim() === "", "DASHBOARD_CHANGED=NO");
  report.DASHBOARD_CHANGED = (dashTouched.stdout || "").trim()
    ? "YES"
    : "NO";

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

  const regressions: Array<[string, string, RegExp]> = [
    [
      "P1092_STATIC",
      "scripts/p1092-codex-responses-global-compat-matrix.mjs",
      /CODE_SUPPORTS_PREVIOUS_RESPONSE_ID=YES|CODE_SUPPORTS_FUNCTION_CALL_OUTPUT=YES/,
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
      fail(`regression_${label}`, "missing script");
      regOk = false;
      continue;
    }
    // P1092 LIVE needs key; run static-only by omitting LIVE (script exits early).
    // For P1092 we only assert static discovery via a dedicated offline probe below.
    if (label === "P1092_STATIC") {
      const transform = read("apps/dmit-api/src/lib/responsesTransform.ts");
      const route = read("apps/dmit-api/src/routes/responses.ts");
      const bridge = read(
        "apps/dmit-api/src/lib/responsesPreviousResponseBridge.ts"
      );
      const ok =
        /previous_response_id/.test(transform) &&
        /previous_response_id/.test(route) &&
        /function_call_output/.test(transform) &&
        /persistResponsesToolStateFromRound1/.test(route) &&
        /resolvePreviousResponseToolOutputBridge/.test(bridge);
      assert(ok, "regression_P1092_STATIC previous_response_id wired");
      if (!ok) regOk = false;
      continue;
    }

    const isMts = script.endsWith(".mts");
    const childEnv = {
      ...process.env,
      LIVE: "",
      P1093_INNER: "1",
      LOG_LEVEL: "info",
    };
    const r = isMts
      ? spawnSync(
          process.execPath,
          [
            "--experimental-test-module-mocks",
            "--import",
            join(ROOT, "apps/dmit-api/node_modules/tsx/dist/loader.mjs"),
            abs,
          ],
          {
            cwd: ROOT,
            encoding: "utf8",
            env: childEnv,
            timeout: 240_000,
            maxBuffer: 20 * 1024 * 1024,
          }
        )
      : spawnSync(process.execPath, [abs], {
          cwd: ROOT,
          encoding: "utf8",
          env: childEnv,
          timeout: 240_000,
          maxBuffer: 20 * 1024 * 1024,
        });
    const out = `${r.stdout || ""}\n${r.stderr || ""}`;
    const ok = r.status === 0 && re.test(out);
    assert(
      ok,
      `regression_${label}`,
      `status=${r.status}${ok ? "" : ` err=${(r.stderr || "").slice(0, 240)}`}`
    );
    if (!ok) regOk = false;
  }
  report.REGRESSIONS = regOk ? "PASS" : "FAIL";

  const diffCheck = spawnSync("git", ["diff", "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert(diffCheck.status === 0, "git_diff_check");
}

if (
  failed === 0 &&
  report.PREVIOUS_RESPONSE_ID_SUPPORTED === "YES" &&
  report.ROUND1_TOOL_STATE_SAVED === "YES" &&
  report.ROUND2_PREVIOUS_RESPONSE_ID_RESOLVED === "YES" &&
  report.ROUND2_REBUILT_FULL_INPUT === "YES" &&
  report.ROUND2_PREVIOUS_RESPONSE_ID_PASS === "YES" &&
  report.ROUND2_FULL_INPUT_STILL_PASS === "YES" &&
  report.MISSING_STATE_NO_PROVIDER_FETCH === "YES" &&
  report.CALL_ID_MISMATCH_NO_PROVIDER_FETCH === "YES" &&
  report.TOKFAI_EXECUTES_TOOLS === "NO" &&
  report.BILLING_DOUBLE_CHARGE_RISK === "NO" &&
  report.TYPECHECK === "PASS" &&
  report.BUILD === "PASS" &&
  report.REGRESSIONS === "PASS"
) {
  report.FINAL_VERDICT = "A_FIX_READY";
} else if (failed === 0) {
  report.FINAL_VERDICT = "B_FIX_FIRST";
} else {
  report.FINAL_VERDICT = "C_REJECT";
}

console.log("\n--- P1093 report ---");
for (const [k, v] of Object.entries(report)) {
  console.log(`${k}=${v}`);
}

if (report.FINAL_VERDICT === "A_FIX_READY") {
  console.log(PASS);
  process.exit(0);
}

console.log(FAIL);
process.exit(1);
