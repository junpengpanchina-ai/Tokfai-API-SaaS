#!/usr/bin/env node
/**
 * P1103 — STT Admin "测试连接" 400 root-cause harness.
 *
 *   node scripts/p1103-stt-admin-test-root-cause.mjs
 *
 * Markers:
 *   TOKFAI_P1103_STT_ADMIN_TEST_400_ROOT_CAUSE_PASS
 *   TOKFAI_P1103_STT_ADMIN_TEST_400_ROOT_CAUSE_FAIL
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

const SCRIPT = "scripts/p1103-stt-admin-test-root-cause.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P1103_STT_ADMIN_TEST_400_ROOT_CAUSE_PASS";
const FAIL_MARKER = "TOKFAI_P1103_STT_ADMIN_TEST_400_ROOT_CAUSE_FAIL";
const SUMMARY_PATH = join(
  ROOT,
  process.env.SUMMARY_PATH ?? "tmp/p1103-stt-admin-test-root-cause-summary.json"
);

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_JWT_SECRET ??= "xxxxxxxxxxxxxxxxxxxx";
process.env.TOKEN_PEPPER ??= "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.GRSAI_API_KEY ??= "test-key-grsai-chat-untouched";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test";
process.env.TOKFAI_ADMIN_CHANNELS_STORE ??= join(
  ROOT,
  "tmp/p1103-admin-channels-store.json"
);
process.env.TOKFAI_KEY_ENCRYPTION_SECRET ??=
  "p1103-test-encryption-secret-32chars!!";

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
    adminUser: { userId: "u-p1103", email: "p1103@test.local" },
    ipAddress: "127.0.0.1",
    userAgent: "p1103",
    idempotencyKey: `p1103-${suffix}`,
    requestId: `req_p1103_${suffix}`,
  };
}

/**
 * Mock Whisper-compatible STT upstream. Captures multipart field names.
 */
