/**
 * P1017 — Offline unit tests for Tool Intent Compiler / Parser / Registry.
 *
 * Usage:
 *   npx tsx scripts/p1017-tool-intent-compiler-unit.mjs
 *
 * Marker:
 *   TOKFAI_P1017_TOOL_INTENT_COMPILER_UNIT_PASS
 */

import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Minimal env so modules that import ../env.js can load offline.
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service_role_test_key_xxxxxxxx";
process.env.SUPABASE_JWT_SECRET ??= "jwt_secret_test_value_at_least_32_chars!!";
process.env.TOKEN_PEPPER ??= "token_pepper_test_value_at_least_32_chars!";
process.env.GRSAI_API_KEY ??= "grsai_test_key";
process.env.GRSAI_BASE_URL ??= "https://grsaiapi.com";
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test_dummy";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIB = join(ROOT, "apps/dmit-api/src/lib");

async function load(rel) {
  return import(pathToFileURL(join(LIB, rel)).href);
}

const results = [];
function check(id, fn) {
  try {
    fn();
    results.push({ id, ok: true });
    console.log(`PASS ${id}`);
  } catch (err) {
    results.push({ id, ok: false, err: String(err?.message ?? err) });
    console.error(`FAIL ${id}:`, err?.message ?? err);
  }
}

const {
  resolveToolCallingMode,
  modelHasToolCallingSupport,
  bestToolCallingModeForModel,
} = await load("toolCallingModeRegistry.ts");
const { compileEmulatedUpstreamBody, extractClientToolFunctions } = await load(
  "toolIntentCompiler.ts"
);
const {
  parseToolIntentFromContent,
  applyToolIntentToChatCompletion,
} = await load("toolIntentParser.ts");
const { validateAgainstJsonSchema } = await load("toolIntentSchema.ts");
const { isToolIntentRepairableCode } = await load("toolIntentErrors.ts");
const { requestHasTools, isStrictToolCallRequest, stripToolsFromChatBody } =
  await load("toolCallCapability.ts");

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_tokfai_canary",
      parameters: {
        type: "object",
        properties: { value: { type: "integer" } },
        required: ["value"],
        additionalProperties: false,
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_order",
      parameters: {
        type: "object",
        properties: {
          product_id: { type: "string" },
          quantity: { type: "integer" },
          express: { type: "boolean" },
        },
        required: ["product_id", "quantity", "express"],
        additionalProperties: false,
      },
    },
  },
];

check("01_no_tools_request", () => {
  assert.equal(requestHasTools({ messages: [] }), false);
});

check("02_registry_grsai_emulated", () => {
  assert.equal(resolveToolCallingMode("grsai-primary", "gpt-5.5"), "emulated_json");
  assert.equal(resolveToolCallingMode("openai-official", "gpt-5.5"), "native");
  assert.equal(resolveToolCallingMode("grsai-primary", "nano-banana"), "unsupported");
  assert.equal(modelHasToolCallingSupport("gpt-5.5"), true);
  assert.equal(modelHasToolCallingSupport("totally-unknown-model"), false);
});

check("03_alias_not_capability_key", () => {
  // Alias ids themselves are not registry keys unless listed.
  assert.equal(resolveToolCallingMode("grsai-primary", "auto-pro"), "unsupported");
  // Concrete model on GRSAI is emulated; best across registry prefers native slots.
  assert.equal(resolveToolCallingMode("grsai-primary", "gpt-5.5"), "emulated_json");
  assert.equal(bestToolCallingModeForModel("gpt-5.5"), "native");
});

check("04_compiler_strips_native_tools", () => {
  const upstream = {
    model: "gpt-5.5",
    messages: [{ role: "user", content: "hi" }],
    tools: TOOLS,
    tool_choice: "required",
    stream: false,
  };
  const out = compileEmulatedUpstreamBody(upstream, {
    tools: TOOLS,
    tool_choice: "required",
  });
  assert.equal(out.tools, undefined);
  assert.equal(out.tool_choice, undefined);
  assert.ok(Array.isArray(out.messages));
  assert.ok(out.messages.length >= 3);
});

check("05_emulated_single_tool", () => {
  const intent = parseToolIntentFromContent({
    content: JSON.stringify({
      type: "tool_call",
      tool_calls: [{ name: "get_tokfai_canary", arguments: { value: 42 } }],
    }),
    clientTools: TOOLS,
    toolChoice: "auto",
  });
  assert.equal(intent.kind, "tool_call");
  assert.equal(intent.toolCalls.length, 1);
  assert.equal(intent.toolCalls[0].function.name, "get_tokfai_canary");
  assert.equal(intent.toolCalls[0].function.arguments, '{"value":42}');
  assert.ok(intent.toolCalls[0].id.startsWith("call_"));
});

check("06_emulated_required", () => {
  assert.throws(
    () =>
      parseToolIntentFromContent({
        content: JSON.stringify({
          type: "assistant_text",
          content: "no tools",
        }),
        clientTools: TOOLS,
        toolChoice: "required",
      }),
    (e) => e?.code === "required_tool_call_missing"
  );
});

check("07_emulated_forced_function", () => {
  assert.throws(
    () =>
      parseToolIntentFromContent({
        content: JSON.stringify({
          type: "tool_call",
          tool_calls: [{ name: "create_order", arguments: { product_id: "x", quantity: 1, express: true } }],
        }),
        clientTools: TOOLS,
        toolChoice: { type: "function", function: { name: "get_tokfai_canary" } },
      }),
    (e) => e?.code === "tool_name_not_allowed"
  );
});

