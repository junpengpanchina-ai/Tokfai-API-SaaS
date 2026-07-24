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
  normalizeChatMessageRole,
  normalizeClientChatCompletionBody,
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
assert(
  normalizeChatMessageContent([{ type: "input_text", text: "in" }]) === "in",
  "content input_text parts"
);
assert(normalizeChatMessageContent([{ text: "bare" }]) === "bare", "content bare text");
assert(normalizeChatMessageContent(null) === "", "content null → empty");
assert(normalizeChatMessageContent(undefined) === "", "content undefined → empty");
assert(normalizeChatMessageContent([]) === "", "content [] → empty");

assert(normalizeChatMessageRole("developer") === "system", "developer → system");
assert(normalizeChatMessageRole("user") === "user", "user kept");
assert(normalizeChatMessageRole("tool") === "user", "other role → user");

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

// Pre-schema client normalize matrix (P933)
const emptyArr = normalizeClientChatCompletionBody({ model: "gpt-5.5", messages: [] });
assert(emptyArr.noop === true, "messages:[] → noop");
assert(emptyArr.rejectedReason === "empty_messages", "empty rejectedReason");

const missing = normalizeClientChatCompletionBody({ model: "gpt-5.5" });
assert(missing.noop === true, "messages missing → noop");

const nullMsgs = normalizeClientChatCompletionBody({ model: "gpt-5.5", messages: null });
assert(nullMsgs.noop === true, "messages:null → noop");

const strMsgs = normalizeClientChatCompletionBody({ model: "gpt-5.5", messages: "abc" });
assert(strMsgs.noop === true, "messages:string → noop");

const nullContent = normalizeClientChatCompletionBody({
  model: "gpt-5.5",
  messages: [{ role: "user", content: null }],
});
assert(nullContent.noop === true, "content:null → noop");

const emptyArrContent = normalizeClientChatCompletionBody({
  model: "gpt-5.5",
  messages: [{ role: "user", content: [] }],
});
assert(emptyArrContent.noop === true, "content:[] → noop");

const textParts = normalizeClientChatCompletionBody({
  model: "gpt-5.5",
  messages: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
});
assert(textParts.noop === false, "text parts not noop");
assert(textParts.normalized === true, "text parts normalized");
assert(textParts.body.messages[0].content === "hi", "text parts flattened");

const developer = normalizeClientChatCompletionBody({
  model: "gpt-5.5",
  messages: [
    { role: "developer", content: "你是助手" },
    { role: "user", content: "hi" },
  ],
});
assert(developer.noop === false, "developer role not noop");
assert(developer.body.messages[0].role === "system", "developer → system");
assert(developer.body.messages[1].role === "user", "user kept");

const nullOpts = normalizeClientChatCompletionBody({
  model: "gpt-5.5",
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
  provider_options: null,
  extra_body: null,
});
assert(nullOpts.noop === false, "null optionals not noop");
assert(nullOpts.normalized === true, "null optionals normalized");
assert(nullOpts.body.temperature === undefined, "temperature null deleted");
assert(nullOpts.body.tools === undefined, "tools null deleted");
assert(!("stream_options" in nullOpts.body), "stream_options null deleted");
assert(!("provider_options" in nullOpts.body), "provider_options null deleted");
assert(!("extra_body" in nullOpts.body), "extra_body null deleted");

const normal = normalizeClientChatCompletionBody({
  model: "gpt-5.5",
  messages: [{ role: "user", content: "hello world" }],
  temperature: 0.7,
});
assert(normal.noop === false, "normal not noop");
assert(normal.normalized === false, "normal unchanged");
assert(normal.body.messages[0].content === "hello world", "normal content intact");
assert(normal.body.temperature === 0.7, "normal temperature intact");

const maxCompOnly = normalizeClientChatCompletionBody({
  model: "gpt-5.5",
  stream: true,
  messages: [{ role: "user", content: "reply only ok" }],
  max_completion_tokens: 16,
});
assert(maxCompOnly.noop === false, "max_completion_tokens-only not noop");
assert(maxCompOnly.normalized === true, "max_completion_tokens-only normalized");
assert(maxCompOnly.body.max_tokens === 16, "max_completion_tokens → max_tokens");
assert(
  !("max_completion_tokens" in maxCompOnly.body),
  "max_completion_tokens deleted after promote"
);

const maxBoth = normalizeClientChatCompletionBody({
  model: "gpt-5.5",
  messages: [{ role: "user", content: "hi" }],
  max_tokens: 32,
  max_completion_tokens: 64,
});
assert(maxBoth.body.max_tokens === 32, "existing max_tokens kept when both set");
assert(
  maxBoth.body.max_completion_tokens === 64,
  "max_completion_tokens kept when max_tokens present (upstream sanitize drops it)"
);

assert(shouldStripGptSamplingParams("gpt-5.5") === true, "strip gpt-5.5");
assert(shouldStripGptSamplingParams("gpt-5.4-pro") === true, "strip gpt-5.4-pro");
assert(shouldStripGptSamplingParams("gpt-5-pro") === true, "strip gpt-5-pro");
assert(shouldStripGptSamplingParams("gpt-5") === true, "strip gpt-5");
assert(shouldStripGptSamplingParams("gpt-5.4") === true, "strip gpt-5.4");
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
assert(cherryReal.upstream.temperature === undefined, "gpt-5.4 temperature stripped");
assert(!("tool_choice" in cherryReal.upstream), "tool_choice key absent");
assert(cherryReal.upstream.max_tokens === 64, "cherry max_tokens forwarded");
assert(
  !("max_completion_tokens" in cherryReal.upstream),
  "cherry max_completion_tokens never forwarded"
);

const maxCompSanitize = sanitizeUpstreamChatBody(
  {
    messages: [{ role: "user", content: "reply only ok" }],
    max_completion_tokens: 16,
  },
  "gpt-5.5"
);
assert(maxCompSanitize.ok === true, "max_completion_tokens-only sanitize ok");
assert(maxCompSanitize.upstream.max_tokens === 16, "sanitize promotes to max_tokens");
assert(
  !("max_completion_tokens" in maxCompSanitize.upstream),
  "sanitize drops max_completion_tokens"
);

const geminiCherry = sanitizeUpstreamChatBody(
  {
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "Return exactly: TOKFAI_CHERRY_OK" }],
      },
    ],
    temperature: null,
    top_p: null,
    presence_penalty: null,
    frequency_penalty: null,
    tools: [],
    tool_choice: null,
    response_format: null,
    stream_options: { include_usage: true },
    max_tokens: 64,
    max_completion_tokens: 64,
    enable_thinking: false,
    provider_options: { cherry: true },
  },
  "gemini-3-pro"
);
assert(geminiCherry.ok === true, "gemini cherry sanitize ok");
assert(geminiCherry.upstream.temperature === undefined, "gemini null temperature stripped");
assert(geminiCherry.upstream.top_p === undefined, "gemini null top_p stripped");
assert(geminiCherry.upstream.tool_choice === undefined, "gemini null tool_choice stripped");
assert(geminiCherry.upstream.tools === undefined, "gemini empty tools stripped");
assert(geminiCherry.upstream.enable_thinking === undefined, "gemini extras dropped");
assert(
  !Object.values(geminiCherry.upstream).includes(null),
  "gemini upstream has no null values"
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
