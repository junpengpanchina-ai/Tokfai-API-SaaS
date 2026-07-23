/**
 * Shared helpers for P944 / P945 client latency & concurrency experience smokes.
 * Measurement / judgment only — does not touch production paths.
 */

import { mergeAcceptanceHeaders } from "./acceptance-http.mjs";
import {
  extractCredits,
  extractErrorObject,
  percentile,
} from "./public-beta-live-helpers.mjs";

export const P944_RESULT_COLUMNS = [
  "model",
  "route",
  "stream",
  "status",
  "firstByteMs",
  "firstSseMs",
  "firstContentMs",
  "totalMs",
  "requestId",
  "creditsCharged",
  "errorCode",
  "billingStatus",
];

export const P944_SUMMARY_COLUMNS = [
  "group",
  "n",
  "successN",
  "failN",
  "p50FirstByteMs",
  "p95FirstByteMs",
  "p99FirstByteMs",
  "p50FirstSseMs",
  "p95FirstSseMs",
  "p99FirstSseMs",
  "p50FirstContentMs",
  "p95FirstContentMs",
  "p99FirstContentMs",
  "p50TotalMs",
  "p95TotalMs",
  "p99TotalMs",
];

export const P945_RESULT_COLUMNS = [
  "index",
  "concurrency",
  "model",
  "route",
  "stream",
  "status",
  "firstByteMs",
  "firstSseMs",
  "firstContentMs",
  "totalMs",
  "requestId",
  "creditsCharged",
  "errorCode",
  "errorMessage",
  "billingStatus",
  "emptyBody",
  "ok",
];

export const P945_SUMMARY_COLUMNS = [
  "concurrency",
  "requests",
  "successN",
  "failN",
  "status429N",
  "status5xxN",
  "emptyBodyN",
  "chargedTimeoutN",
  "p50FirstByteMs",
  "p95FirstByteMs",
  "p99FirstByteMs",
  "p50FirstSseMs",
  "p95FirstSseMs",
  "p99FirstSseMs",
  "p50TotalMs",
  "p95TotalMs",
  "p99TotalMs",
];

export const DEFAULT_EXPERIENCE_MODELS = [
  "gpt-5.5",
  "gpt-5-pro",
  "gpt-5.4-pro",
  "gemini-3-pro",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
];

export const DEFAULT_EXPERIENCE_ROUTES = [
  { route: "POST /v1/chat/completions", path: "/v1/chat/completions", stream: true },
  { route: "POST /v1/chat/completions", path: "/v1/chat/completions", stream: false },
  { route: "POST /v1/responses", path: "/v1/responses", stream: true },
  { route: "POST /v1/responses", path: "/v1/responses", stream: false },
];

const PROMPT = "Say ok only.";

export function maskKey(key) {
  if (!key || key.length <= 12) return "(not set)";
  return `${key.slice(0, 12)}…${key.slice(-4)} (len=${key.length})`;
}

