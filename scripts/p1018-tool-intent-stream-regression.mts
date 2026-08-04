/**
 * P1018 — Stream regression via real respondChatCompletionEarlySse
 * (production stream path: executeChatCompletion + SSE synthesis).
 *
 *   npx tsx scripts/p1018-tool-intent-stream-regression.mts
 *
 * Marker: TOKFAI_P1018_TOOL_INTENT_STREAM_REGRESSION_PASS
 */

import { fileURLToPath } from "node:url";
import {
  CALLER,
  WEATHER_TOOLS,
  billingSnapshot,
  defaultProviders,
  ensureDummyEnv,
  ensureModuleMocks,
  getCounts,
  installP1018Mocks,
  loadRespondEarlySse,
  makeAssistantTextIntent,
  makeToolCallIntent,
  nativeToolCompletion,
  resetScenario,
} from "./fixtures/p1018-tool-intent-harness.mts";

ensureModuleMocks(fileURLToPath(import.meta.url));
ensureDummyEnv();
await installP1018Mocks();

const { respondChatCompletionEarlySse } = await loadRespondEarlySse();

const PASS = "TOKFAI_P1018_TOOL_INTENT_STREAM_REGRESSION_PASS";
const FAIL = "TOKFAI_P1018_TOOL_INTENT_STREAM_REGRESSION_FAIL";

let failed = 0;
function pass(label: string, meta: Record<string, unknown>) {
  console.log(`PASS  ${label}`);
  console.log(
    JSON.stringify(
      {
        level: "REAL ROUTE ENTRY (stream)",
        entry: "respondChatCompletionEarlySse → executeChatCompletion",
        ...meta,
      },
      null,
      2
    )
  );
}
function fail(label: string, detail?: string) {
  failed += 1;
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}

function mockContext() {
  return {
    header() {},
    json(body: unknown, status?: number) {
      return new Response(JSON.stringify(body), {
        status: status ?? 200,
        headers: { "content-type": "application/json" },
      });
    },
    req: { header: () => undefined },
    get: () => undefined,
    set() {},
  } as any;
}

async function readSse(res: Response): Promise<{
  status: number;
  text: string;
  events: unknown[];
}> {
  const text = await res.text();
  const events: unknown[] = [];
  for (const block of text.split("\n\n")) {
    const line = block
      .split("\n")
      .find((l) => l.startsWith("data: "));
    if (!line) continue;
    const raw = line.slice(6);
    if (raw === "[DONE]") {
      events.push("[DONE]");
      continue;
    }
    try {
      events.push(JSON.parse(raw));
    } catch {
      events.push(raw);
    }
  }
  return { status: res.status, text, events };
}

async function streamChat(body: Record<string, unknown>, requestId: string) {
  return respondChatCompletionEarlySse(mockContext(), {
    caller: CALLER,
    requestId,
    body: { ...body, stream: false } as any, // route strips stream before exec
    limitKey: "p1018-stream",
    idempotencyKey: null,
  });
}

function collectDeltas(events: unknown[]) {
  const contents: string[] = [];
  const toolCallChunks: unknown[] = [];
  let finish: string | null = null;
  let errorCode: string | null = null;
  let sawDone = false;
  for (const ev of events) {
    if (ev === "[DONE]") {
      sawDone = true;
      continue;
    }
    if (!ev || typeof ev !== "object") continue;
    const row = ev as Record<string, unknown>;
    if (row.error && typeof row.error === "object") {
      errorCode = String((row.error as any).code ?? "");
    }
    const choices = row.choices as any[] | undefined;
    const choice = choices?.[0];
    if (!choice) continue;
    const delta = choice.delta ?? {};
    if (typeof delta.content === "string" && delta.content) {
      contents.push(delta.content);
    }
    if (delta.tool_calls) toolCallChunks.push(delta.tool_calls);
    if (typeof choice.finish_reason === "string" && choice.finish_reason) {
      finish = choice.finish_reason;
    }
  }
  return { contents, toolCallChunks, finish, errorCode, sawDone };
}

console.log("P1018 STREAM REGRESSION — respondChatCompletionEarlySse\n");

