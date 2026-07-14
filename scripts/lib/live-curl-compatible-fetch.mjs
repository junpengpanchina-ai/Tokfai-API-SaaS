/**
 * Exact curl-compatible HTTPS POST for live Responses probes.
 *
 * Uses Node `https`/`http` (not undici fetch) so no automatic Accept /
 * Accept-Encoding / User-Agent headers are injected — matching:
 *
 *   curl -H "Authorization: Bearer …" -H "Content-Type: application/json" -d '…'
 *
 * Never logs full API keys.
 */

import http from "node:http";
import https from "node:https";
import { URL } from "node:url";

export const LIVE_RESPONSES_PROMPT = "Say OK in one short sentence.";

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

/**
 * Low-level request with exact caller-supplied headers only (+ Content-Length).
 * @returns {Promise<{
 *   status: number,
 *   headers: Record<string, string>,
 *   text: string,
 *   body: unknown,
 *   url: string,
 *   headerKeys: string[],
 *   emptyRawBody: boolean,
 * }>}
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

  // Only the headers the caller passes — plus Content-Length for the body.
  /** @type {Record<string, string>} */
  const headers = { ...(options.headers ?? {}) };
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
        // Avoid connection reuse quirks across mixed fetch/https probes.
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
            flatHeaders[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : String(v);
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
      req.destroy(new Error(`exactCurlCompatibleFetch timeout after ${timeoutMs}ms`));
    });
    req.on("error", reject);
    if (bodyText) req.write(bodyText);
    req.end();
  });
}

/**
 * POST /v1/responses non-stream with curl-identical headers + body.
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

export function extractErrorCode(body) {
  if (!body || typeof body !== "object") return null;
  const err = body.error;
  if (err && typeof err === "object" && typeof err.code === "string") {
    return err.code;
  }
  if (typeof body.code === "string") return body.code;
  return null;
}

/**
 * Redacted debug for curl-compatible probe failures.
 * Never prints full API key.
 */
export function printCurlCompatibleDebug(result, apiKey) {
  const preview = (result.text ?? "").slice(0, 500);
  console.error("DEBUG  exactCurlCompatibleFetch failure (redacted)");
  console.error(`      url=${result.url}`);
  console.error(`      method=${result.method ?? "POST"}`);
  console.error(
    `      headers_keys=${(result.headerKeys ?? []).join(",") || "(none)"}`
  );
  console.error(`      model=${result.model ?? "(n/a)"}`);
  console.error(`      stream=${result.stream === true}`);
  console.error(`      payload_json=${result.bodyJson ?? JSON.stringify(result.payload ?? {})}`);
  console.error(`      http_status=${result.status}`);
  console.error(
    `      content_type=${result.headers?.["content-type"] ?? "(n/a)"}`
  );
  console.error(
    `      x_request_id=${result.headers?.["x-request-id"] ?? "(n/a)"}`
  );
  console.error(`      raw_body_length=${(result.text ?? "").length}`);
  if (result.emptyRawBody) {
    console.error("      EMPTY_RAW_BODY_FROM_FETCH");
  }
  console.error(`      raw_body_preview=${JSON.stringify(preview)}`);
  console.error(`      api_key=${maskApiKeyShort(apiKey)}`);
}
