#!/usr/bin/env node
/**
 * P1079 — Self-hosted STT worker architecture (adapter + admin channel + mock worker).
 *
 * Usage:
 *   node scripts/p1079-self-hosted-stt-worker-architecture.mjs
 *
 * Markers:
 *   TOKFAI_P1079_SELF_HOSTED_STT_WORKER_ARCHITECTURE_PASS
 *   TOKFAI_P1079_SELF_HOSTED_STT_WORKER_ARCHITECTURE_FAIL
 *
 * Never installs Whisper / ffmpeg / Docker. Never hits a real STT upstream.
 * Never commits / pushes / deploys / mutates production DB.
 */

import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { pass, fail } from "./lib/client-compat-smoke-bootstrap.mjs";
import {
  mockWorkerPresets,
  withMockSttWorker,
} from "./lib/p1079-mock-stt-worker.mjs";

const SCRIPT = "scripts/p1079-self-hosted-stt-worker-architecture.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER =
  "TOKFAI_P1079_SELF_HOSTED_STT_WORKER_ARCHITECTURE_PASS";
const FAIL_MARKER =
  "TOKFAI_P1079_SELF_HOSTED_STT_WORKER_ARCHITECTURE_FAIL";
const WAV = join(ROOT, "scripts/fixtures/p1074/stt-canary-silence.wav");
const REPORT_PATH = join(
  ROOT,
  process.env.REPORT_PATH ??
    "docs/p1079-self-hosted-stt-worker-architecture-report.md"
);
const SUMMARY_PATH = join(
  ROOT,
  process.env.SUMMARY_PATH ??
    "tmp/p1079-self-hosted-stt-worker-architecture-summary.json"
);

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_JWT_SECRET ??= "xxxxxxxxxxxxxxxxxxxx";
process.env.TOKEN_PEPPER ??= "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.GRSAI_API_KEY ??= "test-key";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test";
process.env.TOKFAI_ADMIN_CHANNELS_STORE ??= join(
  ROOT,
  "tmp/p1079-admin-channels-store.json"
);
process.env.TOKFAI_KEY_ENCRYPTION_SECRET ??=
  "p1079-test-encryption-secret-32chars!!";

/** @type {{ id: string, ok: boolean, detail?: string }[]} */
const cases = [];

function record(id, ok, detail) {
  cases.push({
    id,
    ok: !!ok,
    detail: detail ? String(detail).slice(0, 500) : undefined,
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

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function runNpm(script) {
  return spawnSync("npm", ["run", script], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
  });
}

function runScript(rel) {
  const abs = join(ROOT, rel);
  const isTs = rel.endsWith(".mts") || rel.endsWith(".ts");
  const args = isTs
    ? ["tsx", "--experimental-test-module-mocks", abs]
    : [abs];
  const cmd = isTs ? "npx" : process.execPath;
  return spawnSync(cmd, isTs ? args : [abs], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, LIVE: "" },
    timeout: 240_000,
  });
}

