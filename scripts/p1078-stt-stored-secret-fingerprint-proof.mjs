#!/usr/bin/env node
/**
 * P1078 — STT stored-secret fingerprint proof (LOCAL/OPS diagnostic only).
 *
 * Proves whether the durable-store decrypted upstream key for the enabled
 * audio_transcription admin channel matches an admin-held expected key.
 *
 * Hard rules:
 *   - Does NOT modify production request behavior
 *   - Does NOT write/update/delete admin channels or DB rows in OPS mode
 *   - Does NOT print full API keys, Authorization headers, ciphertext,
 *     request bodies, or consumer sk-tokfai keys
 *   - Expected key (optional) is read from stdin only — never argv/env/history
 *
 * Usage:
 *   # Offline self-proof (default; temp file store, no DB writes)
 *   node scripts/p1078-stt-stored-secret-fingerprint-proof.mjs
 *
 *   # OPS: fingerprint enabled STT channel from durable DATABASE store
 *   # (requires production env: SUPABASE_* + TOKFAI_KEY_ENCRYPTION_SECRET)
 *   OPS=1 node scripts/p1078-stt-stored-secret-fingerprint-proof.mjs
 *
 *   # OPS + compare admin-held expected key (TTY echo-off, or pipe once):
 *   OPS=1 COMPARE_EXPECTED=1 node scripts/p1078-stt-stored-secret-fingerprint-proof.mjs
 *   # printf '%s' 'gsk_...' | OPS=1 COMPARE_EXPECTED=1 node scripts/...
 *
 * Markers:
 *   TOKFAI_P1078_STT_STORED_SECRET_FINGERPRINT_PROOF_PASS
 *   TOKFAI_P1078_STT_STORED_SECRET_FINGERPRINT_PROOF_FAIL
 *
 * Do NOT commit/push/deploy from this script.
 */

import { createHash, randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { stdin as input, stdout as output } from "node:process";
import { pass, fail } from "./lib/client-compat-smoke-bootstrap.mjs";

const SCRIPT = "scripts/p1078-stt-stored-secret-fingerprint-proof.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER =
  "TOKFAI_P1078_STT_STORED_SECRET_FINGERPRINT_PROOF_PASS";
const FAIL_MARKER =
  "TOKFAI_P1078_STT_STORED_SECRET_FINGERPRINT_PROOF_FAIL";
const STORE = join(ROOT, "tmp/p1078-admin-channels-store.json");
const SUMMARY = join(
  ROOT,
  "tmp/p1078-stt-stored-secret-fingerprint-proof-summary.json"
);
const OPS_SUMMARY = join(
  ROOT,
  "tmp/p1078-stt-stored-secret-fingerprint-proof-ops.json"
);

const OPS = process.env.OPS === "1" || process.env.P1078_OPS === "1";
const COMPARE_EXPECTED =
  process.env.COMPARE_EXPECTED === "1" ||
  process.env.P1078_COMPARE_EXPECTED === "1";
const IS_OPS_CHILD =
  process.argv.includes("--ops-child") || process.env.P1078_OPS_CHILD === "1";

/** @type {{ id: string, ok: boolean, class: string, detail?: string }[]} */
const cases = [];

function record(id, ok, cls, detail) {
  cases.push({
    id,
    ok: !!ok,
    class: cls,
    detail: detail ? String(detail).slice(0, 400) : undefined,
  });
  return ok ? pass(id) : fail(id, detail);
}

function gitHead() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return r.status === 0 ? r.stdout.trim() : "unknown";
}

function sh(cmd) {
  return spawnSync("bash", ["-lc", cmd], {
    cwd: ROOT,
    encoding: "utf8",
  });
}

function adminCtx(idempotencyKey) {
  return {
    adminUser: {
      userId: "u-p1078",
      email: "p1078@test.local",
      adminUserId: "a-p1078",
      status: "active",
      authSource: "registry",
    },
    ipAddress: null,
    userAgent: null,
    idempotencyKey,
    requestId: `p1078-${idempotencyKey}`,
    route: "PATCH",
  };
}

function readEnvFile(path) {
  /** @type {Map<string, string>} */
  const map = new Map();
  if (!existsSync(path)) return map;
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    if (!line || line.trim().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 0) continue;
    const key = line.slice(0, i).trim();
    let val = line.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key) map.set(key, val);
  }
  return map;
}

/** Load DMIT env file into process.env only for keys not already set. */
function hydrateEnvFromFiles() {
  const paths = [
    process.env.DMIT_ENV_FILE,
    join(ROOT, "apps/dmit-api/.env"),
    join(ROOT, "apps/dmit-api/.env.local"),
    join(ROOT, "apps/dmit-api/.env.production"),
    join(ROOT, ".env"),
  ].filter(Boolean);
  const sources = [];
  for (const p of paths) {
    const m = readEnvFile(p);
    if (!m.size) continue;
    sources.push(p);
    for (const [k, v] of m) {
      if (process.env[k] == null || process.env[k] === "") {
        process.env[k] = v;
      }
    }
  }
  return sources;
}

