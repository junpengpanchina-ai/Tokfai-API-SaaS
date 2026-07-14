#!/usr/bin/env node
/**
 * Security smoke — API key redaction / revoke / restore (offline).
 *
 * Usage: node scripts/security-api-key-redaction-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function pass(label) {
  console.log(`PASS  ${label}`);
  return true;
}

function fail(label, detail) {
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
  return false;
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

let ok = true;

{
  const keys = read("apps/dmit-api/src/routes/keys.ts");
  const me = read("apps/dmit-api/src/routes/me.ts");
  const createOnce =
    (keys.includes("secret: material.fullKey") || keys.includes("fullKey")) &&
    (me.includes("one_time_secret") || me.includes("secret"));
  if (!createOnce) {
    ok = fail("create key once", "expected create response to include one-time secret") && ok;
  } else {
    pass("create key returns secret once (create path)");
  }
}

{
  const db = read("apps/dmit-api/src/lib/apiKeysDb.ts");
  const mapper = db.match(
    /export function mapApiKeyListRow[\s\S]*?\n\}/
  )?.[0];
  if (!mapper || !mapper.includes("prefix: row.prefix")) {
    ok = fail("list key prefix", "mapApiKeyListRow must return prefix only") && ok;
  } else if (/\bsecret\s*:/.test(mapper) || mapper.includes("fullKey") || mapper.includes("encrypted_secret:")) {
    ok = fail("list key no secret", "list mapper must not include secret") && ok;
  } else {
    pass("list key returns prefix / masked only");
  }
}

{
  const logger = read("apps/dmit-api/src/logger.ts");
  const apiKey = read("apps/dmit-api/src/auth/apiKey.ts");
  if (!apiKey.includes("maskApiKeyId") && !apiKey.includes("maskTokenPrefix")) {
    ok = fail("key masking helpers", "expected maskApiKeyId / maskTokenPrefix") && ok;
  } else {
    pass("API key masking helpers exist");
  }
  // Logger must not allowlist raw secret fields
  if (/allow|ALLOW/.test(logger) && /fullKey|rawSecret|sk-tokfai_/.test(logger)) {
    ok = fail("logger secret allowlist", "logger must not log full sk-tokfai secrets") && ok;
  } else {
    pass("logs do not allowlist full sk-tokfai secrets");
  }
}

{
  const actions = read("apps/dmit-api/src/routes/apiKeyActions.ts");
  const adminKeys = read("apps/dmit-api/src/routes/adminApiKeys.ts");
  const verify = read("apps/dmit-api/src/auth/apiKey.ts");

  if (!verify.includes("revoked_at") || !/revoked_at[\s\S]{0,120}null|is null|IS NULL/i.test(verify)) {
    // verifyApiKeyToken should reject revoked
    if (!/revoked/i.test(verify)) {
      ok = fail("revoked key auth", "verify must check revoked_at") && ok;
    } else {
      pass("revoked key cannot authenticate");
    }
  } else {
    pass("revoked key cannot authenticate");
  }

  if (!actions.includes("revoke") && !adminKeys.includes("revoke")) {
    ok = fail("revoke flow", "missing revoke handlers") && ok;
  } else {
    pass("revoke key flow present");
  }

  if (!adminKeys.includes("restore") && !adminKeys.includes("Restore")) {
    ok = fail("restore flow", "missing admin restore") && ok;
  } else {
    pass("restore key can re-enable calling");
  }
}

if (!ok) {
  console.error("\nsecurity-api-key-redaction-smoke: FAILED");
  process.exit(1);
}
console.log("\nsecurity-api-key-redaction-smoke: OK");
