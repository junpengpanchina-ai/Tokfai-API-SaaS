/**
 * P1114 — /v1/responses vs /v1/chat/completions tool_call capability matrix.
 *
 * LIVE synthetic client against Tokfai (default https://api.tokfai.com).
 * Does NOT modify production code. Does NOT force tools (P1109 transparent).
 * Does NOT execute tools server-side.
 *
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p1114-responses-tool-call-capability-matrix.mjs
 *
 * Safety: never prints Authorization, API key, full prompt, tool schema, or
 * tool argument bodies — only status / requestId / model / route / toolChoice /
 * toolsCount / toolCallCount / finishReason / hasToolCalls / latencyMs /
 * errorClass / safe message.
 *
 * Marker:
 *   TOKFAI_P1114_RESPONSES_TOOL_CALL_CAPABILITY_MATRIX_PASS
 */

import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS =
  "TOKFAI_P1114_RESPONSES_TOOL_CALL_CAPABILITY_MATRIX_PASS";
const FAIL =
  "TOKFAI_P1114_RESPONSES_TOOL_CALL_CAPABILITY_MATRIX_FAIL";
const SUMMARY = join(
  ROOT,
  "tmp/p1114-responses-tool-call-capability-matrix-summary.json"
);

const TOOL_NAME = "read_project_file";
const CANARY_REL = ".tokfai-canary/p1113/codex-read-target.txt";
const MODEL =
  process.env.P1114_MODEL || process.env.TOKFAI_TEST_MODEL || "gpt-5.5";
const TIMEOUT_MS = Math.max(
  30_000,
  Number(process.env.TIMEOUT_MS || 120_000) || 120_000
);
const LOOKBACK = Math.max(
  1000,
  Number(process.env.P1114_LOOKBACK_LINES || 6000) || 6000
);
const SSH_TARGET = (
  process.env.P1114_SSH ||
  process.env.P1101_SSH ||
  "deploy@api.tokfai.com"
).trim();
const SSH_KEY = (
  process.env.P1114_SSH_KEY ||
  process.env.P1101_SSH_KEY ||
  join(homedir(), ".ssh/tokfai_hgk_ed25519")
).trim();

const RUN_ID = randomBytes(3).toString("hex");
const RUN_TOKEN = `p1114-${Date.now().toString(36)}-${RUN_ID}`;