export function csvEscape(value) {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(columns, rows) {
  const lines = [columns.join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(row[c])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

export function roundMs(n) {
  if (n == null || Number.isNaN(n)) return "";
  return Math.round(n);
}

export function percentileMs(values, p) {
  const nums = values
    .filter((v) => typeof v === "number" && Number.isFinite(v))
    .slice()
    .sort((a, b) => a - b);
  if (!nums.length) return "";
  return Math.round(percentile(nums, p));
}

export function buildChatBody({ model, stream, maxTokens }) {
  const body = {
    model,
    messages: [{ role: "user", content: PROMPT }],
    stream: Boolean(stream),
  };
  if (maxTokens != null) body.max_tokens = maxTokens;
  return body;
}

export function buildResponsesBody({ model, stream, maxOutputTokens }) {
  const body = {
    model,
    input: PROMPT,
    stream: Boolean(stream),
  };
  if (maxOutputTokens != null) body.max_output_tokens = maxOutputTokens;
  return body;
}

export function buildRequestBody({ path, model, stream, maxTokens }) {
  if (path.includes("/responses")) {
    return buildResponsesBody({
      model,
      stream,
      maxOutputTokens: maxTokens,
    });
  }
  return buildChatBody({ model, stream, maxTokens });
}

function extractBillingStatus(body, frames = []) {
  const candidates = [
    body?.tokfai?.billing_status,
    body?.billing_status,
    ...frames.flatMap((f) => [
      f?.tokfai?.billing_status,
      f?.billing_status,
      f?.response?.tokfai?.billing_status,
    ]),
  ];
  for (const v of candidates) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

/**
 * Prefer real request_id fields; fall back to OpenAI-style ids / raw regex
 * so stream frames without a top-level request_id still correlate.
 */
export function extractExperienceRequestId({ body, frames = [], res, text }) {
  const candidates = [];

  function push(v) {
    if (typeof v === "string" && v.trim()) candidates.push(v.trim());
  }

  push(body?.request_id);
  push(body?.tokfai?.request_id);
  push(body?.error?.request_id);
  push(body?.response?.request_id);
  push(res?.headers?.get?.("x-request-id"));

  for (const f of frames) {
    push(f?.request_id);
    push(f?.tokfai?.request_id);
    push(f?.error?.request_id);
    push(f?.response?.request_id);
    push(f?.response?.tokfai?.request_id);
  }

  if (typeof text === "string" && text) {
    const m = text.match(/"request_id"\s*:\s*"([^"]+)"/);
    if (m?.[1]) push(m[1]);
  }

  // Correlators (mock / OpenAI-shaped streams)
  push(body?.id);
  push(body?.response?.id);
  for (const f of frames) {
    push(f?.id);
    push(f?.response?.id);
  }

  return candidates[0] ?? "";
}

function extractCreditsFromFrames(body, frames = []) {
  const direct = extractCredits(body);
  if (direct != null) return direct;
  for (let i = frames.length - 1; i >= 0; i -= 1) {
    const c = extractCredits(frames[i]);
    if (c != null) return c;
  }
  return null;
}

function frameHasContent(obj) {
  if (!obj || typeof obj !== "object") return false;

  // Chat completions SSE delta
  const delta = obj?.choices?.[0]?.delta;
  if (delta) {
    if (typeof delta.content === "string" && delta.content.length > 0) return true;
    if (typeof delta.text === "string" && delta.text.length > 0) return true;
    if (Array.isArray(delta.content)) {
      for (const part of delta.content) {
        if (typeof part === "string" && part.length > 0) return true;
        if (part && typeof part.text === "string" && part.text.length > 0) {
          return true;
        }
      }
    }
  }

  // Non-stream chat
  const msg = obj?.choices?.[0]?.message?.content;
  if (typeof msg === "string" && msg.length > 0) return true;
  if (Array.isArray(msg) && msg.some((p) => (typeof p === "string" ? p : p?.text))) {
    return true;
  }

  // Responses API
  if (typeof obj?.output_text === "string" && obj.output_text.length > 0) {
    return true;
  }
  if (typeof obj?.delta === "string" && obj.delta.length > 0) return true;
  if (typeof obj?.text === "string" && obj.text.length > 0 && obj.type) {
    return true;
  }
  const t = typeof obj?.type === "string" ? obj.type : "";
  if (
    t.includes("output_text.delta") ||
    t.includes("content_part.delta") ||
    t === "response.output_text.delta"
  ) {
    if (typeof obj.delta === "string" && obj.delta.length > 0) return true;
    if (typeof obj?.text === "string" && obj.text.length > 0) return true;
  }
  return false;
}

function parseSseFrames(text) {
  const frames = [];
  if (!text) return frames;
  for (const line of String(text).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      frames.push(JSON.parse(payload));
    } catch {
      // ignore non-JSON data lines
    }
  }
  return frames;
}

/**
 * Incremental SSE scanner — updates firstSseMs / firstContentMs as chunks arrive.
 */
export function createSseTimingScanner(t0) {
  let buffer = "";
  let firstSseMs = null;
  let firstContentMs = null;
  /** @type {object[]} */
  const frames = [];

  function onChunk(chunkText) {
    buffer += chunkText;
    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      let line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (trimmed.startsWith("data:") || trimmed.startsWith("event:")) {
        if (firstSseMs == null) {
          firstSseMs = performance.now() - t0;
        }
      }
      if (!trimmed.startsWith("data:")) continue;
      const payload = trimmed.slice(5).trim();
      if (!payload || payload === "[DONE]") continue;
      try {
        const parsed = JSON.parse(payload);
        frames.push(parsed);
        if (firstContentMs == null && frameHasContent(parsed)) {
          firstContentMs = performance.now() - t0;
        }
      } catch {
        // ignore
      }
    }
  }

  function finish() {
    if (buffer.trim()) onChunk("\n");
    return { firstSseMs, firstContentMs, frames, text: "" };
  }

  return {
    onChunk,
    finish,
    get firstSseMs() {
      return firstSseMs;
    },
    get firstContentMs() {
      return firstContentMs;
    },
    get frames() {
      return frames;
    },
    get bufferText() {
      return buffer;
    },
  };
}

/**
 * Timed probe with first-byte / first-SSE / first-content measurement.
 * Uses streaming body read for stream=true; non-stream still measures TTFB.
 */
export async function timedExperienceProbe({
  base,
  path,
  model,
  stream,
  body,
  headers,
  timeoutMs,
  curlCompatible = false,
}) {
  const url = `${base}${path}`;
  const t0 = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  /** @type {Record<string, unknown>} */
  const rowBase = {
    model,
    route: path.includes("/responses")
      ? "POST /v1/responses"
      : "POST /v1/chat/completions",
    stream: stream ? "true" : "false",
    status: 0,
    firstByteMs: "",
    firstSseMs: "",
    firstContentMs: "",
    totalMs: "",
    requestId: "",
    creditsCharged: "",
    errorCode: "",
    errorMessage: "",
    billingStatus: "",
    emptyBody: false,
    rawText: "",
  };

  try {
    const reqHeaders = curlCompatible
      ? { ...(headers ?? {}) }
      : mergeAcceptanceHeaders(headers ?? {});

    const res = await fetch(url, {
      method: "POST",
      headers: reqHeaders,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    const firstByteMs = performance.now() - t0;
    rowBase.status = res.status;
    rowBase.firstByteMs = roundMs(firstByteMs);

    const headerRequestId = res.headers.get("x-request-id") ?? "";

    if (stream) {
      const scanner = createSseTimingScanner(t0);
      const reader = res.body?.getReader?.();
      const decoder = new TextDecoder();
      let fullText = "";

      if (!reader) {
        const text = await res.text();
        fullText = text;
        scanner.onChunk(text);
        scanner.finish();
      } else {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          fullText += chunk;
          scanner.onChunk(chunk);
        }
        fullText += decoder.decode();
        if (scanner.bufferText) scanner.onChunk("\n");
      }

      const totalMs = performance.now() - t0;
      const frames = scanner.frames;
      const lastFrame = frames.length ? frames[frames.length - 1] : null;
      let jsonBody = {};
      try {
        jsonBody = fullText && !fullText.includes("data:") ? JSON.parse(fullText) : {};
      } catch {
        jsonBody = { _raw: fullText };
      }

      // Prefer JSON error body when stream failed with application/json
      const errObj =
        extractErrorObject(jsonBody, fullText) ??
        extractErrorObject(lastFrame, fullText);

      const requestId =
        extractExperienceRequestId({
          body: jsonBody,
          frames,
          res,
          text: fullText,
        }) || headerRequestId;

      const credits = extractCreditsFromFrames(jsonBody, frames);
      const billingStatus = extractBillingStatus(jsonBody, frames);
      const emptyBody = !fullText || !String(fullText).trim();

      rowBase.firstSseMs =
        scanner.firstSseMs == null ? "" : roundMs(scanner.firstSseMs);
      rowBase.firstContentMs =
        scanner.firstContentMs == null ? "" : roundMs(scanner.firstContentMs);
      rowBase.totalMs = roundMs(totalMs);
      rowBase.requestId = requestId == null ? "" : String(requestId);
      rowBase.creditsCharged =
        credits == null || Number.isNaN(credits) ? "" : credits;
      rowBase.errorCode =
        errObj?.code == null && errObj?.type == null
          ? ""
          : String(errObj.code ?? errObj.type ?? "");
      rowBase.errorMessage =
        errObj?.message == null ? "" : String(errObj.message).slice(0, 240);
      rowBase.billingStatus = billingStatus;
      rowBase.emptyBody = emptyBody;
      rowBase.rawText = fullText;
      return rowBase;
    }

    // Non-stream: read full body; firstContent when JSON has content.
    const text = await res.text();
    const totalMs = performance.now() - t0;
    let jsonBody = {};
    try {
      jsonBody = text ? JSON.parse(text) : {};
    } catch {
      jsonBody = { _raw: text };
    }

    const errObj = extractErrorObject(jsonBody, text);
    const requestId =
      extractExperienceRequestId({
        body: jsonBody,
        frames: [],
        res,
        text,
      }) || headerRequestId;
    const credits = extractCredits(jsonBody);
    const billingStatus = extractBillingStatus(jsonBody);
    const emptyBody = !text || !String(text).trim();
    const hasContent = frameHasContent(jsonBody);

    rowBase.firstSseMs = "";
    rowBase.firstContentMs = hasContent ? roundMs(totalMs) : "";
    // Non-stream: content arrives with the full body; TTFB still useful.
    if (hasContent && res.ok) {
      rowBase.firstContentMs = roundMs(totalMs);
    }
    rowBase.totalMs = roundMs(totalMs);
    rowBase.requestId = requestId == null ? "" : String(requestId);
    rowBase.creditsCharged =
      credits == null || Number.isNaN(credits) ? "" : credits;
    rowBase.errorCode =
      errObj?.code == null && errObj?.type == null
        ? ""
        : String(errObj.code ?? errObj.type ?? "");
    rowBase.errorMessage =
      errObj?.message == null ? "" : String(errObj.message).slice(0, 240);
    rowBase.billingStatus = billingStatus;
    rowBase.emptyBody = emptyBody;
    rowBase.rawText = text;
    return rowBase;
  } catch (err) {
    const totalMs = performance.now() - t0;
    const message = err instanceof Error ? err.message : String(err);
    const isTimeout =
      /timeout|abort|TimeoutError|AbortError/i.test(message) ||
      err?.name === "AbortError" ||
      err?.name === "TimeoutError";
    rowBase.status = 0;
    rowBase.totalMs = roundMs(totalMs);
    rowBase.errorCode = isTimeout ? "network_timeout" : "network_error";
    rowBase.errorMessage = message.slice(0, 240);
    rowBase.emptyBody = true;
    return rowBase;
  } finally {
    clearTimeout(timer);
  }
}

export function isHttpSuccess(status) {
  return typeof status === "number" && status >= 200 && status < 300;
}

export function isFailureRow(row) {
  const status = Number(row.status);
  if (!Number.isFinite(status) || status === 0) return true;
  if (status >= 400) return true;
  return false;
}

export function hasCharge(row) {
  const credits = row.creditsCharged;
  if (typeof credits === "number" && credits > 0) return true;
  if (typeof credits === "string" && credits.trim() !== "") {
    const n = Number(credits);
    if (Number.isFinite(n) && n > 0) return true;
  }
  const billing = String(row.billingStatus ?? "").toLowerCase();
  if (billing.includes("charged") && !billing.includes("not_billable")) {
    return true;
  }
  return false;
}

export function looksLikeChargedTimeout(row) {
  const msg = String(row.errorMessage ?? "").toLowerCase();
  if (msg.includes("charged timeout")) return true;
  const code = String(row.errorCode ?? "").toLowerCase();
  const isTimeout =
    /timeout/.test(code) ||
    /timeout|timed?\s*out|abort/.test(msg) ||
    Number(row.status) === 504 ||
    row.errorCode === "network_timeout";
  return isTimeout && hasCharge(row);
}

export function containsUndefinedLiteral(text) {
  return /\bundefined\b/i.test(String(text ?? ""));
}

export function messageOrCodeUndefined(row) {
  const code = row.errorCode;
  const message = row.errorMessage;
  if (code === "undefined" || message === "undefined") return true;
  if (containsUndefinedLiteral(row.rawText)) return true;
  return false;
}

/**
 * Stream early-SSE judgment:
 * - successful stream must record firstSseMs
 * - ordering: firstByte <= firstSse <= total
 * - buffering smell: firstSse ≈ total on multi-frame bodies fails
 */
export function judgeEarlySse(row, { bufferingRatio = 0.92 } = {}) {
  if (row.stream !== "true") return { ok: true, detail: null };
  if (!isHttpSuccess(Number(row.status))) return { ok: true, detail: null };

  const firstSse = Number(row.firstSseMs);
  const firstByte = Number(row.firstByteMs);
  const total = Number(row.totalMs);
  if (!Number.isFinite(firstSse) || firstSse <= 0) {
    return { ok: false, detail: "stream success missing firstSseMs" };
  }
  if (!Number.isFinite(firstByte) || firstByte < 0) {
    return { ok: false, detail: "stream success missing firstByteMs" };
  }
  if (!Number.isFinite(total) || total < firstSse) {
    return { ok: false, detail: "stream success totalMs < firstSseMs" };
  }
  if (firstByte - firstSse > 5) {
    return {
      ok: false,
      detail: `firstSseMs (${firstSse}) earlier than firstByteMs (${firstByte})`,
    };
  }

  const text = String(row.rawText ?? "");
  const dataLines = text.split(/\n/).filter((l) => l.trim().startsWith("data:")).length;
  if (dataLines >= 2 && total > 500 && firstSse / total >= bufferingRatio) {
    return {
      ok: false,
      detail: `SSE first frame late (possible buffering): firstSseMs=${firstSse} totalMs=${total} ratio=${(firstSse / total).toFixed(2)}`,
    };
  }
  return { ok: true, detail: null };
}

export function summarizeLatencyGroups(rows) {
  /** @type {Map<string, typeof rows>} */
  const groups = new Map();
  for (const row of rows) {
    const key = `${row.model}|${row.route}|stream=${row.stream}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  const allKey = "ALL";
  groups.set(allKey, rows);

  const out = [];
  for (const [group, list] of groups) {
    const success = list.filter((r) => isHttpSuccess(Number(r.status)));
    const fail = list.filter((r) => isFailureRow(r));
    const pick = (field) =>
      success
        .map((r) => r[field])
        .filter((v) => v !== "" && v != null)
        .map(Number)
        .filter((n) => Number.isFinite(n));

    out.push({
      group,
      n: list.length,
      successN: success.length,
      failN: fail.length,
      p50FirstByteMs: percentileMs(pick("firstByteMs"), 50),
      p95FirstByteMs: percentileMs(pick("firstByteMs"), 95),
      p99FirstByteMs: percentileMs(pick("firstByteMs"), 99),
      p50FirstSseMs: percentileMs(pick("firstSseMs"), 50),
      p95FirstSseMs: percentileMs(pick("firstSseMs"), 95),
      p99FirstSseMs: percentileMs(pick("firstSseMs"), 99),
      p50FirstContentMs: percentileMs(pick("firstContentMs"), 50),
      p95FirstContentMs: percentileMs(pick("firstContentMs"), 95),
      p99FirstContentMs: percentileMs(pick("firstContentMs"), 99),
      p50TotalMs: percentileMs(pick("totalMs"), 50),
      p95TotalMs: percentileMs(pick("totalMs"), 95),
      p99TotalMs: percentileMs(pick("totalMs"), 99),
    });
  }
  return out;
}

export function summarizeConcurrency(rows, concurrency) {
  const success = rows.filter((r) => isHttpSuccess(Number(r.status)));
  const fail = rows.filter((r) => isFailureRow(r));
  const status429N = rows.filter((r) => Number(r.status) === 429).length;
  const status5xxN = rows.filter((r) => {
    const s = Number(r.status);
    return s >= 500 && s < 600;
  }).length;
  const emptyBodyN = rows.filter((r) => r.emptyBody).length;
  const chargedTimeoutN = rows.filter((r) => looksLikeChargedTimeout(r)).length;
  const pick = (field) =>
    success
      .map((r) => r[field])
      .filter((v) => v !== "" && v != null)
      .map(Number)
      .filter((n) => Number.isFinite(n));

  return {
    concurrency,
    requests: rows.length,
    successN: success.length,
    failN: fail.length,
    status429N,
    status5xxN,
    emptyBodyN,
    chargedTimeoutN,
    p50FirstByteMs: percentileMs(pick("firstByteMs"), 50),
    p95FirstByteMs: percentileMs(pick("firstByteMs"), 95),
    p99FirstByteMs: percentileMs(pick("firstByteMs"), 99),
    p50FirstSseMs: percentileMs(pick("firstSseMs"), 50),
    p95FirstSseMs: percentileMs(pick("firstSseMs"), 95),
    p99FirstSseMs: percentileMs(pick("firstSseMs"), 99),
    p50TotalMs: percentileMs(pick("totalMs"), 50),
    p95TotalMs: percentileMs(pick("totalMs"), 95),
    p99TotalMs: percentileMs(pick("totalMs"), 99),
  };
}

export async function runPool(total, concurrency, worker) {
  const results = new Array(total);
  let next = 0;
  async function pump() {
    while (true) {
      const i = next;
      next += 1;
      if (i >= total) return;
      results[i] = await worker(i);
    }
  }
  const n = Math.max(1, Math.min(concurrency, total));
  await Promise.all(Array.from({ length: n }, () => pump()));
  return results;
}

/** Synthetic rows for SELF_TEST — pass all P944 judgments. */
export function buildSyntheticP944Rows(models = DEFAULT_EXPERIENCE_MODELS) {
  const rows = [];
  let i = 0;
  for (const model of models) {
    for (const spec of DEFAULT_EXPERIENCE_ROUTES) {
      i += 1;
      const stream = spec.stream;
      const base = 80 + (i % 7) * 12;
      rows.push({
        model,
        route: spec.route,
        stream: stream ? "true" : "false",
        status: 200,
        firstByteMs: base,
        firstSseMs: stream ? base + 5 : "",
        firstContentMs: stream ? base + 40 : base + 120,
        totalMs: stream ? base + 180 : base + 120,
        requestId: `req_self_${i}`,
        creditsCharged: 0.001,
        errorCode: "",
        errorMessage: "",
        billingStatus: "charged",
        emptyBody: false,
        rawText: stream
          ? `data: {"id":"x","choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n`
          : `{"id":"x","choices":[{"message":{"content":"ok"}}],"request_id":"req_self_${i}","credits_charged":0.001,"tokfai":{"billing_status":"charged"}}`,
      });
    }
  }
  // One intentional not_billable 429 sample for envelope/no-charge path coverage
  rows.push({
    model: models[0],
    route: "POST /v1/chat/completions",
    stream: "false",
    status: 429,
    firstByteMs: 20,
    firstSseMs: "",
    firstContentMs: "",
    totalMs: 25,
    requestId: "req_self_429",
    creditsCharged: 0,
    errorCode: "too_many_requests",
    errorMessage: "Rate limit exceeded",
    billingStatus: "not_billable",
    emptyBody: false,
    rawText: JSON.stringify({
      error: {
        code: "too_many_requests",
        message: "Rate limit exceeded",
        request_id: "req_self_429",
      },
      request_id: "req_self_429",
      tokfai: { billing_status: "not_billable", credits_charged: 0 },
    }),
  });
  return rows;
}

