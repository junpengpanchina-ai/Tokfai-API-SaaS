/**
 * P1018 — Billing regression: success debit×1 / failure debit×0 via real
 * recordSuccessfulUsageAndDebit spy (usageBilling mock boundary).
 *
 *   npx tsx scripts/p1018-tool-intent-billing-regression.mts
 *
 * Marker: TOKFAI_P1018_TOOL_INTENT_BILLING_REGRESSION_PASS
 */

import { fileURLToPath } from "node:url";
import {
  CALLER,
  WEATHER_TOOLS,
  billingSnapshot,
  defaultProviders,
  ensureDummyEnv,
  ensureModuleMocks,
  installP1018Mocks,
  loadExecuteChatCompletion,
  makeAssistantTextIntent,
  makeToolCallIntent,
  resetScenario,
} from "./fixtures/p1018-tool-intent-harness.mts";

ensureModuleMocks(fileURLToPath(import.meta.url));
ensureDummyEnv();
await installP1018Mocks();

const { executeChatCompletion } = await loadExecuteChatCompletion();

const PASS = "TOKFAI_P1018_TOOL_INTENT_BILLING_REGRESSION_PASS";
const FAIL = "TOKFAI_P1018_TOOL_INTENT_BILLING_REGRESSION_FAIL";

let failed = 0;
function pass(label: string, meta: Record<string, unknown>) {
  console.log(`PASS  ${label}`);
  console.log(JSON.stringify({ level: "REAL ENTRY + DEBIT SPY", ...meta }, null, 2));
}
function fail(label: string, detail?: string) {
  failed += 1;
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}

async function exec(body: Record<string, unknown>, requestId: string) {
  return executeChatCompletion({
    caller: CALLER,
    requestId,
    body: body as any,
    route: "/v1/chat/completions",
    limitKey: "p1018-billing",
    clientStream: false,
  });
}

type Case = {
  id: string;
  expectSuccess: boolean;
  body: Record<string, unknown>;
  scripts: Parameters<typeof resetScenario>[0] extends infer O
    ? O extends { scripts?: infer S }
      ? S
      : never
    : never;
};

const cases: Case[] = [
  {
    id: "B1_success_plain",
    expectSuccess: true,
    body: {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "hi" }],
    },
    scripts: [() => ({ kind: "completion", content: "ok" })],
  },
  {
    id: "B2_success_tool_call",
    expectSuccess: true,
    body: {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "tool" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    scripts: [
      () => ({
        kind: "completion",
        content: makeToolCallIntent("get_weather", { city: "X" }),
      }),
    ],
  },
  {
    id: "B3_success_assistant_text",
    expectSuccess: true,
    body: {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "text" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    scripts: [
      () => ({
        kind: "completion",
        content: makeAssistantTextIntent("plain"),
      }),
    ],
  },
  {
    id: "B4_fail_required_missing",
    expectSuccess: false,
    body: {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "req" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    scripts: [
      () => ({
        kind: "completion",
        content: makeAssistantTextIntent("nope"),
      }),
    ],
  },
  {
    id: "B5_fail_invalid_json_after_repair",
    expectSuccess: false,
    body: {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "bad" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    scripts: [() => ({ kind: "completion", content: "{not-json" })],
  },
  {
    id: "B6_fail_name_not_allowed",
    expectSuccess: false,
    body: {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "forced" }],
      tools: WEATHER_TOOLS,
      tool_choice: {
        type: "function",
        function: { name: "get_weather" },
      },
    },
    scripts: [
      () => ({
        kind: "completion",
        content: makeToolCallIntent("get_time", { tz: "UTC" }),
      }),
    ],
  },
  {
    id: "B7_success_after_repair",
    expectSuccess: true,
    body: {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "repair" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    scripts: [
      (ctx) =>
        ctx.isRepair
          ? {
              kind: "completion",
              content: makeToolCallIntent("get_weather", { city: "Y" }),
            }
          : { kind: "completion", content: "<<<" },
    ],
  },
];

console.log("P1018 BILLING REGRESSION — debit spy on usageBilling\n");

for (const c of cases) {
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: c.scripts as any,
  });
  const result = await exec(c.body, `req_${c.id}`);
  const meta = billingSnapshot(result);
  const okSuccess =
    c.expectSuccess &&
    result.ok === true &&
    meta.debitCallCount === 1 &&
    typeof meta.credits_charged === "number";
  const okFail =
    !c.expectSuccess &&
    result.ok === false &&
    meta.debitCallCount === 0 &&
    meta.credits_charged === 0 &&
    meta.billing_status === "not_billable";
  if (okSuccess || okFail) {
    pass(c.id, {
      expectSuccess: c.expectSuccess,
      ...meta,
      debit_spy: "recordSuccessfulUsageAndDebit",
    });
  } else {
    fail(
      c.id,
      JSON.stringify({
        expectSuccess: c.expectSuccess,
        ok: result.ok,
        errorCode: (result as any).errorCode,
        meta,
      })
    );
  }
}

if (failed > 0) {
  console.error(`\n${FAIL} (${failed} failed)`);
  process.exit(1);
}
console.log(`\n${PASS}`);
