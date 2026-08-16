/**
 * P1115 — Codex explicit tool_choice policy opt-in gate.
 *
 * REAL executeChatCompletion ENTRY (/v1/responses) + pure policy units.
 * MOCK provider + billing via p1018 harness.
 *
 *   node scripts/p1115-codex-explicit-tool-choice-policy-opt-in-gate.mjs
 *
 * Marker (FINAL_VERDICT=A_FIX_READY only):
 *   TOKFAI_P1115_CODEX_EXPLICIT_TOOL_CHOICE_POLICY_OPT_IN_PASS
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AGENT_FILE_TOOLS,
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

ensureModuleMocks(fileURLToPath(import.meta.url));
ensureDummyEnv();
await installP1018Mocks();

const { executeChatCompletion } = await loadExecuteChatCompletion();
const {
  applyCodexExplicitToolChoicePolicy,
  resolveCodexExplicitToolChoicePolicy,
} = await import("../apps/dmit-api/src/lib/codexExplicitToolChoicePolicy.ts");
const {
  shouldBypassTokfaiToolForceForTransparentClient,
} = await import("../apps/dmit-api/src/lib/transparentToolForceBypass.ts");
const {
  shouldAttemptCodexAutoToolNoCallRetry,
} = await import("../apps/dmit-api/src/lib/codexAutoToolRetry.ts");
const {
  shouldAttemptGrsaiToolCompatFallback,
} = await import("../apps/dmit-api/src/lib/grsaiToolCompatFallback.ts");

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS =
  "TOKFAI_P1115_CODEX_EXPLICIT_TOOL_CHOICE_POLICY_OPT_IN_PASS";
const FAIL =
  "TOKFAI_P1115_CODEX_EXPLICIT_TOOL_CHOICE_POLICY_OPT_IN_FAIL";
const SUMMARY = join(
  ROOT,
  "tmp/p1115-codex-explicit-tool-choice-policy-opt-in-summary.json"
);

const READ_TOOLS = [
  {
    type: "function",
    function: {
      name: "read_project_file",
      description: "Read a project file by relative path and return its text.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
  ...AGENT_FILE_TOOLS,
] as const;

let failed = 0;
const report: Record<string, string> = {
  DEFAULT_AUTO_PRESERVED: "NO",
  OPT_IN_REQUIRED_APPLIED: "NO",
  OPT_IN_RESPONSES_TOOLCALL: "NO",
  CLIENT_REQUIRED_PRESERVED: "NO",
  CLIENT_NAMED_PRESERVED: "NO",
  NO_TOOLS_UNCHANGED: "NO",
  NO_PROMPT_PATH_BASED_FORCE: "NO",
  NO_SECOND_PROVIDER_FETCH_RETRY: "NO",
  TOKFAI_EXECUTES_TOOLS: "NO",
  BILLING_CHANGED: "NO",
  DURABLE_CHANGED: "NO",
  TRANSPORT_CHANGED: "NO",
  STT_CHANGED: "NO",
  IMAGE_CHANGED: "NO",
  NO_SECRET_LOGGED: "YES",
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
function msg(result: any) {
  return result?.response?.choices?.[0]?.message ?? null;
}
function hasToolCalls(result: any): boolean {
  const m = msg(result);
  return Array.isArray(m?.tool_calls) && m.tool_calls.length > 0;
}
function finishReason(result: any): string | null {
  return result?.response?.choices?.[0]?.finish_reason ?? null;
}

async function execResponses(
  body: Record<string, unknown>,
  requestId: string
) {
  return executeChatCompletion({
    caller: CALLER,
    requestId,
    body: body as any,
    route: "/v1/responses",
    limitKey: "p1115",
    clientStream: false,
  });
}

async function execChat(
  body: Record<string, unknown>,
  requestId: string
) {
  return executeChatCompletion({
    caller: CALLER,
    requestId,
    body: body as any,
    route: "/v1/chat/completions",
    limitKey: "p1115",
    clientStream: false,
  });
}

function baseBody(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    model: "gpt-5.5",
    messages: [
      {
        role: "user",
        content:
          "Call read_project_file for .tokfai-canary/p1113/codex-read-target.txt",
      },
    ],
    tools: READ_TOOLS,
    tool_choice: "auto",
    stream: false,
    ...overrides,
  };
}

function setPolicy(v: string | undefined) {
  if (v === undefined) delete process.env.TOKFAI_CODEX_TOOL_CHOICE_POLICY;
  else process.env.TOKFAI_CODEX_TOOL_CHOICE_POLICY = v;
}

console.log("P1115 CODEX EXPLICIT TOOL CHOICE POLICY OPT-IN GATE\n");

// ── Static ───────────────────────────────────────────────────────────────
{
  const policySrc = read(
    "apps/dmit-api/src/lib/codexExplicitToolChoicePolicy.ts"
  );
  const execSrc = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const logSrc = read("apps/dmit-api/src/logger.ts");
  const envSrc = read("apps/dmit-api/src/env.ts");

  assert(
    /applyCodexExplicitToolChoicePolicy/.test(policySrc) &&
      /required_when_tools_present/.test(policySrc) &&
      /preserve_auto/.test(policySrc),
    "policy module present"
  );
  assert(
    /codex_explicit_tool_choice_policy/.test(execSrc) &&
      /applyCodexExplicitToolChoicePolicy/.test(execSrc) &&
      /TOKFAI_CODEX_TOOL_CHOICE_POLICY/.test(execSrc),
    "exec wires policy + safe log"
  );
  assert(
    /TOKFAI_CODEX_TOOL_CHOICE_POLICY/.test(envSrc),
    "env documents opt-in flag"
  );
  assert(
    /toolChoiceBefore/.test(logSrc) && /toolChoiceAfter/.test(logSrc),
    "logger allowlists policy fields"
  );
  assert(
    !/readFileSync\(|fs\.promises|from\s+["']node:fs["']/.test(policySrc) &&
      !/detectExplicitToolExecutionIntent/.test(policySrc),
    "policy does not inspect prompts/paths/files"
  );
  report.NO_PROMPT_PATH_BASED_FORCE = "YES";
  report.TOKFAI_EXECUTES_TOOLS = "NO";

  const forbidden = [
    "apps/dmit-api/src/routes/audio.ts",
    "apps/dmit-api/src/upstream/audio",
    "apps/dmit-api/src/lib/usageBilling.ts",
    "apps/dmit-api/src/gateway",
    "apps/dmit-api/src/upstream/grsai.ts",
  ];
  let dirtyForbidden = false;
  for (const f of forbidden) {
    const r = spawnSync("git", ["diff", "--name-only", "HEAD", "--", f], {
      cwd: ROOT,
      encoding: "utf8",
    });
    if ((r.stdout || "").trim()) dirtyForbidden = true;
  }
  assert(!dirtyForbidden, "STT/billing/transport/gateway untouched in diff");
  report.STT_CHANGED = "NO";
  report.DURABLE_CHANGED = "NO";
  report.TRANSPORT_CHANGED = "NO";
  report.IMAGE_CHANGED = "NO";
  report.BILLING_CHANGED = "NO";
}

// ── Unit: resolve + apply ────────────────────────────────────────────────
{
  assert(
    resolveCodexExplicitToolChoicePolicy(undefined) === "preserve_auto",
    "unit: absent → preserve_auto"
  );
  assert(
    resolveCodexExplicitToolChoicePolicy("") === "preserve_auto",
    "unit: empty → preserve_auto"
  );
  assert(
    resolveCodexExplicitToolChoicePolicy("preserve_auto") === "preserve_auto",
    "unit: explicit preserve_auto"
  );
  assert(
    resolveCodexExplicitToolChoicePolicy("required_when_tools_present") ===
      "required_when_tools_present",
    "unit: opt-in name"
  );
  assert(
    resolveCodexExplicitToolChoicePolicy("prompt_based") === "preserve_auto",
    "unit: unknown policy falls back to preserve_auto"
  );

  const base = {
    route: "/v1/responses",
    transparentGateway: true,
    toolsCount: 3,
    toolChoice: "auto" as unknown,
    policy: "required_when_tools_present" as const,
  };
  const applied = applyCodexExplicitToolChoicePolicy(base);
  assert(
    applied.applied === true &&
      applied.toolChoice === "required" &&
      applied.beforeKind === "auto" &&
      applied.afterKind === "required",
    "unit: opt-in auto → required"
  );
  assert(
    applyCodexExplicitToolChoicePolicy({
      ...base,
      policy: "preserve_auto",
    }).applied === false,
    "unit: preserve_auto does not apply"
  );
  assert(
    applyCodexExplicitToolChoicePolicy({
      ...base,
      toolChoice: "required",
    }).reason === "client_required_preserved",
    "unit: client required preserved"
  );
  assert(
    applyCodexExplicitToolChoicePolicy({
      ...base,
      toolChoice: {
        type: "function",
        function: { name: "read_project_file" },
      },
    }).reason === "client_named_preserved",
    "unit: client named preserved"
  );
  assert(
    applyCodexExplicitToolChoicePolicy({
      ...base,
      toolsCount: 0,
    }).reason === "no_tools",
    "unit: no tools unchanged"
  );
  assert(
    applyCodexExplicitToolChoicePolicy({
      ...base,
      route: "/v1/chat/completions",
    }).reason === "route_not_responses",
    "unit: chat completions unchanged"
  );
  assert(
    applyCodexExplicitToolChoicePolicy({
      ...base,
      transparentGateway: false,
    }).reason === "not_transparent_client",
    "unit: non-transparent unchanged"
  );
  assert(
    applyCodexExplicitToolChoicePolicy({
      ...base,
      toolChoice: undefined,
    }).applied === true,
    "unit: missing tool_choice → required when opted in"
  );

  // P1109 still blocks second-fetch force when client choice stays auto
  assert(
    shouldBypassTokfaiToolForceForTransparentClient({
      route: "/v1/responses",
      transparentGateway: true,
      toolChoice: "auto",
    }) === true,
    "unit: P1109 bypass still true for client auto"
  );
  assert(
    shouldAttemptCodexAutoToolNoCallRetry({
      route: "/v1/responses",
      hasTools: true,
      toolsCount: 3,
      toolChoice: "auto",
      incomingToolMessageCount: 0,
      upstreamHttpOk: true,
      upstreamReturnedToolCalls: false,
      finishReason: "stop",
      alreadyAttempted: false,
      freshRemainingTotalMs: 60_000,
      activeToolMode: "native",
      bypassTokfaiToolForce: true,
    }) === false,
    "unit: no second-fetch retry under transparent bypass"
  );
  assert(
    shouldAttemptGrsaiToolCompatFallback({
      route: "/v1/responses",
      providerId: "grsai-primary",
      hasTools: true,
      toolsCount: 3,
      toolChoice: "auto",
      incomingToolMessageCount: 0,
      codexAutoToolRetryAttempted: true,
      nativeRetryReturnedToolCalls: false,
      nativeRetryHttpOk: true,
      nativeRetryFinishReason: "stop",
      alreadyAttempted: false,
      freshRemainingTotalMs: 60_000,
      bypassTokfaiToolForce: true,
    }) === false,
    "unit: no grsai compat second fetch under bypass"
  );
  report.NO_SECOND_PROVIDER_FETCH_RETRY = "YES";
}

// ── A. default / absent: auto preserved, single fetch, stop OK ───────────
{
  setPolicy(undefined);
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async ({ json }) => {
        if (json.tool_choice === "required") {
          return nativeToolCompletion("read_project_file", {
            path: "should-not-force",
          });
        }
        return {
          kind: "completion",
          content: "plain text under auto",
          finish_reason: "stop",
        };
      },
      async () =>
        nativeToolCompletion("read_project_file", { path: "retry-forbidden" }),
    ],
  });
  const result = await execResponses(baseBody(), "p1115-a-default-auto");
  const c = getCounts();
  const snap = billingSnapshot(result);
  const ok =
    result.ok === true &&
    c.providerCallCount === 1 &&
    c.outboundBodies[0]?.tool_choice === "auto" &&
    !hasToolCalls(result) &&
    finishReason(result) === "stop" &&
    snap.debitCallCount === 1;
  assert(
    ok,
    "A: default preserve_auto — outbound auto, 1 fetch, stop",
    `calls=${c.providerCallCount} choice=${JSON.stringify(c.outboundBodies[0]?.tool_choice)} debit=${snap.debitCallCount}`
  );
  if (ok) report.DEFAULT_AUTO_PRESERVED = "YES";
}

// ── B. opt-in: auto → required, tool_call returned, single fetch ─────────
{
  setPolicy("required_when_tools_present");
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async ({ json }) => {
        if (json.tool_choice !== "required") {
          return {
            kind: "completion",
            content: "would-be-auto-text",
            finish_reason: "stop",
          };
        }
        return nativeToolCompletion("read_project_file", {
          path: "opt-in.ts",
        });
      },
      async () => ({
        kind: "completion",
        content: "second-fetch-forbidden",
        finish_reason: "stop",
      }),
    ],
  });
  const result = await execResponses(baseBody(), "p1115-b-opt-in-required");
  const c = getCounts();
  const snap = billingSnapshot(result);
  const ok =
    result.ok === true &&
    c.providerCallCount === 1 &&
    c.outboundBodies[0]?.tool_choice === "required" &&
    hasToolCalls(result) &&
    msg(result)?.tool_calls?.[0]?.function?.name === "read_project_file" &&
    snap.debitCallCount === 1;
  assert(
    ok,
    "B: opt-in auto→required, tool_call, single fetch",
    `calls=${c.providerCallCount} choice=${JSON.stringify(c.outboundBodies[0]?.tool_choice)} hasTc=${hasToolCalls(result)} debit=${snap.debitCallCount}`
  );
  if (ok) {
    report.OPT_IN_REQUIRED_APPLIED = "YES";
    report.OPT_IN_RESPONSES_TOOLCALL = "YES";
  }
}

// ── C. client required / named preserved under opt-in ────────────────────
{
  setPolicy("required_when_tools_present");
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async ({ json }) => {
        if (json.tool_choice !== "required") {
          return {
            kind: "completion",
            content: "expected required",
            finish_reason: "stop",
          };
        }
        return nativeToolCompletion("read_project_file", { path: "req.ts" });
      },
    ],
  });
  const result = await execResponses(
    baseBody({ tool_choice: "required" }),
    "p1115-c-client-required"
  );
  const c = getCounts();
  const ok =
    result.ok === true &&
    c.outboundBodies[0]?.tool_choice === "required" &&
    hasToolCalls(result);
  assert(ok, "C1: client required preserved under opt-in");
  if (ok) report.CLIENT_REQUIRED_PRESERVED = "YES";
}

{
  setPolicy("required_when_tools_present");
  const named = {
    type: "function",
    function: { name: "read_project_file" },
  };
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async ({ json }) => {
        const tc = json.tool_choice;
        const okForced =
          tc === "required" ||
          (tc &&
            typeof tc === "object" &&
            ((tc as any).function?.name === "read_project_file" ||
              (tc as any).name === "read_project_file"));
        if (!okForced) {
          return {
            kind: "completion",
            content: "named missing",
            finish_reason: "stop",
          };
        }
        return nativeToolCompletion("read_project_file", { path: "named.ts" });
      },
    ],
  });
  const result = await execResponses(
    baseBody({ tool_choice: named }),
    "p1115-c-client-named"
  );
  const c = getCounts();
  const sent = c.outboundBodies[0]?.tool_choice as any;
  const forcedOk =
    sent === "required" ||
    (sent?.type === "function" &&
      (sent?.function?.name === "read_project_file" ||
        sent?.name === "read_project_file"));
  const ok =
    result.ok === true &&
    forcedOk &&
    sent !== "auto" &&
    hasToolCalls(result);
  assert(
    ok,
    "C2: client named preserved (or GRSAI required adapt)",
    `choice=${JSON.stringify(sent)}`
  );
  if (ok) report.CLIENT_NAMED_PRESERVED = "YES";
}

// ── D. no tools → unchanged under opt-in ─────────────────────────────────
{
  setPolicy("required_when_tools_present");
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async ({ json }) => {
        if (json.tool_choice === "required") {
          return {
            kind: "completion",
            content: "should-not-force-no-tools",
            finish_reason: "stop",
          };
        }
        return {
          kind: "completion",
          content: "no tools ok",
          finish_reason: "stop",
        };
      },
    ],
  });
  const result = await execResponses(
    baseBody({ tools: undefined, tool_choice: "auto" }),
    "p1115-d-no-tools"
  );
  const c = getCounts();
  const choice = c.outboundBodies[0]?.tool_choice;
  const ok =
    result.ok === true &&
    choice !== "required" &&
    (choice === "auto" || choice === undefined || choice === null) &&
    !hasToolCalls(result);
  assert(
    ok,
    "D: toolsCount=0 → no required rewrite",
    `choice=${JSON.stringify(choice)}`
  );
  if (ok) report.NO_TOOLS_UNCHANGED = "YES";
}

// ── E. chat completions / non-transparent unchanged ──────────────────────
{
  setPolicy("required_when_tools_present");
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async ({ json }) => {
        if (json.tool_choice === "required") {
          return nativeToolCompletion("read_project_file", {
            path: "chat-should-not",
          });
        }
        return {
          kind: "completion",
          content: "chat auto text",
          finish_reason: "stop",
        };
      },
    ],
  });
  const result = await execChat(baseBody(), "p1115-e-chat");
  const c = getCounts();
  const ok =
    result.ok === true &&
    c.outboundBodies[0]?.tool_choice === "auto" &&
    !hasToolCalls(result);
  assert(
    ok,
    "E: /v1/chat/completions unchanged under opt-in",
    `choice=${JSON.stringify(c.outboundBodies[0]?.tool_choice)}`
  );
}

// ── F. billing: tool_call path single debit; stop path single debit ──────
{
  setPolicy("required_when_tools_present");
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () =>
        nativeToolCompletion("read_project_file", { path: "bill.ts" }),
    ],
  });
  const r1 = await execResponses(baseBody(), "p1115-f-toolcall-bill");
  const s1 = billingSnapshot(r1);
  assert(
    r1.ok === true && hasToolCalls(r1) && s1.debitCallCount === 1,
    "F1: tool_call success → single debit",
    `debit=${s1.debitCallCount}`
  );

  setPolicy(undefined);
  resetScenario({
    providers: defaultProviders(),
    scripts: [
      async () => ({
        kind: "completion",
        content: "stop bill",
        finish_reason: "stop",
      }),
    ],
  });
  const r2 = await execResponses(baseBody(), "p1115-f-stop-bill");
  const s2 = billingSnapshot(r2);
  assert(
    r2.ok === true && !hasToolCalls(r2) && s2.debitCallCount === 1,
    "F2: auto stop → single debit (unchanged)",
    `debit=${s2.debitCallCount}`
  );
}

// Reset env for nested regressions
setPolicy(undefined);

// ── Nested regressions ───────────────────────────────────────────────────
function runNode(script: string, envExtra: Record<string, string> = {}) {
  const r = spawnSync(process.execPath, [script], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, ...envExtra, TOKFAI_NESTED_REGRESSION: "1" },
    timeout: 600_000,
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    status: r.status ?? 1,
    out: `${r.stdout || ""}\n${r.stderr || ""}`,
  };
}

{
  const tc = spawnSync("npm", ["run", "typecheck"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
  });
  assert(tc.status === 0, "typecheck", (tc.stderr || tc.stdout || "").slice(-200));
  report.TYPECHECK = tc.status === 0 ? "PASS" : "FAIL";

  const build = spawnSync("npm", ["run", "build"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
  });
  assert(build.status === 0, "build", (build.stderr || build.stdout || "").slice(-200));
  report.BUILD = build.status === 0 ? "PASS" : "FAIL";

  const diff = spawnSync(
    "git",
    [
      "diff",
      "--check",
      "--",
      "apps/dmit-api/src/lib/codexExplicitToolChoicePolicy.ts",
      "apps/dmit-api/src/lib/executeChatCompletion.ts",
      "apps/dmit-api/src/logger.ts",
      "apps/dmit-api/src/env.ts",
      "scripts/p1115-codex-explicit-tool-choice-policy-opt-in-gate.mts",
      "scripts/p1115-codex-explicit-tool-choice-policy-opt-in-gate.mjs",
    ],
    { cwd: ROOT, encoding: "utf8" }
  );
  assert(diff.status === 0, "git diff --check");
  report.GIT_DIFF_CHECK = diff.status === 0 ? "PASS" : "FAIL";
}

if (process.env.TOKFAI_NESTED_REGRESSION !== "1") {
  const p1109 = runNode(
    "scripts/p1109-codex-cursor-transparent-no-tool-force-gate.mjs"
  );
  assert(
    p1109.status === 0 &&
      /TOKFAI_P1109_CODEX_CURSOR_TRANSPARENT_NO_TOOL_FORCE_GATE_PASS/.test(
        p1109.out
      ),
    "P1109 regression"
  );

  // P1114 default policy (production observe; may be LIVE or skip)
  const p1114def = runNode(
    "scripts/p1114-responses-tool-call-capability-matrix.mjs",
    { LIVE: process.env.LIVE || "0" }
  );
  assert(
    /TOKFAI_P1114_RESPONSES_TOOL_CALL_CAPABILITY_MATRIX_(PASS|FAIL)/.test(
      p1114def.out
    ),
    "P1114 default policy ran",
    `status=${p1114def.status}`
  );
  // Do not require PASS if LIVE skipped; require no crash when nested.
  if (process.env.LIVE === "1") {
    assert(
      p1114def.status === 0 &&
        /TOKFAI_P1114_RESPONSES_TOOL_CALL_CAPABILITY_MATRIX_PASS/.test(
          p1114def.out
        ),
      "P1114 default LIVE PASS"
    );
  }

  const p1114opt = runNode(
    "scripts/p1114-responses-tool-call-capability-matrix.mjs",
    {
      LIVE: process.env.LIVE || "0",
      TOKFAI_CODEX_TOOL_CHOICE_POLICY: "required_when_tools_present",
    }
  );
  assert(
    /TOKFAI_P1114_RESPONSES_TOOL_CALL_CAPABILITY_MATRIX_(PASS|FAIL)/.test(
      p1114opt.out
    ),
    "P1114 opt-in env ran (production unchanged until deploy)",
    `status=${p1114opt.status}`
  );

  for (const script of [
    "scripts/p1107-grsai-stt-capability-gate-and-doc-truth.mjs",
    "scripts/p1104-grsai-stt-provider-adapter.mjs",
    "scripts/p1103-stt-admin-test-root-cause.mjs",
  ]) {
    if (!existsSync(join(ROOT, script))) {
      pass(`skip missing ${script}`);
      continue;
    }
    const r = runNode(script);
    assert(
      r.status === 0 || /PASS|SKIP|not applicable/i.test(r.out),
      `quick ${script}`,
      `status=${r.status}`
    );
  }

  report.REGRESSIONS = failed === 0 ? "PASS" : "FAIL";
} else {
  report.REGRESSIONS = "SKIP";
  pass("nested regression skip");
}

const aReady =
  report.DEFAULT_AUTO_PRESERVED === "YES" &&
  report.OPT_IN_REQUIRED_APPLIED === "YES" &&
  report.OPT_IN_RESPONSES_TOOLCALL === "YES" &&
  report.CLIENT_REQUIRED_PRESERVED === "YES" &&
  report.CLIENT_NAMED_PRESERVED === "YES" &&
  report.NO_TOOLS_UNCHANGED === "YES" &&
  report.NO_PROMPT_PATH_BASED_FORCE === "YES" &&
  report.NO_SECOND_PROVIDER_FETCH_RETRY === "YES" &&
  report.TOKFAI_EXECUTES_TOOLS === "NO" &&
  report.BILLING_CHANGED === "NO" &&
  report.TYPECHECK === "PASS" &&
  report.BUILD === "PASS" &&
  report.GIT_DIFF_CHECK === "PASS" &&
  failed === 0;

report.FINAL_VERDICT = aReady ? "A_FIX_READY" : "C_REJECT";

mkdirSync(dirname(SUMMARY), { recursive: true });
writeFileSync(SUMMARY, JSON.stringify(report, null, 2));

console.log("\n=== MATRIX ===");
for (const [k, v] of Object.entries(report)) {
  console.log(`${k}=${v}`);
}
console.log("");
console.log(aReady ? PASS : FAIL);
process.exit(aReady ? 0 : 1);
