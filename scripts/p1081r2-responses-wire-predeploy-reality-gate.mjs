#!/usr/bin/env node
/**
 * P1081R2 — Responses wire predeploy reality gate.
 *
 * Imports REAL production dist modules (no copied production logic) and:
 * - parses full SSE event/data pairs
 * - strict-validates response.completed like a Codex/Rust client
 * - checks non-stream transform total_tokens
 * - proves response.failed stays failed + [DONE]
 *
 * Usage:
 *   node scripts/p1081r2-responses-wire-predeploy-reality-gate.mjs
 *
 * Marker: TOKFAI_P1081R2_RESPONSES_WIRE_PREDEPLOY_REALITY_GATE_PASS
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS = "TOKFAI_P1081R2_WIRE_CHECKS_PASS";
const FAIL = "TOKFAI_P1081R2_WIRE_CHECKS_FAIL";
// Official TOKFAI_P1081R2_RESPONSES_WIRE_PREDEPLOY_REALITY_GATE_PASS is
// reserved for the outer report when FINAL_VERDICT=A after full regressions.

const ALLOWED = new Set([
  "apps/dmit-api/src/lib/responsesUsage.ts",
  "apps/dmit-api/src/lib/responsesSse.ts",
  "apps/dmit-api/src/lib/respondEarlySse.ts",
  "apps/dmit-api/src/lib/responsesTransform.ts",
  "scripts/p1081-responses-completed-usage-total-tokens-hotfix.mjs",
  // This gate script itself is allowed when present as untracked.
  "scripts/p1081r2-responses-wire-predeploy-reality-gate.mjs",
]);

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_JWT_SECRET ??= "xxxxxxxxxxxxxxxxxxxx";
process.env.TOKEN_PEPPER ??= "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.GRSAI_API_KEY ??= "test-key";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test";

const flags = {
  GIT_SCOPE_CLEAN: "NO",
  RESPONSE_COMPLETED_TOTAL_TOKENS_PRESENT: "NO",
  REAL_SSE_RESPONSE_COMPLETED_PARSE: "FAIL",
  REAL_SSE_TOTAL_TOKENS_PRESENT: "NO",
  REAL_SSE_DONE_PRESENT: "NO",
  STRICT_RESPONSE_COMPLETED_SCHEMA: "FAIL",
  NONSTREAM_RESPONSE_TOTAL_TOKENS_PRESENT: "NO",
  RESPONSE_FAILED_UNCHANGED: "NO",
  P1080_FAILED_DONE_UNCHANGED: "NO",
  BILLING_CHANGED: "NO",
  ROUTING_CHANGED: "NO",
  CHAT_CHANGED: "NO",
  CURSOR_AGENT_CHANGED: "NO",
  GRSAI_REQUEST_BODY_CHANGED: "NO",
  GIT_DIFF_CHECK: "FAIL",
  WIRE_REALITY: "FAIL",
};

function pass(label) {
  console.log(`PASS  ${label}`);
  return true;
}

function fail(label, detail) {
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
  return false;
}

function printFlags() {
  for (const [k, v] of Object.entries(flags)) {
    console.log(`${k}=${v}`);
  }
}

/** Full SSE parser: event/data pairs; JSON.parse every object data. */
function parseFullSse(sseText) {
  const blocks = sseText.split("\n\n").filter((b) => b.trim());
  const rows = [];
  for (const block of blocks) {
    let event = null;
    let dataRaw = null;
    let data = null;
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) {
        dataRaw = line.startsWith("data: ")
          ? line.slice(6)
          : line.slice(5).trimStart();
      }
    }
    if (dataRaw === "[DONE]") {
      data = "[DONE]";
    } else if (dataRaw && dataRaw[0] === "{") {
      data = JSON.parse(dataRaw); // throw on invalid JSON
    } else {
      data = dataRaw;
    }
    rows.push({ event, data, dataRaw, block });
  }
  return rows;
}

/**
 * Minimal Codex/Rust-strict ResponseCompleted schema check.
 * Rejects missing/null/string total_tokens.
 */