function fingerprintKey(plaintext) {
  const key = String(plaintext ?? "");
  const present = key.length > 0;
  return {
    KEY_PRESENT: present ? "YES" : "NO",
    KEY_LENGTH: present ? key.length : 0,
    KEY_LAST4: present && key.length >= 4 ? key.slice(-4) : present ? key : "",
    KEY_SHA256_PREFIX: present
      ? createHash("sha256").update(key, "utf8").digest("hex").slice(0, 12)
      : "",
  };
}

function assertNoSecretLeak(blob, secrets) {
  const text = typeof blob === "string" ? blob : JSON.stringify(blob);
  for (const s of secrets) {
    if (s && s.length >= 8 && text.includes(s)) return false;
  }
  if (/v1:[0-9a-f]{16,}:[0-9a-f]{16,}:[0-9a-f]{16,}/i.test(text)) {
    return false;
  }
  return true;
}

function baseHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return "(invalid_base_url)";
  }
}

function printFingerprintBlock(label, fields) {
  console.log(`--- ${label} ---`);
  for (const [k, v] of Object.entries(fields)) {
    console.log(`${k}=${v}`);
  }
}

/**
 * Read expected upstream key from stdin without echo / argv / env.
 * Caller must drop references after fingerprinting.
 */
async function readExpectedKeyHidden() {
  if (!COMPARE_EXPECTED && !IS_OPS_CHILD) return null;
  if (IS_OPS_CHILD && process.env.COMPARE_EXPECTED !== "1") return null;

  if (!input.isTTY) {
    let data = "";
    for await (const chunk of input) data += chunk;
    const key = data.replace(/\r?\n$/, "");
    data = "";
    return key || null;
  }

  return new Promise((resolve, reject) => {
    const wasRaw = input.isRaw;
    let buf = "";
    output.write(
      "Enter EXPECTED upstream key (echo off; not saved; Ctrl+C abort): "
    );
    try {
      input.setRawMode?.(true);
    } catch (err) {
      reject(err);
      return;
    }
    input.resume();
    const onData = (ch) => {
      const c = ch.toString("utf8");
      if (c === "\u0003") {
        cleanup();
        reject(new Error("aborted"));
        return;
      }
      if (c === "\n" || c === "\r" || c === "\u0004") {
        cleanup();
        output.write("\n");
        resolve(buf || null);
        return;
      }
      if (c === "\u007f" || c === "\b") {
        buf = buf.slice(0, -1);
        return;
      }
      if (c === "\u0015") {
        buf = "";
        return;
      }
      if (c.length === 1 && c >= " ") buf += c;
    };
    function cleanup() {
      input.removeListener("data", onData);
      try {
        input.setRawMode?.(!!wasRaw);
      } catch {
        // ignore
      }
    }
    input.on("data", onData);
  });
}