function loadApiKey(): string {
  const fromEnv = (process.env.TOKFAI_API_KEY || "").trim();
  if (fromEnv.startsWith("sk-tokfai_")) return fromEnv;

  const candidates = [
    join(homedir(), ".tokfai/p1111a_env.sh"),
    join(homedir(), ".tokfai/p1102_consumer_key"),
    "/tmp/tokfai_gate_key.txt",
  ];
  for (const path of candidates) {
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

const report: Record<string, string> = {
  CASE_A_RESPONSES_AUTO_TOOLCALL: "UNKNOWN",
  CASE_B_RESPONSES_REQUIRED_TOOLCALL: "UNKNOWN",
  CASE_C_RESPONSES_NAMED_TOOLCALL: "UNKNOWN",
  CASE_D_CHAT_AUTO_TOOLCALL: "UNKNOWN",
  CASE_E_CHAT_REQUIRED_TOOLCALL: "UNKNOWN",
  REAL_CODEX_TOOLS_EXPOSED: "UNKNOWN",
  REAL_CODEX_UPSTREAM_TOOLCALLS: "UNKNOWN",
  TOKFAI_FORCED_TOOLCALL: "NO",
  TOKFAI_AGENT_ORCHESTRATION_REINTRODUCED: "NO",
  FINAL_VERDICT: "D_INCONCLUSIVE",
  TYPECHECK: "SKIP",
  BUILD: "SKIP",
  GIT_DIFF_CHECK: "SKIP",
  API_KEY_PRESENT: API_KEY.startsWith("sk-tokfai_") ? "YES" : "NO",
  LIVE: LIVE ? "YES" : "NO",
  MODEL,
  BASE,
  RUN_TOKEN,
};

type CaseSafe = {
  caseId: string;
  status: number;
  requestId: string;
  model: string;
  route: string;
  toolChoice: string;
  toolsCount: number;
  toolCallCount: number;
  finishReason: string | null;
  hasToolCalls: boolean;
  latencyMs: number;
  errorClass: string | null;
  message: string;
};

const cases: CaseSafe[] = [];
const ourRequestIds = new Set<string>();

function yn(v: boolean): "YES" | "NO" {
  return v ? "YES" : "NO";
}

function shortHash(s: string): string {
  return createHash("sha256").update(s).digest("hex").slice(0, 12);
}

function safeChoiceLabel(tc: unknown): string {
  if (tc == null) return "missing";
  if (typeof tc === "string") return tc;
  if (typeof tc === "object" && !Array.isArray(tc)) {
    const o = tc as Record<string, unknown>;
    const nested =
      o.function && typeof o.function === "object"
        ? (o.function as Record<string, unknown>)
        : null;
    const name =
      (typeof o.name === "string" && o.name) ||
      (nested && typeof nested.name === "string" && nested.name) ||
      "";
    return name ? `named:${name}` : "named:object";
  }
  return "unknown";
}

function printSafe(row: CaseSafe) {
  console.log(
    JSON.stringify({
      caseId: row.caseId,
      status: row.status,
      requestId: row.requestId ? shortHash(row.requestId) : "",
      model: row.model,
      route: row.route,
      toolChoice: row.toolChoice,
      toolsCount: row.toolsCount,
      toolCallCount: row.toolCallCount,
      finishReason: row.finishReason,
      hasToolCalls: row.hasToolCalls,
      latencyMs: row.latencyMs,
      errorClass: row.errorClass,
      message: row.message,
    })
  );
}

/** Minimal Responses flat tool — schema not printed at runtime. */
const RESPONSES_TOOLS = [
  {
    type: "function",
    name: TOOL_NAME,
    description:
      "Read a project file by relative path and return its text.",
    parameters: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
      additionalProperties: false,
    },
  },
];

const CHAT_TOOLS = [
  {
    type: "function",
    function: {
      name: TOOL_NAME,
      description:
        "Read a project file by relative path and return its text.",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
        additionalProperties: false,
      },
    },
  },
];

const PROMPT = `Call ${TOOL_NAME} to read ${CANARY_REL}, then reply with only the file token. Do not invent content.`;

function classifyHttpError(status: number, raw: string): string | null {
  if (status === 0) return "network_or_timeout";
  if (status >= 200 && status < 300) return null;
  try {
    const j = JSON.parse(raw);
    const code =
      j?.error?.code || j?.code || j?.error?.type || j?.type || null;
    if (typeof code === "string" && code) return code.slice(0, 64);
  } catch {
    /* ignore */
  }
  if (status === 400) return "http_400";
  if (status === 401) return "http_401";
  if (status === 402) return "http_402";
  if (status === 429) return "http_429";
  if (status >= 500) return `http_${status}`;
  return `http_${status}`;
}

function isNamedToolChoiceUnsupported(status: number, raw: string): boolean {
  const text = raw.slice(0, 4000);
  const schemaish =
    /tool_choice/i.test(text) &&
    (/function\.name|malformed|must be|invalid|unsupported|not supported|schema/i.test(
      text
    ) ||
      /invalid_request_error/i.test(text));
  if (status === 400 && schemaish) return true;
  // Production may return 200 SSE/JSON error envelope for bad tool_choice.
  if (
    status === 200 &&
    schemaish &&
    !/"type"\s*:\s*"function_call"/.test(raw) &&
    !/"tool_calls"\s*:/.test(raw)
  ) {
    return true;
  }
  return false;
}

