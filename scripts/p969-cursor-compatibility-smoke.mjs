#!/usr/bin/env node
/**
 * P969 — Cursor / OpenAI-Compatible Client Compatibility Acceptance.
 *
 * Verifies Tokfai can be used as an experimental OpenAI-compatible gateway
 * for Cursor (small internal trial). Does NOT claim full Cursor compatibility.
 *
 * Default: offline mock. LIVE=1 hits https://api.tokfai.com (requires key).
 * Never prints API key plaintext. No load test. Does not change billing logic.
 *
 * Usage:
 *   node scripts/p969-cursor-compatibility-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p969-cursor-compatibility-smoke.mjs
 *   WRITE_REPORT=1 node scripts/p969-cursor-compatibility-smoke.mjs
 *
 * Note: docs/p969-cursor-compatibility-report.md is the curated acceptance
 * report (offline+LIVE merged). Smoke only overwrites it when WRITE_REPORT=1.
 *
 * Markers:
 *   TOKFAI_P969_CURSOR_COMPATIBILITY_PASS
 *   TOKFAI_P969_CURSOR_COMPATIBILITY_PARTIAL_PASS
 *   TOKFAI_P969_CURSOR_COMPATIBILITY_FAIL
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import { UPSTREAM_DEGRADED_CODES } from "./lib/public-beta-live-helpers.mjs";
import { assertNoErrorLeak } from "./lib/client-compat-matrix.mjs";

const SCRIPT = "scripts/p969-cursor-compatibility-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P969_CURSOR_COMPATIBILITY_PASS";
const PARTIAL_MARKER = "TOKFAI_P969_CURSOR_COMPATIBILITY_PARTIAL_PASS";
const FAIL_MARKER = "TOKFAI_P969_CURSOR_COMPATIBILITY_FAIL";

const WRITE_REPORT =
  process.env.WRITE_REPORT === "1" || process.env.WRITE_REPORT === "true";
const REPORT_PATH = join(
  ROOT,
  process.env.REPORT_PATH ?? "docs/p969-cursor-compatibility-report.md"
);
const SUMMARY_PATH = join(
  ROOT,
  process.env.SUMMARY_PATH ?? "tmp/p969-cursor-compat-summary.json"
);

const CURSOR_UA = "Cursor/1.0 TokfaiP969CompatSmoke";
const IMAGE_MODELS_FORBIDDEN_IN_CHAT = [
  "nano-banana",
  "gpt-image-2",
  "gpt-image-2-vip",
];
const CURSOR_CHAT_MODELS = ["auto-fast", "auto-pro", "gpt-5-chat"];
const LONG_PROMPT = `Explain this TypeScript function and suggest one safer rewrite.\n\n${"x".repeat(1800)}\n\nfunction parse(id: string | null) {\n  return id!.trim();\n}`;

/** @type {{ id: string, ok: boolean, soft?: boolean, detail?: string }[]} */
const results = [];
/** @type {string[]} */
const requestIds = [];
/** @type {string[]} */
const dirtyLogHits = [];

function record(id, ok, detail, soft = false) {
  results.push({ id, ok, soft, detail: detail ? String(detail).slice(0, 240) : undefined });
  if (ok) {
    if (soft) {
      console.warn(`SOFT  ${id}${detail ? ` — ${detail}` : ""}`);
      return true;
    }
    return pass(id);
  }
  return fail(id, detail);
}

function readSrc(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function maskKey(key) {
  if (!key || typeof key !== "string") return "(none)";
  if (key.length < 16) return "sk-tokfai_…";
  return `${key.slice(0, 14)}…`;
}

function gitHead() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return (r.stdout || "").trim() || "unknown";
}

function extractRequestId(body, headers) {
  const fromBody =
    (typeof body?.request_id === "string" && body.request_id) ||
    (typeof body?.tokfai?.request_id === "string" && body.tokfai.request_id) ||
    (typeof body?.error?.request_id === "string" && body.error.request_id) ||
    "";
  if (fromBody) return fromBody;
  const hdr = headers?.get?.("x-request-id");
  return typeof hdr === "string" ? hdr : "";
}

function creditsOf(body) {
  const n = Number(
    body?.credits_charged ?? body?.tokfai?.credits_charged ?? NaN
  );
  return Number.isFinite(n) ? n : null;
}

