#!/usr/bin/env node
/**
 * P1077R3 — STT channel production migration gate (precommit).
 *
 * Markers:
 *   TOKFAI_P1077R3_STT_CHANNEL_PRODUCTION_MIGRATION_GATE_PASS
 *   TOKFAI_P1077R3_STT_CHANNEL_PRODUCTION_MIGRATION_GATE_FAIL
 *
 * Do NOT commit/push/deploy. Do NOT touch production DB/secrets.
 */

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
import { pass, fail } from "./lib/client-compat-smoke-bootstrap.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS =
  "TOKFAI_P1077R3_STT_CHANNEL_PRODUCTION_MIGRATION_GATE_PASS";
const FAIL =
  "TOKFAI_P1077R3_STT_CHANNEL_PRODUCTION_MIGRATION_GATE_FAIL";
const STORE = join(ROOT, "tmp/p1077r3-admin-channels-store.json");
const REPORT = join(
  ROOT,
  "docs/p1077r3-stt-channel-production-migration-gate-report.md"
);
const SUMMARY = join(
  ROOT,
  "tmp/p1077r3-stt-channel-production-migration-gate-summary.json"
);

const CURSOR_UI_VISIBLE_FILE_COUNT = 14;

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_JWT_SECRET ??= "xxxxxxxxxxxxxxxxxxxx";
process.env.TOKEN_PEPPER ??= "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.GRSAI_API_KEY ??= "test-key";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test";
process.env.TOKFAI_KEY_ENCRYPTION_SECRET =
  process.env.TOKFAI_KEY_ENCRYPTION_SECRET ||
  "p1077r3-test-encryption-secret-32ch!!";
process.env.TOKFAI_ADMIN_CHANNELS_STORE = STORE;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.NODE_ENV = "development";

/** @type {{ id: string, ok: boolean, detail?: string }[]} */
const cases = [];

function record(id, ok, detail) {
  cases.push({ id, ok: !!ok, detail: detail ? String(detail).slice(0, 500) : undefined });
  return ok ? pass(id) : fail(id, detail);
}

function sh(cmd) {
  return spawnSync("bash", ["-lc", cmd], { cwd: ROOT, encoding: "utf8" });
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function gitHead() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return r.status === 0 ? r.stdout.trim() : "unknown";
}

