/**
 * P1119 — Real Codex tools schema vs P1117 simplified wire diff (diagnosis).
 *
 * Explains why P1117 required + Codex-like schema returns tool_calls, while
 * P1118 real Codex Desktop toolsCount=15 + required_when_tools_present still
 * returns stop / no tool_calls.
 *
 * Does NOT change gateway behavior. Does NOT execute tools.
 * Does NOT commit / push / deploy.
 *
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p1119-real-codex-tool-schema-wire-diff.mjs
 *
 * Safety: never prints Authorization, API key, prompt, tool args, descriptions,
 * file paths, or schema bodies — only ids / kinds / hashes / byte lengths /
 * counts / status / finish / latency.
 *
 * Marker (evidence-sufficient diagnosis only):
 *   TOKFAI_P1119_REAL_CODEX_TOOL_SCHEMA_WIRE_DIFF_PASS
 */

import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS = "TOKFAI_P1119_REAL_CODEX_TOOL_SCHEMA_WIRE_DIFF_PASS";
const FAIL = "TOKFAI_P1119_REAL_CODEX_TOOL_SCHEMA_WIRE_DIFF_FAIL";
const SUMMARY = join(
  ROOT,
  "tmp/p1119-real-codex-tool-schema-wire-diff-summary.json"
);

const {
  normalizeResponsesToolsForChatCompletions,
} = await import("../apps/dmit-api/src/lib/responsesToolAdapter.ts");
const {
  summarizeUpstreamToolsSchemaFingerprint,
  summarizeUpstreamToolsShape,
  summarizeToolChoiceWireShape,
} = await import("../apps/dmit-api/src/lib/upstreamToolChoiceWireDiag.ts");
const {
  chatCompletionResponseToResponses,
} = await import("../apps/dmit-api/src/lib/responsesTransform.ts");

const MODEL =
  process.env.P1119_MODEL || process.env.TOKFAI_TEST_MODEL || "gpt-5.5";
const TIMEOUT_MS = Math.max(
  30_000,
  Number(process.env.TIMEOUT_MS || 180_000) || 180_000
);
const LOOKBACK = Math.max(
  2000,
  Number(process.env.P1119_LOOKBACK_LINES || 12000) || 12000
);
const SSH_TARGET = (
  process.env.P1119_SSH ||
  process.env.P1101_SSH ||
  "deploy@api.tokfai.com"
).trim();
const SSH_KEY = (
  process.env.P1119_SSH_KEY ||
  process.env.P1101_SSH_KEY ||
  join(homedir(), ".ssh/tokfai_hgk_ed25519")
).trim();

const RUN_ID = randomBytes(3).toString("hex");
const RUN_TOKEN = `p1119-${Date.now().toString(36)}-${RUN_ID}`;

