#!/usr/bin/env node
/**
 * P1230-R1 local protocol gateway.
 *
 * Uses REAL DMIT dist modules:
 *   responsesToolStateStore
 *   responsesPreviousResponseBridge
 *   responsesPublicId / transform (via bridge)
 *
 * Does NOT start full apps/dmit-api HTTP (no .env). Speaks a minimal
 * /v1/responses surface for harness tests.
 *
 * Billing: synthetic ledger mirroring CURRENT_BILLING_MODEL documented in
 * docs/aviation/testing/08-current-billing-model.md (source-derived).
 */
import http from "node:http";
import { createHash, randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");
const PORT = Number(process.env.RUNTIME_GATEWAY_PORT || 9471);
const MOCK = (process.env.MOCK_UPSTREAM_URL || "http://127.0.0.1:9470").replace(/\/+$/, "");

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_JWT_SECRET ??= "xxxxxxxxxxxxxxxxxxxx";
process.env.TOKEN_PEPPER ??= "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.GRSAI_API_KEY ??= "test-key";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service_role_test_key_xxxxxxxx";
process.env.STRIPE_SECRET_KEY ??= "sk_test_dummy";

const distStore = join(ROOT, "apps/dmit-api/dist/lib/responsesToolStateStore.js");
const distBridge = join(ROOT, "apps/dmit-api/dist/lib/responsesPreviousResponseBridge.js");
const distTransform = join(ROOT, "apps/dmit-api/dist/lib/responsesTransform.js");

if (!existsSync(distStore) || !existsSync(distBridge) || !existsSync(distTransform)) {
  console.error("MISSING_DIST_LIBS — run apps/dmit-api build first");
  process.exit(1);
}

const store = await import(pathToFileURL(distStore).href);
const bridge = await import(pathToFileURL(distBridge).href);
const transform = await import(pathToFileURL(distTransform).href);

store.clearResponsesToolStateStoreForTests?.();

/** @type {Map<string,{tenant:string,userId:string}>} */
const tokens = new Map();
for (const [tenant, secret] of [
  ["TENANT_ALPHA", "tok_alpha_synth"],
  ["TENANT_BRAVO", "tok_bravo_synth"],
  ["TENANT_CHARLIE", "tok_charlie_synth"],
]) {
  tokens.set(secret, { tenant, userId: `user_${tenant}` });
}

/** Synthetic billing ledger (mirrors source: charge only on successful upstream usage). */
const ledger = [];
const providerCalls = [];
const consumedResults = new Set(); // call_id|responseId|tenant — duplicate tool result

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function authTenant(req) {
  const h = req.headers.authorization || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  return tokens.get(m[1].trim()) || null;
}

function reqId() {
  return randomBytes(8).toString("hex");
}

function publicRespId(requestId) {
  return `resp_${requestId}`;
}

function chatToResponses(chatJson, requestId, model) {
  const choice = chatJson?.choices?.[0];
  const msg = choice?.message || {};
  const toolCalls = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
  const output = [];
  if (toolCalls.length) {
    for (const tc of toolCalls) {
      output.push({
        type: "function_call",
        id: tc.id,
        call_id: tc.id,
        name: tc.function?.name,
        arguments: tc.function?.arguments || "{}",
      });
    }
  } else {
    output.push({
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: msg.content || "" }],
    });
  }
  return {
    id: publicRespId(requestId),
    object: "response",
    model,
    status: toolCalls.length ? "requires_action" : "completed",
    output,
    usage: chatJson.usage || { input_tokens: 10, output_tokens: 5 },
    request_id: requestId,
  };
}

