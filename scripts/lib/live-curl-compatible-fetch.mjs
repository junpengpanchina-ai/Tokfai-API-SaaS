/**
 * Exact curl-compatible HTTPS POST for live Responses / Chat probes.
 *
 * Uses Node `https`/`http` (not undici fetch) so no automatic Accept /
 * Accept-Encoding / User-Agent headers are injected — matching:
 *
 *   curl -H "Authorization: Bearer …" -H "Content-Type: application/json" -d '…'
 *
 * Shared runners:
 *   - runLiveResponsesNonStreamProbe()
 *   - runLiveChatCompletionsNonStreamProbe()
 *
 * Used by:
 *   - scripts/live-responses-curl-compatible-probe.mjs
 *   - scripts/public-beta-live-acceptance.mjs (responses + chat non-stream)
 *
 * Never logs full API keys.
 */

import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

export const LIVE_RESPONSES_PROMPT = "Say OK in one short sentence.";
export const LIVE_CHAT_PROMPT = LIVE_RESPONSES_PROMPT;

export function maskApiKeyShort(key) {
  if (!key || typeof key !== "string") return "(missing)";
  if (key.length <= 14) return "(redacted)";
  return `${key.slice(0, 10)}…${key.slice(-4)}`;
}

export function buildResponsesNonStreamPayload(model) {
  return {
    model,
    input: LIVE_RESPONSES_PROMPT,
    stream: false,
  };
}

export function buildChatCompletionsNonStreamPayload(model) {
  return {
    model,
    messages: [{ role: "user", content: LIVE_CHAT_PROMPT }],
    stream: false,
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Low-level request with exact caller-supplied headers only (+ Content-Length).
 */
export function exactCurlCompatibleFetch(url, options = {}) {
  const method = (options.method ?? "POST").toUpperCase();
  const bodyText =
    typeof options.body === "string"
      ? options.body
      : options.body !== undefined
        ? JSON.stringify(options.body)
        : "";
  const timeoutMs = options.timeoutMs ?? 120_000;

  /** @type {Record<string, string>} */
  const headers = { ...(options.headers ?? {}) };
  // Fingerprint only the intentional curl headers (not Content-Length).
  const headerKeys = Object.keys(headers).sort();
  if (bodyText.length > 0 && !headers["Content-Length"] && !headers["content-length"]) {
    headers["Content-Length"] = String(Buffer.byteLength(bodyText, "utf8"));
  }

  const parsed = new URL(url);
  const transport = parsed.protocol === "http:" ? http : https;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "http:" ? 80 : 443),
        path: `${parsed.pathname}${parsed.search}`,
        method,
        headers,
        agent: false,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const emptyRawBody = text.length === 0;
          /** @type {Record<string, string>} */
          const flatHeaders = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (v == null) continue;
            flatHeaders[k.toLowerCase()] = Array.isArray(v)
              ? v.join(", ")
              : String(v);
          }
          let body = {};
          if (!emptyRawBody) {
            try {
              body = JSON.parse(text);
            } catch {
              body = { _raw: text };
            }
          }
          resolve({
            status: res.statusCode ?? 0,
            headers: flatHeaders,
            text,
            body,
            url,
            headerKeys,
            emptyRawBody,
          });
        });
      }
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(
        new Error(`exactCurlCompatibleFetch timeout after ${timeoutMs}ms`)
      );
    });
    req.on("error", reject);
    if (bodyText) req.write(bodyText);
    req.end();
  });
}

/**
 * One-shot POST /v1/responses non-stream with curl-identical headers + body.
 */
export async function postResponsesNonStreamCurlCompatible(args) {
  const {
    apiBase,
    apiKey,
    model,
    timeoutMs = 120_000,
  } = args;

  const base = String(apiBase || "").replace(/\/+$/, "");
  const url = `${base}/v1/responses`;
  const payload = buildResponsesNonStreamPayload(model);
  const bodyJson = JSON.stringify(payload);

  const result = await exactCurlCompatibleFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: bodyJson,
    timeoutMs,
  });

  return {
    ...result,
    payload,
    bodyJson,
    model,
    stream: false,
    method: "POST",
    route: "/v1/responses",
    url,
  };
}

export function responsesNonStreamSucceeded(result) {
  if (result.status < 200 || result.status >= 300) return false;
  const body = result.body;
  if (!body || typeof body !== "object") return false;
  if (
    typeof body.output_text === "string" &&
    body.output_text.trim().length > 0
  ) {
    return true;
  }
  return Array.isArray(body.output) && body.output.length > 0;
}

/**
 * One-shot POST /v1/chat/completions non-stream with curl-identical headers + body.
 */
export async function postChatCompletionsNonStreamCurlCompatible(args) {
  const {
    apiBase,
    apiKey,
    model,
    timeoutMs = 120_000,
  } = args;

  const base = String(apiBase || "").replace(/\/+$/, "");
  const url = `${base}/v1/chat/completions`;
  const payload = buildChatCompletionsNonStreamPayload(model);
  const bodyJson = JSON.stringify(payload);

  const result = await exactCurlCompatibleFetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: bodyJson,
    timeoutMs,
  });

  return {
    ...result,
    payload,
    bodyJson,
    model,
    stream: false,
    method: "POST",
    route: "/v1/chat/completions",
    url,
  };
}

