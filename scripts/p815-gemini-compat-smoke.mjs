#!/usr/bin/env node
/**
 * Internal operator smoke — Google Gemini / Cherry Studio Gemini Provider shim.
 *
 * Covers:
 *   - GET /v1beta/models
 *   - POST /v1beta/models/gemini-2.5-flash:generateContent
 *   - POST /v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse
 *
 * Usage:
 *   node scripts/p815-gemini-compat-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p815-gemini-compat-smoke.mjs
 */

import {
  DEFAULT_MOCK_KEY,
  isLiveMode,
  resolveApiBaseUrl,
  printOfflineDefaultHint,
} from "./lib/acceptance-config.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";

const SCRIPT = "scripts/p815-gemini-compat-smoke.mjs";
const LIVE = isLiveMode();
let mockChild = null;

if (!LIVE) {
  const mock = await ensureMockGateway();
  mockChild = mock.child;
}

const BASE = resolveApiBaseUrl(LIVE).replace(/\/v1$/, "");
const API_KEY = LIVE
  ? process.env.TOKFAI_API_KEY ?? ""
  : process.env.TOKFAI_API_KEY ?? process.env.MOCK_API_KEY ?? DEFAULT_MOCK_KEY;

const TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.CHAT_TIMEOUT_MS ?? "120000", 10) || 120_000
);

const REQUIRED_MODEL_NAMES = [
  "models/gemini-2.5-flash",
  "models/gemini-2.5-pro",
  "models/gemini-3-flash",
  "models/gemini-3-pro",
];

function pass(label) {
  console.log(`PASS  ${label}`);
  return true;
}

function fail(label, detail) {
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
  return false;
}

function errorCode(body) {
  return body?.error?.code ?? body?.code ?? null;
}

async function run() {
  if (!LIVE) {
    printOfflineDefaultHint(SCRIPT);
    console.log(`offline mock: ${BASE}/v1beta/models`);
    console.log("");
  } else {
    console.log(`live production: ${BASE}/v1beta/models`);
    console.log("");
  }

  let ok = true;

  // --- GET /v1beta/models ---
  {
    const { res, body } = await acceptanceFetch(`${BASE}/v1beta/models`, {
      method: "GET",
      timeoutMs: TIMEOUT_MS,
    });
    const names = Array.isArray(body?.models)
      ? body.models.map((m) => m?.name).filter(Boolean)
      : [];
    const missing = REQUIRED_MODEL_NAMES.filter((n) => !names.includes(n));
    const methodsOk = Array.isArray(body?.models)
      ? body.models.every(
          (m) =>
            Array.isArray(m?.supportedGenerationMethods) &&
            m.supportedGenerationMethods.includes("generateContent") &&
            m.supportedGenerationMethods.includes("streamGenerateContent")
        )
      : false;

    if (res.status === 200 && missing.length === 0 && methodsOk) {
      ok = pass("GET /v1beta/models includes required Gemini models") && ok;
    } else {
      ok =
        fail(
          "GET /v1beta/models includes required Gemini models",
          `HTTP ${res.status}, missing=${JSON.stringify(missing)}, methodsOk=${methodsOk}`
        ) && ok;
    }
  }

  // --- Auth probes for generateContent ---
  {
    const { res, body } = await acceptanceFetch(
      `${BASE}/v1beta/models/gemini-2.5-flash:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Say ok only." }] }],
        }),
        timeoutMs: TIMEOUT_MS,
      }
    );
    if (res.status === 401 && errorCode(body) === "missing_token") {
      ok = pass("generateContent missing key → 401 missing_token") && ok;
    } else {
      ok =
        fail(
          "generateContent missing key → 401 missing_token",
          `HTTP ${res.status}, code=${errorCode(body)}`
        ) && ok;
    }
  }

  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.log("SKIP  real-key cases (set TOKFAI_API_KEY or use offline MOCK_API_KEY)");
    if (mockChild) mockChild.kill();
    process.exit(ok ? 0 : 1);
  }

  const geminiBody = {
    contents: [{ role: "user", parts: [{ text: "Say ok only." }] }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 64 },
  };

  // --- generateContent with x-goog-api-key ---
  {
    const { res, body } = await acceptanceFetch(
      `${BASE}/v1beta/models/gemini-2.5-flash:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": API_KEY,
        },
        body: JSON.stringify(geminiBody),
        timeoutMs: TIMEOUT_MS,
      }
    );
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    const usage = body?.usageMetadata;
    const good =
      res.status === 200 &&
      typeof text === "string" &&
      text.length > 0 &&
      typeof usage?.promptTokenCount === "number" &&
      typeof usage?.candidatesTokenCount === "number" &&
      typeof usage?.totalTokenCount === "number";
    if (good) {
      ok =
        pass(
          "POST /v1beta/models/gemini-2.5-flash:generateContent (x-goog-api-key)"
        ) && ok;
    } else {
      ok =
        fail(
          "POST /v1beta/models/gemini-2.5-flash:generateContent (x-goog-api-key)",
          `HTTP ${res.status}, text=${JSON.stringify(text)?.slice(0, 80)}, code=${errorCode(body)}`
        ) && ok;
    }
  }

  // --- generateContent with ?key= ---
  {
    const { res, body } = await acceptanceFetch(
      `${BASE}/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(API_KEY)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(geminiBody),
        timeoutMs: TIMEOUT_MS,
      }
    );
    const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (res.status === 200 && typeof text === "string" && text.length > 0) {
      ok =
        pass(
          "POST /v1beta/models/gemini-2.5-flash:generateContent (?key=)"
        ) && ok;
    } else {
      ok =
        fail(
          "POST /v1beta/models/gemini-2.5-flash:generateContent (?key=)",
          `HTTP ${res.status}, code=${errorCode(body)}`
        ) && ok;
    }
  }

  // --- streamGenerateContent?alt=sse ---
  {
    const { res, text } = await acceptanceFetch(
      `${BASE}/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${API_KEY}`,
        },
        body: JSON.stringify(geminiBody),
        timeoutMs: TIMEOUT_MS,
      }
    );
    const contentType = res.headers.get("content-type") ?? "";
    const hasDataLine =
      typeof text === "string" &&
      text.includes("data: ") &&
      text.includes("candidates");
    if (
      res.status === 200 &&
      contentType.includes("text/event-stream") &&
      hasDataLine
    ) {
      ok =
        pass(
          "POST /v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse"
        ) && ok;
    } else {
      ok =
        fail(
          "POST /v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse",
          `HTTP ${res.status}, content-type=${contentType}, preview=${JSON.stringify(text)?.slice(0, 120)}`
        ) && ok;
    }
  }

  if (mockChild) mockChild.kill();
  process.exit(ok ? 0 : 1);
}

run().catch((err) => {
  console.error(err);
  if (mockChild) mockChild.kill();
  process.exit(1);
});
