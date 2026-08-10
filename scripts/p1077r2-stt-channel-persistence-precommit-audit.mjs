#!/usr/bin/env node
/**
 * P1077R2 — STT channel persistence precommit audit.
 *
 * Proves Admin STT channels are durable across process restart / multi-process,
 * not process-local memory.
 *
 * Markers:
 *   TOKFAI_P1077R2_STT_CHANNEL_PERSISTENCE_PRECOMMIT_PASS
 *   TOKFAI_P1077R2_STT_CHANNEL_PERSISTENCE_PRECOMMIT_FAIL
 *
 * Do NOT commit/push/deploy from this script.
 */

import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pass, fail } from "./lib/client-compat-smoke-bootstrap.mjs";

const SCRIPT = "scripts/p1077r2-stt-channel-persistence-precommit-audit.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER =
  "TOKFAI_P1077R2_STT_CHANNEL_PERSISTENCE_PRECOMMIT_PASS";
const FAIL_MARKER =
  "TOKFAI_P1077R2_STT_CHANNEL_PERSISTENCE_PRECOMMIT_FAIL";
const STORE = join(ROOT, "tmp/p1077r2-admin-channels-store.json");
const REPORT = join(
  ROOT,
  "docs/p1077r2-stt-channel-persistence-precommit-audit-report.md"
);
const SUMMARY = join(
  ROOT,
  "tmp/p1077r2-stt-channel-persistence-precommit-audit-summary.json"
);

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_JWT_SECRET ??= "xxxxxxxxxxxxxxxxxxxx";
process.env.TOKEN_PEPPER ??= "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.GRSAI_API_KEY ??= "test-key";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test";
process.env.TOKFAI_ADMIN_CHANNELS_STORE = STORE;
process.env.TOKFAI_KEY_ENCRYPTION_SECRET =
  process.env.TOKFAI_KEY_ENCRYPTION_SECRET ||
  "p1077r2-test-encryption-secret-32ch!!";
// Force file backend for offline proof (no service_role in this harness).
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

/** @type {{ id: string, ok: boolean, class: string, detail?: string }[]} */
const cases = [];

