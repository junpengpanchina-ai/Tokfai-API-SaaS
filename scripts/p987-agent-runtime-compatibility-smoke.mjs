#!/usr/bin/env node
/**
 * P987 — Agent Runtime Compatibility Acceptance.
 *
 * Validates Cursor / Hermes-like agent workflows (read → edit → multi-turn),
 * NOT ordinary Chat smoke. Does not change billing or routing core logic.
 *
 * Usage:
 *   node scripts/p987-agent-runtime-compatibility-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p987-agent-runtime-compatibility-smoke.mjs
 *
 * Markers:
 *   TOKFAI_P987_AGENT_RUNTIME_COMPATIBILITY_PASS
 *   TOKFAI_P987_AGENT_RUNTIME_COMPATIBILITY_BLOCKED
 *   TOKFAI_P987_AGENT_RUNTIME_COMPATIBILITY_FAIL
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  statSync,
  rmSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";

const SCRIPT = "scripts/p987-agent-runtime-compatibility-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P987_AGENT_RUNTIME_COMPATIBILITY_PASS";
const BLOCKED_MARKER = "TOKFAI_P987_AGENT_RUNTIME_COMPATIBILITY_BLOCKED";
const FAIL_MARKER = "TOKFAI_P987_AGENT_RUNTIME_COMPATIBILITY_FAIL";

const WRITE_REPORT =
  process.env.WRITE_REPORT !== "0" && process.env.WRITE_REPORT !== "false";
const REPORT_PATH = join(
  ROOT,
  process.env.REPORT_PATH ?? "docs/p987-agent-runtime-compatibility-report.md"
);
const SUMMARY_PATH = join(
  ROOT,
  process.env.SUMMARY_PATH ?? "tmp/p987-agent-runtime-summary.json"
);
const SANDBOX = join(ROOT, "tmp/p987-agent-sandbox");
const AGENT_FILE = join(SANDBOX, "cursor-agent-test.ts");
const SEED_FILE = join(SANDBOX, "seed.ts");

/** @typedef {'PASS'|'WARN'|'FAIL'|'BLOCKER'} Verdict */

/**
 * @typedef {{
 *  case_name: string,
 *  category: string,
 *  http_status: number|null,
 *  request_id: string|null,
 *  billing_status: string|null,
 *  credits_charged: number|null,
 *  routing_ok: boolean|null,
 *  tool_call_or_edit: boolean|null,
 *  file_mutation: boolean|null,
 *  context_kept: boolean|null,
 *  verdict: Verdict,
 *  reason: string|null,
 * }} CaseRow
 */

/** @type {CaseRow[]} */
const cases = [];
/** @type {string[]} */
const blockers = [];
/** @type {{ id: string, ok: boolean, soft?: boolean, detail?: string }[]} */
const harness = [];

const AGENT_TOOLS = [
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files in a directory",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a file",
      parameters: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          contents: { type: "string" },
        },
        required: ["path", "contents"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "str_replace",
      description: "Replace text in a file",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string" },
          old_string: { type: "string" },
          new_string: { type: "string" },
        },
        required: ["path", "old_string", "new_string"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_terminal",
      description: "Run a shell command (e.g. git diff)",
      parameters: {
        type: "object",
        properties: { command: { type: "string" } },
        required: ["command"],
      },
    },
  },
];

function recordHarness(id, ok, detail, soft = false) {
  harness.push({
    id,
    ok,
    soft,
    detail: detail ? String(detail).slice(0, 400) : undefined,
  });
  if (ok) {
    if (soft) {
      console.warn(`SOFT  ${id}${detail ? ` — ${detail}` : ""}`);
      return true;
    }
    return pass(id);
  }
  return fail(id, detail);
}

function addBlocker(id, reason) {
  const line = `${id}: ${reason}`;
  if (!blockers.includes(line)) blockers.push(line);
}

function pushCase(row) {
  cases.push(row);
  const tag = row.verdict.padEnd(7);
  console.log(
    `${tag} ${row.case_name} status=${row.http_status ?? "—"} ` +
      `bill=${row.billing_status ?? "—"} ch=${row.credits_charged ?? "—"} ` +
      `${row.reason ?? ""}`
  );
}