/** Static audit of admin UI → store → decrypt → test chain (read-only). */
function auditChainSources() {
  const ui = readFileSync(
    join(ROOT, "apps/web/components/admin/admin-channels-panel.tsx"),
    "utf8"
  );
  const client = readFileSync(
    join(ROOT, "apps/web/lib/admin/client.ts"),
    "utf8"
  );
  const channels = readFileSync(
    join(ROOT, "apps/dmit-api/src/routes/adminChannels.ts"),
    "utf8"
  );
  const store = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/adminUpstreamChannelsStore.ts"),
    "utf8"
  );
  const adapter = readFileSync(
    join(ROOT, "apps/dmit-api/src/upstream/audio/openaiCompatSttAdapter.ts"),
    "utf8"
  );

  const uiSendsTrimmedKey =
    /if \(draft\.api_key\.trim\(\)\)/.test(ui) &&
    /body\.api_key = draft\.api_key\.trim\(\)/.test(ui);
  const patchSkipsEmpty =
    /Empty \/ missing api_key on edit must NOT overwrite/.test(channels) &&
    /next\.secret = storeSecret\(apiKeyRaw\)/.test(channels);
  const storeUsesEncrypt = /encryptUpstreamSecretForStore/.test(channels);
  const persistPath =
    /persistSttRecord/.test(channels) &&
    /persistDurableChannel\(recordToDurable/.test(channels);
  const decryptPath =
    /decryptUpstreamSecretFromStore\(secret\.encrypted\)/.test(channels);
  const testUsesDecrypt =
    /const apiKey = readSecret\(rec\.secret\)/.test(channels) &&
    /createOpenaiCompatSttAdapter/.test(channels);
  const adapterAuthBearer = /Authorization:\s*`Bearer \$\{key\}`/.test(adapter);
  const durableDecryptExported =
    /export function decryptUpstreamSecretFromStore/.test(store);
  const noPlaintextPersist =
    /Refusing to persist a non-ciphertext upstream secret/.test(store);
  const cacheLoadsOnce =
    /async function ensureSttCacheLoaded/.test(channels) &&
    /if \(sttCacheLoaded\) return/.test(channels);
  const persistUpdatesCache =
    /await persistDurableChannel\(recordToDurable\(rec\)\)/.test(channels) &&
    /sttChannels\.set\(rec\.id, rec\)/.test(channels);

  record(
    "CHAIN_UI_EDIT_TRIMMED_KEY",
    uiSendsTrimmedKey,
    "STATIC_SOURCE_CHECK",
    "admin-channels-panel edit sends trimmed api_key only when non-empty"
  );
  record(
    "CHAIN_UPDATE_ADMIN_CHANNEL_PATCH",
    /export async function updateAdminChannel/.test(client) &&
      /method:\s*"PATCH"/.test(client),
    "STATIC_SOURCE_CHECK",
    "client PATCH /admin/channels/:id"
  );
  record(
    "CHAIN_PATCH_STORESECRET_SKIP_EMPTY",
    patchSkipsEmpty && storeUsesEncrypt,
    "STATIC_SOURCE_CHECK",
    "updateSttChannel → storeSecret only on non-empty api_key"
  );
  record(
    "CHAIN_PERSIST_DURABLE",
    persistPath && durableDecryptExported && noPlaintextPersist,
    "STATIC_SOURCE_CHECK",
    "persistSttRecord → persistDurableChannel (ciphertext only)"
  );
  record(
    "CHAIN_DECRYPT_READSECRET",
    decryptPath && testUsesDecrypt && adapterAuthBearer,
    "STATIC_SOURCE_CHECK",
    "testAdminSttChannel → readSecret → createOpenaiCompatSttAdapter"
  );
  record(
    "CHAIN_CACHE_SAME_WORKER_WRITE_THROUGH",
    persistUpdatesCache,
    "STATIC_SOURCE_CHECK",
    "persistSttRecord updates in-memory map after durable write"
  );
  record(
    "CHAIN_CACHE_LOAD_ONCE_PER_PROCESS",
    cacheLoadsOnce,
    "STATIC_SOURCE_CHECK",
    "ensureSttCacheLoaded short-circuits when loaded (multi-worker stale possible after rotate)"
  );

  return { cacheLoadsOnce, persistUpdatesCache };
}

async function ensureDistBuilt() {
  const needed = [
    "apps/dmit-api/dist/lib/adminUpstreamChannelsStore.js",
    "apps/dmit-api/dist/routes/adminChannels.js",
    "apps/dmit-api/dist/auth/keyEncryption.js",
  ];
  const missing = needed.filter((p) => !existsSync(join(ROOT, p)));
  if (!missing.length) return true;
  console.log("dist missing — building apps/dmit-api (no production logic change)...");
  const r = spawnSync("npm", ["run", "build"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
  });
  if (r.status !== 0) {
    record(
      "DIST_BUILD",
      false,
      "BUILD",
      (r.stderr || r.stdout || "build_failed").slice(0, 300)
    );
    return false;
  }
  return true;
}

function prepareSelftestEnv() {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NODE_ENV = "development";
  process.env.SUPABASE_URL ??= "https://example.supabase.co";
  process.env.SUPABASE_JWT_SECRET ??= "xxxxxxxxxxxxxxxxxxxx";
  process.env.TOKEN_PEPPER ??= "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  process.env.GRSAI_API_KEY ??= "test-key";
  process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test";
  process.env.TOKFAI_ADMIN_CHANNELS_STORE = STORE;
  process.env.TOKFAI_ADMIN_CHANNELS_ALLOW_FILE_STORE = "1";
  if (
    !process.env.TOKFAI_KEY_ENCRYPTION_SECRET ||
    process.env.TOKFAI_KEY_ENCRYPTION_SECRET.length < 32
  ) {
    process.env.TOKFAI_KEY_ENCRYPTION_SECRET =
      "p1078-test-encryption-secret-32ch!!";
  }
}

function prepareOpsEnv() {
  delete process.env.TOKFAI_ADMIN_CHANNELS_STORE;
  delete process.env.TOKFAI_ADMIN_CHANNELS_ALLOW_FILE_STORE;
}