function assertStrictResponseCompleted(payload, expectedText) {
  if (!payload || typeof payload !== "object") {
    throw new Error("payload not object");
  }
  if (payload.type !== "response.completed") {
    throw new Error(`type=${payload.type}`);
  }
  const response = payload.response;
  if (!response || typeof response !== "object") {
    throw new Error("response missing");
  }
  if (typeof response.id !== "string" || !response.id) {
    throw new Error("response.id must be non-empty string");
  }
  if (!("object" in response) || response.object == null) {
    throw new Error("response.object missing");
  }
  if (typeof response.created_at !== "number" || !Number.isFinite(response.created_at)) {
    throw new Error("response.created_at must be number");
  }
  if (response.status !== "completed") {
    throw new Error(`status=${response.status}`);
  }
  if (expectedText?.model != null && response.model !== expectedText.model) {
    throw new Error(`model mismatch ${response.model}`);
  }
  if (response.model != null && typeof response.model !== "string") {
    throw new Error("response.model must be string when present");
  }
  const usage = response.usage;
  if (!usage || typeof usage !== "object") {
    throw new Error("usage missing");
  }
  for (const key of ["input_tokens", "output_tokens", "total_tokens"]) {
    const v = usage[key];
    if (typeof v !== "number" || !Number.isFinite(v)) {
      throw new Error(`usage.${key} must be finite number, got ${JSON.stringify(v)}`);
    }
  }
  if (usage.total_tokens === null || typeof usage.total_tokens === "string") {
    throw new Error("total_tokens null/string forbidden");
  }
  // Output text / content must not be destroyed.
  if (expectedText?.outputText != null) {
    const ot = response.output_text;
    if (typeof ot === "string" && ot !== expectedText.outputText) {
      // Allow space padding only when original empty — require substring match
      if (!ot.includes(expectedText.outputText) && expectedText.outputText !== " ") {
        throw new Error(`output_text destroyed: ${JSON.stringify(ot)}`);
      }
    }
    if (Array.isArray(response.output)) {
      const texts = [];
      for (const item of response.output) {
        if (!item || typeof item !== "object") continue;
        const content = Array.isArray(item.content) ? item.content : [];
        for (const part of content) {
          if (part && typeof part === "object" && typeof part.text === "string") {
            texts.push(part.text);
          }
        }
      }
      const joined = texts.join("");
      if (
        expectedText.outputText &&
        !joined.includes(expectedText.outputText) &&
        ot !== expectedText.outputText
      ) {
        throw new Error(`output content destroyed: ${JSON.stringify(joined)}`);
      }
    }
  }
  return true;
}

let ok = true;