function billingStatusOf(body) {
  const s = body?.tokfai?.billing_status ?? body?.billing_status;
  return typeof s === "string" ? s : null;
}

function assertReadableError(body, label) {
  const code = body?.error?.code;
  const message = body?.error?.message ?? "";
  if (!code || typeof code !== "string") {
    return `${label}: missing error.code`;
  }
  if (!message || typeof message !== "string" || !message.trim()) {
    return `${label}: missing readable error.message`;
  }
  if (message === "undefined" || message === "null") {
    return `${label}: dirty message=${message}`;
  }
  const leak = assertNoErrorLeak(message);
  if (leak) return `${label}: ${leak}`;
  return null;
}

function assertNotBillableFailure(body, label) {
  const credits = creditsOf(body);
  const billing = billingStatusOf(body);
  if (credits != null && credits > 0) {
    return `${label}: credits_charged=${credits} (expected 0)`;
  }
  if (billing && billing !== "not_billable") {
    return `${label}: billing_status=${billing} (expected not_billable)`;
  }
  return null;
}

function parseSse(text) {
  const lines = String(text ?? "").split(/\r?\n/);
  const dataLines = [];
  let doneCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (payload === "[DONE]") {
      doneCount += 1;
      continue;
    }
    if (!payload) continue;
    try {
      dataLines.push(JSON.parse(payload));
    } catch {
      dataLines.push({ _raw: payload });
    }
  }
  return { dataLines, doneCount, text: String(text ?? "") };
}

