#!/usr/bin/env node
/**
 * P941 — Tokfai API isolation smoke.
 *
 * Helps locate failures in client vs Tokfai gateway vs upstream model by
 * probing the public OpenAI-compatible surface only. Does not change
 * production code, billing, aliases, or timeouts.
 *
 * Hard limits:
 *   - never print full API key
 *   - never expose upstream domains
 *   - no production path edits
 *
 * Coverage:
 *   1. GET  /v1/models
 *   2. POST /v1/chat/completions stream=false
 *   3. POST /v1/chat/completions stream=true
 *   4. POST /v1/responses stream=false
 *   5. POST /v1/responses stream=true
 *
 * Models (default):
 *   gpt-5.5, gpt-5-pro, gpt-5.4-pro, gemini-3-pro, gemini-2.5-pro, gemini-2.5-flash
 *
 * Usage:
 *   node scripts/p941-api-isolation-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p941-api-isolation-smoke.mjs
 *
 * Optional:
 *   MODELS=gpt-5.5,gemini-2.5-flash
 *   CHAT_TIMEOUT_MS=120000   (client abort only; does not change server timeout)
 *
 * Acceptance:
 *   TOKFAI_P941_API_ISOLATION_SMOKE_PASS
 */

import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";

const SCRIPT = "scripts/p941-api-isolation-smoke.mjs";
const PASS_MARKER = "TOKFAI_P941_API_ISOLATION_SMOKE_PASS";
const FAIL_MARKER = "TOKFAI_P941_API_ISOLATION_SMOKE_FAIL";

const DEFAULT_MODELS = [
  "gpt-5.5",
  "gpt-5-pro",
  "gpt-5.4-pro",
  "gemini-3-pro",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
];

const MODELS = (process.env.MODELS ?? DEFAULT_MODELS.join(","))
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const PROMPT = "Say ok only.";

/** Host / brand patterns that must never appear in printed output. */
const UPSTREAM_LEAK_RE =
  /grsaiapi\.com|generativelanguage\.googleapis\.com|api\.openai\.com|openai\.azure\.com|(?<![\w.])grsai(?!api\.com)|(?<![\w.])garsai/gi;

function maskKey(key) {
  if (!key || key.length <= 12) return "(not set)";
  return `${key.slice(0, 12)}…${key.slice(-4)} (len=${key.length})`;
}

function redactUpstream(value) {
  if (value == null) return null;
  return String(value).replace(UPSTREAM_LEAK_RE, "[redacted]");
}

function isTokfaiErrorEnvelope(body) {
  const err = body?.error;
  if (!err || typeof err !== "object") return false;
  return (
    typeof err.message === "string" &&
    err.message.trim().length > 0 &&
    typeof err.code === "string" &&
    err.code.trim().length > 0 &&
    typeof err.type === "string" &&
    err.type.trim().length > 0
  );
}

function parseSseJsonPayloads(text) {
  const payloads = [];
  if (!text) return payloads;
  for (const block of String(text).split(/\n\n+/)) {
    const dataLines = block
      .split("\n")
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());
    if (!dataLines.length) continue;
    const data = dataLines.join("\n");
    if (!data || data === "[DONE]") continue;
    try {
      payloads.push(JSON.parse(data));
    } catch {
      // ignore non-JSON SSE frames
    }
  }
  return payloads;
}

function extractMeta(body, text, headers) {
  const sse = !body || body._raw != null ? parseSseJsonPayloads(text) : [];
  const first = sse[0] ?? null;
  const last = sse.length ? sse[sse.length - 1] : null;

  const requestId =
    body?.request_id ??
    body?.tokfai?.request_id ??
    body?.error?.request_id ??
    first?.request_id ??
    first?.tokfai?.request_id ??
    last?.request_id ??
    last?.tokfai?.request_id ??
    last?.response?.request_id ??
    headers?.get?.("x-request-id") ??
    null;

  const requestedModel =
    body?.tokfai?.requested_model ??
    body?.requested_model ??
    first?.tokfai?.requested_model ??
    last?.tokfai?.requested_model ??
    null;

  const resolvedModel =
    body?.tokfai?.resolved_model ??
    body?.resolved_model ??
    body?.model ??
    first?.model ??
    last?.model ??
    last?.response?.model ??
    null;

  const creditsRaw =
    body?.credits_charged ??
    body?.tokfai?.credits_charged ??
    first?.credits_charged ??
    first?.tokfai?.credits_charged ??
    last?.credits_charged ??
    last?.tokfai?.credits_charged ??
    null;

  const billingStatus =
    body?.tokfai?.billing_status ??
    body?.billing_status ??
    first?.tokfai?.billing_status ??
    last?.tokfai?.billing_status ??
    null;

  const errorCode = body?.error?.code ?? null;
  const errorMessage = body?.error?.message ?? null;

  return {
    request_id: requestId == null ? null : String(requestId),
    requested_model: requestedModel == null ? null : String(requestedModel),
    resolved_model: resolvedModel == null ? null : String(resolvedModel),
    credits_charged:
      typeof creditsRaw === "number"
        ? creditsRaw
        : creditsRaw == null || creditsRaw === ""
          ? null
          : Number(creditsRaw),
    billing_status: billingStatus == null ? null : String(billingStatus),
    "error.code": errorCode == null ? null : String(errorCode),
    "error.message":
      errorMessage == null ? null : redactUpstream(String(errorMessage)),
  };
}