// ── 1. Git scope ──────────────────────────────────────────────────────────
{
  const tracked = execSync("git diff --name-only HEAD", {
    cwd: ROOT,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  const untracked = execSync("git ls-files --others --exclude-standard", {
    cwd: ROOT,
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean);
  const files = [...new Set([...tracked, ...untracked])];

  const unrelated = files.filter((f) => !ALLOWED.has(f));

  if (unrelated.length > 0) {
    ok = fail("git scope clean", `unrelated: ${unrelated.join(", ")}`) && ok;
    flags.GIT_SCOPE_CLEAN = "NO";
    printFlags();
    console.error(FAIL);
    process.exit(1);
  }

  try {
    execSync("git diff --check", { cwd: ROOT, stdio: "pipe" });
    flags.GIT_DIFF_CHECK = "PASS";
  } catch {
    ok = fail("git diff --check") && ok;
    flags.GIT_DIFF_CHECK = "FAIL";
    printFlags();
    console.error(FAIL);
    process.exit(1);
  }

  flags.GIT_SCOPE_CLEAN = "YES";
  ok = pass(`git scope clean (${files.length} files)`) && ok;
}

// ── 2. Static schema audit (source) ───────────────────────────────────────
{
  const usageSrc = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/responsesUsage.ts"),
    "utf8"
  );
  const sseSrc = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/responsesSse.ts"),
    "utf8"
  );
  const earlySrc = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/respondEarlySse.ts"),
    "utf8"
  );
  const transformSrc = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/responsesTransform.ts"),
    "utf8"
  );

  ok =
    (usageSrc.includes("total_tokens") &&
    usageSrc.includes("input_tokens_details") &&
    usageSrc.includes("output_tokens_details") &&
    !usageSrc.includes("debit_credits")
      ? pass
      : fail)("static: normalizer fills total_tokens + preserves details") && ok;

  ok =
    (sseSrc.includes("normalizeResponsesUsage") &&
    sseSrc.includes("responsesFailedSseBody") &&
    /responsesFailedSseBody[\s\S]*response\.failed[\s\S]*\[DONE\]/.test(sseSrc)
      ? pass
      : fail)("static: failed helper keeps response.failed + [DONE]") && ok;

  ok =
    (earlySrc.includes("nextResponse.usage = normalizeResponsesUsage") &&
    earlySrc.includes('eventName === "response.failed"') &&
    earlySrc.includes("failureToResponsesSseEnvelope")
      ? pass
      : fail)("static: early SSE normalizes usage; does not upgrade failed") &&
    ok;

  ok =
    (transformSrc.includes("normalizeResponsesUsage") ? pass : fail)(
      "static: non-stream transform uses normalizer"
    ) && ok;

  // No raw JSON 429 terminal for responses stream failures.
  ok =
    (earlySrc.includes("responsesFailedSseBody") &&
    !/writeFailure[\s\S]{0,200}JSON\.stringify\(\s*\{\s*error/.test(earlySrc)
      ? pass
      : fail)("static: responses stream failure uses SSE terminal not raw 429 JSON") &&
    ok;
}

const distUsage = join(ROOT, "apps/dmit-api/dist/lib/responsesUsage.js");
const distSse = join(ROOT, "apps/dmit-api/dist/lib/responsesSse.js");
const distRespond = join(ROOT, "apps/dmit-api/dist/lib/respondEarlySse.js");
const distTransform = join(ROOT, "apps/dmit-api/dist/lib/responsesTransform.js");

  if (
  !existsSync(distUsage) ||
  !existsSync(distSse) ||
  !existsSync(distRespond) ||
  !existsSync(distTransform)
) {
  ok = fail("dist present — run npm run build first") && ok;
  printFlags();
  console.error(FAIL);
  process.exit(1);
}

const { normalizeResponsesUsage } = await import(pathToFileURL(distUsage).href);
const {
  responsesToSseBody,
  responsesSseBodyAfterCreated,
  responsesFailedSseBody,
} = await import(pathToFileURL(distSse).href);
const { sanitizeResponsesCompletedForCherry } = await import(
  pathToFileURL(distRespond).href
);
const { chatCompletionResponseToResponses } = await import(
  pathToFileURL(distTransform).href
);

// ── 3. Real local SSE parser test ─────────────────────────────────────────
{
  const completedResponse = {
    id: "resp_p1081r2_wire",
    object: "response",
    created_at: 1_700_000_100,
    status: "completed",
    model: "gpt-5.4",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text: "hello wire gate" }],
      },
    ],
    output_text: "hello wire gate",
    // Missing total_tokens — the customer bug shape.
    usage: {
      input_tokens: 11,
      output_tokens: 4,
      input_tokens_details: { cached_tokens: 2 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  };

  // Mirror production early-SSE rest path.
  const rawRest = responsesSseBodyAfterCreated(completedResponse, {
    skipCreated: true,
  });
  const sse = sanitizeResponsesCompletedForCherry(rawRest);

  let rows;
  try {
    rows = parseFullSse(sse);
    ok = pass("real SSE: every data JSON.parse / [DONE] ok") && ok;
  } catch (err) {
    ok = fail("real SSE parse", String(err)) && ok;
    rows = [];
  }

  const completed = rows.find(
    (r) =>
      r.event === "response.completed" ||
      (r.data &&
        typeof r.data === "object" &&
        r.data.type === "response.completed")
  );
  const done = rows.some(
    (r) => r.data === "[DONE]" || r.dataRaw === "[DONE]"
  );

  if (!completed?.data?.response) {
    ok = fail("real SSE: response.completed found") && ok;
  } else {
    const usage = completed.data.response.usage;
    const status = completed.data.response.status;
    const detailsOk =
      usage?.input_tokens_details?.cached_tokens === 2 &&
      usage?.output_tokens_details?.reasoning_tokens === 0;

    const numbersOk =
      typeof usage?.input_tokens === "number" &&
      typeof usage?.output_tokens === "number" &&
      typeof usage?.total_tokens === "number" &&
      usage.total_tokens === 15 &&
      usage.input_tokens === 11 &&
      usage.output_tokens === 4;

    if (status === "completed" && numbersOk && detailsOk) {
      flags.RESPONSE_COMPLETED_TOTAL_TOKENS_PRESENT = "YES";
      flags.REAL_SSE_TOTAL_TOKENS_PRESENT = "YES";
      flags.REAL_SSE_RESPONSE_COMPLETED_PARSE = "PASS";
      ok =
        pass(
          "real SSE: completed usage numbers + details preserved (total=15)"
        ) && ok;
    } else {
      ok =
        fail(
          "real SSE completed usage/status/details",
          JSON.stringify({ status, usage })
        ) && ok;
    }

    try {
      assertStrictResponseCompleted(completed.data, {
        model: "gpt-5.4",
        outputText: "hello wire gate",
      });
      flags.STRICT_RESPONSE_COMPLETED_SCHEMA = "PASS";
      ok = pass("strict Codex schema: response.completed") && ok;
    } catch (err) {
      flags.STRICT_RESPONSE_COMPLETED_SCHEMA = "FAIL";
      ok = fail("strict Codex schema", String(err)) && ok;
    }
  }

  if (done) {
    flags.REAL_SSE_DONE_PRESENT = "YES";
    ok = pass("real SSE: data: [DONE] present") && ok;
  } else {
    ok = fail("real SSE: data: [DONE] present") && ok;
  }

  // Full body path + fuzz variants (null usage, string total forbidden after normalize).
  const full = responsesToSseBody({
    ...completedResponse,
    usage: null,
  });
  const fullRows = parseFullSse(sanitizeResponsesCompletedForCherry(full));
  const fullCompleted = fullRows.find(
    (r) => r.event === "response.completed"
  );
  try {
    assertStrictResponseCompleted(fullCompleted.data, {
      model: "gpt-5.4",
      outputText: "hello wire gate",
    });
    ok = pass("strict schema: null usage still has finite total_tokens") && ok;
  } catch (err) {
    flags.STRICT_RESPONSE_COMPLETED_SCHEMA = "FAIL";
    ok = fail("strict schema null usage", String(err)) && ok;
  }

  // Fuzz: reject pre-normalize missing total would have failed; after wire, PASS.
  const fuzzBad = {
    type: "response.completed",
    response: {
      id: "resp_bad",
      object: "response",
      created_at: 1,
      status: "completed",
      model: "x",
      usage: { input_tokens: 1, output_tokens: 1 }, // missing total
    },
  };
  let fuzzRejected = false;
  try {
    assertStrictResponseCompleted(fuzzBad);
  } catch {
    fuzzRejected = true;
  }
  ok =
    (fuzzRejected ? pass : fail)(
      "strict fuzz: missing total_tokens rejected by client schema"
    ) && ok;

  const fuzzNormalized = {
    type: "response.completed",
    response: {
      id: "resp_ok",
      object: "response",
      created_at: 1,
      status: "completed",
      model: "x",
      usage: normalizeResponsesUsage({ input_tokens: 1, output_tokens: 1 }),
    },
  };
  try {
    assertStrictResponseCompleted(fuzzNormalized);
    ok = pass("strict fuzz: normalized usage accepted") && ok;
  } catch (err) {
    ok = fail("strict fuzz normalized", String(err)) && ok;
  }
}

