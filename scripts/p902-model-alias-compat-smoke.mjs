#!/usr/bin/env node
/**
 * P902 — Model alias compatibility smoke (offline mock by default).
 *
 * Covers Cherry / Chatbox / Codex style aliases and Tokfai display names.
 *
 * Usage:
 *   node scripts/p902-model-alias-compat-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p902-model-alias-compat-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isLiveMode,
  printOfflineDefaultHint,
  resolveAcceptanceApiKey,
  resolveApiBaseUrl,
} from "./lib/acceptance-config.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";

const SCRIPT = "scripts/p902-model-alias-compat-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = isLiveMode();
let mockChild = null;
let BASE;
let API_KEY;

if (!LIVE) {
  const mock = await ensureMockGateway();
  mockChild = mock.child ?? null;
  // Always use the mock's own base + key (never TOKFAI_API_KEY / TOKFAI_API_BASE).
  BASE = mock.baseUrl.replace(/\/v1$/, "");
  API_KEY = resolveAcceptanceApiKey(false, mock.apiKey);
} else {
  BASE = resolveApiBaseUrl(true).replace(/\/v1$/, "");
  API_KEY = resolveAcceptanceApiKey(true);
}

const TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.CHAT_TIMEOUT_MS ?? "120000", 10) || 120_000
);

const ALIAS_CASES = [
  ["gpt-5", "gpt-5"],
  ["gpt5", "gpt-5"],
  ["GPT 5", "gpt-5"],
  ["gpt-5-pro", "gpt-5-pro"],
  ["gpt5-pro", "gpt-5-pro"],
  ["GPT 5 Pro", "gpt-5-pro"],
  ["gpt-5.4", "gpt-5"],
  ["gpt-5.4-pro", "gpt-5-pro"],
  ["GPT 5.4 Pro", "gpt-5-pro"],
  ["gpt-5.5", "gpt-5.5"],
  ["gpt5.5", "gpt-5.5"],
  ["gemini-3-pro", "gemini-3-pro"],
  ["gemini-2.5-flash", "gemini-2.5-flash"],
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

function assertAuthOk(res, label) {
  if (res.status === 401 || res.status === 403) {
    return fail(
      label,
      `HTTP ${res.status} auth failed — offline must use mock key from ensureMockGateway()`
    );
  }
  return true;
}

async function postJson(path, body) {
  if (!API_KEY || !API_KEY.startsWith("sk-tokfai_")) {
    throw new Error(
      `Missing valid API key for ${LIVE ? "LIVE" : "offline mock"} mode`
    );
  }
  return acceptanceFetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    timeoutMs: TIMEOUT_MS,
  });
}

async function run() {
  if (!LIVE) printOfflineDefaultHint(SCRIPT);
  console.log(LIVE ? `live: ${BASE}` : `offline mock: ${BASE}`);
  console.log(`api_key: ${API_KEY.slice(0, 14)}… (len=${API_KEY.length})`);
  console.log("");

  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error("FAIL  API key missing or invalid format");
    if (mockChild) mockChild.kill();
    process.exit(1);
  }

  let ok = true;

  // Static: safe error copy + alias table
  {
    const aliases = readFileSync(
      join(ROOT, "apps/dmit-api/src/upstream/modelAliases.ts"),
      "utf8"
    );
    if (
      /model not register/i.test(aliases) ||
      !aliases.includes("This model is not available on Tokfai") ||
      !aliases.includes('"gpt-5.4-pro": "gpt-5-pro"')
    ) {
      ok = fail("static alias + error copy", "modelAliases.ts incomplete") && ok;
    } else {
      ok = pass("static alias map + model_not_available copy") && ok;
    }
  }

  {
    const { res, body } = await acceptanceFetch(`${BASE}/v1/models`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      timeoutMs: TIMEOUT_MS,
    });
    if (!assertAuthOk(res, "GET /v1/models auth")) {
      ok = false;
    } else {
      const rows = Array.isArray(body?.data) ? body.data : [];
      const ids = rows.map((r) => r.id).filter(Boolean);
      const required = [
        "gpt-5",
        "gpt-5-pro",
        "gpt-5.4",
        "gpt-5.4-pro",
        "gpt-5.5",
        "gemini-3-pro",
        "gemini-2.5-flash",
      ];
      const missing = required.filter((id) => !ids.includes(id));
      const gpt54pro = rows.find((r) => r.id === "gpt-5.4-pro");
      const label =
        gpt54pro?.display_name || gpt54pro?.name || gpt54pro?.title || "";
      const owned = rows.every(
        (r) => !r.owned_by || String(r.owned_by).toLowerCase() === "tokfai"
      );
      if (res.status !== 200 || missing.length) {
        ok =
          fail(
            "GET /v1/models catalog",
            `HTTP ${res.status} missing=${missing.join(",") || "none"}`
          ) && ok;
      } else if (!/^Tokfai\s+/i.test(label)) {
        ok = fail("Tokfai display_name", `label=${JSON.stringify(label)}`) && ok;
      } else if (!owned) {
        ok = fail("owned_by tokfai", "non-tokfai owned_by in catalog") && ok;
      } else {
        ok = pass("GET /v1/models Tokfai display names + required aliases") && ok;
      }
    }
  }

  for (const [model, expectResolved] of ALIAS_CASES) {
    const { res, body } = await postJson("/v1/chat/completions", {
      model,
      messages: [{ role: "user", content: "Say ok only." }],
      stream: false,
    });
    if (!assertAuthOk(res, `alias ${JSON.stringify(model)} auth`)) {
      ok = false;
      continue;
    }
    const resolved = body?.tokfai?.resolved_model;
    const requested = body?.tokfai?.requested_model;
    const hasMeta =
      body?.tokfai?.request_id != null &&
      body?.tokfai?.credits_charged !== undefined;
    if (
      res.status !== 200 ||
      resolved == null ||
      requested == null ||
      resolved !== expectResolved ||
      requested !== model ||
      !hasMeta
    ) {
      ok =
        fail(
          `alias ${JSON.stringify(model)}`,
          `HTTP ${res.status} requested=${requested} resolved=${resolved} expected=${expectResolved}`
        ) && ok;
    } else {
      ok = pass(`alias ${JSON.stringify(model)} → ${expectResolved}`) && ok;
    }
  }

  {
    const { res, body } = await postJson("/v1/chat/completions", {
      model: "definitely-not-a-tokfai-model-xyz",
      messages: [{ role: "user", content: "hi" }],
      stream: false,
    });
    if (!assertAuthOk(res, "unknown model auth")) {
      ok = false;
    } else {
      const code = body?.error?.code;
      const message = String(body?.error?.message ?? "");
      const bad =
        /model not register/i.test(message) ||
        /grsaiapi/i.test(message) ||
        /stack/i.test(message);
      if (
        res.status !== 400 ||
        code !== "model_not_available" ||
        !message.includes("This model is not available on Tokfai") ||
        bad
      ) {
        ok =
          fail(
            "unknown model → model_not_available",
            `HTTP ${res.status} code=${code} msg=${message.slice(0, 120)}`
          ) && ok;
      } else {
        ok = pass("unknown model → model_not_available (safe message)") && ok;
      }
    }
  }

  if (mockChild) mockChild.kill();
  console.log(ok ? "\nTOKFAI_P902_MODEL_ALIAS_PASS" : "\nTOKFAI_P902_MODEL_ALIAS_FAIL");
  process.exit(ok ? 0 : 1);
}

run().catch((err) => {
  if (mockChild) mockChild.kill();
  console.error(err);
  process.exit(1);
});
