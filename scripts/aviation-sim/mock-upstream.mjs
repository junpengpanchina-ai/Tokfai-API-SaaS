#!/usr/bin/env node
/**
 * Deterministic OpenAI-compatible chat mock for P1230-R1.
 * Controlled by header x-tokfai-scenario or body.tokfai_scenario / body.scenario_id
 */
import http from "node:http";

const PORT = Number(process.env.MOCK_UPSTREAM_PORT || 9470);

/** Per-tenant multi-round counters: key = sessionHint */
const roundCounters = new Map();

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function scenarioOf(req, body) {
  return (
    req.headers["x-tokfai-scenario"] ||
    body.tokfai_scenario ||
    body.scenario_id ||
    "MODE_TEXT"
  );
}

function tenantHint(body) {
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  for (const m of msgs) {
    const c = typeof m.content === "string" ? m.content : "";
    const hit = c.match(/TENANT_(ALPHA|BRAVO|CHARLIE)|fixture_id=([A-Za-z0-9_-]+)/);
    if (hit) return hit[0];
  }
  return "default";
}

function countToolMessages(body) {
  const msgs = Array.isArray(body.messages) ? body.messages : [];
  return msgs.filter((m) => m.role === "tool").length;
}

function toolCall(name, args, callId) {
  return {
    id: callId,
    type: "function",
    function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) },
  };
}

function chatToolResponse(model, toolCalls) {
  return {
    id: `chatcmpl_mock_${Date.now()}`,
    object: "chat.completion",
    model: model || "mock-model",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: null,
          tool_calls: toolCalls,
        },
        finish_reason: "tool_calls",
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  };
}

function chatTextResponse(model, text) {
  return {
    id: `chatcmpl_mock_${Date.now()}`,
    object: "chat.completion",
    model: model || "mock-model",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
  };
}

async function handleChat(req, res, body) {
  const scenario = String(scenarioOf(req, body));
  const model = body.model || "mock-model";
  const hint = tenantHint(body);
  const toolRoundsDone = countToolMessages(body);

  const delayHeader = Number(req.headers["x-tokfai-delay-ms"] || 0);
  if (scenario === "MODE_SLOW" || delayHeader > 0) {
    await new Promise((r) => setTimeout(r, scenario === "MODE_SLOW" ? 20_000 : delayHeader));
  }

  if (scenario === "MODE_429") {
    res.writeHead(429, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "rate_limited", code: "rate_limit" } }));
    return;
  }
  if (scenario === "MODE_500") {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "upstream_boom", code: "server_error" } }));
    return;
  }
  if (scenario === "MODE_MALFORMED_TOOL_CALL") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        id: "bad",
        choices: [{ message: { role: "assistant", tool_calls: [{ type: "function" }] } }],
      })
    );
    return;
  }

  // Multi-round: MODE_TOOL_TOOL_STOP / MODE_MULTI_ROUND_N
  const multiMatch = scenario.match(/^MODE_MULTI_ROUND_(\d+)$/);
  const targetRounds = multiMatch
    ? Number(multiMatch[1])
    : scenario === "MODE_TOOL_TOOL_STOP"
      ? 2
      : scenario === "MODE_TOOL_THEN_STOP" || scenario === "MODE_SINGLE_TOOL"
        ? 1
        : 0;

  if (targetRounds > 0) {
    if (toolRoundsDone < targetRounds) {
      const n = toolRoundsDone + 1;
      const fixture =
        hint.includes("ALPHA") || hint.includes("fixture_id=A")
          ? "A"
          : hint.includes("BRAVO") || hint.includes("fixture_id=B")
            ? "B"
            : hint.includes("CHARLIE") || hint.includes("fixture_id=C")
              ? "C"
              : "A";
      const callId = `call_${hint.replace(/[^A-Za-z0-9]/g, "_")}_${n}`;
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify(
          chatToolResponse(model, [
            toolCall("read_test_token", { fixture_id: fixture, round: n }, callId),
          ])
        )
      );
      return;
    }
    const token =
      hint.includes("fixture_id=B") || hint.includes("BRAVO")
        ? "TOKFAI_BRAVO_18FA3"
        : hint.includes("fixture_id=C") || hint.includes("CHARLIE")
          ? "TOKFAI_CHARLIE_77C91"
          : hint.includes("fixture_id=A") || hint.includes("ALPHA")
            ? "TOKFAI_RUNTIME_TOKEN_A_92F1"
            : "TOKFAI_RUNTIME_TOKEN_A_92F1";
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify(chatTextResponse(model, `final:${token}`)));
    return;
  }

  if (scenario === "MODE_MULTI_TOOL") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify(
        chatToolResponse(model, [
          toolCall("read_test_token", { fixture_id: "A" }, "call_multi_a"),
          toolCall("read_test_token", { fixture_id: "A" }, "call_multi_b"),
        ])
      )
    );
    return;
  }

  if (scenario === "MODE_STREAM" || scenario === "MODE_STREAM_ABORT") {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    });
    res.write(
      `data: ${JSON.stringify({
        id: "chunk1",
        choices: [{ delta: { content: "hel" }, index: 0 }],
      })}\n\n`
    );
    if (scenario === "MODE_STREAM_ABORT") {
      res.destroy();
      return;
    }
    res.write(
      `data: ${JSON.stringify({
        id: "chunk2",
        choices: [{ delta: { content: "lo" }, index: 0 }],
      })}\n\n`
    );
    res.write("data: [DONE]\n\n");
    res.end();
    return;
  }

  // default MODE_TEXT
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(chatTextResponse(model, "ok")));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, service: "p1230-mock-upstream" }));
    return;
  }
  if (url.pathname.endsWith("/chat/completions") || url.pathname === "/v1/chat/completions") {
    try {
      const body = await readBody(req);
      await handleChat(req, res, body);
    } catch (e) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: String(e) } }));
    }
    return;
  }
  res.writeHead(404);
  res.end("not_found");
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`TOKFAI_P1230_MOCK_UPSTREAM_READY port=${PORT}`);
});
