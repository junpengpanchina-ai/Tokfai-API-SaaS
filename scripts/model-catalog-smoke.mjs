#!/usr/bin/env node
/**
 * Model catalog consistency smoke — validates /v1/models and local model guards.
 *
 * Usage (from repo root):
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/model-catalog-smoke.mjs
 *
 * Optional env:
 *   TOKFAI_API_BASE   default https://api.tokfai.com/v1
 *   TIMEOUT_MS        default 120000
 *   SKIP_UPSTREAM_OK  set to 1 to skip live chat/image success checks (validation-only)
 */

const BASE = (process.env.TOKFAI_API_BASE ?? "https://api.tokfai.com/v1").replace(
  /\/+$/,
  ""
);
const API_KEY = process.env.TOKFAI_API_KEY ?? "";
const TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.TIMEOUT_MS ?? "120000", 10) || 120_000
);
const SKIP_UPSTREAM_OK = process.env.SKIP_UPSTREAM_OK === "1";

const HIDDEN_MODELS = ["gpt-4o-mini", "test-admin-model-001"];

const results = [];

function record(name, pass, detail = "") {
  results.push({ name, pass, detail });
  const mark = pass ? "PASS" : "FAIL";
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function fetchJson(path, init = {}) {
  const url = `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  return { res, body, url };
}

async function apiFetch(path, init = {}) {
  return fetchJson(path, {
    ...init,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function testMissingToken() {
  const { res, body } = await fetchJson("/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: "auto-fast",
      messages: [{ role: "user", content: "ping" }],
    }),
  });
  record(
    "7. no token → missing_token",
    res.status === 401 && body?.error?.code === "missing_token",
    `HTTP ${res.status}, code=${body?.error?.code ?? "(none)"}`
  );
}

async function testInvalidToken() {
  const { res, body } = await fetchJson("/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer sk-tokfai_deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "auto-fast",
      messages: [{ role: "user", content: "ping" }],
    }),
  });
  record(
    "8. bad token → invalid_token",
    res.status === 401 && body?.error?.code === "invalid_token",
    `HTTP ${res.status}, code=${body?.error?.code ?? "(none)"}`
  );
}

async function testListModels() {
  if (!API_KEY) {
    record("1. GET /v1/models hides internal models", false, "TOKFAI_API_KEY not set");
    return;
  }

  const { res, body } = await apiFetch("/models", { method: "GET" });
  const ids = Array.isArray(body?.data) ? body.data.map((row) => row.id) : [];
  const leaked = HIDDEN_MODELS.filter((id) => ids.includes(id));

  record(
    "1. GET /v1/models hides gpt-4o-mini & test-admin-model-001",
    res.status === 200 && leaked.length === 0,
    res.status === 200
      ? `count=${ids.length}, leaked=${leaked.join(",") || "none"}`
      : `HTTP ${res.status}`
  );
}

async function testChatAllowed() {
  if (!API_KEY) {
    record("2. chat gpt-5.5 succeeds", false, "TOKFAI_API_KEY not set");
    return;
  }
  if (SKIP_UPSTREAM_OK) {
    record("2. chat gpt-5.5 succeeds", true, "skipped (SKIP_UPSTREAM_OK=1)");
    return;
  }

  const { res, body } = await apiFetch("/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: "gpt-5.5",
      messages: [{ role: "user", content: "Reply with exactly: ok" }],
      stream: false,
    }),
  });

  record(
    "2. POST /v1/chat/completions model=gpt-5.5",
    res.status === 200 && Boolean(body?.choices?.length),
    `HTTP ${res.status}, code=${body?.error?.code ?? "ok"}`
  );
}

async function testChatBlocked() {
  if (!API_KEY) {
    record("3. chat gpt-4o-mini local 400", false, "TOKFAI_API_KEY not set");
    return;
  }

  const { res, body } = await apiFetch("/chat/completions", {
    method: "POST",
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "ping" }],
      stream: false,
    }),
  });

  record(
    "3. POST /v1/chat/completions model=gpt-4o-mini → 400 model_not_available",
    res.status === 400 &&
      body?.error?.code === "model_not_available" &&
      Array.isArray(body?.suggestedModels) &&
      body.suggestedModels.length > 0,
    `HTTP ${res.status}, code=${body?.error?.code ?? "(none)"}, suggested=${body?.suggestedModels?.length ?? 0}`
  );
}

async function testImageAllowed() {
  if (!API_KEY) {
    record("4. image nano-banana-fast", false, "TOKFAI_API_KEY not set");
    return;
  }
  if (SKIP_UPSTREAM_OK) {
    record("4. image nano-banana-fast", true, "skipped (SKIP_UPSTREAM_OK=1)");
    return;
  }

  const { res, body } = await apiFetch("/images/generations", {
    method: "POST",
    body: JSON.stringify({
      model: "nano-banana-fast",
      prompt: "A simple red circle on white background",
      size: "1024x1024",
      n: 1,
      response_format: "url",
    }),
  });

  const ok =
    res.status === 200 ||
    (res.status >= 400 &&
      body?.error?.code &&
      !["image_model_not_available", "model_not_found"].includes(body.error.code));

  record(
    "4. POST /v1/images/generations model=nano-banana-fast",
    ok,
    `HTTP ${res.status}, code=${body?.error?.code ?? "ok"}`
  );
}

async function testImageChatModelBlocked() {
  if (!API_KEY) {
    record("5. image gemini-3-flash local 400", false, "TOKFAI_API_KEY not set");
    return;
  }

  const { res, body } = await apiFetch("/images/generations", {
    method: "POST",
    body: JSON.stringify({
      model: "gemini-3-flash",
      prompt: "A simple red circle",
      size: "1024x1024",
      n: 1,
      response_format: "url",
    }),
  });

  record(
    "5. POST /v1/images/generations model=gemini-3-flash → 400 image_model_not_available",
    res.status === 400 &&
      body?.error?.code === "image_model_not_available" &&
      Array.isArray(body?.suggestedModels) &&
      body.suggestedModels.length > 0 &&
      !body.suggestedModels.includes("gemini-3-flash"),
    `HTTP ${res.status}, code=${body?.error?.code ?? "(none)"}, suggested=${body?.suggestedModels?.join(",") ?? "(none)"}`
  );
}

async function testValidKeyHealth() {
  if (!API_KEY) {
    record("6. valid API key auth", false, "TOKFAI_API_KEY not set");
    return;
  }

  const { res, body } = await apiFetch("/models", { method: "GET" });
  record(
    "6. valid Tokfai API key works",
    res.status === 200 && body?.object === "list",
    `HTTP ${res.status}`
  );
}

async function main() {
  console.log(`Model catalog smoke → ${BASE}`);
  console.log(`API key: ${API_KEY ? `${API_KEY.slice(0, 14)}…` : "(not set)"}`);
  console.log("");

  await testMissingToken();
  await testInvalidToken();
  await testListModels();
  await testChatAllowed();
  await testChatBlocked();
  await testImageAllowed();
  await testImageChatModelBlocked();
  await testValidKeyHealth();

  const failed = results.filter((row) => !row.pass);
  console.log("");
  console.log(`Summary: ${results.length - failed.length}/${results.length} passed`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