// ── 13. stream tool_call (gpt-5.5 native) ────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => nativeToolCompletion("get_weather", { city: "Paris" })],
  });
  const res = await streamChat(
    {
      model: "gpt-5.5",
      messages: [{ role: "user", content: "weather" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1018_s13"
  );
  const { text, events, status } = await readSse(res);
  const d = collectDeltas(events);
  const c = getCounts();
  const rawLeak =
    text.includes('"type":"tool_call"') ||
    (text.includes("get_weather") && text.includes('"arguments":{'));
  const contentJoined = d.contents.join("");
  const noRawContent =
    !contentJoined.includes('"type":"tool_call"') &&
    !contentJoined.includes('"tool_calls":[');
  assert13(
    status === 200 &&
      d.toolCallChunks.length >= 1 &&
      d.finish === "tool_calls" &&
      d.sawDone &&
      noRawContent &&
      c.debitCallCount === 1 &&
      !d.errorCode,
    {
      status,
      ...billingSnapshot({ ok: true, creditsCharged: 1, response: {} }, status),
      finish: d.finish,
      toolCallChunks: d.toolCallChunks.length,
      contentJoined,
      sawDone: d.sawDone,
      rawLeak,
      debitCallCount: c.debitCallCount,
      providerCallCount: c.providerCallCount,
    }
  );
}

function assert13(cond: boolean, meta: Record<string, unknown>) {
  if (cond) pass("13. stream=true native tool_call → delta.tool_calls", meta);
  else fail("13. stream tool_call", JSON.stringify(meta));
}

// ── 13b. stream emulated tool_call (gemini-3-pro) ────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: makeToolCallIntent("get_weather", { city: "Paris" }),
      }),
    ],
  });
  const res = await streamChat(
    {
      model: "gemini-3-pro",
      messages: [{ role: "user", content: "weather" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1018_s13b"
  );
  const { text, events, status } = await readSse(res);
  const d = collectDeltas(events);
  const c = getCounts();
  const contentJoined = d.contents.join("");
  const noRawContent =
    !contentJoined.includes('"type":"tool_call"') &&
    !contentJoined.includes('"tool_calls":[');
  if (
    status === 200 &&
      d.toolCallChunks.length >= 1 &&
      d.finish === "tool_calls" &&
      d.sawDone &&
      noRawContent &&
      c.debitCallCount === 1 &&
      !d.errorCode
  ) {
    pass("13b. stream=true emulated tool_call → delta.tool_calls", {
      status,
      finish: d.finish,
      toolCallChunks: d.toolCallChunks.length,
      debitCallCount: c.debitCallCount,
    });
  } else {
    fail(
      "13b. stream emulated tool_call",
      JSON.stringify({ status, d, c, text: text.slice(0, 300) })
    );
  }
}

// ── 14. stream assistant_text ────────────────────────────────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [
      () => ({
        kind: "completion",
        content: makeAssistantTextIntent("stream hello"),
      }),
    ],
  });
  const res = await streamChat(
    {
      model: "gemini-3-pro",
      messages: [{ role: "user", content: "hi" }],
      tools: WEATHER_TOOLS,
      tool_choice: "auto",
    },
    "req_p1018_s14"
  );
  const { events, status } = await readSse(res);
  const d = collectDeltas(events);
  const c = getCounts();
  const ok =
    status === 200 &&
    d.contents.join("") === "stream hello" &&
    d.toolCallChunks.length === 0 &&
    d.finish === "stop" &&
    d.sawDone &&
    c.debitCallCount === 1;
  if (ok) {
    pass("14. stream=true assistant_text → content delta, no tool_calls", {
      status,
      debitCallCount: c.debitCallCount,
      providerCallCount: c.providerCallCount,
      finish: d.finish,
      content: d.contents.join(""),
    });
  } else {
    fail("14. stream assistant_text", JSON.stringify({ status, d, c }));
  }
}

// ── 15. stream invalid_json — no raw JSON leak, debit=0 ──────────────────
{
  resetScenario({
    providers: defaultProviders(["grsai-primary"]),
    scripts: [() => ({ kind: "completion", content: "NOT_JSON!!!" })],
  });
  const res = await streamChat(
    {
      model: "gemini-3-pro",
      messages: [{ role: "user", content: "bad" }],
      tools: WEATHER_TOOLS,
      tool_choice: "required",
    },
    "req_p1018_s15"
  );
  const { text, events, status } = await readSse(res);
  const d = collectDeltas(events);
  const c = getCounts();
  const bodyHasError =
    Boolean(d.errorCode) ||
    text.includes("tool_intent_invalid_json") ||
    text.includes("not_billable");
  const leakedRawAsContent = d.contents.some((x) => x.includes("NOT_JSON"));
  const ok =
    status !== 200 || bodyHasError
      ? c.debitCallCount === 0 && !leakedRawAsContent && bodyHasError
      : false;
  const strictOk =
    c.debitCallCount === 0 &&
    !leakedRawAsContent &&
    (d.errorCode === "tool_intent_invalid_json" ||
      text.includes("tool_intent_invalid_json") ||
      (status !== 200 && bodyHasError));
  if (strictOk) {
    pass("15. stream=true invalid_json — error envelope, debit=0", {
      status,
      debitCallCount: c.debitCallCount,
      providerCallCount: c.providerCallCount,
      repairCallCount: c.repairCallCount,
      errorCode: d.errorCode,
      leakedRawAsContent,
    });
  } else {
    fail(
      "15. stream invalid_json",
      JSON.stringify({ status, d, c, text: text.slice(0, 500), ok })
    );
  }
}

if (failed > 0) {
  console.error(`\n${FAIL} (${failed} failed)`);
  process.exit(1);
}
console.log(`\n${PASS}`);