function containsUndefinedLiteral(text) {
  return /\bundefined\b/i.test(String(text ?? ""));
}

function assertNoUndefinedInRow(row) {
  for (const [k, v] of Object.entries(row)) {
    if (v === undefined) return `field ${k} is undefined`;
  }
  return null;
}

function buildRow({
  route,
  model,
  status,
  ok,
  latencyMs,
  meta,
}) {
  return {
    route,
    model: model ?? null,
    status,
    ok: Boolean(ok),
    latencyMs: Math.round(latencyMs),
    request_id: meta.request_id,
    requested_model: meta.requested_model,
    resolved_model: meta.resolved_model,
    credits_charged:
      meta.credits_charged == null || Number.isNaN(meta.credits_charged)
        ? null
        : meta.credits_charged,
    billing_status: meta.billing_status,
    "error.code": meta["error.code"],
    "error.message": meta["error.message"],
  };
}

function printRow(row) {
  console.log(
    JSON.stringify({
      route: row.route,
      model: row.model,
      status: row.status,
      ok: row.ok,
      latencyMs: row.latencyMs,
      request_id: row.request_id,
      requested_model: row.requested_model,
      resolved_model: row.resolved_model,
      credits_charged: row.credits_charged,
      billing_status: row.billing_status,
      "error.code": row["error.code"],
      "error.message": row["error.message"],
    })
  );
}

function validateProbe({
  route,
  status,
  text,
  body,
  isStream,
  label,
}) {
  if (!text || !String(text).trim()) {
    return { ok: false, detail: `${label}: empty body` };
  }
  if (containsUndefinedLiteral(text)) {
    return { ok: false, detail: `${label}: body contains literal "undefined"` };
  }

  if (status === 200) {
    if (isStream) {
      const ctHint =
        text.includes("data:") ||
        text.includes("event:") ||
        /\[DONE\]/.test(text);
      if (!ctHint) {
        return {
          ok: false,
          detail: `${label}: HTTP 200 stream body missing SSE markers`,
        };
      }
      return { ok: true, detail: null };
    }

    if (route === "GET /v1/models") {
      if (!Array.isArray(body?.data)) {
        return { ok: false, detail: `${label}: models data missing` };
      }
      return { ok: true, detail: null };
    }

    if (route.includes("/v1/chat/completions")) {
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== "string" || !content.length) {
        return {
          ok: false,
          detail: `${label}: chat completion missing content`,
        };
      }
      return { ok: true, detail: null };
    }

    if (route.includes("/v1/responses")) {
      if (body?.object !== "response") {
        return {
          ok: false,
          detail: `${label}: responses object missing`,
        };
      }
      return { ok: true, detail: null };
    }

    return { ok: true, detail: null };
  }

  // Non-200 must be an explicit Tokfai error envelope (JSON).
  let jsonBody = body;
  if (body?._raw != null) {
    try {
      jsonBody = JSON.parse(text);
    } catch {
      return {
        ok: false,
        detail: `${label}: non-200 non-JSON body (not Tokfai envelope)`,
      };
    }
  }
  if (!isTokfaiErrorEnvelope(jsonBody)) {
    return {
      ok: false,
      detail: `${label}: HTTP ${status} without Tokfai error envelope {error.message,code,type}`,
    };
  }
  if (containsUndefinedLiteral(jsonBody.error.message)) {
    return {
      ok: false,
      detail: `${label}: error.message contains "undefined"`,
    };
  }
  return { ok: true, detail: null };
}