check("08_emulated_auto_text", () => {
  const intent = parseToolIntentFromContent({
    content: JSON.stringify({
      type: "assistant_text",
      content: "今天测试完成。",
    }),
    clientTools: TOOLS,
    toolChoice: "auto",
  });
  assert.equal(intent.kind, "assistant_text");
});

check("09_invalid_json", () => {
  assert.throws(
    () =>
      parseToolIntentFromContent({
        content: "not json",
        clientTools: TOOLS,
      }),
    (e) => e?.code === "tool_intent_invalid_json"
  );
});

check("10_markdown_json", () => {
  assert.throws(
    () =>
      parseToolIntentFromContent({
        content:
          '```json\n{"type":"assistant_text","content":"x"}\n```',
        clientTools: TOOLS,
      }),
    (e) => e?.code === "tool_intent_invalid_json"
  );
});

check("11_outside_text", () => {
  assert.throws(
    () =>
      parseToolIntentFromContent({
        content: 'Here: {"type":"assistant_text","content":"x"}',
        clientTools: TOOLS,
      }),
    (e) => e?.code === "tool_intent_invalid_json"
  );
});

check("12_unknown_tool", () => {
  assert.throws(
    () =>
      parseToolIntentFromContent({
        content: JSON.stringify({
          type: "tool_call",
          tool_calls: [{ name: "hack", arguments: {} }],
        }),
        clientTools: TOOLS,
      }),
    (e) => e?.code === "tool_name_not_allowed"
  );
});

check("13_arguments_schema_invalid", () => {
  assert.throws(
    () =>
      parseToolIntentFromContent({
        content: JSON.stringify({
          type: "tool_call",
          tool_calls: [
            {
              name: "create_order",
              arguments: { product_id: "tokfai-pro", quantity: true, express: true },
            },
          ],
        }),
        clientTools: TOOLS,
      }),
    (e) => e?.code === "tool_arguments_invalid"
  );
});

check("14_parallel_false_multi", () => {
  assert.throws(
    () =>
      parseToolIntentFromContent({
        content: JSON.stringify({
          type: "tool_call",
          tool_calls: [
            { name: "get_tokfai_canary", arguments: { value: 1 } },
            { name: "get_tokfai_canary", arguments: { value: 2 } },
          ],
        }),
        clientTools: TOOLS,
        parallelToolCalls: false,
      }),
    (e) => e?.code === "tool_intent_invalid_json"
  );
});

check("15_extra_envelope_keys", () => {
  assert.throws(
    () =>
      parseToolIntentFromContent({
        content: JSON.stringify({
          type: "tool_call",
          tool_calls: [{ name: "get_tokfai_canary", arguments: { value: 42 } }],
          extra: true,
        }),
        clientTools: TOOLS,
      }),
    (e) => e?.code === "tool_intent_invalid_json"
  );
});

check("16_apply_maps_openai_shape", () => {
  const intent = parseToolIntentFromContent({
    content: JSON.stringify({
      type: "tool_call",
      tool_calls: [{ name: "get_tokfai_canary", arguments: { value: 42 } }],
    }),
    clientTools: TOOLS,
  });
  const mapped = applyToolIntentToChatCompletion(
    { choices: [{ message: { role: "assistant", content: "raw" } }] },
    intent
  );
  assert.equal(mapped.choices[0].finish_reason, "tool_calls");
  assert.equal(mapped.choices[0].message.content, null);
  assert.ok(Array.isArray(mapped.choices[0].message.tool_calls));
});

check("17_schema_additionalProperties", () => {
  const r = validateAgainstJsonSchema(
    { value: 1, nope: true },
    {
      type: "object",
      properties: { value: { type: "integer" } },
      required: ["value"],
      additionalProperties: false,
    }
  );
  assert.equal(r.ok, false);
});

check("18_strip_tools_degrade", () => {
  const stripped = stripToolsFromChatBody({
    model: "x",
    tools: TOOLS,
    tool_choice: "auto",
    messages: [],
  });
  assert.equal(stripped.tools, undefined);
  assert.equal(stripped.tool_choice, undefined);
});

check("19_strict_detect", () => {
  assert.equal(
    isStrictToolCallRequest({ tools: TOOLS, tool_choice: "required" }),
    true
  );
  assert.equal(
    isStrictToolCallRequest({ tools: TOOLS, tool_choice: "auto" }),
    false
  );
});

check("20_repairable_codes", () => {
  assert.equal(isToolIntentRepairableCode("tool_intent_invalid_json"), true);
  assert.equal(isToolIntentRepairableCode("tool_arguments_invalid"), true);
  assert.equal(isToolIntentRepairableCode("tool_name_not_allowed"), false);
});

check("21_extract_tools", () => {
  assert.equal(extractClientToolFunctions(TOOLS).length, 2);
});

check("22_image_unsupported", () => {
  assert.equal(resolveToolCallingMode("grsai-primary", "gpt-image-1"), "unsupported");
});

const failed = results.filter((r) => !r.ok);
if (failed.length) {
  console.error("\nFailed:", failed.map((f) => f.id).join(", "));
  process.exit(1);
}

console.log("\nTOKFAI_P1017_TOOL_INTENT_COMPILER_UNIT_PASS");