export function chatCompletionsNonStreamSucceeded(result) {
  if (result.status < 200 || result.status >= 300) return false;
  const body = result.body;
  if (!body || typeof body !== "object") return false;
  if (Array.isArray(body.choices) && body.choices.length > 0) return true;
  return body.object === "chat.completion";
}

export function extractErrorCode(body) {
  if (!body || typeof body !== "object") return null;
  const err = body.error;
  if (err && typeof err === "object" && typeof err.code === "string") {
    return err.code;
  }
  if (typeof body.code === "string") return body.code;
  return null;
}

export function extractRequestIdFromResult(result) {
  return (
    (typeof result.body?.request_id === "string" && result.body.request_id) ||
    result.headers?.["x-request-id"] ||
    (typeof result.body?.id === "string" && result.body.id) ||
    (typeof result.body?.error?.request_id === "string" &&
      result.body.error.request_id) ||
    null
  );
}

function isUpstreamDegradedCode(code) {
  return (
    code === "upstream_timeout" ||
    code === "upstream_model_busy" ||
    code === "image_generation_timeout" ||
    code === "retryable_timeout"
  );
}

/**
 * Redacted debug fingerprint. Never prints full API key.
 */
export function printCurlCompatibleDebug(result, apiKey, extra = {}) {
  const preview = (result?.text ?? "").slice(0, 500);
  const payload = result?.payload ?? {};
  const payloadKeys =
    payload && typeof payload === "object"
      ? Object.keys(payload).sort().join(",")
      : "(none)";
  console.error("DEBUG  exactCurlCompatibleFetch fingerprint (redacted)");
  console.error(`      route=${result?.route ?? "(n/a)"}`);
  console.error(`      method=${result?.method ?? "POST"}`);
  console.error(`      model=${result?.model ?? "(n/a)"}`);
  console.error(`      stream=${Boolean(result?.stream)}`);
  console.error(`      payload_keys=${payloadKeys}`);
  console.error(
    `      payload_json=${result?.bodyJson ?? JSON.stringify(payload)}`
  );
  console.error(
    `      headers_keys=${(result?.headerKeys ?? []).join(",") || "(none)"}`
  );
  console.error(`      status=${result?.status ?? "(n/a)"}`);
  console.error(
    `      content_type=${result?.headers?.["content-type"] ?? "(n/a)"}`
  );
  console.error(
    `      request_id=${
      result ? extractRequestIdFromResult(result) ?? "(n/a)" : "(n/a)"
    }`
  );
  console.error(`      raw_body_length=${(result?.text ?? "").length}`);
  console.error(`      body_preview=${JSON.stringify(preview)}`);
  console.error(`      final_url=${result?.url ?? "(n/a)"}`);
  if (result?.emptyRawBody) {
    console.error("      EMPTY_RAW_BODY_FROM_FETCH");
  }
  if (extra.runnerMismatch) {
    console.error(`      runner_mismatch=${extra.runnerMismatch}`);
  }
  console.error(`      api_key=${maskApiKeyShort(apiKey)}`);
  if (typeof result?.attempt === "number") {
    console.error(`      attempt=${result.attempt}`);
  }
}

/**
 * Shared empty-body / degraded classification for curl-compatible runners.
 */
async function runCurlCompatibleNonStreamProbe(args, postOnce, succeeded) {
  const {
    apiBase,
    apiKey,
    model,
    timeoutMs = 120_000,
    retries = 3,
    retryDelayMs = 1500,
  } = args;

  let last = null;

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const result = await postOnce({
      apiBase,
      apiKey,
      model,
      timeoutMs,
    });
    result.attempt = attempt;
    last = result;

    if (succeeded(result)) {
      return {
        ok: true,
        kind: "pass",
        result,
        requestId: extractRequestIdFromResult(result),
      };
    }

    const shouldRetry =
      result.emptyRawBody ||
      result.status === 0 ||
      (result.status === 400 && result.emptyRawBody);

    if (shouldRetry && attempt < retries) {
      await sleep(retryDelayMs * attempt);
      continue;
    }

    const code = extractErrorCode(result.body);
    if (isUpstreamDegradedCode(code)) {
      return {
        ok: false,
        kind: "degraded",
        result,
        code,
        requestId: extractRequestIdFromResult(result),
      };
    }

    if (result.emptyRawBody) {
      return {
        ok: false,
        kind: "empty_body",
        result,
        requestId: extractRequestIdFromResult(result),
      };
    }

    return {
      ok: false,
      kind: "error",
      result,
      code,
      requestId: extractRequestIdFromResult(result),
    };
  }

  return {
    ok: false,
    kind: "empty_body",
    result: last,
    requestId: last ? extractRequestIdFromResult(last) : null,
  };
}

/**
 * Shared runner for POST /v1/responses non-stream (standalone + acceptance).
 * Success: HTTP 2xx + output_text/output. credits optional.
 */
export async function runLiveResponsesNonStreamProbe(args) {
  return runCurlCompatibleNonStreamProbe(
    args,
    postResponsesNonStreamCurlCompatible,
    responsesNonStreamSucceeded
  );
}

/**
 * Shared runner for POST /v1/chat/completions non-stream (acceptance).
 * Success: HTTP 2xx + choices[] / chat.completion. credits optional at runner layer.
 */
export async function runLiveChatCompletionsNonStreamProbe(args) {
  return runCurlCompatibleNonStreamProbe(
    args,
    postChatCompletionsNonStreamCurlCompatible,
    chatCompletionsNonStreamSucceeded
  );
}