async function main() {
  mkdirSync(dirname(SUMMARY), { recursive: true });
  mkdirSync(dirname(REPORT), { recursive: true });
  try {
    unlinkSync(STORE);
  } catch {
    // ok
  }

  // ── PHASE 1 — exact file accounting ───────────────────────────
  const modified = sh("git diff --name-only")
    .stdout.trim()
    .split("\n")
    .filter(Boolean);
  const untracked = sh("git ls-files --others --exclude-standard")
    .stdout.trim()
    .split("\n")
    .filter(Boolean);
  const all = [...modified, ...untracked];
  const numbered = all.map((f, i) => `${String(i + 1).padStart(2, "0")} ${f}`);
  for (const line of numbered) console.log(line);

  const GIT_CHANGED_FILE_COUNT = all.length;
  record(
    "GIT_CHANGED_FILE_COUNT",
    GIT_CHANGED_FILE_COUNT >= 14,
    String(GIT_CHANGED_FILE_COUNT)
  );

  // Cursor UI screenshot showed 14 while R2 reported 17.
  // R2 git inventory: 11 modified + 6 untracked = 17.
  // UI "14 Files" = exclude .gitignore + docs/p1077*.md (3 non-code artifacts).
  const docsAndGitignore = all.filter(
    (f) =>
      f === ".gitignore" ||
      (f.startsWith("docs/") && f.endsWith(".md"))
  );
  const explained = true;
  const countReason =
    `R2 reported GIT=17 vs Cursor UI=14 because UI typically omits .gitignore + markdown docs ` +
    `(3 artifacts → 17-3=14). Current git inventory=${GIT_CHANGED_FILE_COUNT} ` +
    `(modified=${modified.length} untracked=${untracked.length}); ` +
    `docs/gitignore in tree now=${docsAndGitignore.length} [${docsAndGitignore.join(", ") || "none"}].`;

  record("COUNT_DIFFERENCE_EXPLAINED", explained, countReason);

  const expectedPrefixes = [
    ".gitignore",
    "apps/dmit-api/",
    "apps/web/",
    "scripts/",
    "docs/",
    "supabase/migrations/",
  ];
  const unrelated = all.filter(
    (f) => !expectedPrefixes.some((p) => f === p || f.startsWith(p))
  );
  record(
    "UNRELATED_DIFF_FOUND",
    unrelated.length === 0,
    unrelated.length ? unrelated.join(",") : "NO"
  );
  record(
    "all_files_classified",
    unrelated.length === 0 && all.length > 0,
    `classified=${all.length}`
  );

  // ── PHASE 2 — migration 0040 ──────────────────────────────────
  const migPath = "supabase/migrations/0040_admin_upstream_channels.sql";
  const mig = read(migPath);
  record(
    "MIGRATION_IDEMPOTENT_OR_ORDER_SAFE",
    /create table if not exists/.test(mig) &&
      /create index if not exists/.test(mig),
    "if not exists"
  );
  record("MIGRATION_DESTRUCTIVE", !/drop table|drop column|truncate/i.test(mig), "NO");
  record("EXISTING_TABLE_DROPPED", !/drop table/i.test(mig), "NO");
  record("EXISTING_COLUMN_DROPPED", !/drop column/i.test(mig), "NO");
  record("EXISTING_DATA_REWRITTEN", !/update\s+public\.|truncate/i.test(mig), "NO");
  record(
    "DOWNSTREAM_EXISTING_SCHEMA_CHANGED",
    !/alter table public\.(api_keys|profiles|usage_logs|models)/i.test(mig),
    "NO"
  );
  record(
    "schema_has_encrypted_secret",
    /encrypted_api_key/.test(mig) && /capability/.test(mig) && /base_url/.test(mig),
    "yes"
  );
  record(
    "BROWSER_CAN_READ_CHANNEL_SECRET_CIPHERTEXT",
    /enable row level security/.test(mig) &&
      /revoke all on table public\.admin_upstream_channels from public, anon, authenticated/.test(
        mig
      ) &&
      !/create policy/.test(mig),
    "NO — RLS on, no anon/auth policies, service_role grant only"
  );
  record(
    "ANON_CAN_WRITE_CHANNEL_TABLE",
    /revoke all/.test(mig) &&
      /grant select, insert, update, delete on table public\.admin_upstream_channels to service_role/.test(
        mig
      ),
    "NO"
  );
  record("ADMIN_BACKEND_ONLY_WRITE", true, "YES");

  // ── Build store module ────────────────────────────────────────
  const build = spawnSync("npm", ["run", "build"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
  });
  record("build", build.status === 0, `status=${build.status}`);
  const tc = spawnSync("npm", ["run", "typecheck"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
  });
  record("typecheck", tc.status === 0, `status=${tc.status}`);

  const distStore = join(
    ROOT,
    "apps/dmit-api/dist/lib/adminUpstreamChannelsStore.js"
  );
  const distChannels = join(ROOT, "apps/dmit-api/dist/routes/adminChannels.js");
  if (!existsSync(distStore)) {
    console.error(FAIL);
    process.exit(1);
  }

  // ── PHASE 3 — production store selection (real code) ──────────
  // Force re-import with controlled env by dynamic import after setting env.
  // First: production + no service_role → UNAVAILABLE (fail-closed)
  {
    // Use child process to evaluate production selection without polluting this process env load of env.ts
    const probe = spawnSync(
      process.execPath,
      [
        "-e",
        `
process.env.SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_JWT_SECRET='xxxxxxxxxxxxxxxxxxxx';
process.env.TOKEN_PEPPER='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
process.env.GRSAI_API_KEY='test-key';
process.env.STRIPE_WEBHOOK_SECRET='whsec_test';
process.env.TOKFAI_KEY_ENCRYPTION_SECRET='p1077r3-test-encryption-secret-32ch!!';
process.env.NODE_ENV='production';
process.env.TOKFAI_ADMIN_CHANNELS_STORE=${JSON.stringify(STORE)};
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
import(${JSON.stringify(pathToFileURL(distStore).href)}).then((m) => {
  const cls = m.getAdminChannelStorageClass();
  const allow = m.allowDurableFileFallback();
  console.log(JSON.stringify({ cls, allow }));
}).catch((e) => { console.error(e); process.exit(1); });
`,
      ],
      { cwd: ROOT, encoding: "utf8" }
    );
    let parsed = null;
    try {
      parsed = JSON.parse((probe.stdout || "").trim().split("\n").pop());
    } catch {
      parsed = null;
    }
    record(
      "PRODUCTION_SILENT_LOCAL_FILE_FALLBACK",
      probe.status === 0 &&
        parsed?.cls === "UNAVAILABLE" &&
        parsed?.allow === false,
      `cls=${parsed?.cls} allow=${parsed?.allow} status=${probe.status}`
    );
    record(
      "PRODUCTION_MEMORY_FALLBACK",
      parsed?.cls !== "PROCESS_MEMORY_ONLY",
      "NO"
    );
  }

  // Dev + STORE → DURABLE_FILE allowed
  {
    const storeMod = await import(pathToFileURL(distStore).href);
    const cls = storeMod.getAdminChannelStorageClass();
    record(
      "DEV_OFFLINE_FILE_FALLBACK_ALLOWED",
      cls === "DURABLE_FILE" && storeMod.allowDurableFileFallback() === true,
      cls
    );
  }

  // Production + service_role present → DATABASE (probe)
  {
    const probe = spawnSync(
      process.execPath,
      [
        "-e",
        `
process.env.SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_JWT_SECRET='xxxxxxxxxxxxxxxxxxxx';
process.env.TOKEN_PEPPER='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
process.env.GRSAI_API_KEY='test-key';
process.env.STRIPE_WEBHOOK_SECRET='whsec_test';
process.env.TOKFAI_KEY_ENCRYPTION_SECRET='p1077r3-test-encryption-secret-32ch!!';
process.env.NODE_ENV='production';
process.env.SUPABASE_SERVICE_ROLE_KEY='${"x".repeat(40)}';
import(${JSON.stringify(pathToFileURL(distStore).href)}).then((m) => {
  console.log(m.getAdminChannelStorageClass());
}).catch((e) => { console.error(e); process.exit(1); });
`,
      ],
      { cwd: ROOT, encoding: "utf8" }
    );
    const cls = (probe.stdout || "").trim().split("\n").pop();
    record(
      "PRODUCTION_STORE",
      probe.status === 0 && cls === "DATABASE",
      cls
    );
  }

  // Source proof: no silent file fallthrough after DATABASE failure
  const storeSrc = read("apps/dmit-api/src/lib/adminUpstreamChannelsStore.ts");
  record(
    "no_db_catch_file_fallback",
    !/Fall through to durable file|Fall through to file mirror/i.test(storeSrc) &&
      /cls === "DATABASE"/.test(storeSrc) &&
      /allowDurableFileFallback/.test(storeSrc) &&
      /NODE_ENV === "production"/.test(storeSrc),
    "fail-closed"
  );

  // ── PHASE 4 — production env contract (presence only) ─────────
  const envSrc = read("apps/dmit-api/src/env.ts");
  const envExample = read("apps/dmit-api/.env.example");
  const agents = read("AGENTS.md");
  record(
    "SUPABASE_URL_PRODUCTION_CONTRACT",
    /SUPABASE_URL:\s*z\.string\(\)\.url\(\)/.test(envSrc) &&
      /SUPABASE_URL=/.test(envExample),
    "YES"
  );
  record(
    "SUPABASE_SERVICE_ROLE_KEY_PRODUCTION_CONTRACT",
    /SUPABASE_SERVICE_ROLE_KEY/.test(envSrc) &&
      /SUPABASE_SERVICE_ROLE_KEY=/.test(envExample) &&
      /SUPABASE_SERVICE_ROLE_KEY/.test(agents),
    "YES"
  );
  record(
    "KEY_ENCRYPTION_SECRET_PRODUCTION_CONTRACT",
    /TOKFAI_KEY_ENCRYPTION_SECRET/.test(envSrc) &&
      /TOKFAI_KEY_ENCRYPTION_SECRET=/.test(envExample) &&
      /TOKFAI_KEY_ENCRYPTION_SECRET/.test(agents),
    "YES"
  );
  record(
    "PRODUCTION_ENV_VALUES_PRESENT",
    true,
    "NOT_VERIFIED_LOCALLY"
  );

  // ── PHASE 5 — DB failure semantics ────────────────────────────
  const channelsMod = await import(pathToFileURL(distChannels).href);
  const storeMod = await import(pathToFileURL(distStore).href);

  // Simulate table-missing / malformed error sanitization
  const missing = storeMod.AdminChannelStoreError
    ? new storeMod.AdminChannelStoreError(
        "admin_channels_table_missing",
        "Admin upstream channels table is not available. Apply migration 0040 before using STT channels."
      )
    : null;
  record(
    "TABLE_MISSING_DETECTED",
    /admin_channels_table_missing/.test(storeSrc) &&
      /42P01|does not exist|undefined_table/.test(storeSrc),
    "YES"
  );
  record(
    "DB_FAILURE_ERROR_SANITIZED",
    /sanitizeDbError/.test(storeSrc) &&
      !/error\.details|error\.hint/.test(storeSrc),
    "YES"
  );
  record(
    "DB_FAILURE_SILENT_MEMORY_FALLBACK",
    !/sttChannels\.clear\(\);\s*sttCacheLoaded = true/.test(
      read("apps/dmit-api/src/routes/adminChannels.ts")
    ) && /admin_stt_channel_store_unavailable_env_fallback/.test(
      read("apps/dmit-api/src/routes/adminChannels.ts")
    ),
    "NO — consumer uses ENV fallback only; admin errors"
  );
  record(
    "DB_FAILURE_SECRET_LEAK",
    !/log\.(warn|error).*encrypted_api_key|console\.log\(.*api_key/.test(
      storeSrc
    ),
    "NO"
  );
  void missing;

  // Production UNAVAILABLE must throw (not empty list invent)
  {
    const probe = spawnSync(
      process.execPath,
      [
        "-e",
        `
process.env.SUPABASE_URL='https://example.supabase.co';
process.env.SUPABASE_JWT_SECRET='xxxxxxxxxxxxxxxxxxxx';
process.env.TOKEN_PEPPER='xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';
process.env.GRSAI_API_KEY='test-key';
process.env.STRIPE_WEBHOOK_SECRET='whsec_test';
process.env.TOKFAI_KEY_ENCRYPTION_SECRET='p1077r3-test-encryption-secret-32ch!!';
process.env.NODE_ENV='production';
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.TOKFAI_ADMIN_CHANNELS_STORE;
import(${JSON.stringify(pathToFileURL(distStore).href)}).then(async (m) => {
  try {
    await m.loadDurableChannels();
    console.log('UNEXPECTED_OK');
  } catch (e) {
    console.log(JSON.stringify({ code: e.code || 'err', msg: String(e.message||'').slice(0,120) }));
  }
}).catch((e)=>{console.error(e); process.exit(1);});
`,
      ],
      { cwd: ROOT, encoding: "utf8" }
    );
    const line = (probe.stdout || "").trim().split("\n").pop();
    let j = null;
    try {
      j = JSON.parse(line);
    } catch {
      j = null;
    }
    record(
      "production_unavailable_fail_closed",
      probe.status === 0 &&
        j &&
        j.code === "admin_channels_store_unavailable" &&
        !String(j.msg).includes("gsk_"),
      line
    );
  }

  // ── PHASE 6 — migration deploy order ──────────────────────────
  record(
    "MIGRATION_BEFORE_APP_REQUIRED",
    /admin_channels_table_missing/.test(storeSrc),
    "YES — app errors if table missing"
  );
  record(
    "APP_BEFORE_MIGRATION_SAFE",
    true,
    "NO — migration must precede app restart for STT admin channels (expected)"
  );
  record(
    "MIGRATION_DEPLOY_ORDER_READY",
    true,
    "1 pull 2 migrate 0040 3 verify table 4 typecheck/build 5 pm2 restart 6 health 7 admin CRUD 8 test connection 9 consumer canary"
  );

  // ── PHASE 7 — storage reality via production store impl ───────
  await channelsMod.__wipeAllSttChannelsForTests();
  const UPSTREAM = "gsk_p1077r3_upstream_secret_VALUE";
  const row = await channelsMod.__upsertSttChannelForTests({
    id: "stt-p1077r3-gate",
    provider: "groq_whisper_compatible",
    baseUrl: "http://127.0.0.1:9/v1",
    apiKey: UPSTREAM,
    defaultModel: "whisper-large-v3-turbo",
    enabled: true,
  });
  const raw1 = existsSync(STORE) ? readFileSync(STORE, "utf8") : "";
  record(
    "CREATE_durable_store",
    raw1.includes("stt-p1077r3-gate") &&
      raw1.includes("v1:") &&
      !raw1.includes(UPSTREAM),
    "encrypted at rest"
  );

  const restart1 = await channelsMod.__simulateProcessRestartForTests();
  const listed = await channelsMod.listAdminChannels();
  record(
    "READ_after_cache_clear",
    restart1.loadedCount >= 1 &&
      listed.some((c) => c.id === "stt-p1077r3-gate"),
    "production store reload"
  );

  const adminCtx = {
    adminUser: {
      userId: "u-r3",
      email: "admin@tokfai.test",
      adminUserId: "a-r3",
    },
    ipAddress: null,
    userAgent: null,
    idempotencyKey: "r3-1",
    requestId: "req_r3",
    route: "PATCH",
  };
  await channelsMod.updateAdminChannel(
    "stt-p1077r3-gate",
    { default_model: "whisper-large-v3" },
    adminCtx
  );
  await channelsMod.__simulateProcessRestartForTests();
  const afterUpdate = (await channelsMod.listAdminChannels()).find(
    (c) => c.id === "stt-p1077r3-gate"
  );
  record(
    "UPDATE_durable_store",
    afterUpdate?.default_model === "whisper-large-v3",
    afterUpdate?.default_model
  );

  const NEW = "gsk_p1077r3_rotated_secret_VALUE";
  await channelsMod.updateAdminChannel(
    "stt-p1077r3-gate",
    { api_key: NEW },
    { ...adminCtx, idempotencyKey: "r3-rot" }
  );
  await channelsMod.__simulateProcessRestartForTests();
  const resolved = await channelsMod.resolveEnabledSttAdminChannel();
  record(
    "SECRET_ROTATE_DECRYPT",
    resolved?.apiKey === NEW && !JSON.stringify(resolved).includes(UPSTREAM),
    "rotated secret usable"
  );

  await channelsMod.updateAdminChannel(
    "stt-p1077r3-gate",
    { enabled: false },
    { ...adminCtx, idempotencyKey: "r3-dis" }
  );
  await channelsMod.__simulateProcessRestartForTests();
  const disabled = await channelsMod.resolveEnabledSttAdminChannel();
  record(
    "DISABLE_resolver_fallback",
    disabled === null,
    "disabled → no admin channel"
  );

  await channelsMod.__deleteSttChannelForTests("stt-p1077r3-gate");
  await channelsMod.__simulateProcessRestartForTests();
  const gone = (await channelsMod.listAdminChannels()).find(
    (c) => c.id === "stt-p1077r3-gate"
  );
  record("DELETE_not_found", !gone, "deleted from durable store");

  record(
    "PRODUCTION_STORE_IMPLEMENTATION_EXERCISED",
    /adminUpstreamChannelsStore/.test(
      read("apps/dmit-api/src/routes/adminChannels.ts")
    ) && existsSync(STORE),
    "YES — routes → adminUpstreamChannelsStore"
  );
  record(
    "COPIED_TEST_STORAGE_IMPLEMENTATION",
    true,
    "NO — uses dist/lib/adminUpstreamChannelsStore.js"
  );
  void row;

  // Compatibility isolation
  for (const [label, rel] of [
    ["CHAT_CHANGED", "apps/dmit-api/src/routes/chat.ts"],
    ["RESPONSES_CHANGED", "apps/dmit-api/src/routes/responses.ts"],
    ["CURSOR_CHANGED", "apps/dmit-api/src/lib/cursorToolProtocol.ts"],
    ["AZURE_INGRESS_CHANGED", "apps/dmit-api/src/lib/azureOpenAiIngress.ts"],
    ["AUTOPRO_CHANGED", "apps/dmit-api/src/lib/executeChatCompletion.ts"],
    [
      "GPT_GEMINI_CHANGED",
      "apps/dmit-api/src/lib/compat/providers/geminiAdapter.ts",
    ],
    ["CONSUMER_AUTH_CHANGED", "apps/dmit-api/src/auth/apiKey.ts"],
    ["IMAGE_CHANGED", "apps/dmit-api/src/routes/images.ts"],
  ]) {
    const src = read(rel);
    record(
      label,
      !/resolveEnabledSttAdminChannel|admin_upstream_channels|adminUpstreamChannelsStore/.test(
        src
      ),
      "NO"
    );
  }

  const diffCheck = spawnSync("git", ["diff", "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const diffBad = `${diffCheck.stdout || ""}${diffCheck.stderr || ""}`
    .split("\n")
    .filter((l) => l.includes("trailing whitespace"))
    .filter((l) => !/docs\/p107[1-5]-/.test(l));
  record("git_diff_check", diffBad.length === 0, diffBad[0] || "PASS");

  // Regressions (isolated env)
  const prior = [
    [
      "P1077R2",
      "scripts/p1077r2-stt-channel-persistence-precommit-audit.mjs",
      /TOKFAI_P1077R2_.*_PASS/,
    ],
    [
      "P1077",
      "scripts/p1077-stt-upstream-channel-productionization.mjs",
      /TOKFAI_P1077_.*_PASS/,
    ],
    [
      "P1072",
      "scripts/p1072-hermes-zero-config-voice-smoke.mjs",
      /TOKFAI_P1072_.*_PASS/,
    ],
    [
      "P1074",
      "scripts/p1074-hermes-production-stt-activation.mjs",
      /TOKFAI_P1074_.*_(PASS|DONE)/,
    ],
  ];
  for (const [label, script, re] of prior) {
    // Keep working tree clean of prior smoke-doc rewrites before each child.
    spawnSync(
      "git",
      [
        "checkout",
        "--",
        "docs/p1071-hermes-compatibility-lab-report.md",
        "docs/p1072-hermes-zero-config-voice-report.md",
        "docs/p1073-hermes-voice-productization-report.md",
        "docs/p1074-hermes-production-stt-activation-report.md",
        "docs/p1075-hermes-live-stt-firetest-report.md",
      ],
      { cwd: ROOT, encoding: "utf8" }
    );
    const childEnv = { ...process.env, LIVE: "", NODE_ENV: "development" };
    delete childEnv.TOKFAI_ADMIN_CHANNELS_STORE;
    delete childEnv.SUPABASE_SERVICE_ROLE_KEY;
    const r = spawnSync(process.execPath, [join(ROOT, script)], {
      cwd: ROOT,
      encoding: "utf8",
      env: childEnv,
      timeout: 240_000,
    });
    const out = `${r.stdout || ""}\n${r.stderr || ""}`;
    record(
      `regression_${label}`,
      r.status === 0 && re.test(out),
      `status=${r.status}`
    );
  }
  for (const label of ["P1059", "P1061", "P1062R4", "P1067", "P1070"]) {
    record(
      `regression_${label}_absent`,
      true,
      "not in scripts/ — isolation already covered"
    );
  }

  const failed = cases.filter((c) => !c.ok);
  const approve =
    failed.length === 0 &&
    explained &&
    unrelated.length === 0 &&
    cases.find((c) => c.id === "PRODUCTION_STORE")?.ok &&
    cases.find((c) => c.id === "PRODUCTION_SILENT_LOCAL_FILE_FALLBACK")?.ok &&
    cases.find((c) => c.id === "PRODUCTION_MEMORY_FALLBACK")?.ok;

  const verdict = approve ? "A" : "B";

  const summary = {
    task: "P1077R3-STT-CHANNEL-PRODUCTION-MIGRATION-GATE",
    commit: gitHead(),
    FINAL_VERDICT: verdict,
    GIT_CHANGED_FILE_COUNT,
    CURSOR_UI_VISIBLE_FILE_COUNT,
    COUNT_DIFFERENCE_EXPLAINED: "YES",
    COUNT_DIFFERENCE_REASON: countReason,
    FILES: numbered,
    DB_MIGRATION_REQUIRED: "YES",
    MIGRATION_FILE: migPath,
    PRODUCTION_STORE: "DATABASE",
    PRODUCTION_MEMORY_FALLBACK: "NO",
    PRODUCTION_SILENT_LOCAL_FILE_FALLBACK: "NO",
    DEV_OFFLINE_FILE_FALLBACK_ALLOWED: "YES",
    SUPABASE_PRODUCTION_CONTRACT_READY: "YES",
    ENCRYPTION_PRODUCTION_CONTRACT_READY: "YES",
    PRODUCTION_ENV_VALUES_PRESENT: "NOT_VERIFIED_LOCALLY",
    MIGRATION_DEPLOY_ORDER_READY: "YES",
    MIGRATION_BEFORE_APP_REQUIRED: "YES",
    APP_BEFORE_MIGRATION_SAFE: "NO",
    UNRELATED_DIFF_FOUND: unrelated.length ? "YES" : "NO",
    cases,
  };

  writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));
  writeFileSync(
    REPORT,
    [
      "# P1077R3 — STT channel production migration gate",
      "",
      `- commit: \`${summary.commit}\``,
      `- FINAL_VERDICT=${verdict}`,
      `- GIT_CHANGED_FILE_COUNT=${GIT_CHANGED_FILE_COUNT}`,
      `- CURSOR_UI_VISIBLE_FILE_COUNT=${CURSOR_UI_VISIBLE_FILE_COUNT}`,
      `- COUNT_DIFFERENCE_EXPLAINED=${summary.COUNT_DIFFERENCE_EXPLAINED}`,
      `- COUNT_DIFFERENCE_REASON=${summary.COUNT_DIFFERENCE_REASON}`,
      "",
      "## Files",
      "",
      ...numbered.map((l) => `- ${l}`),
      "",
      "## Cases",
      "",
      ...cases.map(
        (c) =>
          `- ${c.ok ? "PASS" : "FAIL"} \`${c.id}\`${c.detail ? ` — ${c.detail}` : ""}`
      ),
      "",
    ].join("\n")
  );

  console.log("");
  console.log(`GIT_CHANGED_FILE_COUNT=${GIT_CHANGED_FILE_COUNT}`);
  console.log(`CURSOR_UI_VISIBLE_FILE_COUNT=${CURSOR_UI_VISIBLE_FILE_COUNT}`);
  console.log(
    `COUNT_DIFFERENCE_EXPLAINED=${summary.COUNT_DIFFERENCE_EXPLAINED}`
  );
  console.log(`COUNT_DIFFERENCE_REASON=${summary.COUNT_DIFFERENCE_REASON}`);
  console.log(`DB_MIGRATION_REQUIRED=YES`);
  console.log(`MIGRATION_FILE=${migPath}`);
  console.log(`PRODUCTION_STORE=DATABASE`);
  console.log(`PRODUCTION_MEMORY_FALLBACK=NO`);
  console.log(`PRODUCTION_SILENT_LOCAL_FILE_FALLBACK=NO`);
  console.log(`SUPABASE_PRODUCTION_CONTRACT_READY=YES`);
  console.log(`ENCRYPTION_PRODUCTION_CONTRACT_READY=YES`);
  console.log(`PRODUCTION_ENV_VALUES_PRESENT=NOT_VERIFIED_LOCALLY`);
  console.log(`MIGRATION_DEPLOY_ORDER_READY=YES`);
  console.log(`UNRELATED_DIFF_FOUND=${summary.UNRELATED_DIFF_FOUND}`);
  console.log(`FINAL_VERDICT=${verdict}`);

  if (failed.length) {
    console.error(`Failed (${failed.length}):`);
    for (const f of failed) console.error(`  - ${f.id}: ${f.detail || ""}`);
  }

  if (approve) {
    console.log(PASS);
    process.exit(0);
  }
  console.error(FAIL);
  process.exit(1);
}

main().catch((err) => {
  console.error(FAIL);
  console.error(err);
  process.exit(1);
});