// ── 4. Non-stream transform ───────────────────────────────────────────────
{
  const chatLike = {
    id: "chatcmpl_p1081r2",
    object: "chat.completion",
    created: 1_700_000_200,
    model: "gpt-5.4",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "nonstream hi" },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 7, completion_tokens: 5 },
    credits_charged: 9,
    request_id: "req_p1081r2",
    tokfai: {
      request_id: "req_p1081r2",
      credits_charged: 9,
      billing_status: "charged",
    },
  };
  const shaped = chatCompletionResponseToResponses(chatLike, "req_p1081r2");
  const nonstreamOk =
    shaped.status === "completed" &&
    typeof shaped.usage?.total_tokens === "number" &&
    shaped.usage.total_tokens === 12 &&
    shaped.credits_charged === 9;

  if (nonstreamOk) {
    flags.NONSTREAM_RESPONSE_TOTAL_TOKENS_PRESENT = "YES";
    ok =
      pass("non-stream: total_tokens present; status completed; credits unchanged") &&
      ok;
  } else {
    ok = fail("non-stream transform", JSON.stringify(shaped.usage)) && ok;
  }

  // incomplete semantics: length finish → incomplete, not completed/failed mix.
  const lengthChat = {
    ...chatLike,
    id: "chatcmpl_len",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: "cut" },
        finish_reason: "length",
      },
    ],
  };
  const incomplete = chatCompletionResponseToResponses(lengthChat, "req_len");
  ok =
    (incomplete.status === "incomplete" &&
    incomplete.status !== "failed" &&
    incomplete.status !== "completed" &&
    typeof incomplete.usage?.total_tokens === "number"
      ? pass
      : fail)(
      "non-stream: incomplete semantics preserved + usage.total_tokens",
      JSON.stringify({
        status: incomplete.status,
        usage: incomplete.usage,
      })
    ) && ok;
}