async function main() {
  const ctx = await bootstrapClientCompatSmoke(SCRIPT);
  // Re-mask: bootstrap already prints a prefix; reinforce hard limit.
  console.log(`api_key_masked: ${maskKey(ctx.API_KEY)}`);
  console.log(`models: ${MODELS.join(", ")}`);
  console.log("");

  const rows = [];
  let allOk = true;
  let lastJsonBody = null;

  async function probe({
    route,
    model,
    method,
    path,
    body,
    isStream = false,
  }) {
    const label = model ? `${route} model=${model}` : route;
    const started = performance.now();
    let res;
    let json;
    let text;
    try {
      ({ res, body: json, text } = await acceptanceFetch(`${ctx.BASE}${path}`, {
        method,
        headers: ctx.authHeaders(),
        body: body == null ? undefined : JSON.stringify(body),
        timeoutMs: ctx.TIMEOUT_MS,
      }));
    } catch (err) {
      const latencyMs = performance.now() - started;
      const message = redactUpstream(
        err instanceof Error ? err.message : String(err)
      );
      const row = buildRow({
        route,
        model,
        status: 0,
        ok: false,
        latencyMs,
        meta: {
          request_id: null,
          requested_model: model ?? null,
          resolved_model: null,
          credits_charged: null,
          billing_status: null,
          "error.code": "network_error",
          "error.message": message,
        },
      });
      rows.push(row);
      printRow(row);
      allOk = fail(label, `network: ${message}`) && allOk;
      lastJsonBody = null;
      return row;
    }

    const latencyMs = performance.now() - started;
    lastJsonBody = json;
    const meta = extractMeta(json, text, res.headers);
    if (model && meta.requested_model == null) {
      meta.requested_model = model;
    }

    const verdict = validateProbe({
      route,
      status: res.status,
      text,
      body: json,
      isStream,
      label,
    });

    const row = buildRow({
      route,
      model,
      status: res.status,
      ok: verdict.ok,
      latencyMs,
      meta,
    });

    const undefErr = assertNoUndefinedInRow(row);
    if (undefErr) {
      row.ok = false;
      allOk = fail(label, undefErr) && allOk;
    } else if (!verdict.ok) {
      allOk = fail(label, verdict.detail) && allOk;
    } else {
      pass(label);
    }

    rows.push(row);
    printRow(row);
    return row;
  }

  // 1) Catalog
  const modelsRow = await probe({
    route: "GET /v1/models",
    model: null,
    method: "GET",
    path: "/v1/models",
  });

  const catalogIds = new Set(
    modelsRow.ok && modelsRow.status === 200 && Array.isArray(lastJsonBody?.data)
      ? lastJsonBody.data
          .map((m) => m?.id)
          .filter((id) => typeof id === "string" && id.length > 0)
      : []
  );

  const availableModels = MODELS.filter((m) => catalogIds.has(m));
  const missingFromCatalog = MODELS.filter((m) => !catalogIds.has(m));
  console.log(
    `\navailable_models (${availableModels.length}/${MODELS.length}): ${
      availableModels.join(", ") || "(none)"
    }`
  );
  if (missingFromCatalog.length) {
    console.log(
      `not_in_catalog (still probed): ${missingFromCatalog.join(", ")}`
    );
  }
  console.log("");

  // Always probe the configured model list — catalog membership is diagnostic.
  for (const model of MODELS) {
    await probe({
      route: "POST /v1/chat/completions stream=false",
      model,
      method: "POST",
      path: "/v1/chat/completions",
      body: {
        model,
        messages: [{ role: "user", content: PROMPT }],
        stream: false,
      },
    });

    await probe({
      route: "POST /v1/chat/completions stream=true",
      model,
      method: "POST",
      path: "/v1/chat/completions",
      body: {
        model,
        messages: [{ role: "user", content: PROMPT }],
        stream: true,
      },
      isStream: true,
    });

    await probe({
      route: "POST /v1/responses stream=false",
      model,
      method: "POST",
      path: "/v1/responses",
      body: {
        model,
        input: PROMPT,
        stream: false,
      },
    });

    await probe({
      route: "POST /v1/responses stream=true",
      model,
      method: "POST",
      path: "/v1/responses",
      body: {
        model,
        input: PROMPT,
        stream: true,
      },
      isStream: true,
    });
  }

  // Isolation gate: every available-model probe is 200 or Tokfai envelope.
  const availableSet = new Set(
    availableModels.length ? availableModels : MODELS
  );
  for (const row of rows) {
    if (row.route === "GET /v1/models") continue;
    if (row.model && !availableSet.has(row.model)) continue;
    if (!row.ok) {
      allOk = false;
      continue;
    }
    const allowed =
      row.status === 200 ||
      (row.status >= 400 &&
        row["error.code"] != null &&
        row["error.message"] != null);
    if (!allowed) {
      allOk =
        fail(
          `isolation ${row.route} model=${row.model}`,
          `status=${row.status} not 200 and not Tokfai error`
        ) && allOk;
    }
  }

  // Final sweep: every output field must be defined (null allowed).
  for (const row of rows) {
    const err = assertNoUndefinedInRow(row);
    if (err) {
      allOk = fail("row integrity", err) && allOk;
    }
  }

  ctx.cleanup();
  console.log("");
  console.log(
    `summary: ${rows.filter((r) => r.ok).length}/${rows.length} probes ok`
  );
  console.log(allOk ? PASS_MARKER : FAIL_MARKER);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(redactUpstream(err instanceof Error ? err.message : String(err)));
  console.log(FAIL_MARKER);
  process.exit(1);
});