export function buildSyntheticP945Rows({ concurrency, requests, model, route, stream }) {
  const rows = [];
  for (let i = 0; i < requests; i += 1) {
    const is429 = concurrency >= 300 && i % 17 === 0;
    if (is429) {
      rows.push({
        index: i,
        concurrency,
        model,
        route,
        stream: stream ? "true" : "false",
        status: 429,
        firstByteMs: 15,
        firstSseMs: "",
        firstContentMs: "",
        totalMs: 18,
        requestId: `req_c${concurrency}_${i}`,
        creditsCharged: 0,
        errorCode: "too_many_requests",
        errorMessage: "Rate limit exceeded",
        billingStatus: "not_billable",
        emptyBody: false,
        ok: true,
        rawText: JSON.stringify({
          error: {
            code: "too_many_requests",
            message: "Rate limit exceeded",
            request_id: `req_c${concurrency}_${i}`,
          },
        }),
      });
      continue;
    }
    const base = 40 + (i % 9) * 8;
    rows.push({
      index: i,
      concurrency,
      model,
      route,
      stream: stream ? "true" : "false",
      status: 200,
      firstByteMs: base,
      firstSseMs: stream ? base + 4 : "",
      firstContentMs: stream ? base + 30 : base + 90,
      totalMs: stream ? base + 110 : base + 90,
      requestId: `req_c${concurrency}_${i}`,
      creditsCharged: 0.0005,
      errorCode: "",
      errorMessage: "",
      billingStatus: "charged",
      emptyBody: false,
      ok: true,
      rawText: stream
        ? `data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n`
        : `{"choices":[{"message":{"content":"ok"}}]}`,
    });
  }
  return rows;
}