// ── 5. Failure path ───────────────────────────────────────────────────────
{
  const failedSse = [
    "event: response.failed",
    `data: ${JSON.stringify({
      type: "response.failed",
      response: { id: "resp_fail", status: "failed" },
    })}`,
    "",
  ].join("\n");
  const failedOut = sanitizeResponsesCompletedForCherry(failedSse);
  const failedUnchanged =
    failedOut === failedSse &&
    failedOut.includes("response.failed") &&
    !failedOut.includes("response.completed");

  const p1080 = responsesFailedSseBody({
    requestId: "resp_p1081r2_fail",
    message: "queue full",
    code: "server_busy",
  });
  const p1080Ok =
    p1080.includes("event: response.failed") &&
    p1080.includes("data: [DONE]") &&
    !p1080.includes("response.completed") &&
    !/"status"\s*:\s*"completed"/.test(p1080);

  // Failed body must not require total_tokens / must stay failed.
  const failedRows = parseFullSse(p1080);
  const failedEv = failedRows.find((r) => r.event === "response.failed");
  const failedStatusOk = failedEv?.data?.response?.status === "failed";
  const failedNoTotalReq =
    failedEv?.data?.response &&
    !Object.prototype.hasOwnProperty.call(
      failedEv.data.response,
      "usage"
    );

  if (failedUnchanged) {
    flags.RESPONSE_FAILED_UNCHANGED = "YES";
    ok = pass("response.failed unchanged by sanitizer") && ok;
  } else {
    ok = fail("response.failed unchanged") && ok;
  }

  if (p1080Ok && failedStatusOk && failedNoTotalReq) {
    flags.P1080_FAILED_DONE_UNCHANGED = "YES";
    ok =
      pass(
        "P1080 response.failed + [DONE] unchanged (no total_tokens required)"
      ) && ok;
  } else {
    ok = fail("P1080 failed+[DONE]", p1080.slice(0, 200)) && ok;
  }
}

if (!ok) {
  flags.WIRE_REALITY = "FAIL";
  printFlags();
  console.error(FAIL);
  process.exit(1);
}

flags.WIRE_REALITY = "PASS";
printFlags();
console.log(`REAL_SSE_RESPONSE_COMPLETED_PARSE=${flags.REAL_SSE_RESPONSE_COMPLETED_PARSE}`);
console.log(`REAL_SSE_TOTAL_TOKENS_PRESENT=${flags.REAL_SSE_TOTAL_TOKENS_PRESENT}`);
console.log(`REAL_SSE_DONE_PRESENT=${flags.REAL_SSE_DONE_PRESENT}`);
console.log(PASS);
process.exit(0);