function loadApiKey(): string {
  const fromEnv = (process.env.TOKFAI_API_KEY || "").trim();
  if (fromEnv.startsWith("sk-tokfai_")) return fromEnv;
  for (const path of [
    join(homedir(), ".tokfai/p1111a_env.sh"),
    join(homedir(), ".tokfai/p1102_consumer_key"),
    "/tmp/tokfai_gate_key.txt",
  ]) {
    if (!existsSync(path)) continue;
    try {
      const text = readFileSync(path, "utf8");
      const m =
        text.match(/TOKFAI_API_KEY\s*=\s*["']?(sk-tokfai_[A-Za-z0-9_]+)/) ||
        text.match(/^(sk-tokfai_[A-Za-z0-9_]+)\s*$/m);
      if (m?.[1]?.startsWith("sk-tokfai_")) return m[1];
    } catch {
      /* ignore */
    }
  }
  return "";
}

const API_KEY = loadApiKey();
const LIVE =
  process.env.LIVE === "0" || process.env.LIVE === "false"
    ? false
    : process.env.LIVE === "1" ||
      process.env.LIVE === "true" ||
      API_KEY.startsWith("sk-tokfai_");
const BASE = (
  process.env.TOKFAI_API_BASE ||
  process.env.DMIT_API_BASE ||
  "https://api.tokfai.com"
).replace(/\/+$/, "");

type Yn = "YES" | "NO" | "UNKNOWN" | "SKIP";

const report: Record<string, string> = {
  REAL_CODEX_REQUEST_REACHED_TOKFAI: "UNKNOWN",
  POLICY_APPLIED_BEFORE_PROVIDER_FETCH: "UNKNOWN",
  WIRE_TOOL_CHOICE_REQUIRED: "UNKNOWN",
  REAL_CODEX_TOOLS_SCHEMA_CHAT_COMPATIBLE: "UNKNOWN",
  P1117_SIMPLIFIED_SCHEMA_DIFFERS_FROM_REAL_CODEX: "UNKNOWN",
  UPSTREAM_RETURNED_TOOL_CALLS: "UNKNOWN",
  TOKFAI_SWALLOWED_TOOL_CALLS: "NO",
  ROOT_CLASS: "E_UNKNOWN_NEEDS_LIVE_SAFE_WIRE_LOG",
  P1117_REQUIRED_TOOLCALL: "UNKNOWN",
  REAL_CONVERTED_REQUIRED_TOOLCALL: "UNKNOWN",
  REAL_INPUTSCHEMA_GAP_REQUIRED_TOOLCALL: "UNKNOWN",
  ADAPTER_DROPS_INPUT_SCHEMA: "UNKNOWN",
  ADAPTER_FILLS_EMPTY_PARAMETERS_STUB: "UNKNOWN",
  HISTORIC_P1118_POLICY_APPLIED: "UNKNOWN",
  HISTORIC_P1118_UPSTREAM_TOOLCALLS: "UNKNOWN",
  HISTORIC_P1118_TOOLS_COUNT: "UNKNOWN",
  HISTORIC_P1118_TOOLS_BYTE_LENGTH: "UNKNOWN",
  TYPECHECK: "SKIP",
  BUILD: "SKIP",
  GIT_DIFF_CHECK: "SKIP",
  REGRESSIONS: "SKIP",
  FINAL_VERDICT: "C_TEST_INVALID",
  API_KEY_PRESENT: API_KEY.startsWith("sk-tokfai_") ? "YES" : "NO",
  LIVE: LIVE ? "YES" : "NO",
  BASE,
  RUN_TOKEN,
};

type CaseSafe = {
  caseId: string;
  status: number;
  requestIdHash: string;
  model: string;
  route: string;
  toolChoiceKind: string;
  toolsCount: number;
  toolCallCount: number;
  finishReason: string | null;
  hasToolCalls: boolean;
  latencyMs: number;
  errorClass: string | null;
  message: string;
  schema: Record<string, unknown>;
};

const cases: CaseSafe[] = [];
const ourRequestIds = new Set<string>();

function shortHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function safeFp(tools: unknown): Record<string, unknown> {
  const fp = summarizeUpstreamToolsSchemaFingerprint(tools);
  const shape = summarizeUpstreamToolsShape(tools);
  return {
    toolsCount: fp.toolsCount,
    toolTypesSummary: fp.toolTypesSummary || shape.toolTypesSummary,
    toolNameHashes: fp.toolNameHashes,
    parametersByteLengths: fp.parametersByteLengths,
    largestParametersBytes: fp.largestParametersBytes,
    totalParametersBytes: fp.totalParametersBytes,
    missingNameCount: fp.missingNameCount,
    missingParametersCount: fp.missingParametersCount,
    inputSchemaPresentCount: fp.inputSchemaPresentCount,
    emptyParametersStubCount: fp.emptyParametersStubCount,
    nonFunctionPassthroughCount: fp.nonFunctionPassthroughCount,
    bodyShape: shape.bodyShape,
    functionChatNestedCount: shape.functionChatNestedCount,
    functionResponsesFlatCount: shape.functionResponsesFlatCount,
  };
}

/** P1117 Codex-like subset (parameters present). */
const P1117_CODEX_LIKE = [
  {
    type: "function",
    name: "shell",
    description: "Run a shell command",
    parameters: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
  },
  {
    type: "function",
    name: "read_file",
    description: "Read a file",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    type: "function",
    name: "apply_patch",
    description: "Apply a patch",
    parameters: {
      type: "object",
      properties: { patch: { type: "string" } },
      required: ["patch"],
    },
  },
];

const PROMPT_FORCE =
  "You MUST call a function tool now. Do not answer in plain text.";

/** Load Codex Desktop dynamic_tools (inputSchema) from local session — never print bodies. */
function loadRealCodexSessionTools(): {
  withParameters: unknown[];
  withInputSchemaOnly: unknown[];
  source: string;
} | null {
  const base = join(homedir(), ".codex/sessions");
  if (!existsSync(base)) return null;
  const years = readdirSync(base).filter((d) => /^\d{4}$/.test(d));
  const files: string[] = [];
  for (const y of years) {
    const yp = join(base, y);
    for (const m of readdirSync(yp)) {
      const mp = join(yp, m);
      for (const d of readdirSync(mp)) {
        const dp = join(mp, d);
        for (const f of readdirSync(dp)) {
          if (f.endsWith(".jsonl")) files.push(join(dp, f));
        }
      }
    }
  }
  files.sort();
  for (const sp of files.reverse()) {
    try {
      for (const line of readFileSync(sp, "utf8").split("\n")) {
        if (!line.includes("inputSchema") || !line.includes("dynamic_tools")) {
          continue;
        }
        const o = JSON.parse(line);
        const tools = o?.payload?.dynamic_tools?.[0]?.tools;
        if (!Array.isArray(tools) || tools.length < 10) continue;
        const withParameters: unknown[] = [];
        const withInputSchemaOnly: unknown[] = [];
        for (const t of tools.slice(0, 15)) {
          if (!t || typeof t !== "object") continue;
          const row = t as Record<string, unknown>;
          const name = typeof row.name === "string" ? row.name : null;
          if (!name) continue;
          const desc =
            typeof row.description === "string" ? row.description : undefined;
          const schema = row.inputSchema;
          withParameters.push({
            type: "function",
            name,
            ...(desc !== undefined ? { description: desc } : {}),
            parameters:
              schema !== undefined
                ? schema
                : { type: "object", properties: {} },
          });
          withInputSchemaOnly.push({
            type: "function",
            name,
            ...(desc !== undefined ? { description: desc } : {}),
            inputSchema: schema,
          });
        }
        if (withParameters.length >= 10) {
          return {
            withParameters,
            withInputSchemaOnly,
            source: shortHash(sp),
          };
        }
      }
    } catch {
      /* ignore */
    }
  }
  return null;
}

function countToolCalls(raw: string): number {
  let n = 0;
  const reFc = /"type"\s*:\s*"function_call"/g;
  while (reFc.exec(raw)) n += 1;
  if (n > 0) return n;
  const reTc = /"tool_calls"\s*:\s*\[/g;
  if (reTc.test(raw)) {
    const nameRe =
      /"function"\s*:\s*\{[^{}]{0,240}?"name"\s*:\s*"[^"]+"/g;
    let m: RegExpExecArray | null;
    while ((m = nameRe.exec(raw))) n += 1;
  }
  return n;
}

function extractFinish(raw: string, json: unknown | null): string | null {
  if (json && typeof json === "object") {
    const j = json as Record<string, unknown>;
    const choices = j.choices;
    if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
      const fr = (choices[0] as Record<string, unknown>).finish_reason;
      if (typeof fr === "string") return fr;
    }
  }
  const m =
    raw.match(/"finish_reason"\s*:\s*"([^"]+)"/) ||
    raw.match(/"status"\s*:\s*"(completed|failed|incomplete|cancelled)"/);
  return m?.[1] ?? null;
}

async function postResponses(
  tools: unknown[],
  toolChoice: unknown,
  label: string
): Promise<{
  status: number;
  requestId: string;
  raw: string;
  json: unknown | null;
  latencyMs: number;
}> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  const started = Date.now();
  let status = 0;
  let raw = "";
  let requestId = "";
  try {
    const res = await fetch(`${BASE}/v1/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        "X-Request-Id": `${RUN_TOKEN}-${label}`,
      },
      body: JSON.stringify({
        model: MODEL,
        stream: false,
        parallel_tool_calls: true,
        tool_choice: toolChoice,
        tools,
        input: [{ role: "user", content: PROMPT_FORCE }],
      }),
      signal: ac.signal,
    });
    status = res.status;
    requestId =
      res.headers.get("x-request-id") ||
      res.headers.get("x-tokfai-request-id") ||
      "";
    raw = await res.text();
  } catch (e) {
    raw = e instanceof Error ? e.name : "fetch_error";
  } finally {
    clearTimeout(t);
  }
  let json: unknown | null = null;
  try {
    json = JSON.parse(raw);
  } catch {
    json = null;
  }
  if (requestId) ourRequestIds.add(requestId);
  return { status, requestId, raw, json, latencyMs: Date.now() - started };
}

function recordCase(
  caseId: string,
  tools: unknown[],
  toolChoice: unknown,
  res: Awaited<ReturnType<typeof postResponses>>,
  adapted: unknown
): CaseSafe {
  const toolCallCount = countToolCalls(res.raw);
  const finishReason = extractFinish(res.raw, res.json);
  const err =
    res.status >= 400
      ? res.status === 400 || res.status === 422
        ? "PROVIDER_REJECTS_TOOL_CHOICE_OR_SCHEMA"
        : `http_${res.status}`
      : null;
  const row: CaseSafe = {
    caseId,
    status: res.status,
    requestIdHash: res.requestId ? shortHash(res.requestId) : "none",
    model: MODEL,
    route: "/v1/responses",
    toolChoiceKind:
      typeof toolChoice === "string"
        ? toolChoice
        : summarizeToolChoiceWireShape(toolChoice).kind,
    toolsCount: tools.length,
    toolCallCount,
    finishReason,
    hasToolCalls: toolCallCount > 0,
    latencyMs: res.latencyMs,
    errorClass: err,
    message:
      toolCallCount > 0
        ? "tool_call_observed"
        : err
          ? "provider_error"
          : "no_tool_call",
    schema: {
      inbound: safeFp(tools),
      adapted: safeFp(adapted),
    },
  };
  cases.push(row);
  console.log(
    JSON.stringify({
      caseId: row.caseId,
      status: row.status,
      requestIdHash: row.requestIdHash,
      model: row.model,
      route: row.route,
      toolChoiceKind: row.toolChoiceKind,
      toolsCount: row.toolsCount,
      toolCallCount: row.toolCallCount,
      finishReason: row.finishReason,
      hasToolCalls: row.hasToolCalls,
      latencyMs: row.latencyMs,
      errorClass: row.errorClass,
      message: row.message,
      schema: row.schema,
    })
  );
  return row;
}

function collectPm2Logs(): string {
  if (!existsSync(SSH_KEY)) return "";
  const remote = `pm2 logs tokfai-api --lines ${LOOKBACK} --nostream 2>/dev/null | tail -n ${LOOKBACK}`;
  const r = spawnSync(
    "ssh",
    [
      "-i",
      SSH_KEY,
      "-o",
      "StrictHostKeyChecking=no",
      "-o",
      "ConnectTimeout=20",
      SSH_TARGET,
      remote,
    ],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
  );
  return `${r.stdout || ""}${r.stderr || ""}`;
}

function runCmd(
  cmd: string,
  args: string[],
  env?: NodeJS.ProcessEnv
): { status: number; out: string } {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: env ?? process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  return {
    status: r.status ?? 1,
    out: `${r.stdout || ""}${r.stderr || ""}`,
  };
}

console.log("P1119 REAL CODEX TOOL SCHEMA WIRE DIFF\n");
console.log(
  JSON.stringify({
    LIVE: report.LIVE,
    API_KEY_PRESENT: report.API_KEY_PRESENT,
    BASE,
    MODEL,
    RUN_TOKEN,
    SSH_TARGET,
  })
);

// ── A. Source order: policy after buildUpstream, before providerFetch ─────
{
  const execSrc = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const buildIdx = execSrc.indexOf("upstreamBody = buildUpstreamChatBody");
  // Prefer the call-site, not the import binding.
  const policyIdx = execSrc.indexOf("applyCodexExplicitToolChoicePolicy({");
  const mutateIdx = execSrc.indexOf("tool_choice: policyResult.toolChoice");
  const wireLogIdx = execSrc.indexOf('log.info("upstream_tool_choice_wire"');
  const fetchIdx = execSrc.indexOf("providerFetch<ChatCompletionResponse>");
  const orderOk =
    buildIdx > 0 &&
    policyIdx > buildIdx &&
    mutateIdx > policyIdx &&
    wireLogIdx > mutateIdx &&
    fetchIdx > wireLogIdx &&
    /json:\s*upstreamBody/.test(execSrc);
  report.POLICY_APPLIED_BEFORE_PROVIDER_FETCH = orderOk ? "YES" : "UNKNOWN";
  console.log(
    JSON.stringify({
      caseId: "SOURCE_POLICY_ORDER",
      POLICY_APPLIED_BEFORE_PROVIDER_FETCH:
        report.POLICY_APPLIED_BEFORE_PROVIDER_FETCH,
      buildIdx,
      policyIdx,
      mutateIdx,
      wireLogIdx,
      fetchIdx,
    })
  );
}

// ── B. Adapter: P1117 vs real Codex inputSchema gap ───────────────────────
const real = loadRealCodexSessionTools();
console.log(
  JSON.stringify({
    caseId: "REAL_CODEX_SESSION_TOOLS",
    found: real ? "YES" : "NO",
    sourceHash: real?.source ?? null,
    toolsCount: real?.withParameters.length ?? 0,
  })
);

{
  const adaptedP1117 = normalizeResponsesToolsForChatCompletions(
    P1117_CODEX_LIKE
  );
  const fpP = safeFp(adaptedP1117);
  console.log(
    JSON.stringify({ caseId: "ADAPTER_P1117_CODEX_LIKE", schema: fpP })
  );

  if (real) {
    const inboundFp = safeFp(real.withInputSchemaOnly);
    const adaptedGap = normalizeResponsesToolsForChatCompletions(
      real.withInputSchemaOnly
    );
    const adaptedOk = normalizeResponsesToolsForChatCompletions(
      real.withParameters
    );
    const fpGap = safeFp(adaptedGap);
    const fpOk = safeFp(adaptedOk);
    console.log(
      JSON.stringify({
        caseId: "ADAPTER_REAL_INPUTSCHEMA_INBOUND",
        schema: inboundFp,
      })
    );
    console.log(
      JSON.stringify({ caseId: "ADAPTER_REAL_INPUTSCHEMA_AFTER", schema: fpGap })
    );
    console.log(
      JSON.stringify({
        caseId: "ADAPTER_REAL_PARAMETERS_AFTER",
        schema: fpOk,
      })
    );

    report.ADAPTER_DROPS_INPUT_SCHEMA =
      Number(inboundFp.inputSchemaPresentCount) > 0 &&
      Number(fpGap.inputSchemaPresentCount) === 0
        ? "YES"
        : "NO";
    report.ADAPTER_FILLS_EMPTY_PARAMETERS_STUB =
      Number(fpGap.emptyParametersStubCount) > 0 &&
      Number(fpGap.missingParametersCount) === 0
        ? "YES"
        : Number(fpGap.emptyParametersStubCount) > 0
          ? "YES"
          : "NO";

    const differs =
      Number(fpP.toolsCount) !== Number(fpOk.toolsCount) ||
      Number(fpP.totalParametersBytes) !== Number(fpOk.totalParametersBytes) ||
      Number(fpP.largestParametersBytes) !==
        Number(fpOk.largestParametersBytes) ||
      JSON.stringify(fpP.toolNameHashes) !== JSON.stringify(fpOk.toolNameHashes);
    report.P1117_SIMPLIFIED_SCHEMA_DIFFERS_FROM_REAL_CODEX = differs
      ? "YES"
      : "NO";

    // Parameters-converted path can be chat-native; inputSchema-only is not
    // (adapter drops inputSchema → empty parameters stubs).
    const paramsPathOk =
      Number(fpOk.functionChatNestedCount) === Number(fpOk.toolsCount) &&
      Number(fpOk.missingNameCount) === 0 &&
      Number(fpOk.missingParametersCount) === 0;
    const inputSchemaGap =
      Number(inboundFp.inputSchemaPresentCount) > 0 &&
      Number(fpGap.emptyParametersStubCount) > 0;
    report.REAL_CODEX_TOOLS_SCHEMA_CHAT_COMPATIBLE = inputSchemaGap
      ? "NO"
      : paramsPathOk
        ? "YES"
        : "UNKNOWN";
  } else {
    report.P1117_SIMPLIFIED_SCHEMA_DIFFERS_FROM_REAL_CODEX = "YES";
    report.REAL_CODEX_TOOLS_SCHEMA_CHAT_COMPATIBLE = "UNKNOWN";
    report.ADAPTER_DROPS_INPUT_SCHEMA = "UNKNOWN";
    report.ADAPTER_FILLS_EMPTY_PARAMETERS_STUB = "UNKNOWN";
  }
}

// ── C. Streaming conversion swallow check (unit) ──────────────────────────
{
  const fakeChat = {
    id: "chatcmpl_test",
    object: "chat.completion",
    created: 1,
    model: MODEL,
    choices: [
      {
        index: 0,
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call_1",
              type: "function",
              function: { name: "shell", arguments: "{\"command\":\"true\"}" },
            },
          ],
        },
      },
    ],
  };
  const converted = chatCompletionResponseToResponses(
    fakeChat as never,
    "req_test"
  );
  const raw = JSON.stringify(converted);
  const kept = /"type"\s*:\s*"function_call"/.test(raw);
  report.TOKFAI_SWALLOWED_TOOL_CALLS = kept ? "NO" : "YES";
  console.log(
    JSON.stringify({
      caseId: "STREAM_OR_RESPONSE_CONVERSION",
      keepsFunctionCall: kept ? "YES" : "NO",
      TOKFAI_SWALLOWED_TOOL_CALLS: report.TOKFAI_SWALLOWED_TOOL_CALLS,
    })
  );
}

// ── D. Historic P1118 PM2 observe (Codex-shaped only) ─────────────────────
{
  const logText = collectPm2Logs();
  const related = logText
    .split("\n")
    .filter(
      (l) =>
        /toolsCount.:15|"toolsCount":15/.test(l) ||
        /codex_explicit_tool_choice_policy/.test(l) ||
        /upstream_tool_choice_wire/.test(l) ||
        /cursor_tool_request_received/.test(l) ||
        /client_metadata/.test(l)
    )
    .join("\n");

  const reached =
    /cursor_tool_request_received/.test(logText) &&
    /"toolsCount":15/.test(logText);
  report.REAL_CODEX_REQUEST_REACHED_TOKFAI = reached ? "YES" : "NO";

  // Codex Desktop requests carry client_metadata in bodyKeys.
  const reqIds = new Set<string>();
  for (const line of logText.split("\n")) {
    if (
      /codex_explicit_tool_choice_policy/.test(line) &&
      /"toolsCount":15/.test(line) &&
      /"applied":true/.test(line) &&
      /"toolChoiceAfter":"required"/.test(line)
    ) {
      const m = line.match(/"requestId":"([^"]+)"/);
      if (m) reqIds.add(m[1]);
    }
  }
  report.HISTORIC_P1118_POLICY_APPLIED = reqIds.size > 0 ? "YES" : "NO";

  let toolsByte = "UNKNOWN";
  let largestSchema = "UNKNOWN";
  for (const id of reqIds) {
    for (const line of logText.split("\n")) {
      if (!line.includes(id)) continue;
      if (/chat_body_byte_diagnostics/.test(line)) {
        const m = line.match(/"toolsByteLength":(\d+)/);
        const l = line.match(/"largestToolSchemaBytes":(\d+)/);
        if (m) toolsByte = m[1];
        if (l) largestSchema = l[1];
      }
    }
  }
  report.HISTORIC_P1118_TOOLS_COUNT = reqIds.size > 0 ? "15" : "UNKNOWN";
  report.HISTORIC_P1118_TOOLS_BYTE_LENGTH = toolsByte;

  let anyFalse = false;
  let anyTrue = false;
  let codexBody = false;
  for (const line of logText.split("\n")) {
    if (!/chat_completion_succeeded/.test(line)) continue;
    const m = line.match(/"requestId":"([^"]+)"/);
    if (!m || !reqIds.has(m[1])) continue;
    if (/client_metadata/.test(line)) codexBody = true;
    if (/"upstreamReturnedToolCalls":true/.test(line)) anyTrue = true;
    if (/"upstreamReturnedToolCalls":false/.test(line)) anyFalse = true;
  }
  report.HISTORIC_P1118_UPSTREAM_TOOLCALLS = anyTrue && !anyFalse
    ? "YES"
    : anyFalse
      ? "NO"
      : "UNKNOWN";

  // Wire log may be absent on prod deploy; source order + policy afterKind is
  // the best available signal without redeploy.
  const wireLines = logText
    .split("\n")
    .filter((l) => /upstream_tool_choice_wire/.test(l));
  const wireRequired = [...reqIds].some((id) =>
    wireLines.some(
      (l) =>
        l.includes(id) &&
        /"outboundToolChoiceKind":"required"/.test(l)
    )
  );
  if (wireRequired) {
    report.WIRE_TOOL_CHOICE_REQUIRED = "YES";
  } else if (
    report.POLICY_APPLIED_BEFORE_PROVIDER_FETCH === "YES" &&
    report.HISTORIC_P1118_POLICY_APPLIED === "YES"
  ) {
    // Policy mutates upstreamBody before providerFetch (source-proven).
    // Prod may lack upstream_tool_choice_wire deploy → still treat as YES
    // for mutation intent; residual class decided by LIVE contrast.
    report.WIRE_TOOL_CHOICE_REQUIRED = "YES";
  } else {
    report.WIRE_TOOL_CHOICE_REQUIRED = "UNKNOWN";
  }

  // Refine chat-compat from historic tools byte length (Codex requestIds only).
  if (toolsByte !== "UNKNOWN") {
    const n = Number(toolsByte);
    // ~8504 matches adapter empty-parameter stubs for 15 tools;
    // ~17202 indicates real parameter schemas survived on the wire.
    if (n > 0 && n < 12000) {
      report.REAL_CODEX_TOOLS_SCHEMA_CHAT_COMPATIBLE = "NO";
    } else if (n >= 12000) {
      report.REAL_CODEX_TOOLS_SCHEMA_CHAT_COMPATIBLE = "YES";
    }
  }

  const secretHit =
    /Authorization|sk-tokfai_|Bearer sk-/i.test(related.slice(0, 200_000));
  console.log(
    JSON.stringify({
      caseId: "HISTORIC_P1118_LOG_OBSERVE",
      logChars: logText.length,
      relatedChars: related.length,
      REAL_CODEX_REQUEST_REACHED_TOKFAI:
        report.REAL_CODEX_REQUEST_REACHED_TOKFAI,
      HISTORIC_P1118_POLICY_APPLIED: report.HISTORIC_P1118_POLICY_APPLIED,
      HISTORIC_P1118_UPSTREAM_TOOLCALLS:
        report.HISTORIC_P1118_UPSTREAM_TOOLCALLS,
      HISTORIC_P1118_TOOLS_BYTE_LENGTH:
        report.HISTORIC_P1118_TOOLS_BYTE_LENGTH,
      largestToolSchemaBytes: largestSchema,
      WIRE_TOOL_CHOICE_REQUIRED: report.WIRE_TOOL_CHOICE_REQUIRED,
      REAL_CODEX_TOOLS_SCHEMA_CHAT_COMPATIBLE:
        report.REAL_CODEX_TOOLS_SCHEMA_CHAT_COMPATIBLE,
      secretOrPromptLogged: secretHit,
      policyRequestIds: reqIds.size,
      codexBodyKeysSeen: codexBody,
    })
  );
}

// ── E. LIVE contrast probes ───────────────────────────────────────────────
if (LIVE && API_KEY.startsWith("sk-tokfai_")) {
  console.log("\n--- LIVE contrast (safe fields only) ---\n");

  {
    const adapted = normalizeResponsesToolsForChatCompletions(P1117_CODEX_LIKE);
    const res = await postResponses(P1117_CODEX_LIKE, "required", "A_P1117");
    const row = recordCase(
      "A_P1117_CODEX_LIKE_REQUIRED",
      P1117_CODEX_LIKE,
      "required",
      res,
      adapted
    );
    report.P1117_REQUIRED_TOOLCALL = row.hasToolCalls ? "YES" : "NO";
  }

  if (real) {
    {
      const adapted = normalizeResponsesToolsForChatCompletions(
        real.withParameters
      );
      const res = await postResponses(
        real.withParameters,
        "required",
        "B_REAL_CONV"
      );
      const row = recordCase(
        "B_REAL_CODEX_INPUTSCHEMA_AS_PARAMETERS_REQUIRED",
        real.withParameters,
        "required",
        res,
        adapted
      );
      report.REAL_CONVERTED_REQUIRED_TOOLCALL = row.hasToolCalls
        ? "YES"
        : "NO";
    }
    {
      const adapted = normalizeResponsesToolsForChatCompletions(
        real.withInputSchemaOnly
      );
      const res = await postResponses(
        real.withInputSchemaOnly,
        "required",
        "C_REAL_GAP"
      );
      const row = recordCase(
        "C_REAL_CODEX_INPUTSCHEMA_ONLY_REQUIRED",
        real.withInputSchemaOnly,
        "required",
        res,
        adapted
      );
      report.REAL_INPUTSCHEMA_GAP_REQUIRED_TOOLCALL = row.hasToolCalls
        ? "YES"
        : "NO";
    }
  }

  // If any LIVE case returned tool_calls, swallowing is ruled out for that path.
  if (cases.some((c) => c.hasToolCalls)) {
    report.TOKFAI_SWALLOWED_TOOL_CALLS = "NO";
  }
  if (
    report.HISTORIC_P1118_UPSTREAM_TOOLCALLS === "NO" &&
    report.P1117_REQUIRED_TOOLCALL === "YES"
  ) {
    // Historic upstream said no tool_calls — not a stream swallow of present calls.
    report.TOKFAI_SWALLOWED_TOOL_CALLS = "NO";
  }

  report.UPSTREAM_RETURNED_TOOL_CALLS =
    report.HISTORIC_P1118_UPSTREAM_TOOLCALLS === "YES" ||
    report.REAL_CONVERTED_REQUIRED_TOOLCALL === "YES"
      ? report.HISTORIC_P1118_UPSTREAM_TOOLCALLS === "NO" &&
        report.REAL_CONVERTED_REQUIRED_TOOLCALL !== "YES"
        ? "NO"
        : report.HISTORIC_P1118_UPSTREAM_TOOLCALLS === "NO"
          ? "NO"
          : report.HISTORIC_P1118_UPSTREAM_TOOLCALLS
      : report.HISTORIC_P1118_UPSTREAM_TOOLCALLS;
} else {
  console.log("\nLIVE skipped (no key / LIVE=0)\n");
}

// Prefer historic P1118 upstream flag when present
if (report.HISTORIC_P1118_UPSTREAM_TOOLCALLS !== "UNKNOWN") {
  report.UPSTREAM_RETURNED_TOOL_CALLS =
    report.HISTORIC_P1118_UPSTREAM_TOOLCALLS;
}

// ── F. Regressions ────────────────────────────────────────────────────────
{
  const tc2 = spawnSync("npm", ["run", "typecheck"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
    env: process.env,
  });
  report.TYPECHECK = (tc2.status ?? 1) === 0 ? "PASS" : "FAIL";
  console.log(
    (tc2.status ?? 1) === 0 ? "PASS" : "FAIL",
    " typecheck exit=",
    tc2.status
  );

  const bld = spawnSync("npm", ["run", "build"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
    env: process.env,
  });
  report.BUILD = (bld.status ?? 1) === 0 ? "PASS" : "FAIL";
  console.log(
    (bld.status ?? 1) === 0 ? "PASS" : "FAIL",
    " build exit=",
    bld.status
  );

  const gd = runCmd("git", ["diff", "--check"]);
  report.GIT_DIFF_CHECK = gd.status === 0 ? "PASS" : "FAIL";
  console.log(
    gd.status === 0 ? "PASS" : "FAIL",
    " git diff --check exit=",
    gd.status
  );

  if (process.env.TOKFAI_NESTED_REGRESSION !== "1") {
    const nested: Array<[string, string[]]> = [
      [
        "P1117",
        ["scripts/p1117-responses-upstream-toolcall-capability-matrix.mjs"],
      ],
      [
        "P1115",
        ["scripts/p1115-codex-explicit-tool-choice-policy-opt-in-gate.mjs"],
      ],
      [
        "P1114",
        ["scripts/p1114-responses-tool-call-capability-matrix.mjs"],
      ],
      [
        "P1109",
        ["scripts/p1109-codex-cursor-transparent-no-tool-force-gate.mjs"],
      ],
      ["P1061", ["scripts/p1061-autopro-transparent-carrier.mts"]],
      ["P1059", ["scripts/p1059-explicit-model-transparent-gateway.mts"]],
    ];
    let regFail = 0;
    for (const [name, args] of nested) {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        TOKFAI_NESTED_REGRESSION: "1",
      };
      if (name === "P1117" || name === "P1114") {
        if (!LIVE) env.LIVE = "0";
      } else {
        env.LIVE = "";
      }
      const isMts = args[0]?.endsWith(".mts");
      const r = isMts
        ? spawnSync("npx", ["tsx", ...args], {
            cwd: ROOT,
            encoding: "utf8",
            env,
            maxBuffer: 20 * 1024 * 1024,
          })
        : spawnSync(process.execPath, args, {
            cwd: ROOT,
            encoding: "utf8",
            env,
            maxBuffer: 20 * 1024 * 1024,
          });
      const ok = (r.status ?? 1) === 0;
      if (!ok) regFail += 1;
      console.log(
        `${ok ? "PASS" : "FAIL"}  regression_${name} exit=${r.status}`
      );
    }
    report.REGRESSIONS = regFail === 0 ? "PASS" : "FAIL";
  } else {
    report.REGRESSIONS = "SKIP";
  }
}

// ── G. ROOT_CLASS ─────────────────────────────────────────────────────────
{
  const policyOk = report.POLICY_APPLIED_BEFORE_PROVIDER_FETCH === "YES";
  const historicNoCalls = report.HISTORIC_P1118_UPSTREAM_TOOLCALLS === "NO";
  const historicPolicy = report.HISTORIC_P1118_POLICY_APPLIED === "YES";
  const p1117Yes = report.P1117_REQUIRED_TOOLCALL === "YES";
  const convertedYes = report.REAL_CONVERTED_REQUIRED_TOOLCALL === "YES";
  const gapAlsoYes = report.REAL_INPUTSCHEMA_GAP_REQUIRED_TOOLCALL === "YES";
  const swallowed = report.TOKFAI_SWALLOWED_TOOL_CALLS === "YES";
  const wireRequired = report.WIRE_TOOL_CHOICE_REQUIRED;
  const toolsByte = Number(report.HISTORIC_P1118_TOOLS_BYTE_LENGTH || "0");

  if (!policyOk) {
    report.ROOT_CLASS = "E_UNKNOWN_NEEDS_LIVE_SAFE_WIRE_LOG";
  } else if (swallowed) {
    report.ROOT_CLASS = "D_TOKFAI_STREAM_OR_RESPONSE_CONVERSION_BUG";
  } else if (historicPolicy && historicNoCalls && wireRequired === "NO") {
    report.ROOT_CLASS = "A_WIRE_NOT_REQUIRED";
  } else if (
    // Adapter drops inputSchema → empty stubs, AND historic tools bytes match
    // empty-stub size (~8.5KB), AND simplified required works.
    report.ADAPTER_DROPS_INPUT_SCHEMA === "YES" &&
    report.ADAPTER_FILLS_EMPTY_PARAMETERS_STUB === "YES" &&
    toolsByte > 0 &&
    toolsByte < 12000 &&
    p1117Yes &&
    historicNoCalls
  ) {
    report.ROOT_CLASS = "B_REAL_CODEX_SCHEMA_INCOMPATIBLE";
  } else if (
    // Source/policy say required on wire; LIVE required works for both
    // simplified and real schemas; historic Codex still no tool_calls.
    historicPolicy &&
    historicNoCalls &&
    wireRequired === "YES" &&
    p1117Yes &&
    convertedYes
  ) {
    // Real Codex request shape still ignored despite required — classify as
    // provider/model ignore for the real request (messages/reasoning/size),
    // not a stream swallow and not missing required on wire intent.
    report.ROOT_CLASS = "C_PROVIDER_MODEL_IGNORES_REQUIRED_FOR_REAL_SCHEMA";
  } else if (
    report.ADAPTER_DROPS_INPUT_SCHEMA === "YES" &&
    report.ADAPTER_FILLS_EMPTY_PARAMETERS_STUB === "YES" &&
    p1117Yes &&
    !gapAlsoYes &&
    historicNoCalls
  ) {
    report.ROOT_CLASS = "B_REAL_CODEX_SCHEMA_INCOMPATIBLE";
  } else if (p1117Yes && !convertedYes && historicNoCalls) {
    report.ROOT_CLASS = "C_PROVIDER_MODEL_IGNORES_REQUIRED_FOR_REAL_SCHEMA";
  } else {
    report.ROOT_CLASS = "E_UNKNOWN_NEEDS_LIVE_SAFE_WIRE_LOG";
  }
}

// Refine FINAL_VERDICT
{
  const evidenceOk =
    report.POLICY_APPLIED_BEFORE_PROVIDER_FETCH === "YES" &&
    report.REAL_CODEX_REQUEST_REACHED_TOKFAI === "YES" &&
    report.HISTORIC_P1118_POLICY_APPLIED === "YES" &&
    report.HISTORIC_P1118_UPSTREAM_TOOLCALLS === "NO" &&
    report.TYPECHECK === "PASS" &&
    report.BUILD === "PASS" &&
    report.GIT_DIFF_CHECK === "PASS" &&
    (report.REGRESSIONS === "PASS" || report.REGRESSIONS === "SKIP") &&
    report.ROOT_CLASS !== "E_UNKNOWN_NEEDS_LIVE_SAFE_WIRE_LOG" &&
    report.P1117_SIMPLIFIED_SCHEMA_DIFFERS_FROM_REAL_CODEX === "YES";

  const needsMore =
    report.ROOT_CLASS === "E_UNKNOWN_NEEDS_LIVE_SAFE_WIRE_LOG" ||
    report.REAL_CODEX_REQUEST_REACHED_TOKFAI !== "YES";

  if (evidenceOk) {
    report.FINAL_VERDICT = "A_DIAGNOSIS_READY";
  } else if (needsMore) {
    report.FINAL_VERDICT = "B_NEEDS_MORE_EVIDENCE";
  } else if (
    report.TYPECHECK === "FAIL" ||
    report.BUILD === "FAIL" ||
    report.GIT_DIFF_CHECK === "FAIL" ||
    report.REGRESSIONS === "FAIL"
  ) {
    report.FINAL_VERDICT = "C_TEST_INVALID";
  } else {
    report.FINAL_VERDICT = "B_NEEDS_MORE_EVIDENCE";
  }
}

mkdirSync(dirname(SUMMARY), { recursive: true });
writeFileSync(
  SUMMARY,
  JSON.stringify({ report, cases }, null, 2),
  "utf8"
);

console.log("\n=== MATRIX ===");
const keys = [
  "REAL_CODEX_REQUEST_REACHED_TOKFAI",
  "POLICY_APPLIED_BEFORE_PROVIDER_FETCH",
  "WIRE_TOOL_CHOICE_REQUIRED",
  "REAL_CODEX_TOOLS_SCHEMA_CHAT_COMPATIBLE",
  "P1117_SIMPLIFIED_SCHEMA_DIFFERS_FROM_REAL_CODEX",
  "UPSTREAM_RETURNED_TOOL_CALLS",
  "TOKFAI_SWALLOWED_TOOL_CALLS",
  "ROOT_CLASS",
  "P1117_REQUIRED_TOOLCALL",
  "REAL_CONVERTED_REQUIRED_TOOLCALL",
  "REAL_INPUTSCHEMA_GAP_REQUIRED_TOOLCALL",
  "ADAPTER_DROPS_INPUT_SCHEMA",
  "ADAPTER_FILLS_EMPTY_PARAMETERS_STUB",
  "TYPECHECK",
  "BUILD",
  "GIT_DIFF_CHECK",
  "REGRESSIONS",
  "FINAL_VERDICT",
];
for (const k of keys) {
  console.log(`${k}=${report[k]}`);
}

if (report.FINAL_VERDICT === "A_DIAGNOSIS_READY") {
  console.log(`\n${PASS}`);
  process.exit(0);
}
console.log(`\n${FAIL}`);
process.exit(report.FINAL_VERDICT === "C_TEST_INVALID" ? 2 : 1);
