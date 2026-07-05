#!/usr/bin/env node
/**
 * Tokfai production readiness smoke — run before customer demos or releases.
 *
 * Usage:
 *   node scripts/smoke-prod.mjs
 *   TOKFAI_TEST_API_KEY=sk-tokfai_... node scripts/smoke-prod.mjs
 *   TOKFAI_SMOKE_IMAGE=true TOKFAI_TEST_API_KEY=sk-tokfai_... node scripts/smoke-prod.mjs
 *
 * Env:
 *   TOKFAI_WEB_BASE       default https://www.tokfai.com
 *   TOKFAI_API_BASE       default https://api.tokfai.com
 *   TOKFAI_TEST_API_KEY   optional — chat/images checks SKIP when unset
 *   TOKFAI_SMOKE_IMAGE    default false — image failure is WARN unless true
 */

import {
  acceptanceFetch,
  getAcceptanceHeaders,
} from "./lib/acceptance-http.mjs";

const WEB_BASE = normalizeBase(
  process.env.TOKFAI_WEB_BASE,
  "https://www.tokfai.com"
);
const API_ROOT = normalizeBase(
  process.env.TOKFAI_API_BASE,
  "https://api.tokfai.com"
);
const API_V1 = API_ROOT.endsWith("/v1") ? API_ROOT : `${API_ROOT}/v1`;
const TEST_API_KEY = (process.env.TOKFAI_TEST_API_KEY ?? "").trim();
const SMOKE_IMAGE_STRICT =
  process.env.TOKFAI_SMOKE_IMAGE === "true" ||
  process.env.TOKFAI_SMOKE_IMAGE === "1";

const WEB_TIMEOUT_MS = Math.max(
  5000,
  parseInt(process.env.TOKFAI_SMOKE_WEB_TIMEOUT_MS ?? "30000", 10) || 30_000
);
const API_TIMEOUT_MS = Math.max(
  5000,
  parseInt(process.env.TOKFAI_SMOKE_API_TIMEOUT_MS ?? "120000", 10) || 120_000
);
const IMAGE_TIMEOUT_MS = Math.max(
  5000,
  parseInt(process.env.TOKFAI_SMOKE_IMAGE_TIMEOUT_MS ?? "180000", 10) || 180_000
);

/** @type {Array<{ id: string, status: 'PASS'|'WARN'|'FAIL'|'SKIP', detail: string }>} */
const results = [];

const ADMIN_LEAK_MARKERS = [
  "/admin/users",
  "/admin/api-keys",
  "/admin/logs",
  "/admin/overview",
  "User management",
  "用户管理",
  "API Keys",
  "API 密钥",
  "Credit orders",
  "充值订单",
  "Error logs",
  "错误日志",
  "Admin sections",
  "Operations overview",
  "运营概览",
];

const LOGIN_MARKERS = [
  "/login",
  "sign in",
  "Sign in",
  "Log in",
  "登录",
  'type="email"',
  "auth/sign",
];

const SERVER_ERROR_MARKERS = [
  "Digest:",
  "Application error: a server-side exception",
  "Internal Server Error",
];

function normalizeBase(value, fallback) {
  return (value?.trim() || fallback).replace(/\/+$/, "");
}

function record(id, status, detail) {
  results.push({ id, status, detail });
  const label = status.padEnd(4);
  console.log(`[${label}] ${id} — ${detail}`);
}

function hasAnyMarker(text, markers) {
  const haystack = text.toLowerCase();
  return markers.some((marker) => haystack.includes(marker.toLowerCase()));
}

function isRedirectToLogin(status, location) {
  if (![301, 302, 303, 307, 308].includes(status)) return false;
  const loc = (location ?? "").toLowerCase();
  return loc.includes("/login");
}

function requestIdFrom(body, res) {
  return (
    body?.request_id ??
    body?.tokfai?.request_id ??
    body?.error?.request_id ??
    res?.headers?.get("x-request-id") ??
    null
  );
}

function errorCodeFrom(body) {
  return body?.error?.code ?? body?.code ?? null;
}