/**
 * P944 acceptance judgments. Returns { ok, failures[] }.
 */
export function judgeP944Rows(rows) {
  const failures = [];

  for (const row of rows) {
    const label = `${row.model} ${row.route} stream=${row.stream} status=${row.status}`;
    const status = Number(row.status);

    if (status > 0 && !String(row.requestId ?? "").trim()) {
      failures.push(`${label}: missing request_id`);
    }

    if (isFailureRow(row)) {
      if (!String(row.errorCode ?? "").trim()) {
        failures.push(`${label}: failure missing error.code`);
      }
      if (!String(row.errorMessage ?? "").trim()) {
        failures.push(`${label}: failure missing error.message`);
      }
      if (hasCharge(row)) {
        failures.push(`${label}: failure/timeout/429 charged credits`);
      }
      if (looksLikeChargedTimeout(row)) {
        failures.push(`${label}: charged timeout`);
      }
    }

    if (Number(row.status) === 429 && hasCharge(row)) {
      failures.push(`${label}: 429 charged`);
    }

    const sse = judgeEarlySse(row);
    if (!sse.ok) failures.push(`${label}: ${sse.detail}`);
  }

  return { ok: failures.length === 0, failures };
}

/**
 * P945 acceptance judgments.
 */
export function judgeP945Rows(rows) {
  const failures = [];

  for (const row of rows) {
    const label = `idx=${row.index} status=${row.status}`;
    const status = Number(row.status);

    if (row.emptyBody && status !== 0) {
      failures.push(`${label}: empty body`);
    }
    if (messageOrCodeUndefined(row)) {
      failures.push(`${label}: message=undefined or code=undefined`);
    }
    if (looksLikeChargedTimeout(row)) {
      failures.push(`${label}: charged timeout`);
    }
    if (status >= 500 && status < 600) {
      failures.push(`${label}: HTTP 500-class ${status}`);
    }
    if (status === 429) {
      if (!String(row.errorCode ?? "").trim() || !String(row.errorMessage ?? "").trim()) {
        failures.push(`${label}: 429 missing standard envelope`);
      }
      if (!String(row.requestId ?? "").trim()) {
        failures.push(`${label}: 429 missing request_id`);
      }
      if (hasCharge(row)) {
        failures.push(`${label}: 429 not_billable required (charged)`);
      }
      const billing = String(row.billingStatus ?? "").toLowerCase();
      if (billing && billing !== "not_billable") {
        failures.push(`${label}: 429 billingStatus=${billing} (want not_billable)`);
      }
    }
  }

  return { ok: failures.length === 0, failures };
}