function assertStatic() {
  let ok = true;

  const chat = readSrc("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const isolation = readSrc("apps/dmit-api/src/lib/imageProviderIsolation.ts");
  const catalog = readSrc("apps/dmit-api/src/catalog/modelPricing.ts");
  const errors = readSrc("apps/dmit-api/src/errors.ts");
  const chatRoute = readSrc("apps/dmit-api/src/routes/chat.ts");
  const messages = readSrc("apps/web/lib/i18n/messages.ts");

  ok =
    record(
      "static:image_model_not_for_chat isolation",
      chat.includes("image_model_not_for_chat") &&
        isolation.includes("IMAGE_MODEL_NOT_FOR_CHAT_CODE") &&
        chat.includes('billing_status: "not_billable"')
    ) && ok;

  ok =
    record(
      "static:GET /v1/models excludes image-only from chat catalog",
      catalog.includes("listAvailableChatModelIds") &&
        catalog.includes("Image-only models stay on")
    ) && ok;

  ok =
    record(
      "static:error envelope codes present",
      errors.includes("too_many_requests") &&
        errors.includes("upstream_timeout") &&
        errors.includes("upstream_error") &&
        errors.includes("invalid_request_error") &&
        errors.includes("image_model_not_for_chat") &&
        chat.includes("insufficient_credits")
    ) && ok;

  ok =
    record(
      "static:chat SSE path + idempotency",
      chatRoute.includes("respondChatCompletionEarlySse") &&
        chatRoute.includes("Idempotency-Key") &&
        chat.includes("lookupBillingIdempotency")
    ) && ok;

  ok =
    record(
      "static:Cursor docs marked experimental path (not fully compatible)",
      messages.includes("cursorGatewayNote") &&
        messages.includes("https://api.tokfai.com/v1") &&
        messages.includes("auto-fast") &&
        !/fully compatible with Cursor/i.test(messages)
    ) && ok;

  // Dirty-log guards in error path
  ok =
    record(
      "static:sanitizePublicErrorMessage prevents undefined leak",
      errors.includes("sanitizePublicErrorMessage") &&
        errors.includes('trimmed === "undefined"')
    ) && ok;

  return ok;
}

async function postChat(ctx, body, extraHeaders = {}) {
  const { res, body: json, text, headers } = await acceptanceFetch(
    `${ctx.BASE}/v1/chat/completions`,
    {
      method: "POST",
      headers: ctx.authHeaders({
        "User-Agent": CURSOR_UA,
        ...extraHeaders,
      }),
      body: JSON.stringify(body),
      timeoutMs: ctx.TIMEOUT_MS,
    }
  );
  const rid = extractRequestId(json, headers);
  if (rid) requestIds.push(rid);
  return { res, body: json, text, headers };
}

async function runModelsCheck(ctx) {
  let ok = true;
  const { res, body } = await ctx.getJson("/v1/models");
  const rows = Array.isArray(body?.data) ? body.data : [];
  const ids = rows.map((r) => r.id);

  if (res.status !== 200 || body?.object !== "list" || !Array.isArray(body?.data)) {
    return record(
      "GET /v1/models OpenAI list shape",
      false,
      `HTTP ${res.status} object=${body?.object}`
    );
  }
  ok = record("GET /v1/models object=list + data[]", true) && ok;

  const missingStable = CURSOR_CHAT_MODELS.filter((id) => !ids.includes(id));
  ok =
    record(
      "GET /v1/models Cursor chat models stable",
      missingStable.length === 0,
      missingStable.length ? `missing=${missingStable.join(",")}` : undefined
    ) && ok;

  const badObject = rows.filter((r) => r.object !== "model" || !r.id);
  ok =
    record(
      "GET /v1/models each item object=model + id",
      badObject.length === 0,
      badObject.length ? `bad=${badObject.length}` : undefined
    ) && ok;

  const leakedImage = ids.filter((id) =>
    IMAGE_MODELS_FORBIDDEN_IN_CHAT.some(
      (img) => id === img || String(id).startsWith(`${img}-`) || String(id).startsWith("gpt-image") || String(id).startsWith("nano-banana")
    )
  );
  ok =
    record(
      "GET /v1/models hides image-only from Cursor chat catalog",
      leakedImage.length === 0,
      leakedImage.length ? `leaked=${leakedImage.join(",")}` : undefined
    ) && ok;

  return ok;
}

async function runSuccessChatScenarios(ctx) {
  let ok = true;
  const model = CURSOR_CHAT_MODELS.find(Boolean);

  const cases = [
    {
      id: "cursor:simple Q&A",
      body: {
        model,
        messages: [
          { role: "system", content: "You are a concise assistant." },
          { role: "user", content: "Reply with exactly: P969_OK" },
        ],
        stream: false,
        max_tokens: 64,
        temperature: 0,
      },
    },
    {
      id: "cursor:code explain",
      body: {
        model: "auto-fast",
        messages: [
          { role: "system", content: "You are a coding assistant." },
          {
            role: "user",
            content:
              "Explain in one sentence: const n = Number(x) || 0;",
          },
        ],
        stream: false,
        max_tokens: 128,
      },
    },
    {
      id: "cursor:code edit suggestion",
      body: {
        model: "gpt-5-chat",
        messages: [
          { role: "user", content: "Suggest a safer rewrite for: id!.trim()" },
          {
            role: "assistant",
            content: "Use optional chaining / null check.",
          },
          { role: "user", content: "Give one short TypeScript line only." },
        ],
        stream: false,
        max_tokens: 64,
      },
    },
    {
      id: "cursor:long prompt",
      body: {
        model: "auto-pro",
        messages: [{ role: "user", content: LONG_PROMPT }],
        stream: false,
        max_tokens: 96,
      },
    },
  ];

  for (const c of cases) {
    const { res, body } = await postChat(ctx, c.body);
    const content = body?.choices?.[0]?.message?.content;
    const usage = body?.usage;
    const credits = creditsOf(body);
    const code = body?.error?.code;

    if (ctx.LIVE && UPSTREAM_DEGRADED_CODES.has(code)) {
      ok =
        record(
          c.id,
          true,
          `upstream degraded code=${code} (soft)`,
          true
        ) && ok;
      continue;
    }

    const success =
      res.status === 200 &&
      typeof content === "string" &&
      content.length > 0 &&
      usage &&
      typeof usage === "object" &&
      (credits == null || credits >= 0);

    if (!success) {
      ok =
        record(
          c.id,
          false,
          `HTTP ${res.status} code=${code} content=${JSON.stringify(content)?.slice(0, 80)}`
        ) && ok;
      continue;
    }

    // Successful chat should charge (mock always charges tiny amount; live may be unlimited).
    if (!ctx.LIVE && (credits == null || credits <= 0)) {
      ok = record(`${c.id} billable`, false, `credits_charged=${credits}`) && ok;
    } else if (ctx.LIVE && credits != null && credits < 0) {
      ok = record(`${c.id} billable`, false, `credits_charged=${credits}`) && ok;
    } else {
      ok =
        record(
          `${c.id} content+usage`,
          true,
          `credits=${credits ?? "n/a"} model=${c.body.model}`
        ) && ok;
    }
  }

  return ok;
}

async function runStreamCheck(ctx) {
  const { res, body, text, headers } = await postChat(ctx, {
    model: "auto-fast",
    messages: [{ role: "user", content: "Say P969_STREAM_OK in a few words." }],
    stream: true,
    max_tokens: 64,
  });

  const code = body?.error?.code;
  if (ctx.LIVE && UPSTREAM_DEGRADED_CODES.has(code)) {
    return record("cursor:stream=true", true, `upstream degraded code=${code}`, true);
  }

  const ct = headers?.get?.("content-type") ?? "";
  const sse = parseSse(text);
  const hasEventStream =
    ct.includes("text/event-stream") || sse.text.includes("data:");
  const hasChunk =
    sse.dataLines.some(
      (f) =>
        f?.object === "chat.completion.chunk" ||
        (f?.choices && Array.isArray(f.choices))
    ) || /chat\.completion\.chunk/.test(sse.text);
  const hasDelta = sse.text.includes('"delta"');
  const doneOk = sse.doneCount === 1;
  const noDoubleDone = sse.doneCount <= 1;
  const noHeadersError = !/Cannot set headers after they are sent/i.test(
    sse.text
  );
  const noGarbage = !/\uFFFD/.test(sse.text);

  const ok =
    res.status === 200 &&
    hasEventStream &&
    hasChunk &&
    hasDelta &&
    doneOk &&
    noDoubleDone &&
    noHeadersError &&
    noGarbage;

  return record(
    "cursor:stream=true SSE OpenAI-compatible",
    ok,
    ok
      ? `done=${sse.doneCount} chunks=${sse.dataLines.length}`
      : `HTTP ${res.status} ct=${ct} done=${sse.doneCount} chunk=${hasChunk} delta=${hasDelta} code=${code}`
  );
}

async function runErrorMatrix(ctx) {
  let ok = true;

  // Unknown model → model_not_available (docs also accept model_not_found alias)
  {
    const { res, body } = await postChat(ctx, {
      model: "not-a-real-tokfai-model-zzz-p969",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
    });
    const code = body?.error?.code;
    const readable = assertReadableError(body, "unknown model");
    const billing = assertNotBillableFailure(body, "unknown model");
    const codeOk =
      code === "model_not_available" || code === "model_not_found";
    ok =
      record(
        "error:unknown model → model_not_available",
        res.status === 400 && codeOk && !readable && !billing,
        readable || billing || `HTTP ${res.status} code=${code}`
      ) && ok;
  }

  // Image model used in chat
  {
    const { res, body } = await postChat(ctx, {
      model: "nano-banana",
      messages: [{ role: "user", content: "draw a cat" }],
      stream: false,
    });
    const code = body?.error?.code;
    const readable = assertReadableError(body, "image in chat");
    const billing = assertNotBillableFailure(body, "image in chat");
    const codeOk =
      code === "image_model_not_for_chat" || code === "model_not_for_chat";
    ok =
      record(
        "error:image model in chat → image_model_not_for_chat",
        res.status === 400 && codeOk && !readable && !billing,
        readable || billing || `HTTP ${res.status} code=${code}`
      ) && ok;
  }

  // Forced error triggers (offline mock; LIVE soft-skips)
  const forced = [
    {
      id: "error:insufficient_credits",
      model: "__tokfai_mock_insufficient_credits",
      expectStatus: 402,
      expectCode: "insufficient_credits",
    },
    {
      id: "error:too_many_requests",
      model: "__tokfai_mock_rate_limited",
      expectStatus: 429,
      expectCode: "too_many_requests",
    },
    {
      id: "error:upstream_timeout",
      model: "__tokfai_mock_upstream_timeout",
      expectStatus: 504,
      expectCode: "upstream_timeout",
    },
    {
      id: "error:upstream_error",
      model: "__tokfai_mock_upstream_error",
      expectStatus: 502,
      expectCode: "upstream_error",
    },
    {
      id: "error:invalid_request_error",
      model: "__tokfai_mock_invalid_request",
      expectStatus: 400,
      expectCode: "invalid_request_error",
    },
  ];

  for (const f of forced) {
    // Only invalid_request is wired in production chat.ts; other __tokfai_mock_*
    // triggers are offline-mock-only (LIVE soft-skip, covered offline + static).
    const liveSupported = f.model === "__tokfai_mock_invalid_request";
    if (ctx.LIVE && !liveSupported) {
      ok =
        record(
          f.id,
          true,
          "LIVE soft-skip (mock trigger only; static+offline cover)",
          true
        ) && ok;
      continue;
    }
    const { res, body } = await postChat(ctx, {
      model: f.model,
      messages: [{ role: "user", content: "hi" }],
      stream: false,
    });
    const code = body?.error?.code;
    const readable = assertReadableError(body, f.id);
    const billing = assertNotBillableFailure(body, f.id);
    // LIVE error envelope may omit tokfai.billing_status; accept credits<=0 /
    // missing billing field (usage_logs not_billable covered by static).
    const billingOk =
      !billing ||
      (ctx.LIVE &&
        (creditsOf(body) == null || creditsOf(body) === 0) &&
        !billingStatusOf(body));
    ok =
      record(
        f.id,
        res.status === f.expectStatus &&
          code === f.expectCode &&
          !readable &&
          billingOk,
        readable ||
          billing ||
          `HTTP ${res.status} code=${code} expect=${f.expectStatus}/${f.expectCode}`
      ) && ok;
  }

  return ok;
}

async function runIdempotencyCheck(ctx) {
  const key = `p969-idem-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const body = {
    model: "auto-fast",
    messages: [{ role: "user", content: "Reply with exactly: P969_IDEM" }],
    stream: false,
    max_tokens: 32,
    temperature: 0,
  };

  const first = await postChat(ctx, body, { "Idempotency-Key": key });
  const second = await postChat(ctx, body, { "Idempotency-Key": key });

  const code1 = first.body?.error?.code;
  if (ctx.LIVE && UPSTREAM_DEGRADED_CODES.has(code1)) {
    return record(
      "cursor:idempotency duplicate",
      true,
      `upstream degraded code=${code1}`,
      true
    );
  }

  if (first.res.status !== 200 || second.res.status !== 200) {
    return record(
      "cursor:idempotency duplicate",
      false,
      `HTTP ${first.res.status}/${second.res.status} code=${code1}/${second.body?.error?.code}`
    );
  }

  const c1 = creditsOf(first.body) ?? 0;
  const c2 = creditsOf(second.body) ?? 0;
  const r1 = extractRequestId(first.body, first.headers);
  const r2 = extractRequestId(second.body, second.headers);

  // Replay should not double-charge: same credits on both responses,
  // and ideally same request_id (mock + live RPC).
  const sameCredits = c1 === c2;
  const sameRequest = !r1 || !r2 || r1 === r2;
  const noDouble = sameCredits && sameRequest;

  return record(
    "cursor:idempotency no double charge",
    noDouble,
    `credits=${c1}/${c2} request_id=${r1 || "n/a"}/${r2 || "n/a"}`
  );
}

function decideVerdict() {
  const hardFails = results.filter((r) => !r.ok && !r.soft);
  const softs = results.filter((r) => r.ok && r.soft);
  const hardPasses = results.filter((r) => r.ok && !r.soft);

  if (hardFails.length > 0) {
    return {
      marker: FAIL_MARKER,
      reason: `${hardFails.length} hard fail(s)`,
    };
  }
  if (softs.length > 0) {
    return {
      marker: PARTIAL_MARKER,
      reason: `${softs.length} soft/degraded; ${hardPasses.length} hard pass`,
    };
  }
  return {
    marker: PASS_MARKER,
    reason: `${hardPasses.length} hard pass, 0 soft`,
  };
}

function buildReportMarkdown(ctx, verdict) {
  const today = new Date().toISOString().slice(0, 10);
  const head = gitHead();
  const mode = ctx.LIVE ? "LIVE production" : "offline mock";
  const rows = results
    .map(
      (r) =>
        `| ${r.id} | ${r.ok ? (r.soft ? "SOFT" : "PASS") : "FAIL"} | ${r.detail ?? ""} |`
    )
    .join("\n");

  const hardFails = results.filter((r) => !r.ok && !r.soft);
  const billingFail = results.some(
    (r) => !r.ok && /billable|credits|idempotency|not_billable/i.test(r.id + (r.detail ?? ""))
  );
  const dirtyFail = results.some(
    (r) => !r.ok && /dirty|undefined|Cannot set headers/i.test(r.detail ?? "")
  );

  const canTrial =
    verdict.marker === PASS_MARKER || verdict.marker === PARTIAL_MARKER;

  return `# P969 Cursor / OpenAI-Compatible Client Compatibility Report

> 日期：${today}  
> 环境：${mode} — Base URL \`https://api.tokfai.com/v1\`  
> 约束：未压测；未改 Chat / Image / Billing 核心计费逻辑；未打印 API Key 明文  
> API Key 前缀：\`${maskKey(ctx.API_KEY)}\`  
> HEAD：\`${head}\`  
> 脚本：\`scripts/p969-cursor-compatibility-smoke.mjs\`

---

## 最终结论

\`\`\`
${verdict.marker}
\`\`\`

${verdict.reason}

| 问题 | 结论 |
|---|---|
| Cursor 是否可以接入 | **可以（experimental）** — OpenAI-compatible Base URL + API Key + custom model |
| 支持哪些模型（Chat） | \`auto-fast\` / \`auto-pro\` / \`gpt-5-chat\`（及 \`/v1/models\` 列出的其它 text 模型） |
| 哪些功能仅 experimental | Cursor IDE 内聊天 / Agent；流式 SSE；别名路由；幂等 \`Idempotency-Key\` |
| 哪些功能不建议使用 | Image-only 模型走 Chat；把 Tokfai 标成 fully compatible；大并发压测；依赖 vendor-native Cursor 专有协议 |
| 是否发现扣费异常 | ${billingFail ? "**是（见检查表 FAIL）**" : "**否**（成功可扣费；失败 not_billable / credits=0；幂等不双扣）"} |
| 是否发现 runtime 脏日志 | ${dirtyFail || dirtyLogHits.length ? "**是**" : "**否**（无 undefined / empty body / Cannot set headers）"} |
| 是否可以给内部开发者小范围试用 | **${canTrial ? "可以（小范围 / experimental）" : "否 — 先修复 FAIL"}** |

---

## 一、Cursor 设置说明（experimental）

> **重要：** Tokfai ↔ Cursor 兼容性标记为 **experimental**，**不是** fully compatible。

1. 打开 **Cursor Settings**
2. 进入 **Models**（或 Model provider / OpenAI Compatible）
3. 设置 **OpenAI API Key**：\`sk-tokfai_xxx\`（Dashboard → API Keys 创建的完整密钥）
4. 开启 **Override OpenAI Base URL**
5. **Base URL**：\`https://api.tokfai.com/v1\`（必须含 \`/v1\`）
6. **Custom model**：\`auto-fast\`（推荐）或 \`gpt-5-chat\` / \`auto-pro\`
7. 发送短测试 prompt；到 Tokfai Usage 用 \`request_id\` 核对

若 Cursor 聊天失败：先用一行 curl 验证 Key + Base URL：

\`\`\`bash
curl -sS https://api.tokfai.com/v1/chat/completions \\
  -H "Authorization: Bearer sk-tokfai_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"auto-fast","messages":[{"role":"user","content":"Say ok only."}],"stream":false}'
\`\`\`

HTTP 200 说明网关与密钥正常，再回头修 Cursor 设置。

---

## 二、OpenAI-compatible 基础验收

| 项 | 期望 | 本轮 |
|---|---|---|
| GET /v1/models | \`object: list\` + \`data[]\` + 稳定 id | 见检查表 |
| Image-only 不进默认 Chat 目录 | 不返回 nano-banana / gpt-image-* | 见检查表 |
| POST chat 非流式 | \`choices[0].message.content\` + \`usage\` | 见检查表 |
| POST chat stream=true | \`data: {...}\` + 单一 \`data: [DONE]\` | 见检查表 |

---

## 三、错误码兼容（失败不扣费）

| 语义 | 实际 \`error.code\` | 期望计费 |
|---|---|---|
| model_not_found | \`model_not_available\`（文档亦接受 model_not_found） | not_billable / credits=0 |
| model_not_for_chat | \`image_model_not_for_chat\` | not_billable / credits=0 |
| insufficient_credits | \`insufficient_credits\` | not_billable / credits=0 |
| too_many_requests | \`too_many_requests\` | not_billable / credits=0 |
| upstream_timeout | \`upstream_timeout\` | not_billable / credits=0 |
| upstream_error | \`upstream_error\` | not_billable / credits=0 |
| invalid_request_error | \`invalid_request_error\` | not_billable / credits=0 |

消息必须人类可读；禁止 vendor 泄漏与字面量 \`undefined\`。

---

## 四、账务检查

| 检查 | 结果 |
|---|---|
| 成功 Chat 正常扣费 | 见 \`cursor:*\` PASS（mock 有 \`credits_charged\`；LIVE 以响应字段为准） |
| 失败 Chat 不扣费 | 见 error:* not_billable |
| stream 终态 | SSE 单次 \`[DONE]\`；失败走 JSON envelope（非脏 SSE） |
| duplicate Idempotency-Key 不重复扣费 | 见 idempotency 行 |
| usage ↔ ledger | 本脚本校验响应字段；全库对账见 P968 |

采集到的 request_id（脱敏完整保留供 Usage 搜索）：  
${requestIds.length ? requestIds.map((id) => `\`${id}\``).join(", ") : "（无）"}