async function fetchWeb(path, options = {}) {
  const url = `${WEB_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const timeoutMs = options.timeoutMs ?? WEB_TIMEOUT_MS;

  if (options.redirect === "manual") {
    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers: { ...getAcceptanceHeaders(), ...(options.headers ?? {}) },
      body: options.body,
      redirect: "manual",
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    return { res, text, body: {} };
  }

  return acceptanceFetch(url, {
    method: options.method ?? "GET",
    headers: options.headers,
    body: options.body,
    timeoutMs,
  });
}

async function fetchApi(path, options = {}) {
  const url = `${API_V1}${path.startsWith("/") ? path : `/${path}`}`;
  return acceptanceFetch(url, {
    method: options.method ?? "GET",
    headers: options.headers,
    body: options.body,
    timeoutMs: options.timeoutMs ?? API_TIMEOUT_MS,
  });
}

async function checkWebPage(id, path) {
  try {
    const { res, text } = await fetchWeb(path);
    if (res.status >= 500) {
      record(id, "FAIL", `HTTP ${res.status}`);
      return;
    }
    if (hasAnyMarker(text, SERVER_ERROR_MARKERS)) {
      record(id, "FAIL", "response contains server-side error marker");
      return;
    }
    record(id, "PASS", `HTTP ${res.status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(id, "FAIL", `network error: ${message}`);
  }
}

async function checkNoAuthGuard(id, path) {
  try {
    const { res, text } = await fetchWeb(path, { redirect: "manual" });
    const location = res.headers.get("location") ?? "";

    if (isRedirectToLogin(res.status, location)) {
      record(id, "PASS", `redirect ${res.status} → ${location}`);
      return;
    }

    if (res.status >= 500) {
      record(id, "FAIL", `HTTP ${res.status}`);
      return;
    }

    if (hasAnyMarker(text, SERVER_ERROR_MARKERS)) {
      record(id, "FAIL", "Digest / server-side exception in body");
      return;
    }

    if (res.status === 200) {
      if (hasAnyMarker(text, ADMIN_LEAK_MARKERS)) {
        record(id, "FAIL", "HTTP 200 exposes admin UI content");
        return;
      }
      if (hasAnyMarker(text, LOGIN_MARKERS)) {
        record(id, "PASS", "HTTP 200 login page (no admin leak)");
        return;
      }
      record(
        id,
        "FAIL",
        `HTTP 200 without login redirect or recognizable login page`
      );
      return;
    }

    record(
      id,
      "FAIL",
      `unexpected HTTP ${res.status}${location ? ` → ${location}` : ""}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(id, "FAIL", `network error: ${message}`);
  }
}

async function checkModels() {
  const id = "D API GET /v1/models";
  try {
    const { res, body } = await fetchApi("/models");
    if (res.status !== 200) {
      record(id, "FAIL", `HTTP ${res.status}`);
      return;
    }
    if (!body || typeof body !== "object") {
      record(id, "FAIL", "response is not JSON object");
      return;
    }
    record(id, "PASS", `HTTP 200 JSON (${Array.isArray(body.data) ? body.data.length : "?"} models)`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(id, "FAIL", `network error: ${message}`);
  }
}

async function checkCorsPreflight() {
  const id = "E CORS OPTIONS /v1/images/generations";
  try {
    const url = `${API_V1}/images/generations`;
    const { res } = await acceptanceFetch(url, {
      method: "OPTIONS",
      headers: {
        Origin: WEB_BASE,
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,authorization",
      },
      timeoutMs: API_TIMEOUT_MS,
    });

    const allowOrigin = res.headers.get("access-control-allow-origin") ?? "";
    const okStatus = res.status === 204 || res.status === 200;
    const okOrigin =
      allowOrigin === WEB_BASE ||
      allowOrigin === "*" ||
      allowOrigin.includes("tokfai.com");

    if (!okStatus) {
      record(id, "FAIL", `HTTP ${res.status} (expected 204)`);
      return;
    }
    if (!okOrigin) {
      record(
        id,
        "FAIL",
        `missing Access-Control-Allow-Origin for ${WEB_BASE} (got ${allowOrigin || "(empty)"})`
      );
      return;
    }
    record(
      id,
      "PASS",
      `HTTP ${res.status}, Access-Control-Allow-Origin=${allowOrigin}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(id, "FAIL", `network error: ${message}`);
  }
}

async function checkChatApi() {
  const id = "F Chat POST /v1/chat/completions";
  if (!TEST_API_KEY) {
    record(id, "SKIP", "TOKFAI_TEST_API_KEY not set");
    return;
  }

  try {
    const started = performance.now();
    const { res, body } = await fetchApi("/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages: [{ role: "user", content: "Say hello" }],
      }),
    });
    const latencyMs = Math.round(performance.now() - started);
    const requestId = requestIdFrom(body, res);

    if (res.status !== 200) {
      record(
        id,
        "FAIL",
        `HTTP ${res.status} code=${errorCodeFrom(body) ?? "n/a"} request_id=${requestId ?? "n/a"} (${latencyMs}ms)`
      );
      return;
    }

    const content =
      body?.choices?.[0]?.message?.content ??
      body?.choices?.[0]?.text ??
      body?.content ??
      null;

    if (!content) {
      record(
        id,
        "FAIL",
        `HTTP 200 but missing choices/content request_id=${requestId ?? "n/a"}`
      );
      return;
    }

    if (!requestId) {
      record(id, "FAIL", `HTTP 200 with content but missing request_id (${latencyMs}ms)`);
      return;
    }

    record(
      id,
      "PASS",
      `HTTP 200 request_id=${requestId} latencyMs=${latencyMs}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(id, "FAIL", `network error: ${message}`);
  }
}

async function checkImageApi() {
  const id = "G Image POST /v1/images/generations";
  if (!TEST_API_KEY) {
    record(id, "SKIP", "TOKFAI_TEST_API_KEY not set");
    return;
  }

  const strict = SMOKE_IMAGE_STRICT;
  const outcome = strict ? "FAIL" : "WARN";

  try {
    const started = performance.now();
    const { res, body } = await fetchApi("/images/generations", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TEST_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "nano-banana-fast",
        prompt: "test image",
        n: 1,
      }),
      timeoutMs: IMAGE_TIMEOUT_MS,
    });
    const latencyMs = Math.round(performance.now() - started);
    const requestId = requestIdFrom(body, res);
    const code = errorCodeFrom(body);

    if (res.status === 200) {
      record(
        id,
        "PASS",
        `HTTP 200 request_id=${requestId ?? "n/a"} latencyMs=${latencyMs}`
      );
      return;
    }

    record(
      id,
      outcome,
      `HTTP ${res.status} code=${code ?? "n/a"} request_id=${requestId ?? "n/a"} latencyMs=${latencyMs}${strict ? "" : " (image is Beta; set TOKFAI_SMOKE_IMAGE=true to fail hard)"}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(
      id,
      outcome,
      `network error: ${message}${strict ? "" : " (image is Beta)"}`
    );
  }
}

