#!/usr/bin/env node
/**
 * Local assertion: /v1/models payload builder must not advertise aliases.
 * Does not call chat/completions or touch billing.
 *
 * Usage (from repo root, after apps/dmit-api build):
 *   node scripts/p-v1-models-public-alias-denylist-smoke.mjs
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distRoot = path.resolve(__dirname, "../apps/dmit-api/dist");

const { buildModelsListPayload } = await import(
  path.join(distRoot, "routes/modelsListCompat.js")
);
const {
  isDeniedPublicModelId,
  scrubModelsListPayload,
  PUBLIC_MODELS_HARD_DENIED_IDS,
} = await import(path.join(distRoot, "catalog/publicModelsListFilter.js"));
const aliases = await import(path.join(distRoot, "upstream/modelAliases.js"));

const DENIED_GREP =
  /auto-fast|auto-pro|auto-cheap|gpt-5-chat|gpt-5-pro|gpt-5-4|Tokfai GPT/i;

const samples = [
  {
    id: "auto-fast",
    object: "model",
    created: 1,
    owned_by: "tokfai",
    name: "Tokfai Auto Fast",
    display_name: "Tokfai Auto Fast",
    title: "Tokfai Auto Fast",
  },
  {
    id: "auto-pro",
    object: "model",
    created: 1,
    owned_by: "tokfai",
    name: "Tokfai Auto Pro",
    display_name: "Tokfai Auto Pro",
    title: "Tokfai Auto Pro",
  },
  {
    id: "auto-cheap",
    object: "model",
    created: 1,
    owned_by: "tokfai",
    name: "Tokfai Auto Cheap",
    display_name: "Tokfai Auto Cheap",
    title: "Tokfai Auto Cheap",
  },
  {
    id: "gpt-5-chat",
    object: "model",
    created: 1,
    owned_by: "tokfai",
    name: "Tokfai GPT-5 Chat",
    display_name: "Tokfai GPT-5 Chat",
    title: "Tokfai GPT-5 Chat",
  },
  {
    id: "gpt-5-pro",
    object: "model",
    created: 1,
    owned_by: "tokfai",
    name: "Tokfai GPT-5 Pro",
    display_name: "Tokfai GPT-5 Pro",
    title: "Tokfai GPT-5 Pro",
  },
  {
    id: "gpt-5-4",
    object: "model",
    created: 1,
    owned_by: "tokfai",
    name: "Tokfai GPT-5.4",
    display_name: "Tokfai GPT-5.4",
    title: "Tokfai GPT-5.4",
  },
  {
    id: "gpt-5.4",
    object: "model",
    created: 1,
    owned_by: "tokfai",
    name: "Tokfai GPT-5.4",
    display_name: "Tokfai GPT-5.4",
    title: "Tokfai GPT-5.4",
  },
  {
    id: "gpt-5.6-sol",
    object: "model",
    created: 1,
    owned_by: "tokfai",
    name: "Tokfai GPT-5.6 Sol",
    display_name: "Tokfai GPT-5.6 Sol",
    title: "Tokfai GPT-5.6 Sol",
  },
  {
    id: "gpt-5.6-terra",
    object: "model",
    created: 1,
    owned_by: "tokfai",
    name: "Tokfai GPT-5.6 Terra",
    display_name: "Tokfai GPT-5.6 Terra",
    title: "Tokfai GPT-5.6 Terra",
  },
  {
    id: "gemini-3-flash",
    object: "model",
    created: 1,
    owned_by: "tokfai",
    name: "Tokfai Gemini 3 Flash",
    display_name: "Tokfai Gemini 3 Flash",
    title: "Tokfai Gemini 3 Flash",
  },
];

for (const id of PUBLIC_MODELS_HARD_DENIED_IDS) {
  if (!isDeniedPublicModelId(id)) {
    console.error(`TOKFAI_V1_MODELS_ALIAS_DENYLIST_FAIL denied_id_miss=${id}`);
    process.exit(1);
  }
}

const payload = scrubModelsListPayload(buildModelsListPayload(samples));
const raw = JSON.stringify(payload);
if (DENIED_GREP.test(raw)) {
  console.error("TOKFAI_V1_MODELS_ALIAS_DENYLIST_FAIL leaked_pattern_in_payload");
  console.error(raw);
  process.exit(1);
}

const ids = payload.data.map((row) => row.id);
const expectedKeep = ["gpt-5.6-sol", "gpt-5.6-terra", "gemini-3-flash"];
for (const id of expectedKeep) {
  if (!ids.includes(id)) {
    console.error(`TOKFAI_V1_MODELS_ALIAS_DENYLIST_FAIL missing_keep=${id}`);
    process.exit(1);
  }
}

for (const id of ids) {
  if (isDeniedPublicModelId(id)) {
    console.error(`TOKFAI_V1_MODELS_ALIAS_DENYLIST_FAIL leaked_id=${id}`);
    process.exit(1);
  }
}

// Alias routing helpers must still exist (chat path), without being listed.
if (typeof aliases.resolveChatModel !== "function") {
  console.error("TOKFAI_V1_MODELS_ALIAS_DENYLIST_FAIL missing_resolveChatModel");
  process.exit(1);
}
const resolved = aliases.resolveChatModel("auto-fast");
if (!resolved?.isAlias || !Array.isArray(resolved.attempts) || resolved.attempts.length < 1) {
  console.error("TOKFAI_V1_MODELS_ALIAS_DENYLIST_FAIL alias_routing_broken");
  process.exit(1);
}

console.log("TOKFAI_V1_MODELS_ALIAS_DENYLIST_PASS");
console.log(
  JSON.stringify(
    {
      kept_ids: ids,
      denied_sample_count: PUBLIC_MODELS_HARD_DENIED_IDS.length,
      alias_route_ok: true,
    },
    null,
    2
  )
);