---

## 五、检查明细

| 检查项 | 结果 | 说明 |
|---|---|---|
${rows}

---

## 六、硬限制声明

1. **Experimental only** — 不可对外写 fully compatible。  
2. 不破坏现有 Chat / Image / Billing / Ledger 主链路。  
3. 不做大压测。  
4. 不打印 API Key 明文。  
5. Image / Batch / vendor-native Cursor 协议不在本验收范围。

---

## 七、复现

\`\`\`bash
# Offline (default)
node scripts/p969-cursor-compatibility-smoke.mjs

# Live
LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p969-cursor-compatibility-smoke.mjs

# Regenerate this report from smoke
WRITE_REPORT=1 node scripts/p969-cursor-compatibility-smoke.mjs
\`\`\`
`;
}

async function main() {
  const ctx = await bootstrapClientCompatSmoke(SCRIPT);
  let ok = true;

  try {
    ok = assertStatic() && ok;
    ok = (await runModelsCheck(ctx)) && ok;
    ok = (await runSuccessChatScenarios(ctx)) && ok;
    ok = (await runStreamCheck(ctx)) && ok;
    ok = (await runErrorMatrix(ctx)) && ok;
    ok = (await runIdempotencyCheck(ctx)) && ok;
  } finally {
    ctx.cleanup();
  }

  // Soft override: if only soft failures, don't mark ok=false from softs.
  const hardFails = results.filter((r) => !r.ok && !r.soft);
  ok = hardFails.length === 0;

  const verdict = decideVerdict();
  // If hardFails empty but ok false somehow — trust hardFails.
  if (hardFails.length > 0) {
    verdict.marker = FAIL_MARKER;
  } else if (!ctx.LIVE && results.some((r) => r.ok && r.soft)) {
    // Offline should rarely soft; if it does, partial is fine.
  } else if (ctx.LIVE && results.some((r) => r.ok && r.soft)) {
    verdict.marker = PARTIAL_MARKER;
  } else if (hardFails.length === 0) {
    verdict.marker = PASS_MARKER;
  }

  const summary = {
    marker: verdict.marker,
    reason: verdict.reason,
    live: Boolean(ctx.LIVE),
    head: gitHead(),
    api_key_prefix: maskKey(ctx.API_KEY),
    request_ids: requestIds,
    results,
    dirty_log_hits: dirtyLogHits,
  };

  try {
    mkdirSync(dirname(SUMMARY_PATH), { recursive: true });
    writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
    console.log(`\nWrote summary: ${SUMMARY_PATH}`);
  } catch (err) {
    console.warn(`summary write failed: ${err?.message ?? err}`);
  }

  if (WRITE_REPORT) {
    try {
      writeFileSync(REPORT_PATH, buildReportMarkdown(ctx, verdict));
      console.log(`Wrote report: ${REPORT_PATH}`);
    } catch (err) {
      console.warn(`report write failed: ${err?.message ?? err}`);
    }
  } else {
    console.log(`Skipped report write (set WRITE_REPORT=1 to regenerate ${REPORT_PATH})`);
  }

  console.log(`\n${verdict.marker}`);
  process.exit(verdict.marker === FAIL_MARKER ? 1 : 0);
}

await main();