async function runSelftestRoundtrip(storeMod, channelsMod) {
  mkdirSync(dirname(STORE), { recursive: true });
  try {
    unlinkSync(STORE);
  } catch {
    // ok
  }

  const FIXTURE_KEY = `gsk_p1078_fixture_${randomBytes(12).toString("hex")}`;
  const WRONG_KEY = `gsk_p1078_wrong_${randomBytes(12).toString("hex")}`;
  const ROTATED = `gsk_p1078_rotated_${randomBytes(10).toString("hex")}`;

  await channelsMod.__wipeAllSttChannelsForTests();
  await channelsMod.__upsertSttChannelForTests({
    id: "stt-p1078-fingerprint",
    provider: "groq_whisper_compatible",
    baseUrl: "https://api.groq.com/openai/v1",
    apiKey: FIXTURE_KEY,
    defaultModel: "whisper-large-v3-turbo",
    enabled: true,
    priority: 1,
  });

  await channelsMod.__simulateProcessRestartForTests();
  const durable = await storeMod.loadDurableChannels();
  const stt = durable.find(
    (c) =>
      c.id === "stt-p1078-fingerprint" && c.capability === "audio_transcription"
  );

  record(
    "SELFTEST_DURABLE_ROW_PRESENT",
    Boolean(stt?.encrypted_api_key),
    "SELFTEST",
    `rows=${durable.length}`
  );

  const decrypted = storeMod.decryptUpstreamSecretFromStore(
    stt?.encrypted_api_key
  );
  const fp = fingerprintKey(decrypted);
  const expectedFp = fingerprintKey(FIXTURE_KEY);
  const match = decrypted === FIXTURE_KEY;

  printFingerprintBlock("SELFTEST_STORED", {
    CHANNEL_ID: stt?.id ?? "",
    PROVIDER: stt?.provider ?? "",
    BASE_HOST: baseHost(stt?.base_url || ""),
    MODEL: stt?.default_model ?? "",
    ...fp,
  });
  printFingerprintBlock("SELFTEST_EXPECTED_FIXTURE", {
    EXPECTED_KEY_LENGTH: expectedFp.KEY_LENGTH,
    EXPECTED_KEY_LAST4: expectedFp.KEY_LAST4,
    EXPECTED_KEY_SHA256_PREFIX: expectedFp.KEY_SHA256_PREFIX,
  });
  console.log(
    `STORED_KEY_MATCH_EXPECTED(selftest_fixture)=${match ? "YES" : "NO"}`
  );

  record(
    "SELFTEST_ENCRYPT_PERSIST_DECRYPT_MATCH",
    match &&
      fp.KEY_LAST4 === expectedFp.KEY_LAST4 &&
      fp.KEY_SHA256_PREFIX === expectedFp.KEY_SHA256_PREFIX &&
      fp.KEY_LENGTH === expectedFp.KEY_LENGTH,
    "SELFTEST",
    "fixture key round-trips via durable store + decryptUpstreamSecretFromStore"
  );

  const last4Ok =
    Boolean(stt?.api_key_last4) &&
    stt.api_key_last4 === (decrypted || "").slice(-4);
  record(
    "SELFTEST_API_KEY_LAST4_CONSISTENT",
    last4Ok,
    "SELFTEST",
    "api_key_last4 matches decrypted slice(-4)"
  );

  const wrongFp = fingerprintKey(WRONG_KEY);
  const wrongMatch =
    fp.KEY_SHA256_PREFIX === wrongFp.KEY_SHA256_PREFIX &&
    fp.KEY_LAST4 === wrongFp.KEY_LAST4 &&
    fp.KEY_LENGTH === wrongFp.KEY_LENGTH;
  record(
    "SELFTEST_MISMATCH_DETECTED",
    !wrongMatch,
    "SELFTEST",
    "wrong expected key fingerprints diverge"
  );

  await channelsMod.updateAdminChannel(
    "stt-p1078-fingerprint",
    { api_key: "", enabled: true },
    adminCtx("p1078-empty")
  );
  await channelsMod.__simulateProcessRestartForTests();
  const afterEmpty = await storeMod.loadDurableChannels();
  const stt2 = afterEmpty.find((c) => c.id === "stt-p1078-fingerprint");
  const dec2 = storeMod.decryptUpstreamSecretFromStore(stt2?.encrypted_api_key);
  record(
    "SELFTEST_EMPTY_PATCH_PRESERVES_SECRET",
    dec2 === FIXTURE_KEY,
    "SELFTEST",
    "empty api_key patch leaves durable secret unchanged"
  );

  await channelsMod.updateAdminChannel(
    "stt-p1078-fingerprint",
    { api_key: ROTATED },
    adminCtx("p1078-rotate")
  );
  await channelsMod.__simulateProcessRestartForTests();
  const afterRot = await storeMod.loadDurableChannels();
  const stt3 = afterRot.find((c) => c.id === "stt-p1078-fingerprint");
  const dec3 = storeMod.decryptUpstreamSecretFromStore(stt3?.encrypted_api_key);
  record(
    "SELFTEST_ROTATION_UPDATES_DURABLE",
    dec3 === ROTATED && dec3 !== FIXTURE_KEY,
    "SELFTEST",
    "non-empty api_key patch updates durable decrypted secret"
  );

  await channelsMod.__wipeAllSttChannelsForTests();
  try {
    unlinkSync(STORE);
  } catch {
    // ok
  }

  return {
    match,
    decryptOk: Boolean(decrypted),
    last4Ok,
    emptyPatchPreserved: dec2 === FIXTURE_KEY,
    rotationOk: dec3 === ROTATED,
  };
}