async function callUpstream(chatBody, scenario) {
  const t0 = Date.now();
  let status = 0;
  let json = null;
  let err = null;
  try {
    const res = await fetch(`${MOCK}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tokfai-scenario": scenario || "MODE_TEXT",
      },
      body: JSON.stringify(chatBody),
    });
    status = res.status;
    const text = await res.text();
    try {
      json = JSON.parse(text);
    } catch {
      json = { raw: text };
    }
  } catch (e) {
    err = String(e?.message || e);
    status = 0;
  }
  const row = {
    id: `pc_${providerCalls.length + 1}`,
    status,
    ms: Date.now() - t0,
    err,
    usage: json?.usage || null,
  };
  providerCalls.push(row);
  return { status, json, row };
}

function recordBilling({ tenant, userId, requestId, providerRow, billable, reason }) {
  const charge = billable ? 1 : 0;
  ledger.push({
    tenant,
    userId,
    requestId,
    providerCallId: providerRow?.id || null,
    billable,
    charge,
    reason,
  });
  return charge;
}

function sumTenant(tenant) {
  return ledger.filter((r) => r.tenant === tenant).reduce((s, r) => s + r.charge, 0);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);

  if (url.pathname === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ok: true,
        mode: "PROTOCOL_GATEWAY_WITH_REAL_DIST_LIBS",
        storeKind: store.getStoreKind?.(),
      })
    );
    return;
  }

  if (url.pathname === "/debug/ledger") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        ledger,
        providerCalls: providerCalls.map((p) => ({
          id: p.id,
          status: p.status,
          ms: p.ms,
        })),
        sums: {
          TENANT_ALPHA: sumTenant("TENANT_ALPHA"),
          TENANT_BRAVO: sumTenant("TENANT_BRAVO"),
          TENANT_CHARLIE: sumTenant("TENANT_CHARLIE"),
        },
      })
    );
    return;
  }

  if (url.pathname === "/debug/reset") {
    store.clearResponsesToolStateStoreForTests?.();
    ledger.length = 0;
    providerCalls.length = 0;
    consumedResults.clear();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (url.pathname !== "/v1/responses" || req.method !== "POST") {
    res.writeHead(404);
    res.end("not_found");
    return;
  }

  const caller = authTenant(req);
  if (!caller) {
    res.writeHead(401, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "unauthorized", code: "unauthorized" } }));
    return;
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: "invalid_json", code: "invalid_request" } }));
    return;
  }

  const requestId = reqId();
  const scenario = String(body.scenario_id || body.tokfai_scenario || "MODE_TEXT");
  const model = body.model || "mock-model";
  let responsesBody = { ...body, model };

  // Duplicate resume / duplicate tool result detection (harness-level + real bridge)
  const bridgeReq = bridge.detectPreviousResponseToolOutputBridge(responsesBody);
  if (bridgeReq) {
    for (const out of bridgeReq.outputs) {
      const key = `${caller.tenant}|${bridgeReq.previousResponseId}|${out.call_id}|${createHash("sha256").update(JSON.stringify(out.output)).digest("hex").slice(0, 8)}`;
      if (consumedResults.has(key)) {
        recordBilling({
          tenant: caller.tenant,
          userId: caller.userId,
          requestId,
          providerRow: null,
          billable: false,
          reason: "duplicate_tool_result",
        });
        res.writeHead(400, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            error: { message: "duplicate tool result", code: "duplicate_tool_result" },
          })
        );
        return;
      }
    }

    const resolved = await bridge.resolvePreviousResponseToolOutputBridge({
      bridge: bridgeReq,
      userId: caller.userId,
      route: "/v1/responses",
    });
    if (!resolved.ok) {
      recordBilling({
        tenant: caller.tenant,
        userId: caller.userId,
        requestId,
        providerRow: null,
        billable: false,
        reason: resolved.error.code || "previous_response_not_found",
      });
      res.writeHead(resolved.error.status || 404, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          error: {
            message: resolved.error.publicMessage || "resume failed",
            code: resolved.error.code,
          },
        })
      );
      return;
    }
    responsesBody = bridge.applyRebuiltPreviousResponseBody(responsesBody, resolved);
    for (const out of bridgeReq.outputs) {
      const key = `${caller.tenant}|${bridgeReq.previousResponseId}|${out.call_id}|${createHash("sha256").update(JSON.stringify(out.output)).digest("hex").slice(0, 8)}`;
      consumedResults.add(key);
    }
  }

  // Transform to chat for mock upstream
  let chatBody;
  try {
    chatBody = transform.responsesBodyToChatBody(responsesBody);
  } catch (e) {
    res.writeHead(400, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: String(e), code: "transform_error" } }));
    return;
  }

  // Inject tenant canary into messages for mock scenario routing (hash only in logs elsewhere)
  if (Array.isArray(chatBody.messages) && chatBody.messages[0]) {
    const first = chatBody.messages[0];
    if (typeof first.content === "string" && !first.content.includes(caller.tenant)) {
      first.content = `${caller.tenant} ${first.content}`;
    }
  }

  chatBody.tokfai_scenario = scenario;
  chatBody.scenario_id = scenario;

  const up = await callUpstream(chatBody, scenario);

  // Failure paths: usage log not_billable / no debit (source model)
  if (up.status === 0 || up.status >= 400) {
    const reason =
      up.status === 429
        ? "upstream_429"
        : up.status >= 500
          ? "upstream_500"
          : up.status === 0
            ? "upstream_timeout_or_disconnect"
            : "upstream_4xx";
    recordBilling({
      tenant: caller.tenant,
      userId: caller.userId,
      requestId,
      providerRow: up.row,
      billable: false,
      reason,
    });
    res.writeHead(up.status === 0 ? 504 : up.status, { "content-type": "application/json" });
    res.end(
      JSON.stringify({
        error: { message: "upstream_error", code: reason },
        request_id: requestId,
      })
    );
    return;
  }

  const responseObj = chatToResponses(up.json, requestId, model);

  /**
   * Multi-round previous_response_id: bridge rebuild skips prior
   * function_call / function_call_output from originalInput. Store completed
   * exchanges as type:message items so history survives the next rebuild.
   * (Harness adaptation — does not modify apps/dmit-api/src.)
   */
  function stabilizeOriginalInput(input) {
    if (!Array.isArray(input)) return input;
    const out = [];
    let pendingFc = null;
    for (const item of input) {
      if (!item || typeof item !== "object") {
        out.push(item);
        continue;
      }
      if (item.type === "function_call") {
        pendingFc = item;
        continue;
      }
      if (item.type === "function_call_output" && pendingFc) {
        out.push({
          type: "message",
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: pendingFc.call_id,
              type: "function",
              function: {
                name: pendingFc.name,
                arguments: pendingFc.arguments || "{}",
              },
            },
          ],
        });
        out.push({
          type: "message",
          role: "tool",
          tool_call_id: item.call_id,
          content:
            typeof item.output === "string"
              ? item.output
              : JSON.stringify(item.output ?? ""),
        });
        pendingFc = null;
        continue;
      }
      if (item.type === "function_call_output") continue;
      out.push(item);
    }
    return out;
  }

  // Persist tool state via REAL bridge helper
  await bridge.persistResponsesToolStateFromRound1({
    response: responseObj,
    requestBody: {
      ...responsesBody,
      input: stabilizeOriginalInput(responsesBody.input),
      tools: body.tools || [
        {
          type: "function",
          name: "read_test_token",
          parameters: {
            type: "object",
            properties: { fixture_id: { type: "string" } },
          },
        },
      ],
      tool_choice: body.tool_choice || "auto",
    },
    userId: caller.userId,
    route: "/v1/responses",
    providerId: "mock-upstream",
    requestId,
    awaitDurable: false,
  });

  // Successful upstream with usage → billable (1 synthetic credit unit)
  recordBilling({
    tenant: caller.tenant,
    userId: caller.userId,
    requestId,
    providerRow: up.row,
    billable: true,
    reason: "successful_provider_usage",
  });

  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(responseObj));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(
    `TOKFAI_P1230_RUNTIME_GATEWAY_READY port=${PORT} mode=PROTOCOL_GATEWAY_WITH_REAL_DIST_LIBS`
  );
});