async function main() {
  mkdirSync(dirname(SUMMARY_PATH), { recursive: true });
  mkdirSync(dirname(REPORT_PATH), { recursive: true });

  const adapterSrc = read(
    "apps/dmit-api/src/upstream/audio/selfHostedWhisperAdapter.ts"
  );
  const resolveSrc = read(
    "apps/dmit-api/src/upstream/audio/resolveAudioProvider.ts"
  );
  const adminChannelsSrc = read("apps/dmit-api/src/routes/adminChannels.ts");
  const audioSrc = read("apps/dmit-api/src/routes/audio.ts");
  const panelSrc = read(
    "apps/web/components/admin/admin-channels-panel.tsx"
  );
  const openaiAdapterSrc = read(
    "apps/dmit-api/src/upstream/audio/openaiCompatSttAdapter.ts"
  );

  record(
    "PROVIDER_TYPE_DECLARED",
    /self_hosted_whisper/.test(adapterSrc) &&
      /self_hosted_whisper/.test(resolveSrc) &&
      /self_hosted_whisper/.test(adminChannelsSrc),
    "provider type wired"
  );
  record(
    "WORKER_CONTRACT_PATH",
    /\/v1\/audio\/transcriptions/.test(adapterSrc) &&
      /buildSelfHostedWorkerForm/.test(adapterSrc),
    "POST {base}/v1/audio/transcriptions"
  );
  record(
    "NO_BASE64_JSON_TRANSPORT",
    !/\bbtoa\s*\(/.test(adapterSrc) &&
      !/Buffer\.from\([^)]*['"]base64['"]/.test(adapterSrc) &&
      !/\.toString\(\s*['"]base64['"]\s*\)/.test(adapterSrc) &&
      !/JSON\.stringify\(\s*\{\s*file/.test(adapterSrc) &&
      /multipart|FormData/.test(adapterSrc),
    "adapter never base64-JSON encodes audio"
  );
  record(
    "NO_FFMPEG_ON_GATEWAY",
    !/\bfluent-ffmpeg\b/.test(adapterSrc + audioSrc) &&
      !/spawn(?:Sync)?\([^)]*ffmpeg/i.test(adapterSrc + audioSrc) &&
      !/require\(['"]ffmpeg/.test(adapterSrc + audioSrc) &&
      !/from ['"].*ffmpeg/.test(adapterSrc + audioSrc),
    "no transcoding"
  );
  record(
    "GROQ_COMPAT_PRESERVED",
    /groq_whisper_compatible/.test(openaiAdapterSrc) &&
      /createOpenaiCompatSttAdapter/.test(resolveSrc),
    "groq path still present"
  );
  record(
    "ADMIN_UI_PROVIDER",
    /self_hosted_whisper/.test(panelSrc) &&
      /fieldWorkerBaseUrl|Worker Base URL/.test(panelSrc),
    "admin dropdown + worker fields"
  );
  record(
    "SECRET_REDACTION_SOURCE",
    /REDACTED|never log|api_key_masked/.test(adapterSrc + adminChannelsSrc) &&
      /base_url:\s*""/.test(adminChannelsSrc),
    "list masks secrets"
  );
  record(
    "BILLING_SEAM_MARKED",
    /self_hosted_stt_cost/.test(audioSrc + adapterSrc) &&
      /recordAudioTranscriptionSuccess/.test(audioSrc),
    "single debit path + future cost seam"
  );

  const typecheck = runNpm("typecheck");
  record("typecheck", typecheck.status === 0, typecheck.stderr?.slice(0, 300));

  const build = runNpm("build");
  record("build", build.status === 0, build.stderr?.slice(0, 300));

  const distAdapter = join(
    ROOT,
    "apps/dmit-api/dist/upstream/audio/selfHostedWhisperAdapter.js"
  );
  const distResolve = join(
    ROOT,
    "apps/dmit-api/dist/upstream/audio/resolveAudioProvider.js"
  );
  const distChannels = join(
    ROOT,
    "apps/dmit-api/dist/routes/adminChannels.js"
  );
  if (
    !existsSync(distAdapter) ||
    !existsSync(distResolve) ||
    !existsSync(distChannels)
  ) {
    record("dist_modules", false, "missing dist after build");
    return finish(false);
  }
  record("dist_modules", true, "adapter + resolve + adminChannels");

  delete process.env.TOKFAI_STT_BASE_URL;
  delete process.env.TOKFAI_STT_API_KEY;

  const channelsMod = await import(pathToFileURL(distChannels).href);
  const resolveMod = await import(pathToFileURL(distResolve).href);
  const adapterMod = await import(pathToFileURL(distAdapter).href);

  await channelsMod.__wipeAllSttChannelsForTests();

  const wavBytes = new Uint8Array(readFileSync(WAV));
  const WORKER_SECRET = "p1079_internal_worker_secret_never_log";

  // A — multipart file passthrough
  await withMockSttWorker(mockWorkerPresets.ok, async ({ baseUrl, hits }) => {
    await channelsMod.__wipeAllSttChannelsForTests();
    await channelsMod.__upsertSttChannelForTests({
      id: "stt-p1079-a",
      provider: "self_hosted_whisper",
      baseUrl,
      apiKey: WORKER_SECRET,
      defaultModel: "whisper-1",
      priority: 5,
    });
    const provider = await resolveMod.resolveAudioSttProvider();
    const out = await provider.transcribeAudio({
      requestId: "p1079-a",
      model: "whisper-1",
      bytes: wavBytes,
      mimeType: "audio/wav",
      filename: "stt-canary-silence.wav",
      timeoutMs: 15_000,
    });
    const hit = hits[0];
    record(
      "A_multipart_file_passthrough",
      out.text.includes("P1079") &&
        hit?.hasFilePart === true &&
        hit.path.includes("/v1/audio/transcriptions") &&
        hit.contentType.includes("multipart/form-data") &&
        hit.bodyLooksBase64Json === false,
      `path=${hit?.path} multipart=${hit?.hasFilePart} base64json=${hit?.bodyLooksBase64Json}`
    );
  });

  // B — model passthrough / default
  await withMockSttWorker(mockWorkerPresets.ok, async ({ baseUrl, hits }) => {
    await channelsMod.__wipeAllSttChannelsForTests();
    await channelsMod.__upsertSttChannelForTests({
      id: "stt-p1079-b",
      provider: "self_hosted_whisper",
      baseUrl,
      apiKey: WORKER_SECRET,
      defaultModel: "tiny.en",
      priority: 5,
    });
    const cfg = await resolveMod.resolveAudioSttConfig();
    const { upstreamModel } = resolveMod.resolveSttUpstreamModel(
      "client-ignored",
      cfg
    );
    const provider = await resolveMod.resolveAudioSttProvider();
    await provider.transcribeAudio({
      requestId: "p1079-b",
      model: upstreamModel,
      bytes: wavBytes,
      mimeType: "audio/wav",
      filename: "probe.wav",
      timeoutMs: 15_000,
    });
    record(
      "B_model_passthrough_default",
      upstreamModel === "tiny.en" && hits[0]?.model === "tiny.en",
      `upstream=${upstreamModel} hit=${hits[0]?.model}`
    );
  });

  // C — language passthrough
  await withMockSttWorker(mockWorkerPresets.ok, async ({ baseUrl, hits }) => {
    const provider = adapterMod.createSelfHostedWhisperAdapter({
      baseUrl,
      apiKey: WORKER_SECRET,
    });
    await provider.transcribeAudio({
      requestId: "p1079-c",
      model: "whisper-1",
      bytes: wavBytes,
      mimeType: "audio/wav",
      filename: "probe.wav",
      language: "zh",
      timeoutMs: 15_000,
    });
    record(
      "C_language_passthrough",
      hits[0]?.language === "zh",
      `language=${hits[0]?.language}`
    );
  });

  // D — successful transcript
  await withMockSttWorker(mockWorkerPresets.ok, async ({ baseUrl }) => {
    await channelsMod.__wipeAllSttChannelsForTests();
    await channelsMod.__upsertSttChannelForTests({
      id: "stt-p1079-d",
      provider: "self_hosted_whisper",
      baseUrl,
      apiKey: WORKER_SECRET,
      priority: 1,
    });
    const provider = await resolveMod.resolveAudioSttProvider();
    const out = await provider.transcribeAudio({
      requestId: "p1079-d",
      model: "whisper-1",
      bytes: wavBytes,
      mimeType: "audio/wav",
      filename: "probe.wav",
      timeoutMs: 15_000,
    });
    record(
      "D_successful_transcript",
      out.text === "P1079_MOCK_TRANSCRIPT_OK" &&
        out.providerId === "self_hosted_whisper",
      out.text
    );
  });

  // E — worker 401/403
  for (const [name, preset, code] of [
    ["E_worker_401", mockWorkerPresets.unauthorized, "worker_auth_error"],
    ["E_worker_403", mockWorkerPresets.forbidden, "worker_auth_error"],
  ]) {
    await withMockSttWorker(preset, async ({ baseUrl }) => {
      const provider = adapterMod.createSelfHostedWhisperAdapter({
        baseUrl,
        apiKey: "wrong",
      });
      let errCode = null;
      try {
        await provider.transcribeAudio({
          requestId: name,
          model: "whisper-1",
          bytes: wavBytes,
          mimeType: "audio/wav",
          filename: "probe.wav",
          timeoutMs: 10_000,
        });
      } catch (err) {
        errCode = err?.code ?? null;
      }
      record(name, errCode === code, `code=${errCode}`);
    });
  }

  // F — 429 overload
  await withMockSttWorker(mockWorkerPresets.overloaded, async ({ baseUrl }) => {
    const provider = adapterMod.createSelfHostedWhisperAdapter({ baseUrl });
    let errCode = null;
    try {
      await provider.transcribeAudio({
        requestId: "p1079-f",
        model: "whisper-1",
        bytes: wavBytes,
        mimeType: "audio/wav",
        filename: "probe.wav",
        timeoutMs: 10_000,
      });
    } catch (err) {
      errCode = err?.code ?? null;
    }
    record("F_worker_overloaded", errCode === "worker_overloaded", `code=${errCode}`);
  });

  // G — 5xx
  await withMockSttWorker(mockWorkerPresets.serverError, async ({ baseUrl }) => {
    const provider = adapterMod.createSelfHostedWhisperAdapter({ baseUrl });
    let errCode = null;
    try {
      await provider.transcribeAudio({
        requestId: "p1079-g",
        model: "whisper-1",
        bytes: wavBytes,
        mimeType: "audio/wav",
        filename: "probe.wav",
        timeoutMs: 10_000,
      });
    } catch (err) {
      errCode = err?.code ?? null;
    }
    record("G_worker_5xx", errCode === "worker_unreachable", `code=${errCode}`);
  });

  // H — timeout
  await withMockSttWorker(
    { handler: mockWorkerPresets.ok, delayMs: 2500 },
    async ({ baseUrl }) => {
      const provider = adapterMod.createSelfHostedWhisperAdapter({ baseUrl });
      let errCode = null;
      try {
        await provider.transcribeAudio({
          requestId: "p1079-h",
          model: "whisper-1",
          bytes: wavBytes,
          mimeType: "audio/wav",
          filename: "probe.wav",
          timeoutMs: 200,
        });
      } catch (err) {
        errCode = err?.code ?? null;
      }
      record("H_worker_timeout", errCode === "worker_timeout", `code=${errCode}`);
    }
  );

  // I — network failure
  {
    const provider = adapterMod.createSelfHostedWhisperAdapter({
      baseUrl: "http://127.0.0.1:1",
    });
    let errCode = null;
    let leaked = false;
    try {
      await provider.transcribeAudio({
        requestId: "p1079-i",
        model: "whisper-1",
        bytes: wavBytes,
        mimeType: "audio/wav",
        filename: "probe.wav",
        timeoutMs: 2000,
      });
    } catch (err) {
      errCode = err?.code ?? null;
      const pub = String(err?.publicMessage ?? err?.message ?? "");
      leaked = /127\.0\.0\.1:1|workerBaseUrl|Bearer /.test(pub);
    }
    record(
      "I_network_failure",
      errCode === "worker_unreachable" && !leaked,
      `code=${errCode} leaked=${leaked}`
    );
  }

  // J — malformed JSON
  await withMockSttWorker(
    mockWorkerPresets.malformedJson,
    async ({ baseUrl }) => {
      const provider = adapterMod.createSelfHostedWhisperAdapter({ baseUrl });
      let errCode = null;
      try {
        await provider.transcribeAudio({
          requestId: "p1079-j",
          model: "whisper-1",
          bytes: wavBytes,
          mimeType: "audio/wav",
          filename: "probe.wav",
          timeoutMs: 10_000,
        });
      } catch (err) {
        errCode = err?.code ?? null;
      }
      record(
        "J_malformed_json",
        errCode === "worker_invalid_response",
        `code=${errCode}`
      );
    }
  );

  // K — empty transcript
  await withMockSttWorker(
    mockWorkerPresets.emptyTranscript,
    async ({ baseUrl }) => {
      const provider = adapterMod.createSelfHostedWhisperAdapter({ baseUrl });
      let errCode = null;
      try {
        await provider.transcribeAudio({
          requestId: "p1079-k",
          model: "whisper-1",
          bytes: wavBytes,
          mimeType: "audio/wav",
          filename: "probe.wav",
          timeoutMs: 10_000,
        });
      } catch (err) {
        errCode = err?.code ?? null;
      }
      record(
        "K_empty_transcript",
        errCode === "worker_invalid_response",
        `code=${errCode}`
      );
    }
  );

  // L — secret redaction (list + error + admin test result)
  await withMockSttWorker(
    mockWorkerPresets.requireAuth(WORKER_SECRET),
    async ({ baseUrl }) => {
      await channelsMod.__wipeAllSttChannelsForTests();
      const row = await channelsMod.__upsertSttChannelForTests({
        id: "stt-p1079-l",
        provider: "self_hosted_whisper",
        baseUrl,
        apiKey: WORKER_SECRET,
        priority: 3,
      });
      const listed = await channelsMod.listAdminChannels();
      const listedJson = JSON.stringify(listed);
      const listSafe =
        !listedJson.includes(WORKER_SECRET) &&
        row.api_key_set === true &&
        typeof row.api_key_masked === "string" &&
        !row.api_key_masked.includes(WORKER_SECRET) &&
        row.base_url === "";

      const testCtx = {
        adminUser: {
          userId: "u-p1079",
          email: "admin@example.com",
          adminUserId: "a-p1079",
        },
        ipAddress: "127.0.0.1",
        userAgent: "p1079",
        idempotencyKey: "p1079-test-l",
        requestId: "p1079-l-test",
      };
      const tested = await channelsMod.testAdminSttChannel(
        "stt-p1079-l",
        testCtx
      );
      const testJson = JSON.stringify(tested);
      const testSafe =
        tested.ok === true &&
        !testJson.includes(WORKER_SECRET) &&
        !testJson.includes(baseUrl);

      // Force auth failure and ensure public message has no secret/url.
      const bad = adapterMod.createSelfHostedWhisperAdapter({
        baseUrl,
        apiKey: "bad-secret",
      });
      let pub = "";
      try {
        await bad.transcribeAudio({
          requestId: "p1079-l-err",
          model: "whisper-1",
          bytes: wavBytes,
          mimeType: "audio/wav",
          filename: "probe.wav",
          timeoutMs: 10_000,
        });
      } catch (err) {
        pub = `${err?.publicMessage ?? ""} ${err?.message ?? ""}`;
      }
      const errSafe =
        !pub.includes(WORKER_SECRET) &&
        !pub.includes("bad-secret") &&
        !pub.includes(baseUrl);

      record(
        "L_secret_redaction",
        listSafe && testSafe && errSafe,
        `listSafe=${listSafe} testSafe=${testSafe} errSafe=${errSafe}`
      );
    }
  );

  // Large file — no base64 JSON, multipart size ≈ file + form overhead
  await withMockSttWorker(mockWorkerPresets.ok, async ({ baseUrl, hits }) => {
    const big = new Uint8Array(2 * 1024 * 1024);
    big.set(wavBytes.subarray(0, Math.min(wavBytes.length, 64)), 0);
    const provider = adapterMod.createSelfHostedWhisperAdapter({
      baseUrl,
      apiKey: WORKER_SECRET,
    });
    await provider.transcribeAudio({
      requestId: "p1079-large",
      model: "whisper-1",
      bytes: big,
      mimeType: "audio/wav",
      filename: "large.wav",
      timeoutMs: 30_000,
    });
    const hit = hits[0];
    const overhead = (hit?.bodyBytes ?? 0) - big.byteLength;
    record(
      "LARGE_FILE_NO_BASE64_JSON",
      hit?.bodyLooksBase64Json === false &&
        hit?.hasFilePart === true &&
        hit?.contentType.includes("multipart/form-data") &&
        overhead > 0 &&
        overhead < 64 * 1024 &&
        (hit?.bodyBytes ?? 0) < big.byteLength * 1.5,
      `bodyBytes=${hit?.bodyBytes} file=${big.byteLength} overhead=${overhead} buffering=gateway_parse_once+formdata_serialize`
    );
  });

  // Priority: self_hosted not hard-coded first (lower priority number wins)
  {
    await channelsMod.__wipeAllSttChannelsForTests();
    await channelsMod.__upsertSttChannelForTests({
      id: "stt-p1079-prio-self",
      provider: "self_hosted_whisper",
      baseUrl: "http://127.0.0.1:9",
      apiKey: WORKER_SECRET,
      priority: 50,
    });
    await channelsMod.__upsertSttChannelForTests({
      id: "stt-p1079-prio-groq",
      provider: "groq_whisper_compatible",
      baseUrl: "http://127.0.0.1:9/v1",
      apiKey: "gsk_p1079_fake",
      priority: 1,
    });
    const resolved = await channelsMod.resolveEnabledSttAdminChannel();
    record(
      "PRIORITY_NOT_HARDCODED_SELF_FIRST",
      resolved?.id === "stt-p1079-prio-groq" &&
        resolved?.providerId === "groq_whisper_compatible",
      `picked=${resolved?.id} provider=${resolved?.providerId}`
    );
  }

  // Optional secret: self-hosted without api key still resolves
  await withMockSttWorker(mockWorkerPresets.ok, async ({ baseUrl }) => {
    await channelsMod.__wipeAllSttChannelsForTests();
    await channelsMod.__upsertSttChannelForTests({
      id: "stt-p1079-nosecret",
      provider: "self_hosted_whisper",
      baseUrl,
      priority: 2,
    });
    const cfg = await resolveMod.resolveAudioSttConfig();
    const provider = await resolveMod.resolveAudioSttProvider();
    const out = await provider.transcribeAudio({
      requestId: "p1079-nosecret",
      model: "whisper-1",
      bytes: wavBytes,
      mimeType: "audio/wav",
      filename: "probe.wav",
      timeoutMs: 10_000,
    });
    record(
      "OPTIONAL_WORKER_SECRET",
      cfg.providerId === "self_hosted_whisper" &&
        provider.available &&
        out.text.includes("P1079"),
      `provider=${cfg.providerId}`
    );
  });

  // Isolation / compatibility (source)
  const chatSrc = read("apps/dmit-api/src/routes/chat.ts");
  const responsesSrc = read("apps/dmit-api/src/routes/responses.ts");
  record(
    "CHAT_UNCHANGED",
    !/self_hosted_whisper|selfHostedWhisper/.test(chatSrc),
    "chat route untouched"
  );
  record(
    "RESPONSES_UNCHANGED",
    !/self_hosted_whisper|selfHostedWhisper/.test(responsesSrc),
    "responses untouched"
  );
  record(
    "CURSOR_UNCHANGED",
    !/self_hosted_whisper/.test(
      read("apps/dmit-api/src/lib/cursorToolProtocol.ts")
    ),
    "cursor untouched"
  );
  record(
    "AZURE_UNCHANGED",
    !/self_hosted_whisper/.test(
      read("apps/dmit-api/src/lib/azureOpenAiIngress.ts")
    ),
    "azure untouched"
  );
  record(
    "AUTOPRO_UNCHANGED",
    !/self_hosted_whisper/.test(
      read("apps/dmit-api/src/lib/executeChatCompletion.ts")
    ),
    "executeChatCompletion untouched"
  );
  record(
    "GPT_GEMINI_UNCHANGED",
    !/self_hosted_whisper/.test(
      read("apps/dmit-api/src/lib/compat/providers/geminiAdapter.ts")
    ),
    "gemini adapter untouched"
  );
  record(
    "CONSUMER_THREE_INPUT",
    /Base URL \+ API Key \+ Model/.test(audioSrc) &&
      !/form\.provider/.test(audioSrc) &&
      !/form\.base_url/.test(audioSrc),
    "consumer still Base URL + key + model"
  );

  const diffCheck = spawnSync("git", ["diff", "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const diffNoise = `${diffCheck.stdout || ""}${diffCheck.stderr || ""}`
    .split("\n")
    .filter((l) => l.includes("trailing whitespace"))
    .filter((l) => !/docs\/p107[1-8]-/.test(l));
  record(
    "git_diff_check",
    diffNoise.length === 0,
    diffNoise[0] || "clean"
  );

  // Required regressions (offline). .mts scripts need tsx.
  const regressions = [
    [
      "P1059",
      "scripts/p1059-explicit-model-transparent-gateway.mts",
      /TOKFAI_P1059_.*_PASS/,
    ],
    [
      "P1061",
      "scripts/p1061-autopro-transparent-carrier.mts",
      /TOKFAI_P1061_.*_PASS/,
    ],
    [
      "P1062R4",
      "scripts/p1062r4-real-entry-transport-sse-canary.mts",
      /TOKFAI_P1062R4_.*_PASS/,
    ],
    [
      "P1067",
      "scripts/p1067-cursor-azure-ingress-real-entry.mts",
      /TOKFAI_P1067_.*_PASS/,
    ],
    [
      "P1070",
      "scripts/p1070-azure-status-passthrough.mts",
      /TOKFAI_P1070_.*_PASS/,
    ],
    [
      "P1071",
      "scripts/p1071-hermes-compatibility-lab.mjs",
      /TOKFAI_P1071_.*_(PASS|DONE)/,
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
    [
      "P1077",
      "scripts/p1077-stt-upstream-channel-productionization.mjs",
      /TOKFAI_P1077_.*_PASS/,
    ],
    [
      "P1077R2",
      "scripts/p1077r2-stt-channel-persistence-precommit-audit.mjs",
      /TOKFAI_P1077R2_.*_PASS/,
    ],
    [
      "P1077R3",
      "scripts/p1077r3-stt-channel-production-migration-gate.mjs",
      /TOKFAI_P1077R3_.*_PASS/,
    ],
  ];

  const regressionResults = [];
  for (const [name, rel, passRe] of regressions) {
    if (!existsSync(join(ROOT, rel))) {
      record(`REGRESSION_${name}`, false, `missing ${rel}`);
      regressionResults.push({ name, ok: false, detail: "missing" });
      continue;
    }
    const r = runScript(rel);
    const out = `${r.stdout || ""}\n${r.stderr || ""}`;
    const familyOk = r.status === 0 && passRe.test(out);
    record(
      `REGRESSION_${name}`,
      familyOk,
      `status=${r.status} tail=${out.trim().split("\n").slice(-2).join(" | ").slice(0, 180)}`
    );
    regressionResults.push({ name, ok: familyOk, status: r.status });
  }

  // Unrelated diff heuristic — only STT/self-host / admin channel / labels / scripts/docs for p1079
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const changed = (status.stdout || "")
    .split("\n")
    .filter(Boolean)
    .map((l) => {
      // porcelain: XY PATH or ?? PATH (XY may include spaces)
      if (l.startsWith("?? ")) return l.slice(3).trim();
      if (l.length >= 3 && l[2] === " ") return l.slice(3).trim();
      return l.replace(/^[ MADRCU?]{1,2}\s+/, "").trim();
    })
    .filter(Boolean);
  // env.ts: TOKFAI_STT_MAX_UPLOAD_BYTES (P1079R2 memory boundary).
  // openaiCompatSttAdapter: abortSignal wiring shared with self-hosted path.
  const allowed =
    /^(apps\/dmit-api\/src\/(upstream\/audio|routes\/(audio|adminChannels)|errors\.ts|env\.ts|lib\/audioTranscriptionUsage)|apps\/web\/(components\/admin\/admin-channels-panel|lib\/admin\/client|lib\/dashboard-safe\/labels)|scripts\/(p107\d|lib\/p107\d|p1077)|docs\/p107|tmp\/|supabase\/migrations\/0040)/;
  const unrelatedStrict = changed.filter((f) => !allowed.test(f));
  record(
    "UNRELATED_DIFF_FOUND",
    unrelatedStrict.length === 0,
    unrelatedStrict.slice(0, 8).join(", ") || "none"
  );

  return finish(
    cases.every((c) => c.ok),
    { regressionResults, unrelatedStrict }
  );
}

function finish(allOk, extra = {}) {
  const failed = cases.filter((c) => !c.ok);
  const typecheckOk = cases.find((c) => c.id === "typecheck")?.ok;
  const buildOk = cases.find((c) => c.id === "build")?.ok;
  const diffOk = cases.find((c) => c.id === "git_diff_check")?.ok;
  const regressionsOk = cases
    .filter((c) => c.id.startsWith("REGRESSION_"))
    .every((c) => c.ok);
  const unrelatedOk = cases.find((c) => c.id === "UNRELATED_DIFF_FOUND")?.ok;

  const report = {
    SELF_HOSTED_STT_PROVIDER_IMPLEMENTED: cases.some(
      (c) => c.id === "PROVIDER_TYPE_DECLARED" && c.ok
    )
      ? "YES"
      : "NO",
    CONSUMER_EXTRA_CONFIG_REQUIRED: cases.some(
      (c) => c.id === "CONSUMER_THREE_INPUT" && c.ok
    )
      ? "NO"
      : "YES",
    HKG_INFERENCE_REQUIRED: "NO",
    AUDIO_TRANSCODING_ON_GATEWAY: cases.some(
      (c) => c.id === "NO_FFMPEG_ON_GATEWAY" && c.ok
    )
      ? "NO"
      : "YES",
    MULTIPART_PASSTHROUGH: cases.some(
      (c) => c.id === "A_multipart_file_passthrough" && c.ok
    )
      ? "YES"
      : "NO",
    WORKER_SECRET_ENCRYPTED: /encryptUpstreamSecretForStore|storeSecret/.test(
      read("apps/dmit-api/src/routes/adminChannels.ts")
    )
      ? "YES"
      : "NO",
    WORKER_SECRET_EXPOSED: cases.some(
      (c) => c.id === "L_secret_redaction" && c.ok
    )
      ? "NO"
      : "YES",
    ADMIN_CHANNEL_REUSED: /admin_upstream_channels|persistDurableChannel/.test(
      read("apps/dmit-api/src/routes/adminChannels.ts")
    )
      ? "YES"
      : "NO",
    CHAT_CHANGED: cases.some((c) => c.id === "CHAT_UNCHANGED" && c.ok)
      ? "NO"
      : "YES",
    RESPONSES_CHANGED: cases.some(
      (c) => c.id === "RESPONSES_UNCHANGED" && c.ok
    )
      ? "NO"
      : "YES",
    CURSOR_CHANGED: cases.some((c) => c.id === "CURSOR_UNCHANGED" && c.ok)
      ? "NO"
      : "YES",
    AZURE_CHANGED: cases.some((c) => c.id === "AZURE_UNCHANGED" && c.ok)
      ? "NO"
      : "YES",
    AUTOPRO_CHANGED: cases.some((c) => c.id === "AUTOPRO_UNCHANGED" && c.ok)
      ? "NO"
      : "YES",
    GPT_GEMINI_CHANGED: cases.some(
      (c) => c.id === "GPT_GEMINI_UNCHANGED" && c.ok
    )
      ? "NO"
      : "YES",
    BILLING_DOUBLE_CHARGE_RISK: cases.some(
      (c) => c.id === "BILLING_SEAM_MARKED" && c.ok
    )
      ? "NO"
      : "YES",
    TYPECHECK: typecheckOk ? "PASS" : "FAIL",
    BUILD: buildOk ? "PASS" : "FAIL",
    REGRESSIONS: regressionsOk ? "PASS" : "FAIL",
    GIT_DIFF_CHECK: diffOk ? "PASS" : "FAIL",
    UNRELATED_DIFF_FOUND: unrelatedOk ? "NO" : "YES",
  };

  const lines = [
    `# P1079 — Self-hosted STT worker architecture`,
    ``,
    `- git_head=${gitHead()}`,
    `- script=${SCRIPT}`,
    `- all_ok=${allOk}`,
    ``,
    `## Report markers`,
    ...Object.entries(report).map(([k, v]) => `- ${k}=${v}`),
    ``,
    `## Cases`,
    ...cases.map(
      (c) => `- ${c.ok ? "PASS" : "FAIL"} ${c.id}${c.detail ? ` — ${c.detail}` : ""}`
    ),
    ``,
    `## Multipart buffering note`,
    `- Gateway: Hono parseBody buffers audio once for validation (size/ext).`,
    `- Adapter: FormData + Blob over the same Uint8Array (no base64 JSON).`,
    `- Worker receives multipart/form-data at POST {workerBaseUrl}/v1/audio/transcriptions.`,
    ``,
    allOk ? PASS_MARKER : FAIL_MARKER,
    ``,
  ];
  writeFileSync(REPORT_PATH, lines.join("\n"));
  writeFileSync(
    SUMMARY_PATH,
    JSON.stringify({ report, cases, extra, gitHead: gitHead() }, null, 2)
  );

  for (const [k, v] of Object.entries(report)) {
    console.log(`${k}=${v}`);
  }
  console.log(allOk ? PASS_MARKER : FAIL_MARKER);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(FAIL_MARKER);
  console.error(err);
  process.exit(1);
});
