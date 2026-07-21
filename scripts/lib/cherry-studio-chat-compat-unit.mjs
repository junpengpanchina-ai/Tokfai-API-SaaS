#!/usr/bin/env node
/**
 * Pure unit checks for Cherry Studio chat compat helpers.
 * Runs via tsx against apps/dmit-api source (no network, no env).
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const DMIT = join(ROOT, "apps/dmit-api");

const source = `
import {
  normalizeChatMessageContent,
  normalizeChatMessages,
  shouldStripGptSamplingParams,
  sanitizeUpstreamChatBody,
  coerceOptionalNumber,
} from "./src/lib/chatCompletionCompat.ts";
import {
  ApiError,
  buildClientErrorBody,
  sanitizePublicErrorMessage,
} from "./src/errors.ts";

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL  " + msg);
    process.exit(1);
  }
  console.log("PASS  " + msg);
}

assert(sanitizePublicErrorMessage(undefined) === "Invalid request.", "sanitize undefined");
assert(sanitizePublicErrorMessage("undefined") === "Invalid request.", "sanitize literal undefined");
assert(sanitizePublicErrorMessage("  ") === "Invalid request.", "sanitize blank");
assert(sanitizePublicErrorMessage("bad msgs") === "bad msgs", "sanitize keeps text");

const badReq = ApiError.badRequest("undefined", "invalid_request_error");
const envelope = buildClientErrorBody(badReq, "req_test_400");
assert(envelope.error.message === "Invalid request.", "badRequest undefined → safe message");
assert(envelope.error.code === "invalid_request_error", "badRequest code");
assert(envelope.error.type === "invalid_request_error", "badRequest type");
assert(envelope.request_id === "req_test_400", "top-level request_id");
assert(envelope.error.request_id === "req_test_400", "error.request_id");
assert(JSON.stringify(envelope).includes('"message"'), "envelope serializes message");


assert(normalizeChatMessageContent("hi") === "hi", "content string");
assert(
  normalizeChatMessageContent([{ type: "text", text: "hello" }]) === "hello",
  "content text parts array"
);
assert(normalizeChatMessageContent(null) === "", "content null → empty");
assert(normalizeChatMessageContent(undefined) === "", "content undefined → empty");

const msgs = normalizeChatMessages([
  { role: "system", content: "You are helpful." },
  { role: "user", content: [{ type: "text", text: "Say ok" }] },
  { role: "assistant", content: null },
]);
assert(msgs.ok === true, "normalizeChatMessages ok");
assert(msgs.messages[1].content === "Say ok", "array content flattened");
assert(msgs.messages[2].content === "", "null content → empty string");

const bad = normalizeChatMessages([]);
assert(bad.ok === false, "empty messages rejected");

assert(shouldStripGptSamplingParams("gpt-5.5") === true, "strip gpt-5.5");
assert(shouldStripGptSamplingParams("gpt-5.4-pro") === true, "strip gpt-5.4-pro");
assert(shouldStripGptSamplingParams("gpt-5-pro") === true, "strip gpt-5-pro");
assert(shouldStripGptSamplingParams("gpt-5") === true, "strip gpt-5");
assert(shouldStripGptSamplingParams("gemini-3-pro") === false, "keep gemini sampling");
assert(shouldStripGptSamplingParams("gemini-2.5-flash") === false, "keep gemini flash sampling");

assert(coerceOptionalNumber(null) === undefined, "null number → undefined");
assert(coerceOptionalNumber(0.7) === 0.7, "finite number kept");

// Real Cherry stream-shaped sanitize (null tool_choice / empty tools)
const cherryReal = sanitizeUpstreamChatBody(
  {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "Return exactly: TOKFAI_CHERRY_OK" }],
      },
    ],
    temperature: null,
    top_p: null,
    tools: [],
    tool_choice: null,
    response_format: null,
    stream_options: { include_usage: true },
    max_tokens: 64,
    max_completion_tokens: 64,
  },
  "gpt-5.4"
);
assert(cherryReal.ok === true, "cherry real sanitize ok");
assert(cherryReal.upstream.tool_choice === undefined, "null tool_choice stripped");
assert(cherryReal.upstream.tools === undefined, "empty tools stripped");
assert(cherryReal.upstream.response_format === undefined, "null response_format stripped");
assert(
  cherryReal.upstream.messages[0].content === "Return exactly: TOKFAI_CHERRY_OK",
  "cherry text parts flattened"
);

const gpt = sanitizeUpstreamChatBody(
  {
    messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
    temperature: 0.7,
    top_p: 0.9,
    tools: [],
    stream_options: { include_usage: true },
    enable_thinking: true,
    provider_options: { x: 1 },
    extra_body: { y: 2 },
    metadata: { z: 3 },
    response_format: { type: "text" },
  },
  "gpt-5.5"
);
assert(gpt.ok === true, "sanitize gpt ok");
assert(gpt.upstream.temperature === undefined, "gpt temperature stripped");
assert(gpt.upstream.top_p === undefined, "gpt top_p stripped");
assert(gpt.upstream.tools === undefined, "empty tools not forwarded");
assert(gpt.upstream.enable_thinking === undefined, "extra fields dropped");
assert(gpt.upstream.provider_options === undefined, "provider_options dropped");
assert(gpt.upstream.extra_body === undefined, "extra_body dropped");
assert(gpt.upstream.stream_options === undefined, "stream_options not forwarded");
assert(gpt.upstream.stream === false, "upstream stream false");
assert(
  gpt.upstream.response_format && gpt.upstream.response_format.type === "text",
  "safe response_format forwarded"
);
assert(
  Array.isArray(gpt.upstream.messages) &&
    gpt.upstream.messages[0].content === "hi",
  "upstream messages normalized"
);

const gem = sanitizeUpstreamChatBody(
  {
    messages: [{ role: "user", content: "hi" }],
    temperature: 0.2,
    top_p: 0.8,
  },
  "gemini-3-pro"
);
assert(gem.ok === true, "sanitize gemini ok");
assert(gem.upstream.temperature === 0.2, "gemini temperature kept");
assert(gem.upstream.top_p === 0.8, "gemini top_p kept");

console.log("TOKFAI_CHERRY_CHAT_COMPAT_UNIT_PASS");
`;

const tsxBin = join(DMIT, "node_modules/.bin/tsx");
const result = spawnSync(tsxBin, ["--eval", source], {
  cwd: DMIT,
  encoding: "utf8",
  env: process.env,
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
process.exit(result.status === 0 ? 0 : 1);