function countResponsesToolCalls(raw: string): number {
  const names: string[] = [];
  const re =
    /"type"\s*:\s*"function_call"[\s\S]{0,400}?"name"\s*:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    if (m[1]) names.push(m[1]);
  }
  // Also count chat-shaped tool_calls inside responses bridge payloads.
  const chatRe =
    /"tool_calls"\s*:\s*\[/g;
  if (chatRe.test(raw)) {
    const nameRe = /"function"\s*:\s*\{[^{}]{0,200}?"name"\s*:\s*"([^"]+)"/g;
    let n: RegExpExecArray | null;
    while ((n = nameRe.exec(raw))) {
      if (n[1] && !names.includes(n[1])) names.push(n[1]);
    }
  }
  return names.length;
}

function extractChatToolCalls(body: unknown): {
  count: number;
  finishReason: string | null;
} {
  const b = body as Record<string, unknown> | null;
  const choices = Array.isArray(b?.choices) ? (b!.choices as any[]) : [];
  const c0 = choices[0] || null;
  const finishReason =
    typeof c0?.finish_reason === "string" ? c0.finish_reason : null;
  const tcs = c0?.message?.tool_calls;
  const count = Array.isArray(tcs) ? tcs.length : 0;
  return { count, finishReason };
}

function extractResponsesFinish(raw: string): string | null {
  const m =
    raw.match(/"status"\s*:\s*"(completed|failed|incomplete|cancelled)"/) ||
    raw.match(/"finish_reason"\s*:\s*"([^"]+)"/);
  return m?.[1] ?? null;
}