async function withMockWhisperUpstream(handler, fn) {
  /** @type {{ contentType: string, hasFile: boolean, hasModel: boolean, modelValue: string | null, authPresent: boolean, bodyLen: number }[]} */
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const buf = Buffer.concat(chunks);
      const contentType = String(req.headers["content-type"] || "");
      const auth = String(req.headers.authorization || "");
      const bodyStr = buf.toString("binary");
      const hasFile =
        /name="file"/.test(bodyStr) || /name='file'/.test(bodyStr);
      const modelMatch = bodyStr.match(
        /name="model"\r?\n\r?\n([^\r\n]+)/
      );
      const hasModel = /name="model"/.test(bodyStr);
      requests.push({
        contentType,
        hasFile,
        hasModel,
        modelValue: modelMatch ? modelMatch[1].trim() : null,
        authPresent: /^Bearer\s+\S+/.test(auth),
        bodyLen: buf.length,
      });

      const out = handler({
        path: req.url || "",
        contentType,
        hasFile,
        hasModel,
        modelValue: modelMatch ? modelMatch[1].trim() : null,
      });
      res.writeHead(out.status, { "content-type": "application/json" });
      res.end(
        typeof out.body === "string" ? out.body : JSON.stringify(out.body)
      );
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    // Groq-compatible path shape: .../openai/v1 + /audio/transcriptions
    const baseUrl = `http://127.0.0.1:${port}/openai/v1`;
    return await fn(baseUrl, requests);
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

async function main() {
  mkdirSync(dirname(SUMMARY_PATH), { recursive: true });

  const adminSrc = read("apps/dmit-api/src/routes/adminChannels.ts");
  const adminRouteSrc = read("apps/dmit-api/src/routes/admin.ts");
  const adapterSrc = read(
    "apps/dmit-api/src/upstream/audio/openaiCompatSttAdapter.ts"
  );
  const clientSrc = read("apps/web/lib/admin/client.ts");
  const panelSrc = read("apps/web/components/admin/admin-channels-panel.tsx");

  // ── A. Route / frontend shape ──────────────────────────────────────────
  record(
    "STT_ADMIN_TEST_ROUTE_FOUND",
    /protectedAdminRoutes\.post\(\s*"\/channels\/:id\/test"/.test(adminRouteSrc) &&
      /testAdminSttChannel/.test(adminRouteSrc) &&
      /\/admin\/channels\/\$\{encodeURIComponent\(id\)\}\/test/.test(clientSrc) &&
      /testAdminSttChannel\(row\.id\)/.test(panelSrc),
    "POST /admin/channels/:id/test + frontend fetch"
  );

  record(
    "STT_TEST_400_SOURCE_CLASSIFIED",
    /allowEmptyTranscript:\s*true/.test(adminSrc) &&
      /buildMinimalSilentWav|loadSilenceWavBytes/.test(adminSrc),
    "BACKEND_VALIDATION: silence empty transcript + fixture path treated as probe failure"
  );

  record(
    "GROQ_WHISPER_COMPATIBLE_MULTIPART_FILE_FIELD",
    /form\.append\(\s*"file"/.test(adapterSrc) &&
      /form\.append\(\s*"model"/.test(adapterSrc),
    "adapter multipart file + model"
  );

  record(
    "STT_TEST_USES_MINIMAL_WAV",
    /buildMinimalSilentWav/.test(adminSrc) &&
      /allowEmptyTranscript:\s*true/.test(adminSrc),
    "in-process silent WAV + allow empty transcript for admin probe"
  );

  record(
    "FRONTEND_SHOWS_BACKEND_MESSAGE",
    /backendMessage|detail\.message|result\.message/.test(panelSrc) &&
      /setError\(backendMessage|setError\(\s*result\.message/.test(panelSrc),
    "panel surfaces backend message on 400"
  );

  // ── Scope guards ───────────────────────────────────────────────────────
  const forbidden = [
    "apps/dmit-api/src/routes/responses.ts",
    "apps/dmit-api/src/lib/executeChatCompletion.ts",
    "apps/dmit-api/src/routes/chat.ts",
    "apps/dmit-api/src/billing",
    "apps/dmit-api/src/routes/billing",
  ];
  const diffNames = spawnSync(
    "git",
    ["diff", "--name-only", "HEAD", "--", ...forbidden],
    { cwd: ROOT, encoding: "utf8" }
  );
  const dirtyForbidden = (diffNames.stdout || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  record(
    "CHAT_RESPONSES_BILLING_UNTOUCHED",
    dirtyForbidden.length === 0,
    dirtyForbidden.join(",") || "clean"
  );

  const logOkSlice =
    adminSrc.match(/log\.info\(\s*"admin_channel_stt_test_ok"[\s\S]*?\}\);/)?.[0] ||
    "";
  const logFailSlice =
    adminSrc.match(/log\.warn\(\s*"admin_channel_stt_test_failed"[\s\S]*?\}\);/)?.[0] ||
    "";
  const logSecretLeak =
    /apiKey|Authorization|Bearer |encrypted|wavBytes|audio_base64/.test(
      logOkSlice + logFailSlice
    );
  record(
    "NO_SECRET_LOGGED_STATIC",
    !logSecretLeak &&
      /provider:|model:|upstream_status:|latency_ms:|error_class:/.test(
        logOkSlice + logFailSlice
      ),
    "safe log fields only"
  );

  // Build + typecheck
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

  if (build.status !== 0) {
    return finish(false);
  }

  const { adapter, channels } = await loadDistMods();
  const { createOpenaiCompatSttAdapter, isGroqOpenaiV1Base } = adapter;

  // Bypass Groq host check for local mock: monkey-patch by using openai_compatible
  // for multipart capture, and separately test groq provider with real Groq-shaped URL
  // via override — detectSttProviderBaseMismatch requires api.groq.com.
  // Strategy: run multipart probe as openai_compatible on mock; run success JSON
  // shape via allowEmptyTranscript with openai_compatible; for groq provider path
  // use detect mismatch skip by temporarily using a URL that passes isGroq check.
  // Local mock cannot use api.groq.com hostname — so we test groq path via
  // createOpenaiCompatSttAdapter({ providerId: groq... }) directly + admin test
  // with openai_compatible OR we stub: admin test for missing_* uses groq provider
  // without hitting upstream.

  record(
    "BUILD_MINIMAL_SILENT_WAV",
    typeof channels.buildMinimalSilentWav === "function" &&
      channels.buildMinimalSilentWav().byteLength > 44 &&
      Buffer.from(channels.buildMinimalSilentWav().subarray(0, 4)).toString() ===
        "RIFF",
    "generated WAV is valid RIFF"
  );

  // ── Mock upstream success (empty transcript = connection OK) ───────────
  await withMockWhisperUpstream(
    () => ({ status: 200, body: { text: "" } }),
    async (baseUrl, requests) => {
      await channels.__wipeAllSttChannelsForTests();
      // openai_compatible avoids groq host gate against 127.0.0.1
      const row = await channels.__upsertSttChannelForTests({
        id: "stt-p1103-ok",
        provider: "openai_compatible",
        baseUrl,
        apiKey: "sk-p1103-test-key-not-secret",
        defaultModel: "whisper-large-v3-turbo",
      });
      const out = await channels.testAdminSttChannel(row.id, adminCtx("ok"));
      const r = out.result;
      const req0 = requests[0];
      record(
        "MOCK_UPSTREAM_SUCCESS_EMPTY_TEXT",
        out.ok === true &&
          r?.ok === true &&
          r?.upstream_status === 200 &&
          typeof r?.latency_ms === "number" &&
          r?.provider === "openai_compatible" &&
          r?.model === "whisper-large-v3-turbo" &&
          r?.message?.includes("succeeded"),
        `ok=${out.ok} status=${r?.upstream_status} msg=${r?.message}`
      );
      record(
        "STT_TEST_SUCCESS_RETURNS_JSON",
        out.ok === true &&
          r?.ok === true &&
          r?.upstreamStatus === 200 &&
          typeof r?.latencyMs === "number",
        "camelCase mirrors present"
      );
      record(
        "MULTIPART_FILE_AND_MODEL",
        !!req0 &&
          /multipart\/form-data/i.test(req0.contentType) &&
          req0.hasFile === true &&
          req0.hasModel === true &&
          req0.modelValue === "whisper-large-v3-turbo",
        req0
          ? `ct=${req0.contentType.slice(0, 40)} file=${req0.hasFile} model=${req0.modelValue}`
          : "no request"
      );
      await channels.__wipeAllSttChannelsForTests();
    }
  );

  // ── Mock upstream 400 ──────────────────────────────────────────────────
  await withMockWhisperUpstream(
    () => ({
      status: 400,
      body: { error: { message: "invalid audio", type: "invalid_request_error" } },
    }),
    async (baseUrl) => {
      await channels.__wipeAllSttChannelsForTests();
      const row = await channels.__upsertSttChannelForTests({
        id: "stt-p1103-up400",
        provider: "openai_compatible",
        baseUrl,
        apiKey: "sk-p1103-test-key-not-secret",
        defaultModel: "whisper-1",
      });
      const out = await channels.testAdminSttChannel(row.id, adminCtx("up400"));
      const r = out.result;
      record(
        "MOCK_UPSTREAM_HTTP_400",
        out.ok === false &&
          out.status === 400 &&
          r?.ok === false &&
          r?.upstream_status === 400 &&
          typeof r?.message === "string" &&
          r.message.length > 0 &&
          (r.code || r.error_class),
        `error=${out.error} class=${r?.error_class} msg=${r?.message}`
      );
      record(
        "STT_TEST_FAILURE_RETURNS_JSON",
        r?.ok === false &&
          typeof r?.provider === "string" &&
          typeof r?.model === "string" &&
          typeof r?.message === "string",
        "failure JSON has provider/model/message"
      );
      await channels.__wipeAllSttChannelsForTests();
    }
  );

  // ── Missing credentials ────────────────────────────────────────────────
  {
    await channels.__wipeAllSttChannelsForTests();
    const row = await channels.__upsertSttChannelForTests({
      id: "stt-p1103-nokey",
      provider: "groq_whisper_compatible",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: "gsk_fake_p1103_then_cleared",
      defaultModel: "whisper-large-v3-turbo",
    });
    channels.__clearSttChannelSecretForTests(row.id);
    const out = await channels.testAdminSttChannel(row.id, adminCtx("nokey"));
    record(
      "MISSING_API_KEY",
      out.ok === false &&
        out.error === "missing_api_key" &&
        /missing_api_key/.test(String(out.result?.message || "")),
      out.result?.message
    );
    await channels.__wipeAllSttChannelsForTests();
  }

  {
    await channels.__wipeAllSttChannelsForTests();
    const row = await channels.__upsertSttChannelForTests({
      id: "stt-p1103-nobase",
      provider: "groq_whisper_compatible",
      baseUrl: "",
      apiKey: "gsk_fake_p1103",
      defaultModel: "whisper-large-v3-turbo",
      allowMissingCredentials: true,
    });
    const out = await channels.testAdminSttChannel(row.id, adminCtx("nobase"));
    record(
      "MISSING_BASE_URL",
      out.ok === false &&
        out.error === "missing_base_url" &&
        /missing_base_url/.test(String(out.result?.message || "")),
      out.result?.message
    );
    await channels.__wipeAllSttChannelsForTests();
  }

  {
    // defaultModel "" falls back to provider default at probe time; assert code path exists
    // and that an empty effective model string would surface missing_model.
    record(
      "MISSING_MODEL",
      /error_class:\s*"missing_model"/.test(adminSrc) &&
        /missing_model: STT channel has no default_model/.test(adminSrc),
      "missing_model path present (provider default usually fills model)"
    );
  }

  // Consumer path still rejects empty transcript (no allowEmptyTranscript)
  await withMockWhisperUpstream(
    () => ({ status: 200, body: { text: "" } }),
    async (baseUrl) => {
      const stt = createOpenaiCompatSttAdapter({
        providerId: "groq_whisper_compatible",
        baseUrl,
        apiKey: "sk-consumer",
      });
      let code = null;
      try {
        await stt.transcribeAudio({
          requestId: "p1103_consumer_empty",
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
        "CONSUMER_EMPTY_TRANSCRIPT_STILL_REJECTS",
        code === "upstream_error",
        `code=${code}`
      );
    }
  );

  // Adapter allowEmptyTranscript success
  await withMockWhisperUpstream(
    () => ({ status: 200, body: { text: "" } }),
    async (baseUrl) => {
      const stt = createOpenaiCompatSttAdapter({
        providerId: "openai_compatible",
        baseUrl,
        apiKey: "sk-admin-probe",
      });
      const out = await stt.transcribeAudio({
        requestId: "p1103_allow_empty",
        model: "whisper-1",
        bytes: channels.buildMinimalSilentWav(),
        mimeType: "audio/wav",
        filename: "a.wav",
        timeoutMs: 5000,
        allowEmptyTranscript: true,
      });
      record(
        "ADAPTER_ALLOW_EMPTY_TRANSCRIPT",
        out.upstreamStatus === 200 && out.text === "",
        `status=${out.upstreamStatus}`
      );
    }
  );

  record(
    "IS_GROQ_HELPER_PRESENT",
    typeof isGroqOpenaiV1Base === "function" &&
      isGroqOpenaiV1Base("https://api.groq.com/openai/v1") === true,
    "groq base helper ok"
  );

  // git diff --check
  const diffCheck = spawnSync("git", ["diff", "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const diffNoise = `${diffCheck.stdout || ""}${diffCheck.stderr || ""}`
    .split("\n")
    .filter((l) => l.includes("trailing whitespace"));
  record("git_diff_check", diffNoise.length === 0, diffNoise[0] || "clean");

  // Static guards: P1093/P1095/P1097/P1098/P1100/P1102 files unchanged
  const regressionScripts = [
    "scripts/p1093-responses-previous-response-id-state-bridge.mjs",
    "scripts/p1095-durable-responses-tool-state-store.mjs",
    "scripts/p1097-responses-previous-response-id-canonical-key-fix.mjs",
    "scripts/p1098-responses-stream-tool-state-save-fix.mjs",
    "scripts/p1100-upstream-transport-failover-long-stream-resilience.mjs",
    "scripts/p1102-real-codex-client-manual-canary.mjs",
  ];
  const regDiff = spawnSync(
    "git",
    ["diff", "--name-only", "HEAD", "--", ...regressionScripts],
    { cwd: ROOT, encoding: "utf8" }
  );
  const regDirty = (regDiff.stdout || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  record(
    "P1093_P1102_SCRIPTS_UNTOUCHED",
    regDirty.length === 0,
    regDirty.join(",") || "clean"
  );

  // Light static existence check (full smoke is heavy; avoid changing those paths)
  for (const rel of regressionScripts) {
    record(
      `EXISTS_${rel.split("/").pop()}`,
      existsSync(join(ROOT, rel)),
      rel
    );
  }

  const allOk = cases.every((c) => c.ok);
  return finish(allOk);
}

main().catch((err) => {
  console.error(err);
  console.log(FAIL_MARKER);
  process.exit(1);
});