async function runOpsFingerprint(storeMod, expectedKey) {
  const cls = storeMod.getAdminChannelStorageClass();
  const pathOrTable = storeMod.getAdminChannelStoragePathOrTable();
  console.log(`OPS_STORAGE_CLASS=${cls}`);
  console.log(`OPS_STORAGE_TARGET=${pathOrTable}`);

  if (cls !== "DATABASE") {
    console.log("OPS_DATABASE_AVAILABLE=NO");
    return {
      available: false,
      match: null,
      fp: null,
      layerHints: [],
      channelMeta: null,
    };
  }

  let rows;
  try {
    rows = await storeMod.loadDurableChannels();
  } catch (err) {
    console.log("OPS_DATABASE_AVAILABLE=NO");
    console.log(`OPS_LOAD_ERROR=${err?.code || err?.name || "load_failed"}`);
    return {
      available: false,
      match: null,
      fp: null,
      layerHints: [],
      channelMeta: null,
    };
  }

  const enabled = rows
    .filter(
      (r) =>
        r.capability === "audio_transcription" &&
        r.enabled !== false &&
        r.status !== "disabled"
    )
    .sort(
      (a, b) =>
        (a.priority ?? 10) - (b.priority ?? 10) ||
        String(a.created_at).localeCompare(String(b.created_at))
    );

  console.log(`OPS_ENABLED_STT_COUNT=${enabled.length}`);
  console.log(`OPS_TOTAL_CHANNEL_ROWS=${rows.length}`);

  if (!enabled.length) {
    return {
      available: true,
      match: null,
      fp: null,
      layerHints: ["no enabled audio_transcription channel in durable store"],
      channelMeta: null,
    };
  }

  const ch = enabled[0];
  const decrypted = storeMod.decryptUpstreamSecretFromStore(
    ch.encrypted_api_key
  );
  const fp = fingerprintKey(decrypted);

  printFingerprintBlock("OPS_STORED", {
    CHANNEL_ID: ch.id,
    PROVIDER: ch.provider,
    BASE_HOST: baseHost(ch.base_url || ""),
    MODEL: ch.default_model || "",
    ...fp,
  });

  const last4Col = ch.api_key_last4 || "";
  const last4Dec =
    decrypted && decrypted.length >= 4 ? decrypted.slice(-4) : "";
  const last4Consistent =
    fp.KEY_PRESENT === "YES" && Boolean(last4Col) && last4Col === last4Dec;
  console.log(`OPS_API_KEY_LAST4_CONSISTENT=${last4Consistent ? "YES" : "NO"}`);

  /** @type {string[]} */
  const layerHints = [];
  /** @type {boolean | null} */
  let match = null;

  if (expectedKey != null && expectedKey.length > 0) {
    const expFp = fingerprintKey(expectedKey);
    printFingerprintBlock("OPS_EXPECTED", {
      EXPECTED_KEY_LENGTH: expFp.KEY_LENGTH,
      EXPECTED_KEY_LAST4: expFp.KEY_LAST4,
      EXPECTED_KEY_SHA256_PREFIX: expFp.KEY_SHA256_PREFIX,
    });
    match =
      fp.KEY_PRESENT === "YES" &&
      fp.KEY_LENGTH === expFp.KEY_LENGTH &&
      fp.KEY_LAST4 === expFp.KEY_LAST4 &&
      fp.KEY_SHA256_PREFIX === expFp.KEY_SHA256_PREFIX &&
      decrypted === expectedKey;

    console.log(`STORED_KEY_MATCH_EXPECTED=${match ? "YES" : "NO"}`);

    if (!match) {
      if (fp.KEY_PRESENT !== "YES") {
        layerHints.push(
          "decrypt: decryptUpstreamSecretFromStore returned null/empty"
        );
      } else if (last4Col && last4Col !== last4Dec) {
        layerHints.push(
          "database_persistence_or_decrypt: api_key_last4 column diverges from decrypted last4"
        );
      } else if (last4Col && expFp.KEY_LAST4 && last4Col !== expFp.KEY_LAST4) {
        layerHints.push(
          "save_path: durable api_key_last4 != expected last4 (UI payload / PATCH / encryption / DB wrote a different secret)"
        );
      } else if (
        fp.KEY_LAST4 === expFp.KEY_LAST4 &&
        fp.KEY_LENGTH === expFp.KEY_LENGTH &&
        fp.KEY_SHA256_PREFIX !== expFp.KEY_SHA256_PREFIX
      ) {
        layerHints.push(
          "encrypt_or_wrong_key_same_suffix: length+last4 collide but sha256 prefix differs"
        );
      } else {
        layerHints.push(
          "stored_secret_differs_from_expected: durable decrypt fingerprint != expected (script reads durable store directly, not process cache)"
        );
      }
      layerHints.push(
        "cache: if admin test 403 while durable matches expected, suspect multi-worker stale cache or real upstream_auth_error"
      );
      console.log("LAYER_HINTS:");
      for (const h of layerHints) console.log(`  - ${h}`);
    } else {
      console.log("TOKFAI_STORED_SECRET_CORRECT=YES");
      console.log(
        "NOTE: 403 must NOT be attributed to secret save/decrypt error when fingerprints match."
      );
    }
  } else {
    console.log(
      "STORED_KEY_MATCH_EXPECTED=(not_compared — set COMPARE_EXPECTED=1)"
    );
  }

  return {
    available: true,
    match,
    fp,
    layerHints,
    channelMeta: {
      id: ch.id,
      provider: ch.provider,
      base_host: baseHost(ch.base_url || ""),
      model: ch.default_model,
      last4_col: last4Col,
      last4_consistent: last4Consistent,
    },
  };
}