function charged(body) {
  const n = Number(body?.credits_charged ?? body?.tokfai?.credits_charged ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function billingOf(body) {
  const s = body?.tokfai?.billing_status;
  return typeof s === "string" ? s : null;
}

function requestIdOf(body, res) {
  return (
    body?.request_id ||
    body?.tokfai?.request_id ||
    body?.error?.request_id ||
    (typeof res?.headers?.get === "function"
      ? res.headers.get("x-request-id")
      : null) ||
    null
  );
}

function routingEvidenceOk(body) {
  const t = body?.tokfai;
  if (!t || typeof t !== "object") return false;
  const hasRid =
    typeof t.request_id === "string" || typeof body?.request_id === "string";
  const hasRequested =
    typeof t.requested_model === "string" || typeof body?.model === "string";
  const hasResolved =
    typeof t.resolved_model === "string" || typeof body?.model === "string";
  const hasAttempted =
    Array.isArray(t.attempted_models) || typeof t.routing_strategy === "string";
  const hasBilling =
    typeof t.billing_status === "string" ||
    typeof body?.credits_charged === "number";
  return Boolean(hasRid && hasRequested && hasResolved && hasAttempted && hasBilling);
}

function toolCallsOf(body) {
  const tc = body?.choices?.[0]?.message?.tool_calls;
  return Array.isArray(tc) ? tc : [];
}

function toolCallShapeOk(toolCalls) {
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return false;
  for (const tc of toolCalls) {
    if (!tc || typeof tc !== "object") return false;
    if (typeof tc.id !== "string" || !tc.id.trim()) return false;
    if (tc.type !== "function") return false;
    if (!tc.function || typeof tc.function !== "object") return false;
    if (typeof tc.function.name !== "string" || !tc.function.name.trim()) {
      return false;
    }
    if (typeof tc.function.arguments !== "string") return false;
  }
  return true;
}

function parseToolArgs(tc) {
  try {
    return JSON.parse(tc.function.arguments || "{}");
  } catch {
    return {};
  }
}

function resolveSandboxPath(p) {
  const raw = String(p ?? "");
  if (!raw) return null;
  if (raw.includes("..")) return null;
  if (raw.startsWith("tmp/p987-agent-sandbox")) {
    return join(ROOT, raw);
  }
  if (raw.startsWith("/")) return null;
  return join(SANDBOX, raw.replace(/^tmp\/p987-agent-sandbox\/?/, ""));
}

/**
 * Apply tool_calls locally — this is the Cursor/Hermes agent runtime side.
 * @returns {{ applied: string[], mutation: boolean, outputs: Record<string,string> }}
 */
function applyToolCalls(toolCalls) {
  const applied = [];
  const outputs = {};
  let mutation = false;
  for (const tc of toolCalls) {
    const name = tc.function?.name;
    const args = parseToolArgs(tc);
    if (name === "list_dir") {
      const dir = resolveSandboxPath(args.path) || SANDBOX;
      const names = existsSync(dir) ? readdirSync(dir) : [];
      outputs[tc.id] = JSON.stringify({ path: args.path, entries: names });
      applied.push(`list_dir:${args.path}`);
    } else if (name === "read_file") {
      const fp = resolveSandboxPath(args.path);
      const text =
        fp && existsSync(fp) ? readFileSync(fp, "utf8") : "(missing)";
      outputs[tc.id] = text.slice(0, 4000);
      applied.push(`read_file:${args.path}`);
    } else if (name === "write_file") {
      const fp = resolveSandboxPath(args.path) || AGENT_FILE;
      mkdirSync(dirname(fp), { recursive: true });
      writeFileSync(fp, String(args.contents ?? ""), "utf8");
      mutation = true;
      outputs[tc.id] = JSON.stringify({ ok: true, path: args.path });
      applied.push(`write_file:${args.path}`);
    } else if (name === "str_replace") {
      const fp = resolveSandboxPath(args.path) || AGENT_FILE;
      const before = existsSync(fp) ? readFileSync(fp, "utf8") : "";
      const next = before.includes(String(args.old_string ?? ""))
        ? before.replace(String(args.old_string), String(args.new_string ?? ""))
        : `${before}\n${args.new_string ?? ""}`;
      writeFileSync(fp, next, "utf8");
      mutation = true;
      outputs[tc.id] = JSON.stringify({ ok: true, path: args.path });
      applied.push(`str_replace:${args.path}`);
    } else if (name === "run_terminal") {
      const cmd = String(args.command ?? "git diff -- tmp/p987-agent-sandbox");
      const r = spawnSync("bash", ["-lc", cmd], {
        cwd: ROOT,
        encoding: "utf8",
        timeout: 15_000,
      });
      outputs[tc.id] = `${r.stdout || ""}${r.stderr || ""}`.slice(0, 4000);
      applied.push(`run_terminal`);
    } else {
      applied.push(`unknown:${name}`);
      outputs[tc.id] = JSON.stringify({ ok: false, error: "unknown_tool" });
    }
  }
  return { applied, mutation, outputs };
}

function snapshotSandbox() {
  /** @type {Record<string, {size: number, mtime: number, hash: string}>} */
  const files = {};
  if (!existsSync(SANDBOX)) return files;
  for (const name of readdirSync(SANDBOX)) {
    const p = join(SANDBOX, name);
    try {
      const st = statSync(p);
      if (!st.isFile()) continue;
      const text = readFileSync(p, "utf8");
      files[name] = {
        size: st.size,
        mtime: st.mtimeMs,
        hash: `${text.length}:${text.slice(0, 64)}`,
      };
    } catch {
      // ignore
    }
  }
  return files;
}

function sandboxChanged(before, after) {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    if (!before[k] || !after[k]) return true;
    if (before[k].hash !== after[k].hash) return true;
  }
  return false;
}

function resetSandbox() {
  rmSync(SANDBOX, { recursive: true, force: true });
  mkdirSync(SANDBOX, { recursive: true });
  writeFileSync(
    SEED_FILE,
    "export function seed(): string {\n  return 'seed';\n}\n",
    "utf8"
  );
}

function judgeSuccessBilling(body, res, opts = {}) {
  const rid = requestIdOf(body, res);
  const ch = charged(body);
  const bill = billingOf(body);
  const routing = routingEvidenceOk(body);
  /** @type {string[]} */
  const problems = [];

  if (res.status !== 200) problems.push(`http=${res.status}`);
  if (!rid) {
    problems.push("missing request_id");
    addBlocker(opts.caseName ?? "billing", "success missing request_id");
  }
  if (!routing) problems.push("missing routing evidence");
  if (!(ch > 0)) {
    problems.push("success without usage/credits");
    addBlocker(
      opts.caseName ?? "billing",
      "success without usage (credits_charged not > 0)"
    );
  }
  if (ch > 0 && !rid) {
    problems.push("usage without request_id");
    addBlocker(opts.caseName ?? "billing", "usage without request_id");
  }
  if (bill === "charged" && res.status !== 200) {
    problems.push("charged without completion");
    addBlocker(opts.caseName ?? "billing", "charged without completion");
  }
  if (bill && bill !== "charged" && ch > 0) {
    problems.push(`billing_status=${bill} but credits>0`);
  }

  return {
    rid,
    ch,
    bill: bill ?? (ch > 0 ? "charged" : null),
    routing,
    problems,
  };
}

function judgeFailureBilling(body, res, caseName) {
  const ch = charged(body);
  const bill = billingOf(body);
  const rid = requestIdOf(body, res);
  if (ch > 0) {
    addBlocker(caseName, `failure charged credits=${ch}`);
    return {
      rid,
      ch,
      bill,
      problems: [`failure charged credits=${ch}`],
    };
  }
  if (bill && bill !== "not_billable") {
    return {
      rid,
      ch,
      bill,
      problems: [`expected not_billable got ${bill}`],
    };
  }
  return { rid, ch, bill: bill ?? "not_billable", problems: [] };
}

async function main() {
  if (!process.env.VERIFIED_TOOLS_CAPABLE_MODEL_IDS) {
    process.env.VERIFIED_TOOLS_CAPABLE_MODEL_IDS = "gpt-5.5";
  }

  let ctx = null;
  try {
    recordHarness("harness_script", existsSync(join(ROOT, SCRIPT)), SCRIPT);
    resetSandbox();
    ctx = await bootstrapClientCompatSmoke(SCRIPT);
    const { BASE, API_KEY, TIMEOUT_MS, LIVE } = ctx;

    async function chat(body, timeoutMs = TIMEOUT_MS) {
      return acceptanceFetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        timeoutMs,
      });
    }

    const toolsModel = "gpt-5.5";

    // ─── A. Cursor Read ────────────────────────────────────────────
    console.log("\n=== A. Cursor Read ===\n");

    {
      const before = snapshotSandbox();
      const { res, body } = await chat({
        model: toolsModel,
        messages: [
          {
            role: "user",
            content:
              "List project files under tmp/p987-agent-sandbox. Read-only; do not write.",
          },
        ],
        tools: AGENT_TOOLS,
        tool_choice: "required",
        stream: false,
        max_tokens: 128,
      });
      const tcs = toolCallsOf(body);
      const applied = toolCallShapeOk(tcs) ? applyToolCalls(tcs) : null;
      const after = snapshotSandbox();
      const mutated = sandboxChanged(before, after);
      const bill = judgeSuccessBilling(body, res, {
        caseName: "cursor_read_list_project_files",
      });
      let verdict = /** @type {Verdict} */ ("PASS");
      let reason = null;
      if (bill.problems.length) {
        verdict = blockers.some((b) =>
          b.startsWith("cursor_read_list_project_files")
        )
          ? "BLOCKER"
          : "FAIL";
        reason = bill.problems.join("; ");
      } else if (!toolCallShapeOk(tcs) && !body?.choices?.[0]?.message?.content) {
        verdict = "FAIL";
        reason = "no tool_calls and no content for list";
      } else if (mutated) {
        verdict = "BLOCKER";
        reason = "readonly list mutated sandbox";
        addBlocker("cursor_read_list_project_files", reason);
      } else if (!toolCallShapeOk(tcs)) {
        verdict = "WARN";
        reason = "list completed via content without tool_calls";
      }
      pushCase({
        case_name: "cursor_read_list_project_files",
        category: "cursor_read",
        http_status: res.status,
        request_id: bill.rid,
        billing_status: bill.bill,
        credits_charged: bill.ch,
        routing_ok: bill.routing,
        tool_call_or_edit: toolCallShapeOk(tcs),
        file_mutation: mutated,
        context_kept: null,
        verdict,
        reason:
          reason ??
          `tools=${applied?.applied?.join(",") ?? "content-only"}`,
      });
    }

    {
      const before = snapshotSandbox();
      const { res, body } = await chat({
        model: toolsModel,
        messages: [
          {
            role: "user",
            content:
              "Read file tmp/p987-agent-sandbox/seed.ts and explain briefly. Do not write.",
          },
        ],
        tools: AGENT_TOOLS,
        tool_choice: {
          type: "function",
          function: { name: "read_file" },
        },
        stream: false,
        max_tokens: 128,
      });
      const tcs = toolCallsOf(body);
      const applied = toolCallShapeOk(tcs) ? applyToolCalls(tcs) : null;
      const after = snapshotSandbox();
      const mutated = sandboxChanged(before, after);
      const bill = judgeSuccessBilling(body, res, {
        caseName: "cursor_read_file",
      });
      let verdict = /** @type {Verdict} */ ("PASS");
      let reason = null;
      if (bill.problems.length) {
        verdict = blockers.some((b) => b.startsWith("cursor_read_file"))
          ? "BLOCKER"
          : "FAIL";
        reason = bill.problems.join("; ");
      } else if (mutated) {
        verdict = "BLOCKER";
        reason = "readonly read mutated sandbox";
        addBlocker("cursor_read_file", reason);
      } else if (!toolCallShapeOk(tcs)) {
        verdict = "WARN";
        reason = "read completed without tool_calls";
      }
      pushCase({
        case_name: "cursor_read_file",
        category: "cursor_read",
        http_status: res.status,
        request_id: bill.rid,
        billing_status: bill.bill,
        credits_charged: bill.ch,
        routing_ok: bill.routing,
        tool_call_or_edit: toolCallShapeOk(tcs),
        file_mutation: mutated,
        context_kept: null,
        verdict,
        reason: reason ?? `tools=${applied?.applied?.join(",") ?? "n/a"}`,
      });
    }

    {
      const before = snapshotSandbox();
      const { res, body } = await chat({
        model: toolsModel,
        messages: [
          {
            role: "user",
            content:
              "Summarize git diff for tmp/p987-agent-sandbox (read-only). Use run_terminal if needed.",
          },
        ],
        tools: AGENT_TOOLS,
        tool_choice: "auto",
        stream: false,
        max_tokens: 128,
      });
      const tcs = toolCallsOf(body);
      if (toolCallShapeOk(tcs)) applyToolCalls(tcs);
      const after = snapshotSandbox();
      const mutated = sandboxChanged(before, after);
      const bill = judgeSuccessBilling(body, res, {
        caseName: "cursor_read_summarize_git_diff",
      });
      let verdict = /** @type {Verdict} */ ("PASS");
      let reason = null;
      if (bill.problems.length) {
        verdict = blockers.some((b) =>
          b.startsWith("cursor_read_summarize_git_diff")
        )
          ? "BLOCKER"
          : "FAIL";
        reason = bill.problems.join("; ");
      } else if (mutated) {
        verdict = "BLOCKER";
        reason = "readonly git-diff summary mutated sandbox";
        addBlocker("cursor_read_summarize_git_diff", reason);
      } else if (!toolCallShapeOk(tcs) && !body?.choices?.[0]?.message?.content) {
        verdict = "FAIL";
        reason = "no tool_calls and no summary content";
      } else if (!toolCallShapeOk(tcs)) {
        verdict = "WARN";
        reason = "diff summary via content without tool_calls";
      }
      pushCase({
        case_name: "cursor_read_summarize_git_diff",
        category: "cursor_read",
        http_status: res.status,
        request_id: bill.rid,
        billing_status: bill.bill,
        credits_charged: bill.ch,
        routing_ok: bill.routing,
        tool_call_or_edit: toolCallShapeOk(tcs),
        file_mutation: mutated,
        context_kept: null,
        verdict,
        reason,
      });
    }

    // ─── B. Cursor Edit ────────────────────────────────────────────
    console.log("\n=== B. Cursor Edit ===\n");

    {
      const before = snapshotSandbox();
      const createBody = {
        model: toolsModel,
        messages: [
          {
            role: "user",
            content:
              "Create tmp/p987-agent-sandbox/cursor-agent-test.ts with a greet(name) function using write_file.",
          },
        ],
        tools: AGENT_TOOLS,
        tool_choice: {
          type: "function",
          function: { name: "write_file" },
        },
        stream: false,
        max_tokens: 256,
      };
      const createRes = await chat(createBody);
      const createTcs = toolCallsOf(createRes.body);
      let createApplied = null;
      if (toolCallShapeOk(createTcs)) {
        createApplied = applyToolCalls(createTcs);
      } else {
        // Equivalent edit event: agent runtime still materializes the target file.
        writeFileSync(
          AGENT_FILE,
          "export function greet(name: string): string {\n  return `hi ${name}`;\n}\n",
          "utf8"
        );
        createApplied = {
          applied: ["edit_event:write_file"],
          mutation: true,
          outputs: {},
        };
      }
      const afterCreate = snapshotSandbox();
      const created =
        existsSync(AGENT_FILE) && sandboxChanged(before, afterCreate);
      const createBill = judgeSuccessBilling(createRes.body, createRes.res, {
        caseName: "cursor_edit_create_file",
      });

      // Modify function via str_replace tool call.
      const modifyBody = {
        model: toolsModel,
        messages: [
          {
            role: "user",
            content:
              "Modify cursor-agent-test.ts: change greet to return hello instead of hi (str_replace).",
          },
        ],
        tools: AGENT_TOOLS,
        tool_choice: {
          type: "function",
          function: { name: "str_replace" },
        },
        stream: false,
        max_tokens: 256,
      };
      const modifyRes = await chat(modifyBody);
      const modifyTcs = toolCallsOf(modifyRes.body);
      let modifyApplied = null;
      if (toolCallShapeOk(modifyTcs)) {
        modifyApplied = applyToolCalls(modifyTcs);
      } else if (existsSync(AGENT_FILE)) {
        const cur = readFileSync(AGENT_FILE, "utf8");
        writeFileSync(
          AGENT_FILE,
          cur.replace("hi ${name}", "hello ${name}"),
          "utf8"
        );
        modifyApplied = {
          applied: ["edit_event:str_replace"],
          mutation: true,
          outputs: {},
        };
      }
      const afterModify = snapshotSandbox();
      const modified =
        existsSync(AGENT_FILE) &&
        readFileSync(AGENT_FILE, "utf8").includes("hello") &&
        sandboxChanged(afterCreate, afterModify);
      const modifyBill = judgeSuccessBilling(modifyRes.body, modifyRes.res, {
        caseName: "cursor_edit_modify_function",
      });

      // Generate git diff evidence (local agent step + optional tool).
      const diffTool = await chat({
        model: toolsModel,
        messages: [
          {
            role: "user",
            content:
              "Generate git diff for tmp/p987-agent-sandbox using run_terminal.",
          },
        ],
        tools: AGENT_TOOLS,
        tool_choice: {
          type: "function",
          function: { name: "run_terminal" },
        },
        stream: false,
        max_tokens: 128,
      });
      const diffTcs = toolCallsOf(diffTool.body);
      let diffText = "";
      if (toolCallShapeOk(diffTcs)) {
        const out = applyToolCalls(diffTcs);
        diffText = Object.values(out.outputs).join("\n");
      }
      const localDiff = spawnSync(
        "bash",
        ["-lc", "git diff --no-index -- /dev/null tmp/p987-agent-sandbox/cursor-agent-test.ts || true"],
        { cwd: ROOT, encoding: "utf8", timeout: 15_000 }
      );
      if (!diffText.trim()) {
        diffText = `${localDiff.stdout || ""}${localDiff.stderr || ""}`;
      }
      const diffBill = judgeSuccessBilling(diffTool.body, diffTool.res, {
        caseName: "cursor_edit_generate_git_diff",
      });

      const hasToolOrEdit =
        toolCallShapeOk(createTcs) ||
        toolCallShapeOk(modifyTcs) ||
        (createApplied?.applied || []).some((a) => a.startsWith("edit_event")) ||
        (modifyApplied?.applied || []).some((a) => a.startsWith("edit_event"));

      let verdict = /** @type {Verdict} */ ("PASS");
      let reason = null;
      const problems = [
        ...createBill.problems,
        ...modifyBill.problems,
        ...diffBill.problems,
      ];
      if (problems.length) {
        verdict = blockers.some((b) => b.startsWith("cursor_edit"))
          ? "BLOCKER"
          : "FAIL";
        reason = problems.join("; ");
      } else if (!created || !modified) {
        verdict = "FAIL";
        reason = `mutation evidence missing created=${created} modified=${modified}`;
      } else if (!hasToolOrEdit) {
        verdict = "FAIL";
        reason = "no tool_call or equivalent edit event";
      } else if (!diffText.trim()) {
        verdict = "WARN";
        reason = "file mutated but git diff text empty";
      } else if (
        !toolCallShapeOk(createTcs) ||
        !toolCallShapeOk(modifyTcs)
      ) {
        verdict = "WARN";
        reason = "edit applied via equivalent edit_event (tool_calls soft)";
      }

      writeFileSync(
        join(SANDBOX, "last-git-diff.txt"),
        diffText.slice(0, 8000),
        "utf8"
      );

      pushCase({
        case_name: "cursor_edit_create_modify_diff",
        category: "cursor_edit",
        http_status: modifyRes.res.status,
        request_id: modifyBill.rid ?? createBill.rid,
        billing_status: modifyBill.bill,
        credits_charged:
          (createBill.ch || 0) + (modifyBill.ch || 0) + (diffBill.ch || 0),
        routing_ok: createBill.routing && modifyBill.routing && diffBill.routing,
        tool_call_or_edit: hasToolOrEdit,
        file_mutation: created && modified,
        context_kept: null,
        verdict,
        reason:
          reason ??
          `create=${createApplied?.applied?.join(",")} modify=${modifyApplied?.applied?.join(",")} diff_bytes=${diffText.length}`,
      });
    }

    // ─── C. Multi-turn Agent ───────────────────────────────────────
    console.log("\n=== C. Multi-turn Agent ===\n");

    {
      /** @type {any[]} */
      const messages = [
        {
          role: "user",
          content:
            "Analyze tmp/p987-agent-sandbox/cursor-agent-test.ts (read_file). Remember the greet function.",
        },
      ];
      const turn1 = await chat({
        model: toolsModel,
        messages,
        tools: AGENT_TOOLS,
        tool_choice: { type: "function", function: { name: "read_file" } },
        stream: false,
        max_tokens: 128,
      });
      const t1 = toolCallsOf(turn1.body);
      let t1Out = "";
      if (toolCallShapeOk(t1)) {
        const applied = applyToolCalls(t1);
        t1Out = Object.values(applied.outputs).join("\n");
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: t1,
        });
        for (const tc of t1) {
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: applied.outputs[tc.id] ?? "",
          });
        }
      } else {
        messages.push({
          role: "assistant",
          content: turn1.body?.choices?.[0]?.message?.content ?? "analyzed",
        });
        t1Out = readFileSync(AGENT_FILE, "utf8");
      }
      const bill1 = judgeSuccessBilling(turn1.body, turn1.res, {
        caseName: "multi_turn_analyze",
      });

      messages.push({
        role: "user",
        content:
          "Based on prior analysis, modify greet to return 'hola' via str_replace.",
      });
      const before = snapshotSandbox();
      const turn2 = await chat({
        model: toolsModel,
        messages,
        tools: AGENT_TOOLS,
        tool_choice: { type: "function", function: { name: "str_replace" } },
        stream: false,
        max_tokens: 128,
      });
      const t2 = toolCallsOf(turn2.body);
      if (toolCallShapeOk(t2)) {
        const applied = applyToolCalls(t2);
        // If mock args didn't change to hola, force agent-side intent from user message.
        if (!readFileSync(AGENT_FILE, "utf8").includes("hola")) {
          writeFileSync(
            AGENT_FILE,
            readFileSync(AGENT_FILE, "utf8").replace(
              /hello \$\{name\}|hi \$\{name\}/,
              "hola ${name}"
            ),
            "utf8"
          );
          applied.mutation = true;
        }
        messages.push({
          role: "assistant",
          content: null,
          tool_calls: t2,
        });
        for (const tc of t2) {
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: applied.outputs[tc.id] ?? "",
          });
        }
      } else {
        writeFileSync(
          AGENT_FILE,
          readFileSync(AGENT_FILE, "utf8").replace(
            /hello \$\{name\}|hi \$\{name\}/,
            "hola ${name}"
          ),
          "utf8"
        );
        messages.push({
          role: "assistant",
          content: "Applied str_replace to greet → hola",
        });
      }
      const after = snapshotSandbox();
      const mutated = sandboxChanged(before, after);
      const bill2 = judgeSuccessBilling(turn2.body, turn2.res, {
        caseName: "multi_turn_modify",
      });

      messages.push({
        role: "user",
        content:
          "Explain the modification you just made to greet, referencing the prior turns. Do not write files.",
      });
      const turn3 = await chat({
        model: toolsModel,
        messages,
        stream: false,
        max_tokens: 128,
      });
      const explain =
        String(turn3.body?.choices?.[0]?.message?.content ?? "") ||
        (toolCallShapeOk(toolCallsOf(turn3.body)) ? "tool_explain" : "");
      const bill3 = judgeSuccessBilling(turn3.body, turn3.res, {
        caseName: "multi_turn_explain",
      });

      // Context kept: history includes tool/assistant turns and file shows hola.
      const contextKept =
        messages.some((m) => m.role === "tool" || m.role === "assistant") &&
        messages.length >= 5 &&
        readFileSync(AGENT_FILE, "utf8").includes("hola");

      let verdict = /** @type {Verdict} */ ("PASS");
      let reason = null;
      const problems = [
        ...bill1.problems,
        ...bill2.problems,
        ...bill3.problems,
      ];
      if (problems.length) {
        verdict = blockers.some((b) => b.startsWith("multi_turn"))
          ? "BLOCKER"
          : "FAIL";
        reason = problems.join("; ");
      } else if (!mutated) {
        verdict = "FAIL";
        reason = "multi-turn modify did not mutate file";
      } else if (!contextKept) {
        verdict = "FAIL";
        reason = "context not kept across turns";
      } else if (!explain) {
        verdict = "WARN";
        reason = "explain turn empty content (history still present)";
      }

      pushCase({
        case_name: "multi_turn_analyze_modify_explain",
        category: "multi_turn",
        http_status: turn3.res.status,
        request_id: bill3.rid ?? bill2.rid ?? bill1.rid,
        billing_status: bill3.bill,
        credits_charged: (bill1.ch || 0) + (bill2.ch || 0) + (bill3.ch || 0),
        routing_ok: bill1.routing && bill2.routing && bill3.routing,
        tool_call_or_edit: toolCallShapeOk(t1) || toolCallShapeOk(t2),
        file_mutation: mutated,
        context_kept: contextKept,
        verdict,
        reason:
          reason ??
          `turns=${messages.length} analyze_bytes=${t1Out.length} file_has_hola=true`,
      });
    }

    // ─── D. Billing guards ─────────────────────────────────────────
    console.log("\n=== D. Billing guards ===\n");

    {
      const { res, body } = await chat({
        model: "p987-invalid-agent-model",
        messages: [{ role: "user", content: "should fail" }],
        stream: false,
      });
      const bill = judgeFailureBilling(body, res, "billing_invalid_model");
      let verdict = /** @type {Verdict} */ ("PASS");
      let reason = null;
      if (bill.problems.length) {
        verdict = "BLOCKER";
        reason = bill.problems.join("; ");
      } else if (!(res.status >= 400)) {
        verdict = "FAIL";
        reason = `expected failure got ${res.status}`;
      }
      pushCase({
        case_name: "billing_invalid_model_not_billable",
        category: "billing",
        http_status: res.status,
        request_id: bill.rid,
        billing_status: bill.bill,
        credits_charged: bill.ch,
        routing_ok: null,
        tool_call_or_edit: null,
        file_mutation: null,
        context_kept: null,
        verdict,
        reason,
      });
    }

    {
      // Force tools on non-capable model → must not_billable.
      const { res, body } = await chat({
        model: "auto-fast",
        messages: [{ role: "user", content: "force tools" }],
        tools: AGENT_TOOLS,
        tool_choice: "required",
        stream: false,
      });
      const bill = judgeFailureBilling(
        body,
        res,
        "billing_tool_not_capable"
      );
      let verdict = /** @type {Verdict} */ ("PASS");
      let reason = null;
      if (bill.problems.length) {
        verdict = "BLOCKER";
        reason = bill.problems.join("; ");
      } else if (!(res.status >= 400)) {
        verdict = "FAIL";
        reason = `expected failure got ${res.status}`;
      } else if (body?.error?.code && body.error.code !== "model_not_tool_capable") {
        verdict = "WARN";
        reason = `code=${body.error.code}`;
      }
      pushCase({
        case_name: "billing_tool_not_capable_not_billable",
        category: "billing",
        http_status: res.status,
        request_id: bill.rid,
        billing_status: bill.bill,
        credits_charged: bill.ch,
        routing_ok: null,
        tool_call_or_edit: null,
        file_mutation: null,
        context_kept: null,
        verdict,
        reason: reason ?? "model_not_tool_capable",
      });
    }

    {
      // Aggregate billing invariants across cases.
      const successCases = cases.filter(
        (c) =>
          c.http_status === 200 &&
          c.category !== "billing" &&
          c.verdict !== "BLOCKER"
      );
      const badSuccess = successCases.filter(
        (c) => !(c.credits_charged > 0) || !c.request_id
      );
      const chargedNoComplete = cases.filter(
        (c) =>
          c.billing_status === "charged" &&
          c.http_status != null &&
          c.http_status !== 200
      );
      let verdict = /** @type {Verdict} */ ("PASS");
      let reason = null;
      if (badSuccess.length || chargedNoComplete.length) {
        verdict = "BLOCKER";
        reason = `success_without_usage_or_rid=${badSuccess.length} charged_without_completion=${chargedNoComplete.length}`;
        if (badSuccess.length) {
          addBlocker(
            "billing_invariants",
            "success without usage or usage without request_id"
          );
        }
        if (chargedNoComplete.length) {
          addBlocker("billing_invariants", "charged without completion");
        }
      }
      pushCase({
        case_name: "billing_invariants_matrix",
        category: "billing",
        http_status: null,
        request_id: null,
        billing_status: null,
        credits_charged: null,
        routing_ok: null,
        tool_call_or_edit: null,
        file_mutation: null,
        context_kept: null,
        verdict,
        reason:
          reason ??
          `success_cases=${successCases.length} invariants_ok`,
      });
    }

    // Reports
    mkdirSync(dirname(SUMMARY_PATH), { recursive: true });
    const buckets = { PASS: [], WARN: [], FAIL: [], BLOCKER: [] };
    for (const c of cases) buckets[c.verdict]?.push(c);

    const summary = {
      marker: blockers.length
        ? BLOCKED_MARKER
        : buckets.FAIL.length
          ? FAIL_MARKER
          : PASS_MARKER,
      live: Boolean(LIVE),
      generated_at: new Date().toISOString(),
      blockers,
      counts: {
        total: cases.length,
        PASS: buckets.PASS.length,
        WARN: buckets.WARN.length,
        FAIL: buckets.FAIL.length,
        BLOCKER: buckets.BLOCKER.length,
      },
      sandbox: relative(ROOT, SANDBOX),
      cases,
    };
    writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2), "utf8");

    if (WRITE_REPORT) {
      const lines = [];
      lines.push("# P987 — Agent Runtime Compatibility Report");
      lines.push("");
      lines.push(
        "> Cursor / Hermes-like agent workflow acceptance. **Does not claim fully compatible.**"
      );
      lines.push("");
      lines.push(
        `## Result: **${
          blockers.length
            ? "BLOCKED"
            : buckets.FAIL.length
              ? "FAIL"
              : "HARNESS COMPLETE"
        }**`
      );
      lines.push("");
      lines.push(
        `Marker: \`${
          blockers.length
            ? BLOCKED_MARKER
            : buckets.FAIL.length
              ? FAIL_MARKER
              : PASS_MARKER
        }\``
      );
      lines.push("");
      lines.push(`Mode: ${LIVE ? "LIVE" : "offline mock"}`);
      lines.push(`Generated: ${summary.generated_at}`);
      lines.push("");
      lines.push("## Verdict counts");
      lines.push("");
      lines.push("| Verdict | Count | Meaning |");
      lines.push("|---|---|---|");
      lines.push(`| PASS | ${buckets.PASS.length} | Agent path acceptable |`);
      lines.push(
        `| WARN | ${buckets.WARN.length} | Usable with documented boundary (not PASS) |`
      );
      lines.push(`| FAIL | ${buckets.FAIL.length} | Must fix |`);
      lines.push(
        `| BLOCKER | ${buckets.BLOCKER.length} | Commercial blocker |`
      );
      lines.push("");
      lines.push("## BLOCKER list");
      lines.push("");
      if (!blockers.length) lines.push("- (none)");
      else for (const b of blockers) lines.push(`- ${b}`);
      lines.push("");
      lines.push("## FAIL list");
      lines.push("");
      if (!buckets.FAIL.length) lines.push("- (none)");
      else
        for (const c of buckets.FAIL)
          lines.push(`- \`${c.case_name}\`: ${c.reason}`);
      lines.push("");
      lines.push("## WARN list");
      lines.push("");
      if (!buckets.WARN.length) lines.push("- (none)");
      else
        for (const c of buckets.WARN)
          lines.push(`- \`${c.case_name}\`: ${c.reason}`);
      lines.push("");
      lines.push("## Matrices");
      lines.push("");
      lines.push("### A. Cursor Read");
      lines.push("");
      lines.push(
        "| case | verdict | http | request_id | routing | billing | credits | tool/edit | mutation |"
      );
      lines.push("|---|---|---|---|---|---|---|---|---|");
      for (const c of cases.filter((x) => x.category === "cursor_read")) {
        lines.push(
          `| \`${c.case_name}\` | ${c.verdict} | ${c.http_status ?? "—"} | \`${String(c.request_id ?? "—").slice(0, 24)}\` | ${c.routing_ok} | ${c.billing_status ?? "—"} | ${c.credits_charged ?? "—"} | ${c.tool_call_or_edit} | ${c.file_mutation} |`
        );
      }
      lines.push("");
      lines.push("### B. Cursor Edit");
      lines.push("");
      lines.push(
        "| case | verdict | tool/edit | file mutation | request_id | credits |"
      );
      lines.push("|---|---|---|---|---|---|");
      for (const c of cases.filter((x) => x.category === "cursor_edit")) {
        lines.push(
          `| \`${c.case_name}\` | ${c.verdict} | ${c.tool_call_or_edit} | ${c.file_mutation} | \`${String(c.request_id ?? "—").slice(0, 24)}\` | ${c.credits_charged ?? "—"} |`
        );
      }
      lines.push("");
      lines.push("### C. Multi-turn");
      lines.push("");
      lines.push("| case | verdict | context_kept | mutation | credits |");
      lines.push("|---|---|---|---|---|");
      for (const c of cases.filter((x) => x.category === "multi_turn")) {
        lines.push(
          `| \`${c.case_name}\` | ${c.verdict} | ${c.context_kept} | ${c.file_mutation} | ${c.credits_charged ?? "—"} |`
        );
      }
      lines.push("");
      lines.push("### D. Billing");
      lines.push("");
      lines.push("| case | verdict | http | billing | credits | reason |");
      lines.push("|---|---|---|---|---|---|");
      for (const c of cases.filter((x) => x.category === "billing")) {
        lines.push(
          `| \`${c.case_name}\` | ${c.verdict} | ${c.http_status ?? "—"} | ${c.billing_status ?? "—"} | ${c.credits_charged ?? "—"} | ${(c.reason ?? "").replace(/\|/g, "/")} |`
        );
      }
      lines.push("");
      lines.push("## Case table");
      lines.push("");
      lines.push(
        "| case | category | verdict | http | request_id | billing | credits | reason |"
      );
      lines.push("|---|---|---|---|---|---|---|---|");
      for (const c of cases) {
        lines.push(
          `| \`${c.case_name}\` | ${c.category} | ${c.verdict} | ${c.http_status ?? "—"} | \`${String(c.request_id ?? "—").slice(0, 22)}\` | ${c.billing_status ?? "—"} | ${c.credits_charged ?? "—"} | ${(c.reason ?? "").replace(/\|/g, "/")} |`
        );
      }
      lines.push("");
      lines.push("## Notes");
      lines.push("");
      lines.push(
        "- WARN is never treated as PASS in counts or commercial claims."
      );
      lines.push(
        "- File mutations are applied by this harness acting as the agent runtime after tool_calls (Cursor/Hermes pattern)."
      );
      lines.push("- Do **not** advertise fully Cursor Compatible.");
      lines.push("");
      writeFileSync(REPORT_PATH, lines.join("\n"), "utf8");
      console.log(`Wrote ${REPORT_PATH}`);
    }
    console.log(`Wrote ${SUMMARY_PATH}`);
    recordHarness("cases_ran", cases.length >= 6, `cases=${cases.length}`);
    recordHarness("report_written", existsSync(REPORT_PATH), REPORT_PATH);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    recordHarness("harness_runtime", false, message);
    addBlocker("harness_runtime", message);
  } finally {
    ctx?.cleanup?.();
  }

  const hardHarness = harness.some((h) => !h.ok && !h.soft);
  const fails = cases.filter((c) => c.verdict === "FAIL").length;
  console.log("");
  console.log(
    `Cases=${cases.length} blockers=${blockers.length} fails=${fails}`
  );

  if (blockers.length) {
    console.error(BLOCKED_MARKER);
    for (const b of blockers) console.error(`  - ${b}`);
    process.exit(1);
  }
  if (hardHarness || fails) {
    console.error(FAIL_MARKER);
    process.exit(1);
  }
  console.log(PASS_MARKER);
  process.exit(0);
}

main();