async function postJson(
  route: "/v1/responses" | "/v1/chat/completions",
  body: Record<string, unknown>,
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
  try {
    const accept =
      route === "/v1/responses" && body.stream === true
        ? "text/event-stream"
        : "application/json";
    const res = await fetch(`${BASE}${route}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
        Accept: accept,
        "X-Tokfai-Smoke": `${RUN_TOKEN}-${label}`,
      },
      body: JSON.stringify(body),
      signal: ac.signal,
    });
    const raw = await res.text();
    const requestId =
      res.headers.get("x-request-id") ||
      res.headers.get("x-tokfai-request-id") ||
      "";
    if (requestId) ourRequestIds.add(requestId);
    let json: unknown | null = null;
    if (
      res.headers.get("content-type")?.includes("application/json") ||
      (raw.trim().startsWith("{") && body.stream !== true)
    ) {
      try {
        json = JSON.parse(raw);
      } catch {
        json = null;
      }
    }
    return {
      status: res.status,
      requestId,
      raw,
      json,
      latencyMs: Date.now() - started,
    };
  } catch {
    return {
      status: 0,
      requestId: "",
      raw: "",
      json: null,
      latencyMs: Date.now() - started,
    };
  } finally {
    clearTimeout(t);
  }
}

async function runResponsesCase(
  caseId: string,
  toolChoice: unknown,
  stream = true
): Promise<CaseSafe> {
  const res = await postJson(
    "/v1/responses",
    {
      model: MODEL,
      stream,
      store: false,
      input: PROMPT,
      tools: RESPONSES_TOOLS,
      tool_choice: toolChoice,
      parallel_tool_calls: false,
    },
    caseId
  );

  const unsupported = isNamedToolChoiceUnsupported(res.status, res.raw);
  const toolCallCount = countResponsesToolCalls(res.raw);
  const hasToolCalls = toolCallCount > 0;
  const errorClass = classifyHttpError(res.status, res.raw);
  const row: CaseSafe = {
    caseId,
    status: res.status,
    requestId: res.requestId,
    model: MODEL,
    route: "/v1/responses",
    toolChoice: safeChoiceLabel(toolChoice),
    toolsCount: RESPONSES_TOOLS.length,
    toolCallCount,
    finishReason: extractResponsesFinish(res.raw),
    hasToolCalls,
    latencyMs: res.latencyMs,
    errorClass: unsupported ? "NOT_SUPPORTED_BY_TOKFAI_SCHEMA" : errorClass,
    message: unsupported
      ? "NOT_SUPPORTED_BY_TOKFAI_SCHEMA"
      : hasToolCalls
        ? "function_call_observed"
        : errorClass
          ? "error_response"
          : "no_tool_call",
  };
  cases.push(row);
  printSafe(row);
  return row;
}

async function runChatCase(
  caseId: string,
  toolChoice: unknown
): Promise<CaseSafe> {
  const res = await postJson(
    "/v1/chat/completions",
    {
      model: MODEL,
      stream: false,
      messages: [{ role: "user", content: PROMPT }],
      tools: CHAT_TOOLS,
      tool_choice: toolChoice,
    },
    caseId
  );

  const unsupported = isNamedToolChoiceUnsupported(res.status, res.raw);
  let toolCallCount = 0;
  let finishReason: string | null = null;
  if (res.json) {
    const ex = extractChatToolCalls(res.json);
    toolCallCount = ex.count;
    finishReason = ex.finishReason;
  } else {
    toolCallCount = countResponsesToolCalls(res.raw);
    finishReason = extractResponsesFinish(res.raw);
  }
  const hasToolCalls = toolCallCount > 0;
  const errorClass = classifyHttpError(res.status, res.raw);
  const row: CaseSafe = {
    caseId,
    status: res.status,
    requestId: res.requestId,
    model: MODEL,
    route: "/v1/chat/completions",
    toolChoice: safeChoiceLabel(toolChoice),
    toolsCount: CHAT_TOOLS.length,
    toolCallCount,
    finishReason,
    hasToolCalls,
    latencyMs: res.latencyMs,
    errorClass: unsupported ? "NOT_SUPPORTED_BY_TOKFAI_SCHEMA" : errorClass,
    message: unsupported
      ? "NOT_SUPPORTED_BY_TOKFAI_SCHEMA"
      : hasToolCalls
        ? "tool_calls_observed"
        : errorClass
          ? "error_response"
          : "no_tool_call",
  };
  cases.push(row);
  printSafe(row);
  return row;
}

function collectPm2LogText(): string {
  const chunks: string[] = [];
  const envPath = (process.env.TOKFAI_PM2_LOG || "").trim();
  if (envPath && existsSync(envPath)) {
    try {
      const lines = readFileSync(envPath, "utf8").split("\n");
      chunks.push(lines.slice(-LOOKBACK).join("\n"));
    } catch {
      /* ignore */
    }
  }

  if (SSH_TARGET) {
    const keyArgs = existsSync(SSH_KEY)
      ? [
          "-i",
          SSH_KEY,
          "-o",
          "IdentitiesOnly=yes",
          "-o",
          "BatchMode=yes",
          "-o",
          "ConnectTimeout=12",
        ]
      : ["-o", "BatchMode=yes", "-o", "ConnectTimeout=12"];
    const remote = [
      `sudo -u deploy -H env PM2_HOME=/home/deploy/.pm2 pm2 logs tokfai-api --lines ${LOOKBACK} --nostream 2>/dev/null`,
      `|| sudo -u deploy -H env PM2_HOME=/home/deploy/.pm2 pm2 logs dmit-api --lines ${LOOKBACK} --nostream 2>/dev/null`,
      `|| tail -n ${LOOKBACK} /home/deploy/.pm2/logs/tokfai-api-out.log /home/deploy/.pm2/logs/tokfai-api-error.log 2>/dev/null`,
      `|| tail -n ${LOOKBACK} ~/.pm2/logs/tokfai-api-out.log ~/.pm2/logs/tokfai-api-error.log 2>/dev/null`,
    ].join(" ");
    const r = spawnSync("ssh", [...keyArgs, SSH_TARGET, remote], {
      encoding: "utf8",
      timeout: 90_000,
      maxBuffer: 25 * 1024 * 1024,
    });
    if ((r.stdout || "").trim()) chunks.push(r.stdout || "");
  }

  return chunks.join("\n");
}

type CodexObs = {
  toolsExposed: boolean;
  upstreamToolCalls: boolean;
  transparentBypass: boolean;
  forcedRetry: boolean;
  compatFallback: boolean;
  cursorRound2: boolean;
  sample: Record<string, unknown> | null;
};

function observeCodexDesktop(logText: string): CodexObs {
  const obs: CodexObs = {
    toolsExposed: false,
    upstreamToolCalls: false,
    transparentBypass: false,
    forcedRetry: false,
    compatFallback: false,
    cursorRound2: false,
    sample: null,
  };

  const lines = logText.split("\n");
  type Agg = {
    route: string | null;
    toolsCount: number | null;
    toolChoice: string | null;
    upstreamReturnedToolCalls: boolean | null;
    toolCallCount: number | null;
    msgs: Set<string>;
  };
  const byRid = new Map<string, Agg>();

  for (const line of lines) {
    const m = line.match(/\{.*\}/);
    if (!m) continue;
    let o: Record<string, unknown>;
    try {
      o = JSON.parse(m[0]!) as Record<string, unknown>;
    } catch {
      continue;
    }
    const rid = typeof o.requestId === "string" ? o.requestId : "";
    if (!rid) continue;
    const a = byRid.get(rid) || {
      route: null,
      toolsCount: null,
      toolChoice: null,
      upstreamReturnedToolCalls: null,
      toolCallCount: null,
      msgs: new Set<string>(),
    };
    const msg = typeof o.msg === "string" ? o.msg : "";
    if (msg) a.msgs.add(msg);
    if (typeof o.route === "string") a.route = o.route;
    if (typeof o.toolsCount === "number") a.toolsCount = o.toolsCount;
    if (typeof o.toolChoice === "string") a.toolChoice = o.toolChoice;
    if (typeof o.upstreamReturnedToolCalls === "boolean") {
      a.upstreamReturnedToolCalls = o.upstreamReturnedToolCalls;
    }
    if (typeof o.toolCallCount === "number") a.toolCallCount = o.toolCallCount;
    byRid.set(rid, a);

    if (msg === "transparent_tool_force_bypassed") obs.transparentBypass = true;
    if (msg === "codex_auto_tool_retry" || /codex_auto_tool_retry/.test(msg)) {
      obs.forcedRetry = true;
    }
    if (
      msg === "grsai_tool_compat_fallback" ||
      /grsai_tool_compat_fallback/.test(msg)
    ) {
      obs.compatFallback = true;
    }
    if (msg === "cursor_tool_round2_received") obs.cursorRound2 = true;
  }

  // Prefer Codex-like: /v1/responses + toolsCount≈15 + toolChoice=auto
  let best: Agg | null = null;
  for (const a of byRid.values()) {
    if (a.route !== "/v1/responses") continue;
    if (!(typeof a.toolsCount === "number" && a.toolsCount >= 10)) continue;
    if (a.toolChoice && a.toolChoice !== "auto") continue;
    best = a;
    break;
  }
  if (!best) {
    for (const a of byRid.values()) {
      if (a.route === "/v1/responses" && (a.toolsCount || 0) > 0) {
        best = a;
        break;
      }
    }
  }

  if (best) {
    obs.toolsExposed = (best.toolsCount || 0) > 0;
    obs.upstreamToolCalls =
      best.upstreamReturnedToolCalls === true ||
      (typeof best.toolCallCount === "number" && best.toolCallCount > 0);
    obs.sample = {
      route: best.route,
      toolsCount: best.toolsCount,
      toolChoice: best.toolChoice,
      upstreamReturnedToolCalls: best.upstreamReturnedToolCalls,
      toolCallCount: best.toolCallCount,
      transparent_tool_force_bypassed: best.msgs.has(
        "transparent_tool_force_bypassed"
      ),
      codex_auto_tool_retry: [...best.msgs].some((x) =>
        /codex_auto_tool_retry/.test(x)
      ),
      grsai_tool_compat_fallback: [...best.msgs].some((x) =>
        /grsai_tool_compat_fallback/.test(x)
      ),
      cursor_tool_round2_received: best.msgs.has(
        "cursor_tool_round2_received"
      ),
    };
  }

  // Also scan raw for our smoke token correlation (forced path on our cases)
  for (const line of lines) {
    if (!line.includes(RUN_TOKEN)) continue;
    if (/codex_auto_tool_retry/.test(line)) obs.forcedRetry = true;
    if (/grsai_tool_compat_fallback/.test(line)) obs.compatFallback = true;
  }

  return obs;
}

function decideVerdict(): string {
  if (
    report.TOKFAI_FORCED_TOOLCALL === "YES" ||
    report.TOKFAI_AGENT_ORCHESTRATION_REINTRODUCED === "YES"
  ) {
    return "C_REJECT_AGENT_REINTRODUCED";
  }

  const a = report.CASE_A_RESPONSES_AUTO_TOOLCALL;
  const b = report.CASE_B_RESPONSES_REQUIRED_TOOLCALL;
  const c = report.CASE_C_RESPONSES_NAMED_TOOLCALL;
  const d = report.CASE_D_CHAT_AUTO_TOOLCALL;
  const e = report.CASE_E_CHAT_REQUIRED_TOOLCALL;

  const responsesForcedHas =
    b === "YES" || c === "YES";
  const responsesForcedNone =
    (b === "NO" || b === "UNSUPPORTED") &&
    (c === "NO" || c === "UNSUPPORTED") &&
    b !== "UNKNOWN" &&
    c !== "UNKNOWN";
  const chatHas = d === "YES" || e === "YES";
  const chatNone =
    (d === "NO" || d === "UNSUPPORTED") &&
    (e === "NO" || e === "UNSUPPORTED") &&
    d !== "UNKNOWN" &&
    e !== "UNKNOWN";

  if (a === "YES") return "A_PROVIDER_TOOLCALL_CAPABLE";
  if (responsesForcedNone && chatHas) return "B_RESPONSES_TOOL_COMPAT_GAP";
  if (responsesForcedHas && a === "NO") return "B_MODEL_AUTO_TOOL_DECISION";
  if (
    (a === "NO" || a === "UNSUPPORTED") &&
    responsesForcedNone &&
    chatNone
  ) {
    return "B_PROVIDER_TOOLCALL_UNSUPPORTED_OR_MODEL_DISABLED";
  }
  return "D_INCONCLUSIVE";
}

console.log("P1114 RESPONSES TOOL CALL CAPABILITY MATRIX\n");
console.log(
  JSON.stringify({
    LIVE: report.LIVE,
    API_KEY_PRESENT: report.API_KEY_PRESENT,
    BASE: report.BASE,
    MODEL: report.MODEL,
    RUN_TOKEN: report.RUN_TOKEN,
    SSH_TARGET: SSH_TARGET || "(none)",
  })
);

// Static: named tool_choice supported by Tokfai adapter (no prod edit).
{
  const adapter = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/responsesToolAdapter.ts"),
    "utf8"
  );
  const namedSupportedInCode =
    /normalizeResponsesToolChoiceForChatCompletions/.test(adapter) &&
    /type:\s*"function"/.test(adapter);
  console.log(
    JSON.stringify({
      caseId: "STATIC_NAMED_SCHEMA",
      message: namedSupportedInCode
        ? "TOKFAI_SCHEMA_SUPPORTS_NAMED_TOOL_CHOICE"
        : "NOT_SUPPORTED_BY_TOKFAI_SCHEMA",
    })
  );
}

if (!LIVE || !API_KEY.startsWith("sk-tokfai_")) {
  console.log(
    JSON.stringify({
      message: "SKIP_LIVE",
      detail: "set LIVE=1 and TOKFAI_API_KEY=sk-tokfai_... (key not printed)",
    })
  );
  report.CASE_A_RESPONSES_AUTO_TOOLCALL = "SKIP";
  report.CASE_B_RESPONSES_REQUIRED_TOOLCALL = "SKIP";
  report.CASE_C_RESPONSES_NAMED_TOOLCALL = "SKIP";
  report.CASE_D_CHAT_AUTO_TOOLCALL = "SKIP";
  report.CASE_E_CHAT_REQUIRED_TOOLCALL = "SKIP";
  report.FINAL_VERDICT = "D_INCONCLUSIVE";
} else {
  console.log("\n--- LIVE cases A–E (safe fields only) ---\n");

  // A. responses + auto
  {
    const row = await runResponsesCase("A_RESPONSES_AUTO", "auto");
    report.CASE_A_RESPONSES_AUTO_TOOLCALL = yn(row.hasToolCalls);
  }

  // B. responses + required
  {
    const row = await runResponsesCase("B_RESPONSES_REQUIRED", "required");
    if (row.errorClass === "NOT_SUPPORTED_BY_TOKFAI_SCHEMA") {
      report.CASE_B_RESPONSES_REQUIRED_TOOLCALL = "UNSUPPORTED";
    } else {
      report.CASE_B_RESPONSES_REQUIRED_TOOLCALL = yn(row.hasToolCalls);
    }
  }

  // C. responses + named
  {
    const named = { type: "function", name: TOOL_NAME };
    const row = await runResponsesCase("C_RESPONSES_NAMED", named);
    if (row.errorClass === "NOT_SUPPORTED_BY_TOKFAI_SCHEMA") {
      report.CASE_C_RESPONSES_NAMED_TOOLCALL = "UNSUPPORTED";
      console.log(
        JSON.stringify({
          caseId: "C_RESPONSES_NAMED",
          message: "NOT_SUPPORTED_BY_TOKFAI_SCHEMA",
        })
      );
    } else {
      report.CASE_C_RESPONSES_NAMED_TOOLCALL = yn(row.hasToolCalls);
    }
  }

  // D. chat + auto
  {
    const row = await runChatCase("D_CHAT_AUTO", "auto");
    report.CASE_D_CHAT_AUTO_TOOLCALL = yn(row.hasToolCalls);
  }

  // E. chat + required (fallback named if required unsupported)
  {
    let row = await runChatCase("E_CHAT_REQUIRED", "required");
    if (row.errorClass === "NOT_SUPPORTED_BY_TOKFAI_SCHEMA") {
      row = await runChatCase("E_CHAT_NAMED", {
        type: "function",
        function: { name: TOOL_NAME },
      });
      if (row.errorClass === "NOT_SUPPORTED_BY_TOKFAI_SCHEMA") {
        report.CASE_E_CHAT_REQUIRED_TOOLCALL = "UNSUPPORTED";
      } else {
        report.CASE_E_CHAT_REQUIRED_TOOLCALL = yn(row.hasToolCalls);
      }
    } else {
      report.CASE_E_CHAT_REQUIRED_TOOLCALL = yn(row.hasToolCalls);
    }
  }
}

// F. Codex Desktop log observation
console.log("\n--- F Codex Desktop log observe (safe) ---\n");
const logText = collectPm2LogText();
const obs = observeCodexDesktop(logText);
console.log(
  JSON.stringify({
    caseId: "F_CODEX_LOG",
    logChars: logText.length,
    REAL_CODEX_TOOLS_EXPOSED: yn(obs.toolsExposed),
    REAL_CODEX_UPSTREAM_TOOLCALLS: yn(obs.upstreamToolCalls),
    transparent_tool_force_bypassed: obs.transparentBypass || Boolean(obs.sample?.transparent_tool_force_bypassed),
    codex_auto_tool_retry: obs.forcedRetry,
    grsai_tool_compat_fallback: obs.compatFallback,
    cursor_tool_round2_received: obs.cursorRound2,
    sample: obs.sample,
  })
);

report.REAL_CODEX_TOOLS_EXPOSED = logText.length
  ? yn(obs.toolsExposed)
  : "UNKNOWN";
report.REAL_CODEX_UPSTREAM_TOOLCALLS = logText.length
  ? yn(obs.upstreamToolCalls)
  : "UNKNOWN";

if (obs.forcedRetry || obs.compatFallback) {
  // Only flag reintroduction if correlated to our smoke or clearly present
  // on a transparent auto path in the lookback sample.
  const sampleForced =
    Boolean(obs.sample?.codex_auto_tool_retry) ||
    Boolean(obs.sample?.grsai_tool_compat_fallback);
  if (sampleForced || obs.forcedRetry) {
    // Transparent bypass expected; forced retry on Codex-like auto is reject.
    if (obs.sample?.toolChoice === "auto" && sampleForced) {
      report.TOKFAI_FORCED_TOOLCALL = "YES";
      report.TOKFAI_AGENT_ORCHESTRATION_REINTRODUCED = "YES";
    }
  }
}

// Our LIVE auto cases must not have triggered force (P1109). Check logs for RUN_TOKEN.
if (LIVE && logText.includes(RUN_TOKEN)) {
  const forcedOnUs =
    new RegExp(
      `${RUN_TOKEN}[\\s\\S]{0,400}codex_auto_tool_retry|${RUN_TOKEN}[\\s\\S]{0,400}grsai_tool_compat_fallback`
    ).test(logText) ||
    (/codex_auto_tool_retry/.test(logText) &&
      [...ourRequestIds].some((id) => logText.includes(id) && /codex_auto_tool_retry/.test(
        logText.split("\n").filter((l) => l.includes(id)).join("\n")
      )));
  // Safer per-request check:
  let usForced = false;
  for (const id of ourRequestIds) {
    const related = logText
      .split("\n")
      .filter((l) => l.includes(id))
      .join("\n");
    if (
      /codex_auto_tool_retry/.test(related) ||
      /grsai_tool_compat_fallback/.test(related)
    ) {
      usForced = true;
    }
  }
  void forcedOnUs;
  if (usForced) {
    report.TOKFAI_FORCED_TOOLCALL = "YES";
    report.TOKFAI_AGENT_ORCHESTRATION_REINTRODUCED = "YES";
  }
}

report.FINAL_VERDICT = decideVerdict();

mkdirSync(dirname(SUMMARY), { recursive: true });
writeFileSync(
  SUMMARY,
  JSON.stringify({ report, cases: cases.map((c) => ({
    ...c,
    requestId: c.requestId ? shortHash(c.requestId) : "",
  })) }, null, 2)
);

console.log("\n=== MATRIX ===");
for (const k of [
  "CASE_A_RESPONSES_AUTO_TOOLCALL",
  "CASE_B_RESPONSES_REQUIRED_TOOLCALL",
  "CASE_C_RESPONSES_NAMED_TOOLCALL",
  "CASE_D_CHAT_AUTO_TOOLCALL",
  "CASE_E_CHAT_REQUIRED_TOOLCALL",
  "REAL_CODEX_TOOLS_EXPOSED",
  "REAL_CODEX_UPSTREAM_TOOLCALLS",
  "TOKFAI_FORCED_TOOLCALL",
  "TOKFAI_AGENT_ORCHESTRATION_REINTRODUCED",
  "FINAL_VERDICT",
]) {
  console.log(`${k}=${report[k]}`);
}

const passOk =
  report.FINAL_VERDICT !== "C_REJECT_AGENT_REINTRODUCED" &&
  report.TOKFAI_FORCED_TOOLCALL === "NO" &&
  report.TOKFAI_AGENT_ORCHESTRATION_REINTRODUCED === "NO" &&
  (LIVE
    ? report.CASE_A_RESPONSES_AUTO_TOOLCALL !== "SKIP"
    : true);

console.log("");
console.log(passOk ? PASS : FAIL);
process.exit(passOk ? 0 : 1);
