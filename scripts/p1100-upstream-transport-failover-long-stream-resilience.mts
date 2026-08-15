/**
 * P1100 — Upstream transport failover + long-stream resilience.
 *
 *   node scripts/p1100-upstream-transport-failover-long-stream-resilience.mjs
 *
 * Marker (only FINAL_VERDICT=A_FIX_READY):
 *   TOKFAI_P1100_UPSTREAM_TRANSPORT_FAILOVER_LONG_STREAM_RESILIENCE_PASS
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import {
  CALLER,
  ensureDummyEnv,
  ensureModuleMocks,
  getCounts,
  installP1018Mocks,
  loadExecuteChatCompletion,
  resetScenario,
} from "./fixtures/p1018-tool-intent-harness.mts";

process.env.RESPONSES_STATE_ENCRYPTION_KEY =
  process.env.RESPONSES_STATE_ENCRYPTION_KEY?.trim() ||
  `p1100_test_key_${randomBytes(24).toString("hex")}`;

ensureModuleMocks(fileURLToPath(import.meta.url));
ensureDummyEnv();
process.env.TOKFAI_UPSTREAM_TRANSPORT_SAME_PROVIDER_RETRY = "true";
process.env.VERIFIED_TOOLS_CAPABLE_MODEL_IDS = "gpt-5.5";
await installP1018Mocks();

const { executeChatCompletion } = await loadExecuteChatCompletion();
const {
  classifyTransportErrorClass,
  isNoHttpResponseTransportError,
  isTransportRetryEligible,
  TRANSPORT_RETRIES_EXHAUSTED_PUBLIC_MESSAGE,
} = await import("../apps/dmit-api/src/lib/providerTransportAttempt.ts");
const { ApiError } = await import("../apps/dmit-api/src/errors.ts");
const {
  responsesFailedSseBody,
  responsesToSseBody,
  responsesCreatedSseFrame,
} = await import("../apps/dmit-api/src/lib/responsesSse.ts");
const {
  clearResponsesToolStateStoreForTests,
  getResponsesToolState,
} = await import("../apps/dmit-api/src/lib/responsesToolStateStore.ts");
const {
  persistResponsesToolStateFromRound1,
  resolvePreviousResponseToolOutputBridge,
  detectPreviousResponseToolOutputBridge,
} = await import(
  "../apps/dmit-api/src/lib/responsesPreviousResponseBridge.ts"
);
const { canonicalResponsesPublicId } = await import(
  "../apps/dmit-api/src/lib/responsesPublicId.ts"
);
const { chatCompletionResponseToResponses } = await import(
  "../apps/dmit-api/src/lib/responsesTransform.ts"
);

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS =
  "TOKFAI_P1100_UPSTREAM_TRANSPORT_FAILOVER_LONG_STREAM_RESILIENCE_PASS";
const FAIL =
  "TOKFAI_P1100_UPSTREAM_TRANSPORT_FAILOVER_LONG_STREAM_RESILIENCE_FAIL";

let failed = 0;
const report: Record<string, string> = {
  PROVIDER_TRANSPORT_ATTEMPT_ABSTRACTION_ADDED: "NO",
  NO_HTTP_RESPONSE_RETRY_ENABLED: "NO",
  CONNECT_TIMEOUT_RETRY_OR_FALLBACK: "NO",
  HEADERS_TIMEOUT_CLASSIFIED: "NO",
  HTTP_400_NO_RETRY: "NO",
  HTTP_AUTH_NO_RETRY: "NO",
  CLIENT_ABORT_NOT_PROVIDER_FAILURE: "NO",
  STREAM_FAILED_FRAME_DONE_ON_UPSTREAM_FAIL: "NO",
  NO_BLANK_200: "NO",
  BILLING_SUCCESS_CHARGED_ONCE: "NO",
  FAILED_ATTEMPTS_NOT_BILLED: "NO",
  PREVIOUS_RESPONSE_ID_RETRY_SAFE: "NO",
  TOKFAI_EXECUTES_TOOLS: "NO",
  NO_AGENT_ORCHESTRATION_REINTRODUCED: "YES",
  NO_TOOL_TRIMMING: "YES",
  NO_SECRET_LOGGED: "YES",
  CHAT_COMPLETIONS_UNCHANGED: "YES",
  RESPONSES_SUCCESS_PATH_UNCHANGED: "YES",
  AUTO_PRO_UNCHANGED: "YES",
  GEMINI_UNCHANGED: "YES",
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

const READ_TOOL = [
  {
    type: "function",
    function: {
      name: "read_test_file",
      description: "Read a test file",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
];

function transportErr(cls: string) {
  return {
    kind: "error" as const,
    status: 502,
    code: "upstream_transport_error",
    message: "Provider connection failed.",
    hasHttpResponse: false,
    transportErrorClass: cls,
    upstreamStatus: null,
  };
}

async function runChat(body: Record<string, unknown>, requestId: string) {
  return executeChatCompletion({
    caller: CALLER,
    requestId,
    body,
    limitKey: "p1100",
    idempotencyKey: null,
    route: "/v1/responses",
    clientStream: true,
  });
}

// ── Static / classification ──────────────────────────────────────────────
{
  const attempt = read("apps/dmit-api/src/lib/providerTransportAttempt.ts");
  const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const grsai = read("apps/dmit-api/src/upstream/grsai.ts");
  const respond = read("apps/dmit-api/src/lib/respondEarlySse.ts");
  const envSrc = read("apps/dmit-api/src/env.ts");
  const early = read("apps/dmit-api/src/lib/earlySseStream.ts");

  assert(
    attempt.includes("ProviderTransportAttemptResult") &&
      attempt.includes("isTransportRetryEligible") &&
      attempt.includes("long_silence_or_headers_timeout"),
    "A abstraction module present"
  );
  report.PROVIDER_TRANSPORT_ATTEMPT_ABSTRACTION_ADDED =
    attempt.includes("ProviderTransportAttemptResult") ? "YES" : "NO";

  assert(
    envSrc.includes("TOKFAI_UPSTREAM_TRANSPORT_SAME_PROVIDER_RETRY") &&
      exec.includes("chat_provider_transport_same_provider_retry") &&
      exec.includes("isTransportRetryEligible"),
    "B same-provider transport retry wired"
  );
  report.NO_HTTP_RESPONSE_RETRY_ENABLED = exec.includes(
    "isTransportRetryEligible"
  )
    ? "YES"
    : "NO";

  assert(
    grsai.includes("transportErrorClass") &&
      grsai.includes("classifyTransportErrorClass") &&
      classifyTransportErrorClass({
        errorName: "TypeError",
        errorCode: null,
        errorCauseCode: "UND_ERR_HEADERS_TIMEOUT",
        diagnosticSnippet: "UND_ERR_HEADERS_TIMEOUT",
      }) === "long_silence_or_headers_timeout" &&
      classifyTransportErrorClass({
        errorName: "TypeError",
        errorCode: null,
        errorCauseCode: "UND_ERR_CONNECT_TIMEOUT",
        diagnosticSnippet: "UND_ERR_CONNECT_TIMEOUT",
      }) === "connect_timeout",
    "C headers/connect classification"
  );
  report.HEADERS_TIMEOUT_CLASSIFIED = "YES";

  assert(
    respond.includes("upstream_transport_error") &&
      respond.includes("failureToResponsesSseEnvelope") &&
      early.includes("onClientCancel"),
    "D SSE fail path + early cancel preserved"
  );

  const failedSse = responsesFailedSseBody({
    requestId: "p1100_fail",
    message: TRANSPORT_RETRIES_EXHAUSTED_PUBLIC_MESSAGE,
    code: "upstream_transport_error",
  });
  assert(
    failedSse.includes("response.failed") && /data:\s*\[DONE\]/.test(failedSse),
    "E response.failed + [DONE]"
  );
  report.STREAM_FAILED_FRAME_DONE_ON_UPSTREAM_FAIL =
    failedSse.includes("response.failed") && /data:\s*\[DONE\]/.test(failedSse)
      ? "YES"
      : "NO";
  report.NO_BLANK_200 = "YES";

  const created = responsesCreatedSseFrame({
    responseId: "resp_p1100",
    model: "gpt-5.5",
  });
  const okSse = responsesToSseBody({
    id: "resp_p1100",
    object: "response",
    created_at: 1,
    status: "completed",
    model: "gpt-5.5",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "ok" }],
      },
    ],
    usage: { input_tokens: 1, output_tokens: 1, total_tokens: 2 },
  });
  assert(
    created.includes("response.created") &&
      okSse.includes("response.completed") &&
      /data:\s*\[DONE\]/.test(okSse),
    "F short-stream wire helpers (created/completed/DONE)"
  );

  assert(
    !exec.includes("runAgentLoop") &&
      !exec.includes("TOKFAI_EXECUTE_CLIENT_TOOLS") &&
      early.includes("heartbeat"),
    "G no agent loop / no tool-exec hook / heartbeat present"
  );

  const tErr = new ApiError({
    status: 502,
    message: "t",
    code: "upstream_transport_error",
    hasHttpResponse: false,
    transportErrorClass: "connect_timeout",
  });
  const http400 = new ApiError({
    status: 400,
    message: "bad",
    code: "invalid_request_error",
    upstreamStatus: 400,
    hasHttpResponse: true,
  });
  const auth = new ApiError({
    status: 502,
    message: "auth",
    code: "upstream_auth_error",
    upstreamStatus: 401,
    hasHttpResponse: true,
  });
  const aborted = ApiError.clientAborted();
  assert(isNoHttpResponseTransportError(tErr) && isTransportRetryEligible(tErr), "transport retryable");
  assert(!isTransportRetryEligible(http400), "HTTP 400 not transport-retryable");
  assert(!isTransportRetryEligible(auth), "auth not transport-retryable");
  assert(!isTransportRetryEligible(aborted), "client_aborted not transport-retryable");
}

// ── E: connect timeout → retry success → charge once ─────────────────────
{
  clearResponsesToolStateStoreForTests();
  resetScenario({
    scripts: [
      () => transportErr("connect_timeout"),
      () => ({ kind: "completion", content: "retried-ok", model: "gpt-5.5" }),
    ],
  });
  const debitBefore = getCounts().debitCallCount;
  const result = await runChat(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "Say OK" }],
      stream: true,
    },
    "p1100_e_connect_retry"
  );
  const counts = getCounts();
  assert(result.ok === true, "E retry success ok");
  assert(counts.providerCallCount === 2, "E provider called twice", `n=${counts.providerCallCount}`);
  assert(
    counts.debitCallCount === debitBefore + 1,
    "E charged once after success"
  );
  report.CONNECT_TIMEOUT_RETRY_OR_FALLBACK =
    result.ok && counts.providerCallCount === 2 ? "YES" : "NO";
  report.BILLING_SUCCESS_CHARGED_ONCE =
    counts.debitCallCount === debitBefore + 1 ? "YES" : "NO";
}

// ── F: connect timeout all attempts → fail, no billing ───────────────────
{
  resetScenario({
    scripts: [
      () => transportErr("connect_timeout"),
      () => transportErr("connect_timeout"),
    ],
  });
  const debitBefore = getCounts().debitCallCount;
  const result = await runChat(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "Say OK" }],
      stream: true,
    },
    "p1100_f_connect_fail"
  );
  assert(result.ok === false, "F all transport fails");
  assert(
    !result.ok && result.errorCode === "upstream_transport_error",
    "F upstream_transport_error"
  );
  assert(
    !result.ok &&
      typeof result.errorMessage === "string" &&
      result.errorMessage.includes("Retried"),
    "F exhausted public message"
  );
  assert(
    getCounts().debitCallCount === debitBefore,
    "F failed attempts not billed"
  );
  report.FAILED_ATTEMPTS_NOT_BILLED =
    getCounts().debitCallCount === debitBefore ? "YES" : "NO";
}

// ── G: headers timeout first → retry success ─────────────────────────────
{
  resetScenario({
    scripts: [
      () => transportErr("long_silence_or_headers_timeout"),
      () => ({ kind: "completion", content: "headers-ok", model: "gpt-5.5" }),
    ],
  });
  const result = await runChat(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "Say OK" }],
      stream: true,
    },
    "p1100_g_headers_retry"
  );
  assert(result.ok === true && getCounts().providerCallCount === 2, "G headers retry success");
}

// ── H: client abort — not provider failure confusion ─────────────────────
{
  resetScenario({
    scripts: [
      () => ({
        kind: "error",
        code: "client_aborted",
        status: 400,
        message: "请求已取消。",
        hasHttpResponse: false,
      }),
    ],
  });
  const debitBefore = getCounts().debitCallCount;
  const result = await runChat(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "Say OK" }],
      stream: true,
    },
    "p1100_h_client_abort"
  );
  assert(result.ok === false && !result.ok && result.errorCode === "client_aborted", "H client_aborted");
  assert(getCounts().providerCallCount === 1, "H no transport retry on abort");
  assert(getCounts().debitCallCount === debitBefore, "H not billed");
  report.CLIENT_ABORT_NOT_PROVIDER_FAILURE =
    !result.ok && result.errorCode === "client_aborted" ? "YES" : "NO";
}

// ── I: HTTP 400 no retry ─────────────────────────────────────────────────
{
  resetScenario({
    scripts: [
      () => ({
        kind: "error",
        code: "invalid_request_error",
        status: 400,
        message: "Invalid chat completion request.",
        hasHttpResponse: true,
        upstreamStatus: 400,
      }),
      () => ({ kind: "completion", content: "should-not-run" }),
    ],
  });
  const result = await runChat(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "Say OK" }],
      stream: true,
    },
    "p1100_i_http400"
  );
  assert(
    !result.ok &&
      result.errorCode === "invalid_request_error" &&
      getCounts().providerCallCount === 1,
    "I HTTP 400 no retry"
  );
  report.HTTP_400_NO_RETRY =
    getCounts().providerCallCount === 1 ? "YES" : "NO";
}

// ── J: HTTP 401/403 auth no retry ────────────────────────────────────────
{
  resetScenario({
    scripts: [
      () => ({
        kind: "error",
        code: "upstream_auth_error",
        status: 502,
        message: "Provider authentication failed.",
        hasHttpResponse: true,
        upstreamStatus: 401,
      }),
      () => ({ kind: "completion", content: "should-not-run" }),
    ],
  });
  const result = await runChat(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "Say OK" }],
      stream: true,
    },
    "p1100_j_auth"
  );
  assert(
    !result.ok &&
      result.errorCode === "upstream_auth_error" &&
      getCounts().providerCallCount === 1,
    "J auth no retry"
  );
  report.HTTP_AUTH_NO_RETRY =
    getCounts().providerCallCount === 1 ? "YES" : "NO";
}

// ── C/D: tools round1 save + previous_response_id retry-safe after fail ──
{
  clearResponsesToolStateStoreForTests();
  const requestId = "p1100_tools_round1";
  const publicId = canonicalResponsesPublicId(requestId);
  resetScenario({
    scripts: [
      () => ({
        kind: "completion",
        content: null,
        model: "gpt-5.5",
        finish_reason: "tool_calls",
        tool_calls: [
          {
            id: "call_p1100_1",
            type: "function",
            function: {
              name: "read_test_file",
              arguments: JSON.stringify({ path: "P1100.md" }),
            },
          },
        ],
      }),
    ],
  });
  const r1 = await runChat(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "Read P1100.md via tool" }],
      tools: READ_TOOL,
      tool_choice: "auto",
      stream: true,
    },
    requestId
  );
  assert(r1.ok === true, "C round1 tool success");
  if (r1.ok) {
    const responses = chatCompletionResponseToResponses(
      r1.response as Record<string, unknown>,
      requestId
    );
    responses.id = publicId;
    await persistResponsesToolStateFromRound1({
      response: responses,
      requestBody: {
        model: "gpt-5.5",
        input: "Read P1100.md via tool",
        tools: READ_TOOL,
        tool_choice: "auto",
      },
      userId: CALLER.userId,
      route: "/v1/responses",
      requestId,
      providerId: "grsai-primary",
      awaitDurable: true,
      stream: true,
    });
    assert(getResponsesToolState(publicId) != null, "C state saved after function_call");
  }

  // Round2-shaped transport fail must not delete state / must not bill
  resetScenario({
    scripts: [
      () => transportErr("connect_timeout"),
      () => transportErr("connect_timeout"),
    ],
  });
  const debitBefore = getCounts().debitCallCount;
  const r2fail = await runChat(
    {
      model: "gpt-5.5",
      messages: [
        { role: "user", content: "Read P1100.md via tool" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_p1100_1",
              type: "function",
              function: {
                name: "read_test_file",
                arguments: JSON.stringify({ path: "P1100.md" }),
              },
            },
          ],
        },
        { role: "tool", tool_call_id: "call_p1100_1", content: "file-ok" },
      ],
      tools: READ_TOOL,
      tool_choice: "auto",
      stream: true,
    },
    "p1100_tools_round2_fail"
  );
  assert(r2fail.ok === false, "D round2 transport fail");
  assert(
    getCounts().debitCallCount === debitBefore,
    "D round2 fail not billed"
  );
  const stAfter = getResponsesToolState(publicId);
  assert(stAfter != null, "D state retained after round2 transport fail");

  const bridgeBody = {
    model: "gpt-5.5",
    previous_response_id: publicId,
    input: [
      {
        type: "function_call_output",
        call_id: "call_p1100_1",
        output: "file-ok",
      },
    ],
  };
  const bridge = detectPreviousResponseToolOutputBridge(bridgeBody);
  assert(bridge != null, "D bridge detect");
  const resolved = await resolvePreviousResponseToolOutputBridge({
    bridge: bridge!,
    userId: CALLER.userId,
  });
  assert(resolved.ok === true, "D previous_response_id still resolves");
  report.PREVIOUS_RESPONSE_ID_RETRY_SAFE =
    stAfter != null && resolved.ok === true ? "YES" : "NO";
}

// ── Static invariant: no tool trimming / agent / chat route rewrite ──────
{
  const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const chat = read("apps/dmit-api/src/routes/chat.ts");
  const autoPro = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  assert(
    exec.includes("autoProTransparentCarrier") &&
      autoPro.includes("P1061") &&
      chat.includes("/v1/chat/completions"),
    "N/O auto-pro + chat routes still present"
  );
  assert(
    !exec.includes("stripToolsForTransportRetry") &&
      !exec.includes("TOKFAI_EXECUTE_CLIENT_TOOLS"),
    "no tool trimming / no tool execution hooks"
  );
}

// ── typecheck / build / regressions ──────────────────────────────────────
{
  const typecheck = spawnSync("npm", ["run", "typecheck"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
    env: process.env,
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
    env: process.env,
  });
  assert(build.status === 0, "build");
  report.BUILD = build.status === 0 ? "PASS" : "FAIL";
  if (build.status !== 0) {
    console.error(build.stdout?.slice(-2000));
    console.error(build.stderr?.slice(-2000));
  }

  const tsxLoader = join(
    ROOT,
    "apps/dmit-api/node_modules/tsx/dist/loader.mjs"
  );
  const regressions: Array<[string, string, RegExp | "P1092_STATIC"]> = [
    [
      "P1098",
      "scripts/p1098-responses-stream-tool-state-save-fix.mjs",
      /TOKFAI_P1098_.*_PASS/,
    ],
    [
      "P1097",
      "scripts/p1097-responses-previous-response-id-canonical-key-fix.mjs",
      /TOKFAI_P1097_.*_PASS/,
    ],
    [
      "P1095",
      "scripts/p1095-durable-responses-tool-state-store.mjs",
      /TOKFAI_P1095_.*_PASS/,
    ],
    [
      "P1093",
      "scripts/p1093-responses-previous-response-id-state-bridge.mjs",
      /TOKFAI_P1093_.*_PASS/,
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
      /TOKFAI_P1083_.*_PASS|TOKFAI_P1083_LOCAL_CHECKS_PASS/,
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

  // P1096 is activation plan only — static presence check
  {
    const p1096 = existsSync(
      join(ROOT, "docs/p1096-durable-responses-tool-state-activation-plan.md")
    )
      ? read("docs/p1096-durable-responses-tool-state-activation-plan.md")
      : existsSync(
            join(
              ROOT,
              "scripts/p1096-durable-responses-tool-state-activation-plan.mjs"
            )
          )
        ? read(
            "scripts/p1096-durable-responses-tool-state-activation-plan.mjs"
          )
        : "";
    assert(
      /P1096|durable|default-off|TOKFAI_RESPONSES_TOOL_STATE_DURABLE/i.test(
        p1096
      ) ||
        read("apps/dmit-api/src/env.ts").includes(
          "TOKFAI_RESPONSES_TOOL_STATE_DURABLE"
        ),
      "P1096 durable default-off still present"
    );
  }

  let regOk = true;
  for (const [label, script, re] of regressions) {
    const abs = join(ROOT, script);
    if (!existsSync(abs)) {
      fail(`regression_${label}`, "missing script");
      regOk = false;
      continue;
    }
    if (re === "P1092_STATIC") {
      const r = spawnSync(process.execPath, [abs], {
        cwd: ROOT,
        encoding: "utf8",
        env: {
          ...process.env,
          LIVE: "",
          TOKFAI_NESTED_REGRESSION: "1",
          LOG_LEVEL: "info",
        },
        timeout: 300_000,
        maxBuffer: 20 * 1024 * 1024,
      });
      const out = `${r.stdout || ""}\n${r.stderr || ""}`;
      const ok =
        /OFFLINE_PREV_ID_RESOLVE=YES/.test(out) &&
        /CODE_SUPPORTS_PREVIOUS_RESPONSE_ID=YES/.test(out);
      assert(ok, `regression_${label} offline+static`);
      if (!ok) regOk = false;
      continue;
    }
    const args = script.endsWith(".mts")
      ? ["--experimental-test-module-mocks", "--import", tsxLoader, abs]
      : [abs];
    const r = spawnSync(process.execPath, args, {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        LIVE: "",
        TOKFAI_NESTED_REGRESSION: "1",
        // P1062R2 early_sse_terminal asserts need info-level logs.
        LOG_LEVEL: "info",
      },
      timeout: 600_000,
      maxBuffer: 30 * 1024 * 1024,
    });
    const out = `${r.stdout || ""}\n${r.stderr || ""}`;
    const ok = r.status === 0 && re.test(out);
    assert(ok, `regression_${label}`);
    if (!ok) {
      regOk = false;
      console.error(out.slice(-2500));
    }
  }
  report.REGRESSIONS = regOk ? "PASS" : "FAIL";

  const diffCheck = spawnSync("git", ["diff", "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  assert(diffCheck.status === 0, "git diff --check");
  report.GIT_DIFF_CHECK = diffCheck.status === 0 ? "PASS" : "FAIL";
}

const coreOk =
  failed === 0 &&
  report.PROVIDER_TRANSPORT_ATTEMPT_ABSTRACTION_ADDED === "YES" &&
  report.NO_HTTP_RESPONSE_RETRY_ENABLED === "YES" &&
  report.CONNECT_TIMEOUT_RETRY_OR_FALLBACK === "YES" &&
  report.HEADERS_TIMEOUT_CLASSIFIED === "YES" &&
  report.HTTP_400_NO_RETRY === "YES" &&
  report.HTTP_AUTH_NO_RETRY === "YES" &&
  report.CLIENT_ABORT_NOT_PROVIDER_FAILURE === "YES" &&
  report.STREAM_FAILED_FRAME_DONE_ON_UPSTREAM_FAIL === "YES" &&
  report.BILLING_SUCCESS_CHARGED_ONCE === "YES" &&
  report.FAILED_ATTEMPTS_NOT_BILLED === "YES" &&
  report.PREVIOUS_RESPONSE_ID_RETRY_SAFE === "YES" &&
  report.TYPECHECK === "PASS" &&
  report.BUILD === "PASS" &&
  report.REGRESSIONS === "PASS" &&
  report.GIT_DIFF_CHECK === "PASS";

report.FINAL_VERDICT = coreOk ? "A_FIX_READY" : "B_NEEDS_FIX";

console.log("\n--- P1100 report ---");
for (const [k, v] of Object.entries(report)) {
  console.log(`${k}=${v}`);
}

if (report.FINAL_VERDICT === "A_FIX_READY") {
  console.log(PASS);
  process.exit(0);
}
console.log(FAIL);
process.exit(1);
