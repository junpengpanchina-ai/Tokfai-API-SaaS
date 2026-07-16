#!/usr/bin/env node
/**
 * Public model registry smoke (offline, static).
 *
 * 1. public + visible chat ids ⊆ local /v1/models allowlist (image models excluded)
 * 2. aliases never appear in public groups
 * 3. aliases without routesTo are not consumer-visible
 * 4. internal/experimental/disabled never appear in consumer docs
 * 5. docs example models are public or alias
 * 6. EN locale dictionaries have no Chinese
 *
 * Usage: node scripts/public-model-registry-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "apps", "web");
const CJK_RE = /[\u4e00-\u9fff]/;

function pass(label) {
  console.log(`PASS  ${label}`);
  return true;
}

function fail(label, detail) {
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
  return false;
}

function extractArrayLiteral(source, exportName) {
  const re = new RegExp(
    `export const ${exportName}[^=]*=\\s*(\\[[\\s\\S]*?\\n\\]);`
  );
  const m = source.match(re);
  return m ? m[1] : null;
}

function extractStringIdsFromTsArray(arraySrc) {
  const ids = [];
  const re = /id:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(arraySrc))) ids.push(m[1]);
  return ids;
}

function extractConstObjectStringValues(source, exportName) {
  const re = new RegExp(
    `export const ${exportName}\\s*=\\s*\\{([\\s\\S]*?)\\n\\}\\s*as const`
  );
  const m = source.match(re);
  if (!m) return {};
  const out = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/(\w+):\s*"([^"]+)"/);
    if (kv) out[kv[1]] = kv[2];
  }
  return out;
}

function extractAllowlist(source) {
  const re =
    /export const PUBLIC_MODELS_API_ALLOWLIST\s*=\s*\[([\s\S]*?)\]\s*as const/;
  const m = source.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
}

function parseRegistryEntries(source) {
  const arraySrc = extractArrayLiteral(source, "PUBLIC_MODEL_REGISTRY");
  if (!arraySrc) return null;
  const entries = [];
  // Split roughly on object starts with id:
  const chunks = arraySrc.split(/\n\s*\{\s*\n/);
  for (const chunk of chunks) {
    const id = chunk.match(/id:\s*"([^"]+)"/)?.[1];
    if (!id) continue;
    const status = chunk.match(/status:\s*"([^"]+)"/)?.[1] ?? "";
    const family = chunk.match(/family:\s*"([^"]+)"/)?.[1] ?? "";
    const visible = /visible:\s*true/.test(chunk);
    const group = chunk.match(/group:\s*"([^"]+)"/)?.[1] ?? "";
    const routesTo = chunk.match(/routesTo:\s*"([^"]+)"/)?.[1] ?? "";
    entries.push({ id, status, family, visible, group, routesTo });
  }
  return entries;
}

function extractConstRecordBody(source, constName) {
  const startRe = new RegExp(
    `(?:export\\s+)?const\\s+${constName}\\s*:\\s*Record<string,\\s*string>\\s*=\\s*\\{`
  );
  const start = source.search(startRe);
  if (start < 0) return null;
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(brace + 1, i);
    }
  }
  return null;
}

function extractMessagesEnBody(source) {
  const marker = source.match(/(?:^|\n)\s*en:\s*\{/);
  if (!marker || marker.index == null) return null;
  const brace = source.indexOf("{", marker.index);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(brace + 1, i);
    }
  }
  return null;
}

function cjkHits(text, limit = 10) {
  const hits = [];
  for (const line of text.split("\n")) {
    if (!CJK_RE.test(line)) continue;
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;
    hits.push(line.trim().slice(0, 140));
    if (hits.length >= limit) break;
  }
  return hits;
}

let ok = true;

const registrySrc = readFileSync(
  join(WEB, "lib", "public-model-registry.ts"),
  "utf8"
);
const entries = parseRegistryEntries(registrySrc);
if (!entries?.length) {
  ok = fail("parse PUBLIC_MODEL_REGISTRY", "no entries") && ok;
  console.error("\npublic-model-registry-smoke: FAILED");
  process.exit(1);
}

const allowlist = new Set(extractAllowlist(registrySrc));
const docExamples = extractConstObjectStringValues(
  registrySrc,
  "PUBLIC_DOC_EXAMPLE_MODELS"
);

const publicVisible = entries.filter(
  (e) => e.visible && e.status === "public"
);
const aliasVisible = entries.filter(
  (e) => e.visible && e.status === "alias"
);
const hiddenStatuses = entries.filter((e) =>
  ["internal", "experimental", "disabled"].includes(e.status)
);

// 1) public chat ⊆ allowlist (image models are Image Workbench / Image API only)
{
  const publicChatVisible = publicVisible.filter((e) => e.family !== "image");
  const missing = publicChatVisible
    .map((e) => e.id)
    .filter((id) => !allowlist.has(id));
  if (missing.length) {
    ok =
      fail(
        "public chat models ⊆ /v1/models allowlist",
        missing.join(", ")
      ) && ok;
  } else {
    pass("public chat models ⊆ /v1/models allowlist");
  }

  const imageOnAllowlist = publicVisible
    .filter((e) => e.family === "image")
    .map((e) => e.id)
    .filter((id) => allowlist.has(id));
  if (imageOnAllowlist.length) {
    ok =
      fail(
        "/v1/models allowlist omits image-only models",
        imageOnAllowlist.join(", ")
      ) && ok;
  } else {
    pass("/v1/models allowlist omits image-only models");
  }
}

// Aliases that are shown should also be on allowlist (catalog aliases)
{
  const missing = aliasVisible
    .map((e) => e.id)
    .filter((id) => !allowlist.has(id));
  if (missing.length) {
    ok =
      fail(
        "visible aliases ⊆ /v1/models allowlist",
        missing.join(", ")
      ) && ok;
  } else {
    pass("visible aliases ⊆ /v1/models allowlist");
  }
}

// 2) aliases not in public groups
{
  const bad = aliasVisible.filter((e) => e.group !== "aliases");
  if (bad.length) {
    ok =
      fail(
        "aliases only in aliases group",
        bad.map((e) => `${e.id}@${e.group}`).join(", ")
      ) && ok;
  } else {
    pass("aliases only in aliases group");
  }
}

{
  const badPublic = publicVisible.filter((e) => e.group === "aliases");
  if (badPublic.length) {
    ok =
      fail(
        "public models not in aliases group",
        badPublic.map((e) => e.id).join(", ")
      ) && ok;
  } else {
    pass("public models not in aliases group");
  }
}

// 3) visible aliases must have routesTo
{
  const missingRoutes = aliasVisible.filter((e) => !e.routesTo);
  if (missingRoutes.length) {
    ok =
      fail(
        "visible aliases have routesTo",
        missingRoutes.map((e) => e.id).join(", ")
      ) && ok;
  } else {
    pass("visible aliases have routesTo");
  }
}

// consumer-model-groups: no rewrite-only pro aliases mixed into public
{
  const groupsSrc = readFileSync(
    join(WEB, "lib", "docs", "consumer-model-groups.ts"),
    "utf8"
  );
  if (!groupsSrc.includes("public-model-registry")) {
    ok = fail(
      "consumer-model-groups derived from registry",
      "missing import of public-model-registry"
    );
  } else {
    pass("consumer-model-groups derived from registry");
  }
  for (const banned of ["gpt-5.4-pro", "gpt-5.5-pro"]) {
    if (groupsSrc.includes(`"${banned}"`) || groupsSrc.includes(`'${banned}'`)) {
      ok = fail("no rewrite-only aliases in consumer groups", banned) && ok;
    }
  }
  if (
    !groupsSrc.includes("gpt-5.4-pro") &&
    !groupsSrc.includes("gpt-5.5-pro")
  ) {
    pass("no rewrite-only aliases in consumer groups");
  }
}

// 4) docs must not advertise hidden / rewrite-only models as recommended
{
  const docsSrc = readFileSync(
    join(WEB, "lib", "docs", "public-beta-docs-registry.ts"),
    "utf8"
  );
  // gpt-5.4-pro is a listed Tokfai compat alias — allowed in docs.
  // gpt-5.5-pro remains rewrite-only and must not be recommended.
  const forbiddenInDocs = [
    ...hiddenStatuses.map((e) => e.id),
    "gpt-5.5-pro",
  ];
  const hits = [];
  for (const id of forbiddenInDocs) {
    if (!id) continue;
    if (docsSrc.includes(id)) hits.push(id);
  }
  // Deduplicate
  const unique = [...new Set(hits)];
  if (unique.length) {
    ok =
      fail(
        "docs omit internal/experimental/disabled + rewrite-only",
        unique.join(", ")
      ) && ok;
  } else {
    pass("docs omit internal/experimental/disabled + rewrite-only");
  }
}

// 5) doc example models are public or alias
{
  const allowed = new Set([
    ...publicVisible.map((e) => e.id),
    ...aliasVisible.map((e) => e.id),
  ]);
  const bad = Object.entries(docExamples)
    .filter(([, id]) => !allowed.has(id))
    .map(([k, id]) => `${k}=${id}`);
  if (bad.length) {
    ok = fail("PUBLIC_DOC_EXAMPLE_MODELS allowed", bad.join(", ")) && ok;
  } else {
    pass("PUBLIC_DOC_EXAMPLE_MODELS are public or alias");
  }
}

// 6) EN locale has no Chinese (messages + labels)
{
  const messages = readFileSync(join(WEB, "lib", "i18n", "messages.ts"), "utf8");
  const enBody = extractMessagesEnBody(messages);
  if (!enBody) {
    ok = fail("messages.ts en block", "not found") && ok;
  } else {
    const hits = cjkHits(enBody);
    if (hits.length) {
      ok = fail("messages.ts en has no Chinese", hits.join("\n      ")) && ok;
    } else {
      pass("messages.ts en has no Chinese");
    }
  }

  const labels = readFileSync(
    join(WEB, "lib", "dashboard-safe", "labels.generated.ts"),
    "utf8"
  );
  const enLabels = extractConstRecordBody(labels, "EN");
  if (!enLabels) {
    ok = fail("labels.generated.ts EN", "not found") && ok;
  } else {
    const hits = cjkHits(enLabels);
    if (hits.length) {
      ok =
        fail("labels.generated.ts EN has no Chinese", hits.join("\n      ")) &&
        ok;
    } else {
      pass("labels.generated.ts EN has no Chinese");
    }
  }
}

// models-client: no inline Chinese UI literals (zh ternaries for chrome)
{
  const client = readFileSync(
    join(WEB, "app", "dashboard", "models", "models-client.tsx"),
    "utf8"
  );
  const hits = [];
  for (const line of client.split("\n")) {
    if (!CJK_RE.test(line)) continue;
    if (/^\s*\/\//.test(line) || /^\s*\*/.test(line)) continue;
    hits.push(line.trim().slice(0, 120));
  }
  if (hits.length) {
    ok =
      fail("models-client.tsx has no Chinese literals", hits.join("\n      ")) &&
      ok;
  } else {
    pass("models-client.tsx has no Chinese literals");
  }
}

if (!ok) {
  console.error("\npublic-model-registry-smoke: FAILED");
  process.exit(1);
}
console.log("\npublic-model-registry-smoke: OK");