function printSummary() {
  const counts = { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 };
  for (const row of results) {
    counts[row.status] += 1;
  }

  console.log("");
  console.log("=== Summary ===");
  console.log(`WEB:  ${WEB_BASE}`);
  console.log(`API:  ${API_V1}`);
  console.log(
    `KEY:  ${TEST_API_KEY ? `${TEST_API_KEY.slice(0, 12)}…` : "(not set)"}`
  );
  console.log(`IMAGE_STRICT: ${SMOKE_IMAGE_STRICT}`);
  console.log(
    `PASS=${counts.PASS} WARN=${counts.WARN} FAIL=${counts.FAIL} SKIP=${counts.SKIP}`
  );

  if (counts.FAIL > 0) {
    console.log("");
    console.log("FAILED checks:");
    for (const row of results.filter((r) => r.status === "FAIL")) {
      console.log(`  - ${row.id}: ${row.detail}`);
    }
    process.exit(1);
  }

  if (counts.WARN > 0) {
    console.log("");
    console.log("Warnings (non-blocking):");
    for (const row of results.filter((r) => r.status === "WARN")) {
      console.log(`  - ${row.id}: ${row.detail}`);
    }
  }

  console.log("");
  console.log("OK — production smoke passed (warnings allowed).");
}

async function main() {
  console.log("=== Tokfai production smoke ===");
  console.log(`WEB: ${WEB_BASE}`);
  console.log(`API: ${API_V1}`);
  console.log("");

  console.log("-- A. Web public pages --");
  await checkWebPage("A1 GET /", "/");
  await checkWebPage("A2 GET /login", "/login");
  await checkWebPage("A3 GET /pricing", "/pricing");
  await checkWebPage("A4 GET /docs", "/docs");

  console.log("");
  console.log("-- B. Admin no-auth guard --");
  await checkNoAuthGuard("B GET /admin", "/admin");

  console.log("");
  console.log("-- C. Dashboard no-auth guard --");
  await checkNoAuthGuard("C GET /dashboard", "/dashboard");

  console.log("");
  console.log("-- D–G API checks --");
  await checkModels();
  await checkCorsPreflight();
  await checkChatApi();
  await checkImageApi();

  printSummary();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
