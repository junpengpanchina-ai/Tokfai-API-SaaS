#!/usr/bin/env node
/**
 * Offline smoke — /v1/responses non-stream envelope + transform + acceptance payload.
 *
 * Usage: node scripts/responses-nonstream-envelope-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

function pass(label) {
  console.log(`PASS  ${label}`);
  return true;
}

function fail(label, detail) {
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
  return false;
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

let ok = true;

{
  const route = read("apps/dmit-api/src/routes/responses.ts");
  const transform = read("apps/dmit-api/src/lib/responsesTransform.ts");
  const failHandlerTs = read(
    "apps/dmit-api/src/lib/handleExecuteChatCompletionResult.ts"
  );
  const acceptance = read("scripts/public-beta-live-acceptance.mjs");
  const errors = read("apps/dmit-api/src/errors.ts");

  const checks = [
    [
      "route supports string input via ResponsesRequestSchema",
      route.includes("ResponsesRequestSchema") &&
        transform.includes("z.string()"),
    ],
    [
      "route rejects messages-without-input",
      route.includes("not `messages`"),
    ],
    [
      "non-stream returns object response",
      route.includes('object !== "response"') ||
        transform.includes('object: "response"'),
    ],
    [
      "transform builds output_text",
      transform.includes("output_text: outputText"),
    ],
    [
      "transform builds credits_charged + tokfai",
      transform.includes("credits_charged") &&
        transform.includes("requested_model") &&
        transform.includes("resolved_model"),
    ],
    [
      "failure handler uses buildClientErrorBody",
      failHandlerTs.includes("buildClientErrorBody"),
    ],
    [
      "failure handler never omits request_id path",
      failHandlerTs.includes("requestId") &&
        failHandlerTs.includes("invalid_request_error"),
    ],
    [
      "ApiError.badRequest defaults invalid_request_error",
      errors.includes('code = "invalid_request_error"') &&
        errors.includes('"invalid_request_error"'),
    ],
    [
      "acceptance responses payload uses input string",
      /async function probeResponses\(model\) \{[\s\S]*?input: PROMPT[\s\S]*?stream: false/.test(
        acceptance
      ),
    ],
    [
      "acceptance does not send max_tokens on responses probe",
      (() => {
        const start = acceptance.indexOf("async function probeResponses(model)");
        const end = acceptance.indexOf(
          "async function probeResponsesStream",
          start
        );
        const block = acceptance.slice(start, end > 0 ? end : undefined);
        return !/\bmax_tokens\b/.test(block);
      })(),
    ],
    [
      "acceptance responses probe does not send messages",
      (() => {
        const start = acceptance.indexOf("async function probeResponses(model)");
        const end = acceptance.indexOf(
          "async function probeResponsesStream",
          start
        );
        const block = acceptance.slice(start, end > 0 ? end : undefined);
        return !/\bmessages\s*:/.test(block);
      })(),
    ],
    [
      "acceptance gemini only responses by default",
      acceptance.includes('"gemini-2.5-flash": ["responses"]'),
    ],
    [
      "acceptance gpt-5.5 full chat+responses+stream",
      acceptance.includes(
        '"gpt-5.5": ["chat", "chat_stream", "responses", "responses_stream"]'
      ),
    ],
  ];

  for (const [label, good] of checks) {
    if (good) pass(label);
    else {
      ok = fail(label) && ok;
    }
  }
}

// Runtime: transform string input → chat messages
{
  try {
    // Prefer built dist if present; else skip runtime (static checks above still run).
    const distPath = join(
      ROOT,
      "apps/dmit-api/dist/lib/responsesTransform.js"
    );
    let mod;
    try {
      mod = require(distPath);
    } catch {
      mod = null;
    }
    if (!mod) {
      pass("runtime transform skipped (dist not built yet — static OK)");
    } else {
      const messages = mod.responsesInputToMessages(
        "Say OK in one short sentence."
      );
      if (
        Array.isArray(messages) &&
        messages[0]?.role === "user" &&
        messages[0]?.content === "Say OK in one short sentence."
      ) {
        pass("runtime string input → user message");
      } else {
        ok = fail("runtime string input → user message", JSON.stringify(messages)) && ok;
      }

      const chatBody = mod.responsesBodyToChatBody({
        model: "gpt-5.5",
        input: "Say OK in one short sentence.",
        stream: false,
      });
      if (chatBody.messages?.[0]?.content && !("input" in chatBody)) {
        pass("runtime responsesBodyToChatBody strips input");
      } else {
        ok = fail("runtime responsesBodyToChatBody", JSON.stringify(chatBody)) && ok;
      }

      const shaped = mod.chatCompletionResponseToResponses(
        {
          model: "gpt-5.5",
          created: 1,
          choices: [{ message: { content: "OK." } }],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          credits_charged: 0.01,
          request_id: "req_test",
          tokfai: {
            request_id: "req_test",
            credits_charged: 0.01,
            requested_model: "gpt-5.5",
            resolved_model: "gpt-5.5",
          },
        },
        "req_test"
      );
      if (
        shaped.object === "response" &&
        shaped.status === "completed" &&
        shaped.output_text === "OK." &&
        shaped.credits_charged === 0.01 &&
        shaped.tokfai?.requested_model === "gpt-5.5"
      ) {
        pass("runtime chat→responses success envelope");
      } else {
        ok = fail("runtime chat→responses", JSON.stringify(shaped)) && ok;
      }
    }
  } catch (err) {
    ok =
      fail(
        "runtime transform",
        err instanceof Error ? err.message : String(err)
      ) && ok;
  }
}

// Helpers: standard envelope must reject empties and accept valid
{
  const helpers = await import("./lib/public-beta-live-helpers.mjs");
  const empty = helpers.assertStandardErrorEnvelope({}, { status: 400, headers: { get: () => null } }, "");
  if (!empty.ok) pass("helper rejects empty error body");
  else ok = fail("helper rejects empty error body") && ok;

  const good = helpers.assertStandardErrorEnvelope(
    {
      error: {
        message: "Invalid responses request.",
        type: "invalid_request_error",
        code: "invalid_request_error",
        request_id: "req_abc",
      },
      request_id: "req_abc",
    },
    { status: 400, headers: { get: () => "req_abc" } },
    ""
  );
  if (good.ok && good.summary.code === "invalid_request_error") {
    pass("helper accepts standard 400 envelope");
  } else {
    ok = fail("helper accepts standard 400 envelope", JSON.stringify(good)) && ok;
  }
}

if (!ok) {
  console.error("\nresponses-nonstream-envelope-smoke: FAILED");
  process.exit(1);
}
console.log("\nresponses-nonstream-envelope-smoke: OK");