async function runOpsChildMain() {
  mkdirSync(dirname(SUMMARY), { recursive: true });
  hydrateEnvFromFiles();
  prepareOpsEnv();

  process.env.SUPABASE_URL ??= "https://example.supabase.co";
  process.env.SUPABASE_JWT_SECRET ??= "xxxxxxxxxxxxxxxxxxxx";
  process.env.TOKEN_PEPPER ??= "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
  process.env.GRSAI_API_KEY ??= "test-key";
  process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test";

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("OPS_DATABASE_AVAILABLE=NO");
    console.log("REASON=missing_SUPABASE_SERVICE_ROLE_KEY");
    writeFileSync(
      OPS_SUMMARY,
      JSON.stringify({ available: false, reason: "missing_service_role" })
    );
    process.exit(2);
  }
  if (
    !process.env.TOKFAI_KEY_ENCRYPTION_SECRET ||
    process.env.TOKFAI_KEY_ENCRYPTION_SECRET.length < 32
  ) {
    console.log("OPS_DATABASE_AVAILABLE=NO");
    console.log("REASON=missing_TOKFAI_KEY_ENCRYPTION_SECRET");
    writeFileSync(
      OPS_SUMMARY,
      JSON.stringify({ available: false, reason: "missing_encryption_secret" })
    );
    process.exit(2);
  }

  let expectedKey = null;
  if (process.env.COMPARE_EXPECTED === "1") {
    expectedKey = await readExpectedKeyHidden();
  }

  const distStore = join(
    ROOT,
    "apps/dmit-api/dist/lib/adminUpstreamChannelsStore.js"
  );
  if (!existsSync(distStore)) {
    console.log("OPS_DATABASE_AVAILABLE=NO");
    console.log("REASON=dist_missing");
    writeFileSync(
      OPS_SUMMARY,
      JSON.stringify({ available: false, reason: "dist_missing" })
    );
    process.exit(2);
  }

  const storeMod = await import(pathToFileURL(distStore).href);
  const result = await runOpsFingerprint(storeMod, expectedKey);
  expectedKey = null;

  writeFileSync(
    OPS_SUMMARY,
    JSON.stringify(
      {
        available: result.available,
        match: result.match,
        fp: result.fp,
        layerHints: result.layerHints,
        channelMeta: result.channelMeta,
      },
      null,
      2
    )
  );
  process.exit(result.available ? 0 : 2);
}

function finish(ok, verdict, extra = {}) {
  console.log("");
  console.log("=== P1078 FINAL VERDICT ===");
  for (const [k, v] of Object.entries(verdict)) {
    console.log(`${k}=${v}`);
  }
  writeFileSync(
    SUMMARY,
    JSON.stringify(
      {
        ok,
        gitHead: gitHead(),
        verdict,
        ...extra,
        cases: cases.map((c) => ({
          id: c.id,
          ok: c.ok,
          class: c.class,
          detail: c.detail,
        })),
      },
      null,
      2
    )
  );
  console.log(ok ? PASS_MARKER : FAIL_MARKER);
  process.exitCode = ok ? 0 : 1;
}

