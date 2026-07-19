#!/usr/bin/env node
/**
 * P915 — Model registry contract for OpenAI-compatible clients (offline).
 *
 * - Required callable ids present
 * - owned_by=tokfai, Tokfai display names
 * - No upstream brand/domain in catalog labels
 * - Stable alias resolve contract (spot-check)
 *
 * Usage: node scripts/p915-model-registry-contract-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import { REQUIRED_MODEL_IDS } from "./lib/client-compat-matrix.mjs";

const SCRIPT = "scripts/p915-model-registry-contract-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ctx = await bootstrapClientCompatSmoke(SCRIPT);
let ok = true;

try {
  {
    const aliases = readFileSync(
      join(ROOT, "apps/dmit-api/src/upstream/modelAliases.ts"),
      "utf8"
    );
    const display = readFileSync(
      join(ROOT, "apps/dmit-api/src/catalog/clientModelDisplayName.ts"),
      "utf8"
    );
    if (
      !aliases.includes('"gpt-5.4-pro": "gpt-5-pro"') ||
      !display.includes("Tokfai") ||
      !aliases.includes('owned_by: "tokfai"')
    ) {
      ok = fail("static registry / display contract", "missing Tokfai branding") && ok;
    } else {
      ok = pass("static modelAliases + Tokfai display names") && ok;
    }
  }

  {
    const { res, body } = await ctx.getJson("/v1/models");
    const rows = Array.isArray(body?.data) ? body.data : [];
    const ids = rows.map((r) => r.id);
    const missing = REQUIRED_MODEL_IDS.filter((id) => !ids.includes(id));
    const leakLabel = rows.find((r) => {
      const blob = `${r.display_name ?? ""} ${r.name ?? ""} ${r.title ?? ""}`;
      return /grsaiapi|openai\.com|google ai|anthropic/i.test(blob);
    });
    const badOwned = rows.filter(
      (r) => r.owned_by && String(r.owned_by).toLowerCase() !== "tokfai"
    );
    const gpt54 = rows.find((r) => r.id === "gpt-5.4-pro");
    const label = gpt54?.display_name || gpt54?.name || "";

    if (res.status !== 200 || missing.length) {
      ok =
        fail(
          "required model ids",
          `HTTP ${res.status} missing=${missing.join(",")}`
        ) && ok;
    } else if (badOwned.length) {
      ok = fail("owned_by tokfai", `${badOwned.length} rows`) && ok;
    } else if (leakLabel) {
      ok = fail("catalog label leak", JSON.stringify(leakLabel.id)) && ok;
    } else if (!/^Tokfai\s+/i.test(label)) {
      ok = fail("gpt-5.4-pro Tokfai display_name", label) && ok;
    } else {
      ok = pass("GET /v1/models registry contract") && ok;
    }
  }

  {
    const { res, body } = await ctx.postJson("/v1/chat/completions", {
      model: "gpt-5.4-pro",
      messages: [{ role: "user", content: "Say ok only." }],
      stream: false,
    });
    if (
      res.status !== 200 ||
      body?.tokfai?.requested_model !== "gpt-5.4-pro" ||
      body?.tokfai?.resolved_model !== "gpt-5-pro" ||
      body?.tokfai?.credits_charged === undefined ||
      !body?.tokfai?.request_id
    ) {
      ok =
        fail(
          "tokfai meta contract",
          `HTTP ${res.status} tokfai=${JSON.stringify(body?.tokfai)}`
        ) && ok;
    } else {
      ok =
        pass(
          "tokfai.requested_model/resolved_model/credits_charged/request_id"
        ) && ok;
    }
  }
} finally {
  ctx.cleanup();
}

console.log(
  ok
    ? "\nTOKFAI_P915_MODEL_REGISTRY_CONTRACT_PASS"
    : "\nTOKFAI_P915_MODEL_REGISTRY_CONTRACT_FAIL"
);
process.exit(ok ? 0 : 1);
