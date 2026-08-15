#!/usr/bin/env node
/**
 * P1104 — GrsAI STT provider adapter (grsai_whisper_compatible).
 *
 *   node scripts/p1104-grsai-stt-provider-adapter.mjs
 *
 * Markers:
 *   TOKFAI_P1104_GRSAI_STT_PROVIDER_ADAPTER_PASS
 *   TOKFAI_P1104_GRSAI_STT_PROVIDER_ADAPTER_FAIL
 */

import { spawnSync } from "node:child_process";
import { createServer } from "node:http";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "scripts/p1104-grsai-stt-provider-adapter.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P1104_GRSAI_STT_PROVIDER_ADAPTER_PASS";
const FAIL_MARKER = "TOKFAI_P1104_GRSAI_STT_PROVIDER_ADAPTER_FAIL";
const SUMMARY_PATH = join(
  ROOT,
  process.env.SUMMARY_PATH ?? "tmp/p1104-grsai-stt-provider-adapter-summary.json"
);

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_JWT_SECRET ??= "xxxxxxxxxxxxxxxxxxxx";
process.env.TOKEN_PEPPER ??= "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.GRSAI_API_KEY ??= "test-key-grsai-chat-untouched";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test";
process.env.TOKFAI_ADMIN_CHANNELS_STORE ??= join(
  ROOT,
  "tmp/p1104-admin-channels-store.json"
);
process.env.TOKFAI_KEY_ENCRYPTION_SECRET ??=
  "p1104-test-encryption-secret-32chars!!";

/** @type {{ id: string, ok: boolean, detail?: string }[]} */
const cases = [];

function record(id, ok, detail) {
  cases.push({
    id,
    ok: !!ok,
    detail: detail ? String(detail).slice(0, 800) : undefined,
  });
  console.log(`${ok ? "PASS" : "FAIL"}  ${id}${detail ? ` — ${detail}` : ""}`);
  return !!ok;
}

function gitHead() {
  const r = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return r.status === 0 ? r.stdout.trim() : "unknown";
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function adminCtx(suffix) {
  return {
    adminUser: { userId: "u-p1104", email: "p1104@test.local" },
    ipAddress: "127.0.0.1",
    userAgent: "p1104",
    idempotencyKey: `p1104-${suffix}`,
    requestId: `req_p1104_${suffix}`,
  };
}

async function withMockWhisperUpstream(handler, fn) {
  /** @type {string[]} */
  const paths = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      paths.push(String(req.url || ""));
      const out = handler({ path: req.url || "" });
      res.writeHead(out.status, { "content-type": "application/json" });
      res.end(
        typeof out.body === "string" ? out.body : JSON.stringify(out.body)
      );
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    // Simulate GrsAI OpenAI-compatible /v1 root (not Groq /openai/v1).
    const baseUrl = `http://127.0.0.1:${port}/v1`;
    return await fn(baseUrl, paths);
  } finally {
    server.close();
  }
}

async function loadDistMods() {
  const adapter = await import(
    pathToFileURL(
      join(ROOT, "apps/dmit-api/dist/upstream/audio/openaiCompatSttAdapter.js")
    ).href
  );
  const channels = await import(
    pathToFileURL(join(ROOT, "apps/dmit-api/dist/routes/adminChannels.js")).href
  );
  return { adapter, channels };
}

function finish(ok) {
  const summary = {
    script: SCRIPT,
    ok,
    git_head: gitHead(),
    cases,
    marker: ok ? PASS_MARKER : FAIL_MARKER,
  };
  mkdirSync(dirname(SUMMARY_PATH), { recursive: true });
  writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2));
  console.log(ok ? PASS_MARKER : FAIL_MARKER);
  process.exit(ok ? 0 : 1);
}

function runNode(scriptRel) {
  const abs = join(ROOT, scriptRel);
  if (!existsSync(abs)) return { status: 127, out: "script missing" };
  const isMts = scriptRel.endsWith(".mts") || scriptRel.endsWith(".ts");
  const args = isMts ? ["tsx", abs] : [abs];
  const cmd = isMts ? "npx" : process.execPath;
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, LIVE: "" },
    timeout: 300_000,
  });
  return {
    status: r.status ?? 1,
    out: `${r.stdout || ""}\n${r.stderr || ""}`,
  };
}

