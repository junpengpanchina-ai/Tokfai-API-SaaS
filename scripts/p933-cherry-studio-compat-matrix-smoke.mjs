#!/usr/bin/env node
/**
 * P933 — Cherry Studio /v1/chat/completions compat matrix smoke.
 *
 * Covers malformed Cherry Studio bodies normalized before schema validation:
 *   1. messages:[]
 *   2. messages missing
 *   3. messages:null
 *   4. messages:"abc"
 *   5. content:null
 *   6. content:[]
 *   7. content text parts array
 *   8. developer role → system
 *   9. stream=true + empty messages
 *  10. stream=true + content array
 *  11. null optional fields
 *  12. normal messages unchanged / upstream success
 *
 * Default: offline mock. LIVE=1 may call https://api.tokfai.com.
 *
 * Usage: node scripts/p933-cherry-studio-compat-matrix-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";

const SCRIPT = "scripts/p933-cherry-studio-compat-matrix-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_TOKEN = "TOKFAI_P933_CHERRY_STUDIO_COMPAT_MATRIX_PASS";
const FAIL_TOKEN = "TOKFAI_P933_CHERRY_STUDIO_COMPAT_MATRIX_FAIL";
const NOOP_CONTENT = "请求内容为空，请重新输入。";

function assertNoopJson(res, body, label) {
  if (res.status !== 200) {
    return fail(label, `expected HTTP 200 got ${res.status}`);
  }
  if (
    body?.choices?.[0]?.message?.content !== NOOP_CONTENT ||
    body?.tokfai?.billing_status !== "not_billable" ||
    body?.tokfai?.rejectedReason !== "empty_messages" ||
    (typeof body?.credits_charged === "number" && body.credits_charged > 0)
  ) {
    return fail(
      label,
      JSON.stringify({
        content: body?.choices?.[0]?.message?.content,
        tokfai: body?.tokfai,
        credits_charged: body?.credits_charged,
      }).slice(0, 280)
    );
  }
  return pass(label);
}

function assertSseNoop(res, text, label) {
  const ct = res.headers.get("content-type") ?? "";
  if (
    res.status !== 200 ||
    !ct.includes("text/event-stream") ||
    !text.includes("chat.completion.chunk") ||
    !text.includes("data:") ||
    !/data:\s*\[DONE\]/.test(text) ||
    !text.includes(NOOP_CONTENT)
  ) {
    return fail(
      label,
      `HTTP ${res.status} ct=${ct} body=${text.slice(0, 280)}`
    );
  }
  return pass(label);
}

function assertSseOk(res, text, label) {
  const ct = res.headers.get("content-type") ?? "";
  if (
    res.status !== 200 ||
    !ct.includes("text/event-stream") ||
    !text.includes("chat.completion.chunk") ||
    !text.includes("data:") ||
    !/data:\s*\[DONE\]/.test(text)
  ) {
    return fail(
      label,
      `HTTP ${res.status} ct=${ct} body=${text.slice(0, 280)}`
    );
  }
  return pass(label);
}

async function postChat(ctx, body) {
  return acceptanceFetch(`${ctx.BASE}/v1/chat/completions`, {
    method: "POST",
    headers: ctx.authHeaders({
      "User-Agent": "CherryStudio/1.0 TokfaiP933CompatMatrixSmoke",
    }),
    body: JSON.stringify(body),
    timeoutMs: ctx.TIMEOUT_MS,
  });
}

function runCompatUnit() {
  const unit = join(ROOT, "scripts/lib/cherry-studio-chat-compat-unit.mjs");
  const result = spawnSync(process.execPath, [unit], {
    cwd: ROOT,
    encoding: "utf8",
    env: process.env,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result.status === 0;
}

console.log("=== P933 Cherry Studio compat matrix smoke ===\n");
const ctx = await bootstrapClientCompatSmoke(SCRIPT);
let ok = true;

try {
  if (!runCompatUnit()) {
    ok = fail("cherry chat compat unit", "unit failed") && ok;
  } else {
    ok = pass("cherry chat compat unit") && ok;
  }

  {
    const chatRoute = readFileSync(
      join(ROOT, "apps/dmit-api/src/routes/chat.ts"),
      "utf8"
    );
    const compat = readFileSync(
      join(ROOT, "apps/dmit-api/src/lib/chatCompletionCompat.ts"),
      "utf8"
    );
    const diag = readFileSync(
      join(ROOT, "apps/dmit-api/src/lib/chatCompletionDiagnostics.ts"),
      "utf8"
    );
    const logger = readFileSync(
      join(ROOT, "apps/dmit-api/src/logger.ts"),
      "utf8"
    );
    const staticOk =
      chatRoute.includes("normalizeClientChatCompletionBody") &&
      chatRoute.includes("logChatCompletionEmptyMessagesNoop") &&
      compat.includes("normalizeClientChatCompletionBody") &&
      compat.includes("normalizeChatMessageRole") &&
      compat.includes("CHAT_NULLABLE_OPTIONAL_KEYS") &&
      diag.includes("normalized") &&
      diag.includes("noop") &&
      diag.includes("rejectedReason") &&
      logger.includes('"normalized"') &&
      logger.includes('"noop"');
    if (!staticOk) {
      ok =
        fail(
          "static P933 pre-schema normalize hooks",
          "missing normalize/role/null/log fields"
        ) && ok;
    } else {
      ok = pass("static P933 pre-schema normalize hooks") && ok;
    }
  }

  // 1. messages:[]
  {
    const { res, body } = await postChat(ctx, {
      model: "gpt-5.5",
      stream: false,
      messages: [],
    });
    ok = assertNoopJson(res, body, "1. messages:[] → 200 noop") && ok;
  }

  // 2. messages missing
  {
    const { res, body } = await postChat(ctx, {
      model: "gpt-5.5",
      stream: false,
    });
    ok = assertNoopJson(res, body, "2. messages missing → 200 noop") && ok;
  }

  // 3. messages:null
  {
    const { res, body } = await postChat(ctx, {
      model: "gpt-5.5",
      stream: false,
      messages: null,
    });
    ok = assertNoopJson(res, body, "3. messages:null → 200 noop") && ok;
  }

  // 4. messages:"abc"
  {
    const { res, body } = await postChat(ctx, {
      model: "gpt-5.5",
      stream: false,
      messages: "abc",
    });
    ok = assertNoopJson(res, body, "4. messages:string → 200 noop") && ok;
  }

  // 5. content:null
  {
    const { res, body } = await postChat(ctx, {
      model: "gpt-5.5",
      stream: false,
      messages: [{ role: "user", content: null }],
    });
    ok =
      assertNoopJson(res, body, "5. content:null → 200 empty noop") && ok;
  }

  // 6. content:[]
  {
    const { res, body } = await postChat(ctx, {
      model: "gpt-5.5",
      stream: false,
      messages: [{ role: "user", content: [] }],
    });
    ok = assertNoopJson(res, body, "6. content:[] → 200 empty noop") && ok;
  }

  // 7. content text parts array
  {
    const { res, body } = await postChat(ctx, {
      model: "gpt-5.5",
      stream: false,
      messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    });
    if (res.status !== 200) {
      ok =
        fail(
          "7. content text parts",
          `HTTP ${res.status} code=${body?.error?.code} message=${body?.error?.message}`
        ) && ok;
    } else if (body?.tokfai?.billing_status === "not_billable") {
      ok =
        fail("7. content text parts must not noop", JSON.stringify(body?.tokfai)) &&
        ok;
    } else if (
      typeof body?.choices?.[0]?.message?.content !== "string" ||
      !body.choices[0].message.content.trim()
    ) {
      ok =
        fail(
          "7. content text parts assistant content",
          JSON.stringify(body?.choices?.[0]?.message)
        ) && ok;
    } else {
      ok = pass("7. content text parts → upstream success") && ok;
    }
  }

  // 8. developer role
  {
    const { res, body } = await postChat(ctx, {
      model: "gpt-5.5",
      stream: false,
      messages: [
        { role: "developer", content: "你是助手" },
        { role: "user", content: "hi" },
      ],
    });
    if (res.status !== 200) {
      ok =
        fail(
          "8. developer role",
          `HTTP ${res.status} code=${body?.error?.code} message=${body?.error?.message}`
        ) && ok;
    } else if (body?.tokfai?.rejectedReason === "empty_messages") {
      ok = fail("8. developer role must not noop", "noop") && ok;
    } else {
      ok = pass("8. developer role → upstream success") && ok;
    }
  }

  // 9. stream=true + empty messages
  {
    const { res, text } = await postChat(ctx, {
      model: "gpt-5.5",
      stream: true,
      messages: [],
    });
    ok =
      assertSseNoop(res, text ?? "", "9. stream empty messages → SSE noop") &&
      ok;
  }

  // 10. stream=true + content array
  {
    const { res, text, body } = await postChat(ctx, {
      model: "gpt-5.5",
      stream: true,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: "Return exactly: TOKFAI_CHERRY_OK" }],
        },
      ],
    });
    const raw = text ?? "";
    if (raw.includes(NOOP_CONTENT)) {
      ok =
        fail("10. stream content array must not noop", raw.slice(0, 200)) && ok;
    } else {
      ok =
        assertSseOk(res, raw, "10. stream content array → SSE success") && ok;
      if (res.status !== 200) {
        ok =
          fail(
            "10. stream content array HTTP",
            `code=${body?.error?.code} message=${body?.error?.message}`
          ) && ok;
      }
    }
  }

  // 11. null optional fields
  {
    const { res, body } = await postChat(ctx, {
      model: "gpt-5.5",
      stream: false,
      messages: [{ role: "user", content: "hi" }],
      temperature: null,
      top_p: null,
      presence_penalty: null,
      frequency_penalty: null,
      max_tokens: null,
      max_completion_tokens: null,
      tools: null,
      tool_choice: null,
      response_format: null,
      stream_options: null,
    });
    if (res.status !== 200) {
      ok =
        fail(
          "11. null optional fields",
          `HTTP ${res.status} code=${body?.error?.code} message=${body?.error?.message}`
        ) && ok;
    } else if (body?.tokfai?.rejectedReason === "empty_messages") {
      ok = fail("11. null optionals must not noop", "noop") && ok;
    } else {
      ok = pass("11. null optional fields → upstream success") && ok;
    }
  }

  // 12. normal messages not corrupted
  {
    const { res, body } = await postChat(ctx, {
      model: "gpt-5.5",
      stream: false,
      messages: [{ role: "user", content: "hello world" }],
      temperature: 0.7,
      max_tokens: 32,
    });
    if (res.status !== 200) {
      ok =
        fail(
          "12. normal messages",
          `HTTP ${res.status} code=${body?.error?.code} message=${body?.error?.message}`
        ) && ok;
    } else if (
      body?.tokfai?.billing_status === "not_billable" &&
      body?.tokfai?.rejectedReason === "empty_messages"
    ) {
      ok = fail("12. normal messages must not noop", "noop") && ok;
    } else if (
      typeof body?.choices?.[0]?.message?.content !== "string" ||
      !body.choices[0].message.content.trim()
    ) {
      ok =
        fail(
          "12. normal messages assistant content",
          JSON.stringify(body?.choices?.[0]?.message)
        ) && ok;
    } else {
      ok = pass("12. normal messages → upstream success") && ok;
    }
  }
} finally {
  ctx.cleanup();
}

console.log(ok ? `\n${PASS_TOKEN}` : `\n${FAIL_TOKEN}`);
process.exit(ok ? 0 : 1);