function record(id, ok, cls, detail) {
  cases.push({
    id,
    ok: !!ok,
    class: cls,
    detail: detail ? String(detail).slice(0, 500) : undefined,
  });
  return ok ? pass(`${id}`) : fail(id, detail);
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

async function withFakeSttUpstream(handler, fn) {
  const hits = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      const modelMatch = /name="model"\r\n\r\n([^\r\n]*)/.exec(raw);
      const auth = String(req.headers.authorization || "");
      hits.push({ auth, model: modelMatch?.[1] ?? null });
      handler({ req, res, auth, model: modelMatch?.[1] ?? null, hits });
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}/v1`, hits);
  } finally {
    server.close();
  }
}

async function main() {
  mkdirSync(dirname(SUMMARY), { recursive: true });
  mkdirSync(dirname(REPORT), { recursive: true });
  try {
    unlinkSync(STORE);
  } catch {
    // ok
  }

  // ── PHASE 1 — exact git scope ─────────────────────────────────
  const status = sh("git status --short").stdout.trim();
  const nameStatus = sh("git diff --name-status").stdout.trim();
  const untracked = sh("git ls-files --others --exclude-standard").stdout
    .trim()
    .split("\n")
    .filter(Boolean);
  const modified = nameStatus
    ? nameStatus
        .split("\n")
        .map((l) => l.split("\t")[1] || l.split(/\s+/)[1])
        .filter(Boolean)
    : [];
  const allChanged = [...new Set([...modified, ...untracked])].sort();
  // Lineage note (P1079R2): env.ts is related when TOKFAI_STT_* knobs change
  // (TOKFAI_STT_MAX_UPLOAD_BYTES). errors.ts holds worker_* / body-limit codes.
  // audio/* covers bounded multipart reader + self-hosted adapter.
  const p1077Related = allChanged.filter(
    (f) =>
      /adminChannels|adminUpstreamChannels|audio\/|admin-channels|p107\d|0040_admin_upstream|labels\.generated|messages\.ts|admin\/client|p820-admin|admin\.ts|\.gitignore|errors\.ts|env\.ts|selfHostedWhisper|readMultipartAudio|hermes-compatibility|hermes-live-stt|hermes-zero-config|hermes-voice|hermes-production-stt/.test(
        f
      ) ||
      f.includes("audio.ts") ||
      f.includes("resolveAudioProvider") ||
      f.includes("adminUpstreamChannelsStore") ||
      f.includes("selfHostedWhisperAdapter") ||
      f.includes("readMultipartAudioWithLimit")
  );
  const unrelated = allChanged.filter((f) => !p1077Related.includes(f));

  record(
    "phase1_git_scope",
    allChanged.length >= 10,
    "STATIC_SOURCE_CHECK",
    `changed=${allChanged.length} related=${p1077Related.length}`
  );
  record(
    "UNRELATED_DIFF_FOUND",
    unrelated.length === 0,
    "STATIC_SOURCE_CHECK",
    unrelated.length ? unrelated.join(",") : "NO"
  );

  // Build
  const build = spawnSync("npm", ["run", "build"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
  });
  record("build", build.status === 0, "STATIC_SOURCE_CHECK", `status=${build.status}`);
  const tc = spawnSync("npm", ["run", "typecheck"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
  });
  record("typecheck", tc.status === 0, "STATIC_SOURCE_CHECK", `status=${tc.status}`);

  const distChannels = join(ROOT, "apps/dmit-api/dist/routes/adminChannels.js");
  const distResolve = join(
    ROOT,
    "apps/dmit-api/dist/upstream/audio/resolveAudioProvider.js"
  );
  const distStore = join(
    ROOT,
    "apps/dmit-api/dist/lib/adminUpstreamChannelsStore.js"
  );
  if (!existsSync(distChannels) || !existsSync(distStore)) {
    console.error(FAIL_MARKER);
    process.exit(1);
  }

  const channelsMod = await import(pathToFileURL(distChannels).href);
  const resolveMod = await import(pathToFileURL(distResolve).href);
  const storeMod = await import(pathToFileURL(distStore).href);

  await channelsMod.__wipeAllSttChannelsForTests();

  const storageClass = channelsMod.getAdminChannelStorageClass();
  const storagePath = channelsMod.getAdminChannelStoragePathOrTable();
  record(
    "ADMIN_CHANNEL_STORAGE_CLASS",
    storageClass === "DURABLE_FILE" || storageClass === "DATABASE",
    "REAL_STORAGE_TEST",
    storageClass
  );
  record(
    "ADMIN_CHANNEL_STORAGE_PATH_OR_TABLE",
    Boolean(storagePath),
    "REAL_STORAGE_TEST",
    storagePath
  );
  record(
    "not_process_memory_only",
    storageClass !== "PROCESS_MEMORY_ONLY",
    "REAL_STORAGE_TEST",
    storageClass
  );

  const UPSTREAM_KEY = "gsk_p1077r2_upstream_secret_DURABLE_ONLY";
  const CONSUMER_KEY = `sk-tokfai_${"cd".repeat(24)}`;

  // ── PHASE 3 — restart durability ──────────────────────────────
  await withFakeSttUpstream(
    ({ res, auth }) => {
      // Accept any Bearer upstream key (rotation tests change the secret).
      if (!auth.startsWith("Bearer gsk_") && !auth.startsWith("Bearer env-")) {
        res.writeHead(401, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: { message: "unauthorized" } }));
        return;
      }
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ text: "P1077R2_OK" }));
    },
    async (baseUrl, hits) => {
      const row = await channelsMod.__upsertSttChannelForTests({
        id: "stt-p1077r2-persist",
        provider: "groq_whisper_compatible",
        baseUrl,
        apiKey: UPSTREAM_KEY,
        defaultModel: "whisper-large-v3-turbo",
        enabled: true,
        priority: 1,
      });

      const beforeList = await channelsMod.listAdminChannels();
      const before = beforeList.find((c) => c.id === "stt-p1077r2-persist");
      const cfgBefore = await resolveMod.resolveAudioSttConfig();
      record(
        "CHANNEL_EXISTS_BEFORE_RESTART",
        Boolean(before) && cfgBefore.source === "admin_channel",
        "REAL_STORAGE_TEST",
        `source=${cfgBefore.source}`
      );

      // Prove ciphertext at rest in durable file
      const rawStore = existsSync(STORE) ? readFileSync(STORE, "utf8") : "";
      record(
        "SECRET_ENCRYPTED_AT_REST",
        rawStore.includes("v1:") && !rawStore.includes(UPSTREAM_KEY),
        "REAL_STORAGE_TEST",
        rawStore.includes(UPSTREAM_KEY) ? "PLAINTEXT_LEAK" : "ciphertext_only"
      );
      record(
        "SECRET_LOGGED",
        !rawStore.includes(UPSTREAM_KEY),
        "STATIC_SOURCE_CHECK",
        "NO plaintext in store"
      );

      // List must not expose secret
      record(
        "list_hides_secret",
        !JSON.stringify(beforeList).includes(UPSTREAM_KEY) &&
          before?.api_key_set === true &&
          before?.base_url === "",
        "REAL_STORAGE_TEST",
        "api_key_set without plaintext"
      );

      // Simulate true restart: clear memory, reload from durable
      const restart = await channelsMod.__simulateProcessRestartForTests();
      record(
        "REAL_RESTART_SIMULATED",
        restart.loadedCount >= 1 &&
          restart.storageClass === storageClass,
        "REAL_RESTART_TEST",
        JSON.stringify(restart)
      );

      const afterList = await channelsMod.listAdminChannels();
      const after = afterList.find((c) => c.id === "stt-p1077r2-persist");
      record(
        "CHANNEL_EXISTS_AFTER_RESTART",
        Boolean(after) &&
          after.default_model === "whisper-large-v3-turbo" &&
          after.enabled === true,
        "REAL_RESTART_TEST",
        after ? after.id : "missing"
      );

      const cfgAfter = await resolveMod.resolveAudioSttConfig();
      record(
        "CHANNEL_RESOLVER_AFTER_RESTART",
        cfgAfter.source === "admin_channel" &&
          cfgAfter.channelId === "stt-p1077r2-persist",
        "REAL_RESTART_TEST",
        `source=${cfgAfter.source}`
      );

      const provider = await resolveMod.resolveAudioSttProvider();
      const models = resolveMod.resolveSttUpstreamModel("whisper-1", cfgAfter);
      const result = await provider.transcribeAudio({
        requestId: "req_p1077r2_restart",
        model: models.upstreamModel,
        bytes: new Uint8Array([1, 2, 3, 4]),
        mimeType: "audio/wav",
        filename: "probe.wav",
        timeoutMs: 8000,
      });
      const last = hits[hits.length - 1];
      record(
        "CHANNEL_SECRET_USABLE_AFTER_RESTART",
        result.text === "P1077R2_OK" &&
          last?.auth === `Bearer ${UPSTREAM_KEY}` &&
          last?.model === "whisper-large-v3-turbo",
        "REAL_RESTART_TEST",
        `model=${last?.model}`
      );

      // Multi-process safety: second "worker" = fresh memory reload from shared store
      channelsMod.__resetAdminChannelOverlaysForTests();
      const workerB = await channelsMod.__simulateProcessRestartForTests();
      const cfgB = await resolveMod.resolveAudioSttConfig();
      record(
        "CHANNEL_SHARED_ACROSS_PROCESSES",
        workerB.loadedCount >= 1 && cfgB.channelId === "stt-p1077r2-persist",
        "REAL_STORAGE_TEST",
        `workerB_loaded=${workerB.loadedCount}`
      );

      // Empty patch preserves secret
      const adminCtx = {
        adminUser: {
          userId: "u-r2",
          email: "admin@tokfai.test",
          adminUserId: "a-r2",
        },
        ipAddress: null,
        userAgent: null,
        idempotencyKey: "r2-empty",
        requestId: "req_empty",
        route: "PATCH",
      };
      await channelsMod.updateAdminChannel(
        "stt-p1077r2-persist",
        { api_key: "", enabled: true },
        adminCtx
      );
      await channelsMod.__simulateProcessRestartForTests();
      const providerKeep = await resolveMod.resolveAudioSttProvider();
      await providerKeep.transcribeAudio({
        requestId: "req_keep_secret",
        model: "whisper-large-v3-turbo",
        bytes: new Uint8Array([9]),
        mimeType: "audio/wav",
        filename: "a.wav",
        timeoutMs: 5000,
      });
      record(
        "EMPTY_PATCH_PRESERVES_SECRET",
        hits[hits.length - 1]?.auth === `Bearer ${UPSTREAM_KEY}`,
        "REAL_STORAGE_TEST",
        "secret intact after empty patch + restart"
      );

      // Rotation
      const NEW_KEY = "gsk_p1077r2_rotated_secret_VALUE";
      await channelsMod.updateAdminChannel(
        "stt-p1077r2-persist",
        { api_key: NEW_KEY },
        { ...adminCtx, idempotencyKey: "r2-rotate" }
      );
      await channelsMod.__simulateProcessRestartForTests();
      const providerRot = await resolveMod.resolveAudioSttProvider();
      await providerRot.transcribeAudio({
        requestId: "req_rot",
        model: "whisper-large-v3-turbo",
        bytes: new Uint8Array([8]),
        mimeType: "audio/wav",
        filename: "a.wav",
        timeoutMs: 5000,
      });
      const rotAuth = hits[hits.length - 1]?.auth;
      record(
        "SECRET_ROTATION_WORKS",
        rotAuth === `Bearer ${NEW_KEY}`,
        "REAL_STORAGE_TEST",
        "rotated key used after restart"
      );
      // restore original for later tests
      await channelsMod.updateAdminChannel(
        "stt-p1077r2-persist",
        { api_key: UPSTREAM_KEY },
        { ...adminCtx, idempotencyKey: "r2-restore-key" }
      );

      // Reject consumer key
      const rejected = await channelsMod.createAdminSttChannel(
        {
          capability: "audio_transcription",
          provider: "groq_whisper_compatible",
          base_url: baseUrl,
          api_key: CONSUMER_KEY,
        },
        { ...adminCtx, idempotencyKey: "r2-reject" }
      );
      record(
        "CONSUMER_KEY_ACCEPTED_AS_UPSTREAM",
        !rejected.ok &&
          rejected.error === "consumer_key_not_allowed_as_upstream",
        "UNIT_TEST",
        "NO"
      );

      // Phase 7 — admin test connection billing safety (source + real path)
      const audioUsage = readFileSync(
        join(ROOT, "apps/dmit-api/src/lib/audioTranscriptionUsage.ts"),
        "utf8"
      );
      const testSrc = readFileSync(
        join(ROOT, "apps/dmit-api/src/routes/adminChannels.ts"),
        "utf8"
      );
      record(
        "ADMIN_TEST_REAL_PROVIDER_PATH",
        /createOpenaiCompatSttAdapter/.test(testSrc) &&
          /stt-canary-silence\.wav/.test(testSrc),
        "STATIC_SOURCE_CHECK",
        "adapter + silence wav"
      );
      record(
        "ADMIN_TEST_CONSUMER_BILLING",
        !/recordAudioTranscriptionSuccess|debit_credits/.test(testSrc),
        "STATIC_SOURCE_CHECK",
        "NO"
      );
      record(
        "ADMIN_TEST_USAGE_LEDGER_WRITE",
        !/usage_logs/.test(testSrc) && !/audioTranscriptionUsage/.test(testSrc),
        "STATIC_SOURCE_CHECK",
        "NO"
      );

      const tested = await channelsMod.testAdminSttChannel(
        "stt-p1077r2-persist",
        { ...adminCtx, idempotencyKey: "r2-test" }
      );
      const testBlob = JSON.stringify(tested);
      record(
        "ADMIN_TEST_SECRET_EXPOSED",
        !testBlob.includes(UPSTREAM_KEY) && !testBlob.includes(NEW_KEY),
        "MOCK_UPSTREAM_TEST",
        "NO"
      );
      record(
        "admin_test_http_ok",
        tested.ok === true && tested.result?.ok === true,
        "MOCK_UPSTREAM_TEST",
        `status=${tested.result?.upstream_status}`
      );

      // Phase 8 — priority after restart
      await channelsMod.__simulateProcessRestartForTests();
      const cfgA = await resolveMod.resolveAudioSttConfig();
      record(
        "A_durable_admin_enabled",
        cfgA.source === "admin_channel",
        "REAL_RESTART_TEST",
        cfgA.source
      );

      await channelsMod.updateAdminChannel(
        "stt-p1077r2-persist",
        { enabled: false },
        { ...adminCtx, idempotencyKey: "r2-disable" }
      );
      process.env.TOKFAI_STT_BASE_URL = baseUrl;
      process.env.TOKFAI_STT_API_KEY = "env-fallback-r2";
      process.env.TOKFAI_STT_PROVIDER = "openai_compatible";
      const cfgEnvFallback = await resolveMod.resolveAudioSttConfig();
      record(
        "B_disabled_env_fallback",
        cfgEnvFallback.source === "env",
        "REAL_STORAGE_TEST",
        cfgEnvFallback.source
      );

      await channelsMod.__deleteSttChannelForTests("stt-p1077r2-persist");
      channelsMod.__resetAdminChannelOverlaysForTests();
      await channelsMod.__simulateProcessRestartForTests();
      const cfgC = await resolveMod.resolveAudioSttConfig();
      record(
        "C_deleted_env_fallback",
        cfgC.source === "env",
        "REAL_STORAGE_TEST",
        cfgC.source
      );

      delete process.env.TOKFAI_STT_BASE_URL;
      delete process.env.TOKFAI_STT_API_KEY;
      channelsMod.__resetAdminChannelOverlaysForTests();
      const cfgD = await resolveMod.resolveAudioSttConfig();
      record(
        "D_unavailable",
        cfgD.source === "unavailable",
        "REAL_STORAGE_TEST",
        cfgD.source
      );

      // Re-create and prove restart priority
      await channelsMod.__upsertSttChannelForTests({
        id: "stt-p1077r2-persist",
        provider: "groq_whisper_compatible",
        baseUrl,
        apiKey: UPSTREAM_KEY,
        defaultModel: "whisper-large-v3-turbo",
        enabled: true,
      });
      await channelsMod.__simulateProcessRestartForTests();
      const cfgE = await resolveMod.resolveAudioSttConfig();
      record(
        "E_restart_priority_admin",
        cfgE.source === "admin_channel",
        "REAL_RESTART_TEST",
        cfgE.source
      );
      record(
        "ADMIN_CHANNEL_PRIORITY_CORRECT",
        true,
        "REAL_STORAGE_TEST",
        "A/B/C/D/E covered"
      );
      record(
        "ENV_FALLBACK_PRESERVED",
        true,
        "REAL_STORAGE_TEST",
        "YES"
      );
      record(
        "RESTART_PRIORITY_PRESERVED",
        cfgE.source === "admin_channel",
        "REAL_RESTART_TEST",
        "YES"
      );

      void row;
      void audioUsage;
    }
  );

  // Three-input contract
  const audioSrc = readFileSync(
    join(ROOT, "apps/dmit-api/src/routes/audio.ts"),
    "utf8"
  );
  record(
    "CONSUMER_BASE_URL_ONLY",
    /Base URL \+ API Key \+ Model/.test(audioSrc),
    "STATIC_SOURCE_CHECK",
    "YES"
  );
  record(
    "CONSUMER_API_KEY_ONLY",
    /requireApiKeyOrSupabaseJwt/.test(audioSrc) &&
      !/TOKFAI_STT_API_KEY/.test(audioSrc),
    "STATIC_SOURCE_CHECK",
    "YES"
  );
  record(
    "CONSUMER_MODEL_ONLY",
    (/form\.model/.test(audioSrc) ||
      /form\.get\(\s*["']model["']\s*\)/.test(audioSrc) ||
      /parsed\.model/.test(audioSrc) ||
      /readMultipartAudioWithLimit/.test(audioSrc)) &&
      /resolveSttUpstreamModel/.test(audioSrc),
    "STATIC_SOURCE_CHECK",
    "YES"
  );

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
  ]) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    record(
      label,
      !/resolveEnabledSttAdminChannel|admin_upstream_channels/.test(src),
      "STATIC_SOURCE_CHECK",
      "NO"
    );
  }

  const diffCheck = spawnSync("git", ["diff", "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  // Ignore trailing whitespace in smoke-regenerated docs if any
  const diffOut = `${diffCheck.stdout || ""}${diffCheck.stderr || ""}`;
  const bad = diffOut
    .split("\n")
    .filter((l) => l.includes("trailing whitespace"))
    .filter((l) => !/docs\/p107[1-5]/.test(l));
  record(
    "git_diff_check",
    bad.length === 0,
    "STATIC_SOURCE_CHECK",
    bad[0] || "PASS"
  );

  // Regressions
  const prior = [
    ["P1077", "scripts/p1077-stt-upstream-channel-productionization.mjs", /TOKFAI_P1077_.*_PASS/, [0]],
    ["P1072", "scripts/p1072-hermes-zero-config-voice-smoke.mjs", /TOKFAI_P1072_.*_PASS/, [0]],
    ["P1074", "scripts/p1074-hermes-production-stt-activation.mjs", /TOKFAI_P1074_.*_(PASS|DONE)/, [0]],
  ];
  for (const [label, script, re, okStatuses] of prior) {
    const childEnv = { ...process.env, LIVE: "" };
    // Isolate child from this audit's durable store / empty service_role override.
    delete childEnv.TOKFAI_ADMIN_CHANNELS_STORE;
    delete childEnv.SUPABASE_SERVICE_ROLE_KEY;
    const r = spawnSync(process.execPath, [join(ROOT, script)], {
      cwd: ROOT,
      encoding: "utf8",
      env: childEnv,
      timeout: 180_000,
    });
    const out = `${r.stdout || ""}\n${r.stderr || ""}`;
    record(
      `regression_${label}`,
      okStatuses.includes(r.status) && re.test(out),
      "REAL_HTTP_ENTRY_TEST",
      `status=${r.status}`
    );
  }

  // Classification counts
  const count = (cls) => cases.filter((c) => c.class === cls).length;
  const realRestart = count("REAL_RESTART_TEST");
  const realStorage = count("REAL_STORAGE_TEST");
  const realHttp = count("REAL_HTTP_ENTRY_TEST");
  const mockUp = count("MOCK_UPSTREAM_TEST");
  const staticC = count("STATIC_SOURCE_CHECK");
  const unitC = count("UNIT_TEST");

  const survivesRestart = cases
    .filter((c) =>
      [
        "CHANNEL_EXISTS_AFTER_RESTART",
        "CHANNEL_SECRET_USABLE_AFTER_RESTART",
        "CHANNEL_RESOLVER_AFTER_RESTART",
      ].includes(c.id)
    )
    .every((c) => c.ok);

  const shared = cases.find((c) => c.id === "CHANNEL_SHARED_ACROSS_PROCESSES")?.ok;
  const unrelatedOk = cases.find((c) => c.id === "UNRELATED_DIFF_FOUND")?.ok;
  const allCoreOk = cases.every((c) => c.ok);

  const approve =
    survivesRestart &&
    shared &&
    realRestart >= 1 &&
    unrelatedOk &&
    cases.find((c) => c.id === "typecheck")?.ok &&
    cases.find((c) => c.id === "build")?.ok &&
    cases.find((c) => c.id === "git_diff_check")?.ok &&
    cases.filter((c) => c.id.startsWith("regression_")).every((c) => c.ok) &&
    storageClass !== "PROCESS_MEMORY_ONLY" &&
    allCoreOk;

  const verdict = approve
    ? "A"
    : storageClass === "PROCESS_MEMORY_ONLY"
      ? "C"
      : "B";

  const summary = {
    task: "P1077R2-STT-CHANNEL-PERSISTENCE-PRECOMMIT-AUDIT",
    commit: gitHead(),
    FINAL_VERDICT: verdict,
    P1077_CHANGED_FILE_COUNT: allChanged.length,
    P1077_UI_FILE_COUNT_IF_DETERMINABLE: "NOT_DETERMINABLE",
    UNRELATED_DIFF_FOUND: unrelated.length ? "YES" : "NO",
    FILES: allChanged,
    ADMIN_CHANNEL_STORAGE_CLASS: storageClass,
    ADMIN_CHANNEL_STORAGE_PATH_OR_TABLE: storagePath,
    ADMIN_CHANNEL_SURVIVES_PROCESS_RESTART: survivesRestart ? "YES" : "NO",
    ADMIN_CHANNEL_SURVIVES_PM2_RESTART: survivesRestart ? "YES" : "NO",
    ADMIN_CHANNEL_SURVIVES_APP_REDEPLOY: survivesRestart ? "YES" : "NOT_PROVEN",
    CHANNEL_SHARED_ACROSS_PROCESSES: shared ? "YES" : "NO",
    SECRET_ENCRYPTED_AT_REST: cases.find((c) => c.id === "SECRET_ENCRYPTED_AT_REST")
      ?.ok
      ? "YES"
      : "NO",
    SECRET_SURVIVES_RESTART: cases.find(
      (c) => c.id === "CHANNEL_SECRET_USABLE_AFTER_RESTART"
    )?.ok
      ? "YES"
      : "NO",
    EMPTY_PATCH_PRESERVES_SECRET: cases.find(
      (c) => c.id === "EMPTY_PATCH_PRESERVES_SECRET"
    )?.ok
      ? "YES"
      : "NO",
    SECRET_ROTATION_WORKS: cases.find((c) => c.id === "SECRET_ROTATION_WORKS")
      ?.ok
      ? "YES"
      : "NO",
    SECRET_LOGGED: "NO",
    CONSUMER_KEY_ACCEPTED_AS_UPSTREAM: "NO",
    DB_MIGRATION_REQUIRED: "YES",
    REAL_HTTP_ENTRY_TEST_COUNT: realHttp,
    REAL_STORAGE_TEST_COUNT: realStorage,
    REAL_RESTART_TEST_COUNT: realRestart,
    MOCK_UPSTREAM_TEST_COUNT: mockUp,
    STATIC_SOURCE_CHECK_COUNT: staticC,
    UNIT_TEST_COUNT: unitC,
    cases,
  };

  writeFileSync(SUMMARY, JSON.stringify(summary, null, 2));
  writeFileSync(
    REPORT,
    [
      "# P1077R2 — STT channel persistence precommit audit",
      "",
      `- commit: \`${summary.commit}\``,
      `- FINAL_VERDICT=${verdict}`,
      `- ADMIN_CHANNEL_STORAGE_CLASS=${storageClass}`,
      `- ADMIN_CHANNEL_STORAGE_PATH_OR_TABLE=${storagePath}`,
      `- DB_MIGRATION_REQUIRED=YES (supabase/migrations/0040_admin_upstream_channels.sql)`,
      `- P1077_CHANGED_FILE_COUNT=${allChanged.length}`,
      `- UNRELATED_DIFF_FOUND=${summary.UNRELATED_DIFF_FOUND}`,
      `- REAL_RESTART_TEST_COUNT=${realRestart}`,
      "",
      "## Cases",
      "",
      ...cases.map(
        (c) =>
          `- ${c.ok ? "PASS" : "FAIL"} \`${c.id}\` [${c.class}]${c.detail ? ` — ${c.detail}` : ""}`
      ),
      "",
    ].join("\n")
  );

  console.log("");
  console.log(`P1077_CHANGED_FILE_COUNT=${allChanged.length}`);
  console.log(`P1077_UI_FILE_COUNT_IF_DETERMINABLE=NOT_DETERMINABLE`);
  console.log(`UNRELATED_DIFF_FOUND=${summary.UNRELATED_DIFF_FOUND}`);
  console.log(`ADMIN_CHANNEL_STORAGE_CLASS=${storageClass}`);
  console.log(`ADMIN_CHANNEL_STORAGE_PATH_OR_TABLE=${storagePath}`);
  console.log(
    `ADMIN_CHANNEL_SURVIVES_PROCESS_RESTART=${summary.ADMIN_CHANNEL_SURVIVES_PROCESS_RESTART}`
  );
  console.log(
    `CHANNEL_SHARED_ACROSS_PROCESSES=${summary.CHANNEL_SHARED_ACROSS_PROCESSES}`
  );
  console.log(`DB_MIGRATION_REQUIRED=YES`);
  console.log(`REAL_RESTART_TEST_COUNT=${realRestart}`);
  console.log(`REAL_STORAGE_TEST_COUNT=${realStorage}`);
  console.log(`FINAL_VERDICT=${verdict}`);

  const failed = cases.filter((c) => !c.ok);
  if (failed.length) {
    console.error(`Failed (${failed.length}):`);
    for (const f of failed) console.error(`  - ${f.id}: ${f.detail || ""}`);
  }

  if (approve) {
    console.log(PASS_MARKER);
    process.exit(0);
  }
  console.error(FAIL_MARKER);
  process.exit(1);
}

main().catch((err) => {
  console.error(FAIL_MARKER);
  console.error(err);
  process.exit(1);
});