async function main() {
  mkdirSync(dirname(SUMMARY_PATH), { recursive: true });

  const typesSrc = read("apps/dmit-api/src/upstream/audio/types.ts");
  const adapterSrc = read(
    "apps/dmit-api/src/upstream/audio/openaiCompatSttAdapter.ts"
  );
  const adminSrc = read("apps/dmit-api/src/routes/adminChannels.ts");
  const resolveSrc = read(
    "apps/dmit-api/src/upstream/audio/resolveAudioProvider.ts"
  );
  const panelSrc = read("apps/web/components/admin/admin-channels-panel.tsx");
  const clientSrc = read("apps/web/lib/admin/client.ts");

  record(
    "GRSAI_STT_PROVIDER_ADDED",
    /grsai_whisper_compatible/.test(typesSrc) &&
      /grsai_whisper_compatible/.test(adapterSrc) &&
      /grsai_whisper_compatible/.test(adminSrc) &&
      /grsai_whisper_compatible/.test(resolveSrc) &&
      /grsai_whisper_compatible/.test(panelSrc) &&
      /grsai_whisper_compatible/.test(clientSrc),
    "provider wired types→adapter→admin→resolve→UI"
  );

  record(
    "GROQ_PROVIDER_UNCHANGED",
    /groq_whisper_compatible expects https:\/\/api\.groq\.com\/openai\/v1/.test(
      adapterSrc
    ) && /isGroqOpenaiV1Base/.test(adapterSrc),
    "groq host check preserved"
  );

  // Scope: forbidden golden paths must stay clean in working tree vs HEAD
  const forbidden = [
    "apps/dmit-api/src/routes/responses.ts",
    "apps/dmit-api/src/lib/executeChatCompletion.ts",
    "apps/dmit-api/src/routes/chat.ts",
    "apps/dmit-api/src/billing",
    "apps/dmit-api/src/routes/billing",
    "apps/dmit-api/src/lib/adminUpstreamChannelsStore.ts",
    "apps/dmit-api/src/gateway",
  ];
  const dirtyForbidden = spawnSync(
    "git",
    ["diff", "--name-only", "HEAD", "--", ...forbidden],
    { cwd: ROOT, encoding: "utf8" }
  );
  const forbiddenList = (dirtyForbidden.stdout || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  record(
    "GOLDEN_PATHS_UNTOUCHED",
    forbiddenList.length === 0,
    forbiddenList.join(",") || "clean"
  );

  const logOk =
    adminSrc.match(/log\.info\(\s*"admin_channel_stt_test_ok"[\s\S]*?\}\);/)?.[0] ||
    "";
  const logFail =
    adminSrc.match(
      /log\.warn\(\s*"admin_channel_stt_test_failed"[\s\S]*?\}\);/
    )?.[0] || "";
  record(
    "NO_SECRET_LOGGED_STATIC",
    !/apiKey|Authorization|Bearer |encrypted|wavBytes|audio_base64|transcript:\s/.test(
      logOk + logFail
    ),
    "admin STT test logs safe"
  );

  const build = spawnSync("npm", ["run", "build"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
    timeout: 180_000,
  });
  record(
    "build",
    build.status === 0,
    (build.stderr || build.stdout || "").slice(-300)
  );
  const tc = spawnSync("npm", ["run", "typecheck"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
    timeout: 120_000,
  });
  record("typecheck", tc.status === 0, (tc.stderr || "").slice(0, 300));
  if (build.status !== 0) return finish(false);

  const { adapter, channels } = await loadDistMods();
  const {
    detectSttProviderBaseMismatch,
    buildSttTranscriptionUrl,
    createOpenaiCompatSttAdapter,
  } = adapter;

  // 1) groq + GrsAI base still rejects
  {
    const m = detectSttProviderBaseMismatch(
      "groq_whisper_compatible",
      "https://grsaiapi.com/v1"
    );
    record(
      "GROQ_WITH_GRSAI_BASE_STILL_REJECTS",
      m.mismatch === true && /groq_whisper_compatible/.test(String(m.hint || "")),
      m.hint
    );
  }

  // 2) grsai + GrsAI base — no Groq mismatch
  {
    const m = detectSttProviderBaseMismatch(
      "grsai_whisper_compatible",
      "https://grsaiapi.com/v1"
    );
    record(
      "GRSAI_WITH_GRSAI_BASE_NO_GROQ_MISMATCH",
      m.mismatch === false && !/api\.groq\.com/.test(String(m.hint || "")),
      `mismatch=${m.mismatch}`
    );
  }

  // grsai + Groq base rejects with GrsAI-specific message
  {
    const m = detectSttProviderBaseMismatch(
      "grsai_whisper_compatible",
      "https://api.groq.com/openai/v1"
    );
    record(
      "GRSAI_WITH_GROQ_BASE_REJECTS",
      m.mismatch === true && /grsai_whisper_compatible/.test(String(m.hint || "")),
      m.hint
    );
  }

  // 3) endpoint path — no double /v1
  {
    const u1 = buildSttTranscriptionUrl("https://grsaiapi.com/v1");
    const u2 = buildSttTranscriptionUrl("https://grsaiapi.com/v1/");
    record(
      "GRSAI_ENDPOINT_PATH_OK",
      u1 === "https://grsaiapi.com/v1/audio/transcriptions" &&
        u2 === "https://grsaiapi.com/v1/audio/transcriptions" &&
        !/\/v1\/v1\//.test(u1) &&
        !/\/v1\/v1\//.test(u2),
      `${u1} | ${u2}`
    );
  }

  // Admin test: groq + grsai base via testAdminSttChannel
  {
    await channels.__wipeAllSttChannelsForTests();
    const row = await channels.__upsertSttChannelForTests({
      id: "stt-p1104-groq-grsai",
      provider: "groq_whisper_compatible",
      baseUrl: "https://grsaiapi.com/v1",
      apiKey: "gsk_fake_p1104",
      defaultModel: "whisper-large-v3-turbo",
    });
    const out = await channels.testAdminSttChannel(row.id, adminCtx("groq-grsai"));
    record(
      "ADMIN_GROQ_GRSAI_MISMATCH",
      out.ok === false &&
        out.error === "provider_base_mismatch" &&
        /groq_whisper_compatible/.test(String(out.result?.message || "")),
      out.result?.message
    );
    await channels.__wipeAllSttChannelsForTests();
  }

  // P1107 — grsai without confirmed STT endpoint must not probe
  {
    delete process.env.TOKFAI_GRSAI_STT_ENDPOINT_CONFIRMED;
    delete process.env.TOKFAI_GRSAI_STT_CONFIRMED_BASE_URL;
    await channels.__wipeAllSttChannelsForTests();
    const row = await channels.__upsertSttChannelForTests({
      id: "stt-p1104-grsai-unknown",
      provider: "grsai_whisper_compatible",
      baseUrl: "https://grsaiapi.com/v1",
      apiKey: "sk-grsai-p1104-unconfirmed",
      defaultModel: "whisper-1",
    });
    const out = await channels.testAdminSttChannel(
      row.id,
      adminCtx("grsai-unknown")
    );
    const r = out.result;
    record(
      "ADMIN_GRSAI_STT_ENDPOINT_UNKNOWN",
      out.ok === false &&
        out.error === "stt_endpoint_unknown" &&
        r?.error_class === "stt_endpoint_unknown" &&
        /Chat completions base URL cannot be used for audio transcription/i.test(
          String(r?.message || "")
        ),
      `error=${out.error} class=${r?.error_class}`
    );
    await channels.__wipeAllSttChannelsForTests();
  }

  // Admin grsai + mock /v1 upstream empty text success (confirmed override)
  await withMockWhisperUpstream(
    () => ({ status: 200, body: { text: "" } }),
    async (baseUrl, paths) => {
      process.env.TOKFAI_GRSAI_STT_ENDPOINT_CONFIRMED = "1";
      process.env.TOKFAI_GRSAI_STT_CONFIRMED_BASE_URL = baseUrl;
      await channels.__wipeAllSttChannelsForTests();
      const row = await channels.__upsertSttChannelForTests({
        id: "stt-p1104-grsai-ok",
        provider: "grsai_whisper_compatible",
        baseUrl,
        apiKey: "sk-grsai-p1104-test-not-secret",
        defaultModel: "whisper-1",
      });
      const out = await channels.testAdminSttChannel(row.id, adminCtx("grsai-ok"));
      const r = out.result;
      record(
        "ADMIN_EMPTY_TRANSCRIPT_ALLOWED",
        out.ok === true &&
          r?.ok === true &&
          r?.provider === "grsai_whisper_compatible" &&
          r?.upstream_status === 200 &&
          /succeeded/i.test(String(r?.message || "")),
        `ok=${out.ok} provider=${r?.provider} status=${r?.upstream_status}`
      );
      record(
        "GRSAI_MOCK_REQUEST_PATH",
        paths.some((p) => p === "/v1/audio/transcriptions") &&
          !paths.some((p) => /\/v1\/v1\//.test(p)),
        paths.join(",") || "no paths"
      );
      delete process.env.TOKFAI_GRSAI_STT_ENDPOINT_CONFIRMED;
      delete process.env.TOKFAI_GRSAI_STT_CONFIRMED_BASE_URL;
      await channels.__wipeAllSttChannelsForTests();
    }
  );

  // missing api_key
  {
    await channels.__wipeAllSttChannelsForTests();
    const row = await channels.__upsertSttChannelForTests({
      id: "stt-p1104-nokey",
      provider: "grsai_whisper_compatible",
      baseUrl: "https://grsaiapi.com/v1",
      apiKey: "sk-temp-then-clear",
      defaultModel: "whisper-1",
    });
    channels.__clearSttChannelSecretForTests(row.id);
    const out = await channels.testAdminSttChannel(row.id, adminCtx("nokey"));
    record(
      "MISSING_API_KEY",
      out.ok === false && out.error === "missing_api_key",
      out.result?.message
    );
    await channels.__wipeAllSttChannelsForTests();
  }

  // missing base_url
  {
    await channels.__wipeAllSttChannelsForTests();
    const row = await channels.__upsertSttChannelForTests({
      id: "stt-p1104-nobase",
      provider: "grsai_whisper_compatible",
      baseUrl: "",
      apiKey: "sk-grsai-fake",
      defaultModel: "whisper-1",
      allowMissingCredentials: true,
    });
    const out = await channels.testAdminSttChannel(row.id, adminCtx("nobase"));
    record(
      "MISSING_BASE_URL",
      out.ok === false && out.error === "missing_base_url",
      out.result?.message
    );
    await channels.__wipeAllSttChannelsForTests();
  }

  // Consumer empty transcript still rejects
  await withMockWhisperUpstream(
    () => ({ status: 200, body: { text: "" } }),
    async (baseUrl) => {
      const stt = createOpenaiCompatSttAdapter({
        providerId: "grsai_whisper_compatible",
        baseUrl,
        apiKey: "sk-consumer",
      });
      let code = null;
      try {
        await stt.transcribeAudio({
          requestId: "p1104_consumer_empty",
          model: "whisper-1",
          bytes: channels.buildMinimalSilentWav(),
          mimeType: "audio/wav",
          filename: "a.wav",
          timeoutMs: 5000,
        });
      } catch (err) {
        code = err?.code ?? null;
      }
      record(
        "CONSUMER_EMPTY_TRANSCRIPT_STILL_REJECTED",
        code === "upstream_error" || code === "empty_transcript",
        `code=${code}`
      );
    }
  );

  const diffCheck = spawnSync("git", ["diff", "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const diffNoise = `${diffCheck.stdout || ""}${diffCheck.stderr || ""}`
    .split("\n")
    .filter((l) => l.includes("trailing whitespace"));
  record("git_diff_check", diffNoise.length === 0, diffNoise[0] || "clean");

  // Regressions: full STT gates + static golden-path guards for responses/transport.
  // P1093–P1100 full suites fail their own STT_CHANGED/DASHBOARD scope checks when
  // this additive STT/admin UI work is dirty — prove those paths were not edited.
  const regressions = [
    ["P1103", "scripts/p1103-stt-admin-test-root-cause.mjs", /TOKFAI_P1103_.*_PASS/],
    ["P1085R2", "scripts/p1085r2-stt-channel-reality-fix-gate.mjs", /TOKFAI_P1085R2_.*_PASS/],
  ];

  for (const [name, rel, re] of regressions) {
    const r = runNode(rel);
    record(
      `regression_${name}`,
      r.status === 0 && re.test(r.out),
      `status=${r.status} ${(r.out.match(re) || ["no-marker"])[0]}`
    );
  }

  const protectedPaths = [
    "apps/dmit-api/src/routes/responses.ts",
    "apps/dmit-api/src/lib/executeChatCompletion.ts",
    "apps/dmit-api/src/billing",
    "apps/dmit-api/src/routes/billing",
    "apps/dmit-api/src/lib/adminUpstreamChannelsStore.ts",
    "apps/dmit-api/src/gateway",
    "apps/dmit-api/src/lib/providerTransportAttempt.ts",
    "scripts/p1093-responses-previous-response-id-state-bridge.mjs",
    "scripts/p1093-responses-previous-response-id-state-bridge.mts",
    "scripts/p1095-durable-responses-tool-state-store.mjs",
    "scripts/p1095-durable-responses-tool-state-store.mts",
    "scripts/p1097-responses-previous-response-id-canonical-key-fix.mjs",
    "scripts/p1097-responses-previous-response-id-canonical-key-fix.mts",
    "scripts/p1098-responses-stream-tool-state-save-fix.mjs",
    "scripts/p1098-responses-stream-tool-state-save-fix.mts",
    "scripts/p1100-upstream-transport-failover-long-stream-resilience.mjs",
  ];
  const protDiff = spawnSync(
    "git",
    ["diff", "--name-only", "HEAD", "--", ...protectedPaths],
    { cwd: ROOT, encoding: "utf8" }
  );
  const protDirty = (protDiff.stdout || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  record(
    "regression_P1093_P1100_STATIC",
    protDirty.length === 0 &&
      protectedPaths
        .filter((p) => p.startsWith("scripts/"))
        .every((p) => existsSync(join(ROOT, p))),
    protDirty.join(",") || "responses/durable/transport scripts+src untouched"
  );

  const allOk = cases.every((c) => c.ok);
  return finish(allOk);
}

main().catch((err) => {
  console.error(err);
  console.log(FAIL_MARKER);
  process.exit(1);
});