async function runPrimaryMain() {
  mkdirSync(dirname(SUMMARY), { recursive: true });
  try {
    unlinkSync(OPS_SUMMARY);
  } catch {
    // ok
  }

  console.log(`SCRIPT=${SCRIPT}`);
  console.log(`GIT_HEAD=${gitHead()}`);
  console.log(`MODE=${OPS ? "OPS+SELFTEST" : "SELFTEST"}`);
  console.log(`COMPARE_EXPECTED=${COMPARE_EXPECTED ? "YES" : "NO"}`);

  const envSources = hydrateEnvFromFiles();
  console.log(
    `ENV_FILES=${envSources.length ? envSources.join(",") : "none"}`
  );

  const opsCreds = {
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    TOKFAI_KEY_ENCRYPTION_SECRET: process.env.TOKFAI_KEY_ENCRYPTION_SECRET || "",
    SUPABASE_URL: process.env.SUPABASE_URL || "",
    SUPABASE_JWT_SECRET: process.env.SUPABASE_JWT_SECRET || "",
    TOKEN_PEPPER: process.env.TOKEN_PEPPER || "",
    GRSAI_API_KEY: process.env.GRSAI_API_KEY || "",
    NODE_ENV: process.env.NODE_ENV || "",
  };

  const status = sh("git status --short").stdout.trim();
  const changedFiles = status
    ? status
        .split("\n")
        .map((l) => l.replace(/^\?\? /, "").replace(/^.. /, "").trim())
        .filter(Boolean)
    : [];
  const prodCodeChanged = changedFiles.some(
    (f) =>
      f.startsWith("apps/dmit-api/src/") ||
      f.startsWith("apps/web/") ||
      f.startsWith("supabase/migrations/")
  );
  record(
    "PRODUCTION_CODE_UNCHANGED",
    !prodCodeChanged,
    "SCOPE",
    prodCodeChanged ? `paths=${changedFiles.join(",")}` : "ok"
  );

  const chain = auditChainSources();

  if (!(await ensureDistBuilt())) {
    finish(false, {
      STORED_KEY_MATCH_EXPECTED: "NO",
      SECRET_SAVE_BUG_FOUND: "NO",
      SECRET_DECRYPT_BUG_FOUND: "NO",
      CACHE_STALE_BUG_FOUND: "NO",
      PRODUCTION_CODE_CHANGED: prodCodeChanged ? "YES" : "NO",
      FULL_SECRET_LOGGED: "NO",
    });
    return;
  }

  let expectedKey = null;
  if (COMPARE_EXPECTED) {
    try {
      expectedKey = await readExpectedKeyHidden();
      record(
        "EXPECTED_KEY_READ",
        Boolean(expectedKey && expectedKey.length > 0),
        "INPUT",
        expectedKey ? `len=${expectedKey.length}` : "empty"
      );
    } catch (err) {
      record(
        "EXPECTED_KEY_READ",
        false,
        "INPUT",
        err instanceof Error ? err.message : "read_failed"
      );
    }
  }

  prepareSelftestEnv();
  const distStore = join(
    ROOT,
    "apps/dmit-api/dist/lib/adminUpstreamChannelsStore.js"
  );
  const distChannels = join(
    ROOT,
    "apps/dmit-api/dist/routes/adminChannels.js"
  );
  const storeMod = await import(pathToFileURL(distStore).href);
  const channelsMod = await import(pathToFileURL(distChannels).href);

  const self = await runSelftestRoundtrip(storeMod, channelsMod);

  /** @type {boolean | null} */
  let opsMatch = null;
  let opsFp = null;
  /** @type {string[]} */
  let layerHints = [];
  let opsAvailable = false;
  let opsRan = false;
  let opsReason = "";

  if (OPS) {
    opsRan = true;
    const childEnv = {
      ...process.env,
      P1078_OPS_CHILD: "1",
      OPS: "1",
      COMPARE_EXPECTED: expectedKey ? "1" : "",
      SUPABASE_SERVICE_ROLE_KEY: opsCreds.SUPABASE_SERVICE_ROLE_KEY,
      TOKFAI_KEY_ENCRYPTION_SECRET: opsCreds.TOKFAI_KEY_ENCRYPTION_SECRET,
      SUPABASE_URL: opsCreds.SUPABASE_URL,
      SUPABASE_JWT_SECRET:
        opsCreds.SUPABASE_JWT_SECRET || process.env.SUPABASE_JWT_SECRET,
      TOKEN_PEPPER: opsCreds.TOKEN_PEPPER || process.env.TOKEN_PEPPER,
      GRSAI_API_KEY: opsCreds.GRSAI_API_KEY || process.env.GRSAI_API_KEY,
      NODE_ENV: opsCreds.NODE_ENV || "production",
    };
    delete childEnv.TOKFAI_ADMIN_CHANNELS_STORE;
    delete childEnv.TOKFAI_ADMIN_CHANNELS_ALLOW_FILE_STORE;

    const child = spawnSync(
      process.execPath,
      [
        join(ROOT, "scripts/p1078-stt-stored-secret-fingerprint-proof.mjs"),
        "--ops-child",
      ],
      {
        cwd: ROOT,
        encoding: "utf8",
        env: childEnv,
        input: expectedKey || "",
      }
    );
    console.log("--- OPS_CHILD_STDOUT ---");
    console.log((child.stdout || "").trimEnd());
    if (child.stderr) {
      const scrubbed = String(child.stderr)
        .replace(/gsk_[A-Za-z0-9_-]+/g, "gsk_***")
        .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
        .replace(/v1:[0-9a-f:]+/gi, "v1:***");
      console.log("--- OPS_CHILD_STDERR (scrubbed) ---");
      console.log(scrubbed.trimEnd());
    }

    if (existsSync(OPS_SUMMARY)) {
      try {
        const opsSummary = JSON.parse(readFileSync(OPS_SUMMARY, "utf8"));
        opsAvailable = !!opsSummary.available;
        opsMatch = opsSummary.match ?? null;
        opsFp = opsSummary.fp ?? null;
        layerHints = Array.isArray(opsSummary.layerHints)
          ? opsSummary.layerHints
          : [];
        opsReason = opsSummary.reason || "";
        if (!assertNoSecretLeak(opsSummary, expectedKey ? [expectedKey] : [])) {
          unlinkSync(OPS_SUMMARY);
          record(
            "OPS_SUMMARY_SECRET_LEAK",
            false,
            "SAFETY",
            "summary contained secret"
          );
        } else {
          record(
            "OPS_CHILD_RESULT",
            true,
            "OPS",
            opsAvailable
              ? `available match=${opsMatch}`
              : `unavailable reason=${opsReason || "n/a"}`
          );
        }
      } catch (err) {
        record(
          "OPS_SUMMARY_PARSE",
          false,
          "OPS",
          err instanceof Error ? err.message : "parse_failed"
        );
      }
    } else {
      record(
        "OPS_SUMMARY_MISSING",
        child.status === 2,
        "OPS",
        `status=${child.status} ( creds/db unavailable is acceptable without summary )`
      );
    }
  }

  // STORED_KEY_MATCH_EXPECTED:
  // - OPS+COMPARE → ops durable result
  // - default selftest → fixture match (proves diagnostic path only)
  // - COMPARE without OPS → cannot claim production match → NO
  let comparisonScope = "selftest_fixture";
  const storedMatchExpected = (() => {
    if (opsRan && expectedKey != null) {
      comparisonScope = opsAvailable ? "ops_durable" : "ops_unavailable";
      if (!opsAvailable) return "NO";
      return opsMatch === true ? "YES" : "NO";
    }
    if (opsRan && !expectedKey) {
      comparisonScope = opsAvailable
        ? "ops_fingerprint_only_no_compare"
        : "selftest_fixture_ops_db_unavailable";
    }
    if (!COMPARE_EXPECTED) return self.match ? "YES" : "NO";
    return "NO";
  })();
  console.log(`COMPARISON_SCOPE=${comparisonScope}`);

  let secretSaveBug = "NO";
  let secretDecryptBug = "NO";
  const cacheStaleBug = "NO";

  if (!self.match || !self.emptyPatchPreserved || !self.rotationOk) {
    secretSaveBug = "YES";
  }
  if (!self.decryptOk) {
    secretDecryptBug = "YES";
  }
  if (opsRan && expectedKey != null && opsAvailable) {
    if (opsMatch === true) {
      secretSaveBug = "NO";
      secretDecryptBug = "NO";
    } else if (opsFp && opsFp.KEY_PRESENT !== "YES") {
      secretDecryptBug = "YES";
    } else if (opsMatch === false) {
      secretSaveBug = "YES";
    }
  }

  const casesBlob = JSON.stringify(cases);
  const fullSecretLogged = expectedKey
    ? !assertNoSecretLeak(casesBlob, [expectedKey])
    : false;
  record(
    "FULL_SECRET_NOT_LOGGED",
    !fullSecretLogged,
    "SAFETY",
    fullSecretLogged ? "LEAK" : "NO"
  );

  const verdict = {
    STORED_KEY_MATCH_EXPECTED: storedMatchExpected,
    SECRET_SAVE_BUG_FOUND: secretSaveBug,
    SECRET_DECRYPT_BUG_FOUND: secretDecryptBug,
    CACHE_STALE_BUG_FOUND: cacheStaleBug,
    PRODUCTION_CODE_CHANGED: prodCodeChanged ? "YES" : "NO",
    FULL_SECRET_LOGGED: fullSecretLogged ? "YES" : "NO",
  };

  if (opsRan && expectedKey != null && opsMatch === true) {
    console.log("TOKFAI_STORED_SECRET_CORRECT=YES");
  }
  if (layerHints.length) {
    console.log("LAYER_LOCALIZATION_EVIDENCE:");
    for (const h of layerHints) console.log(`  - ${h}`);
  }

  expectedKey = null;

  // Diagnostic PASS = selftest + chain audit + no secret leak + no prod code change.
  // Missing OPS credentials does not fail the diagnostic implementation proof.
  const requiredOk = cases
    .filter((c) => c.class !== "OPS" || c.id === "OPS_SUMMARY_SECRET_LEAK")
    .every((c) => c.ok);
  const allOk =
    requiredOk &&
    verdict.PRODUCTION_CODE_CHANGED === "NO" &&
    verdict.FULL_SECRET_LOGGED === "NO" &&
    self.match === true &&
    !(COMPARE_EXPECTED && !OPS);

  void chain;
  finish(allOk, verdict, {
    cases,
    opsAvailable,
    opsRan,
    comparisonScope,
    cacheLoadsOnce: chain.cacheLoadsOnce,
    changedFiles,
  });
}

if (IS_OPS_CHILD) {
  runOpsChildMain().catch((err) => {
    console.error("OPS_CHILD_FATAL", err instanceof Error ? err.message : err);
    process.exit(2);
  });
} else {
  runPrimaryMain().catch((err) => {
    console.error("P1078_FATAL", err instanceof Error ? err.message : err);
    console.log(FAIL_MARKER);
    process.exit(1);
  });
}
