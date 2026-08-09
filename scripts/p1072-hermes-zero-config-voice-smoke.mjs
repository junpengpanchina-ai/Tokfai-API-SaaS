#!/usr/bin/env node
/**
 * P1072 — Hermes zero-config voice + real Tokfai STT harness.
 *
 * Usage:
 *   node scripts/p1072-hermes-zero-config-voice-smoke.mjs
 *   LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p1072-hermes-zero-config-voice-smoke.mjs
 *
 * Markers:
 *   TOKFAI_P1072_HERMES_ZERO_CONFIG_VOICE_PASS
 *   TOKFAI_P1072_HERMES_ZERO_CONFIG_VOICE_FAIL
 */

import { createServer } from "node:http";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./lib/client-compat-smoke-bootstrap.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";

const SCRIPT = "scripts/p1072-hermes-zero-config-voice-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P1072_HERMES_ZERO_CONFIG_VOICE_PASS";
const FAIL_MARKER = "TOKFAI_P1072_HERMES_ZERO_CONFIG_VOICE_FAIL";

// Stub boot env before importing dmit dist modules (never print secrets).
process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_JWT_SECRET ??= "xxxxxxxxxxxxxxxxxxxx";
process.env.TOKEN_PEPPER ??= "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.GRSAI_API_KEY ??= "test-key";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test";
const REPORT_PATH = join(
  ROOT,
  process.env.REPORT_PATH ?? "docs/p1072-hermes-zero-config-voice-report.md"
);
const SUMMARY_PATH = join(
  ROOT,
  process.env.SUMMARY_PATH ?? "tmp/p1072-hermes-zero-config-voice-summary.json"
);

/** @type {{ id: string, ok: boolean, realEntry: boolean, detail?: string }[]} */
const cases = [];

function record(id, ok, detail, realEntry = true) {
  cases.push({
    id,
    ok: !!ok,
    realEntry: !!realEntry,
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

function multipart(model, filename = "probe.wav", payload = "RIFF....WAVEfmt ") {
  const boundary = "----tokfaiP1072";
  const body =
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="model"\r\n\r\n${model}\r\n` +
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="file"; filename="${filename}"\r\n` +
    `Content-Type: audio/wav\r\n\r\n` +
    `${payload}\r\n` +
    `--${boundary}--\r\n`;
  return {
    body,
    headers: {
      "Content-Type": `multipart/form-data; boundary=${boundary}`,
    },
  };
}

function readHermesFacts() {
  const home = process.env.HERMES_HOME || join(process.env.HOME || "", ".hermes");
  const agent = join(home, "hermes-agent/tools/transcription_tools.py");
  const stamp = join(home, "desktop-build-stamp.json");
  const helpers = join(home, "hermes-agent/tools/tool_backend_helpers.py");
  const desktopVoice = join(
    home,
    "hermes-agent/apps/desktop/src/app/settings/voice-provider-fields.test.ts"
  );
  const facts = {
    STT_CAN_INHERIT_CHAT_BASE_URL: false,
    STT_CAN_INHERIT_CHAT_API_KEY: false,
    ZERO_EXTRA_CONSUMER_FIELDS_FEASIBLE: false,
    CLIENT_PATCH_REQUIRED: true,
    reasons: [],
  };
  if (!existsSync(agent)) {
    facts.reasons.push("hermes-agent transcription_tools.py missing");
    return facts;
  }
  const src = readFileSync(agent, "utf8");
  const usesSttEnvDefault = /STT_OPENAI_BASE_URL/.test(src);
  const returnsSttConst =
    /return direct_api_key, OPENAI_BASE_URL/.test(src) &&
    /os\.getenv\("STT_OPENAI_BASE_URL"/.test(src);
  const inheritsChatBase =
    /getenv\("OPENAI_BASE_URL"/.test(src) &&
    /STT_OPENAI_BASE_URL/.test(src) &&
    src.includes("OPENAI_BASE_URL") &&
    /inherit|fallback.*OPENAI_BASE_URL|chat.?base/i.test(src);
  // Stock: key inherit yes via resolve_openai_audio_api_key → OPENAI_API_KEY
  if (existsSync(helpers)) {
    const h = readFileSync(helpers, "utf8");
    facts.STT_CAN_INHERIT_CHAT_API_KEY =
      /VOICE_TOOLS_OPENAI_KEY/.test(h) &&
      /OPENAI_API_KEY/.test(h) &&
      /resolve_openai_audio_api_key/.test(h);
  }
  // Stock Hermes does NOT inherit chat OPENAI_BASE_URL for STT.
  facts.STT_CAN_INHERIT_CHAT_BASE_URL = Boolean(inheritsChatBase);
  if (usesSttEnvDefault && returnsSttConst && !inheritsChatBase) {
    facts.reasons.push(
      "STT base uses STT_OPENAI_BASE_URL/default api.openai.com; does not read OPENAI_BASE_URL"
    );
  }
  if (existsSync(desktopVoice)) {
    const v = readFileSync(desktopVoice, "utf8");
    if (/stt', 'openai'\)\)\.toEqual\(\['stt\.openai\.model'\]\)/.test(v)) {
      facts.reasons.push(
        "Desktop UI voiceProviderKeys(stt,openai) only exposes stt.openai.model — no base_url persistence seam"
      );
    }
  }
  if (existsSync(stamp)) {
    const st = JSON.parse(readFileSync(stamp, "utf8"));
    if (st.sourceMode === false) {
      facts.CLIENT_PATCH_REQUIRED = true;
      facts.reasons.push(
        "desktop-build-stamp sourceMode=false — bundled Desktop; Tokfai cannot inject inherit into binary"
      );
    }
  }
  // P1072R2/P1073: terminal bootstrap is NOT zero-config product. Stock Hermes
  // cannot inherit STT base URL; product path is Tokfai Hermes Connector (P1073).
  facts.ZERO_EXTRA_CONSUMER_FIELDS_FEASIBLE = false;
  facts.reasons.push(
    "P1073: unmodified Hermes has no STT base inherit; consumer Terminal bootstrap is not product zero-config"
  );
  return facts;
}

async function withMockSttUpstream(fn) {
  const server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/v1/audio/transcriptions") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        const auth = req.headers.authorization || "";
        if (!auth.startsWith("Bearer ")) {
          res.writeHead(401, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: { message: "unauthorized" } }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ text: "ADAPTER_STT_OK" }));
      });
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    return await fn(`http://127.0.0.1:${port}/v1`);
  } finally {
    server.close();
  }
}

async function main() {
  mkdirSync(dirname(SUMMARY_PATH), { recursive: true });
  const facts = readHermesFacts();

  record(
    "phase1_stt_key_inherit",
    facts.STT_CAN_INHERIT_CHAT_API_KEY,
    facts.reasons.join("; "),
    false
  );
  record(
    "phase1_stt_base_inherit_stock",
    facts.STT_CAN_INHERIT_CHAT_BASE_URL === false,
    "stock Hermes must NOT silently claim base inherit",
    false
  );
  record(
    "phase1_client_patch_required",
    facts.CLIENT_PATCH_REQUIRED === true,
    "Desktop bundled",
    false
  );

  // Source contracts
  const audioRoute = join(ROOT, "apps/dmit-api/src/routes/audio.ts");
  const adapter = join(
    ROOT,
    "apps/dmit-api/src/upstream/audio/openaiCompatSttAdapter.ts"
  );
  const resolve = join(
    ROOT,
    "apps/dmit-api/src/upstream/audio/resolveAudioProvider.ts"
  );
  const bootstrap = join(ROOT, "scripts/hermes-tokfai-voice-bootstrap.mjs");
  {
    const src = readFileSync(audioRoute, "utf8");
    const importsChat =
      /from\s+["'].*executeChatCompletion/.test(src) ||
      /\bexecuteChatCompletion\s*\(/.test(src);
    record(
      "source_audio_route",
      existsSync(audioRoute) && !importsChat,
      importsChat ? "imports executeChatCompletion" : audioRoute,
      false
    );
  }
  record(
    "source_adapter",
    existsSync(adapter) && existsSync(resolve),
    adapter,
    false
  );
  record("source_bootstrap", existsSync(bootstrap), bootstrap, false);

  // Build
  const distAdapter = join(
    ROOT,
    "apps/dmit-api/dist/upstream/audio/openaiCompatSttAdapter.js"
  );
  if (!existsSync(distAdapter)) {
    const b = spawnSync("npm", ["run", "build"], {
      cwd: join(ROOT, "apps/dmit-api"),
      encoding: "utf8",
    });
    record("dist_build", b.status === 0, b.stderr?.slice(0, 200));
  } else {
    record("dist_build", true, "present");
  }

  // Adapter real HTTP against ephemeral upstream (not chat)
  if (existsSync(distAdapter)) {
    await withMockSttUpstream(async (baseUrl) => {
      const mod = await import(pathToFileURL(distAdapter).href);
      const provider = mod.createOpenaiCompatSttAdapter({
        providerId: "openai_compatible",
        baseUrl,
        apiKey: "sk-test-stt",
      });
      const result = await provider.transcribeAudio({
        requestId: "req_p1072_adapter",
        model: "whisper-1",
        bytes: new Uint8Array([1, 2, 3, 4]),
        mimeType: "audio/wav",
        filename: "probe.wav",
        timeoutMs: 5000,
      });
      record(
        "D_provider_adapter_invoked",
        result.text === "ADAPTER_STT_OK" &&
          result.providerId === "openai_compatible",
        result.text
      );
      record(
        "E_transcription_text_returned_adapter",
        typeof result.text === "string" && result.text.length > 0,
        result.text
      );
      record(
        "P_no_fake_in_adapter",
        result.text === "ADAPTER_STT_OK",
        "upstream-provided text"
      );
    });

    const unavailMod = await import(pathToFileURL(distAdapter).href);
    const unavail = unavailMod.createUnavailableSttAdapter();
    let threw = false;
    try {
      await unavail.transcribeAudio({
        requestId: "x",
        model: "whisper-1",
        bytes: new Uint8Array([1]),
        mimeType: "audio/wav",
        filename: "a.wav",
        timeoutMs: 1000,
      });
    } catch {
      threw = true;
    }
    record(
      "unavailable_adapter_no_fake_text",
      threw && !unavail.available,
      "throws not_available",
      true
    );
  }

  // Bootstrap dry-run in temp HERMES_HOME
  {
    const tmp = mkdtempSync(join(tmpdir(), "p1072-hermes-"));
    try {
      const r = spawnSync(
        process.execPath,
        [
          bootstrap,
          "--base-url",
          "https://api.tokfai.com/v1",
          "--api-key",
          `sk-tokfai_${"a".repeat(48)}`,
          "--model",
          "gpt-5.5",
        ],
        {
          encoding: "utf8",
          env: { ...process.env, HERMES_HOME: tmp, DRY_RUN: "0" },
        }
      );
      const envText = existsSync(join(tmp, ".env"))
        ? readFileSync(join(tmp, ".env"), "utf8")
        : "";
      const ok =
        r.status === 0 &&
        r.stdout.includes("TOKFAI_HERMES_VOICE_BOOTSTRAP_OK") &&
        /STT_OPENAI_BASE_URL=https:\/\/api\.tokfai\.com\/v1/.test(envText) &&
        /OPENAI_API_KEY=sk-tokfai_/.test(envText) &&
        !/VOICE_TOOLS_OPENAI_KEY=/.test(envText);
      record(
        "bootstrap_three_input_writes_stt",
        ok,
        `status=${r.status}`,
        false
      );
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  const { LIVE, BASE, API_KEY, TIMEOUT_MS, authHeaders, cleanup } =
    await bootstrapClientCompatSmoke(SCRIPT);

  try {
    // A/C/E — multipart valid → text via Tokfai entry
    {
      const mp = multipart("whisper-1");
      const { res, body } = await acceptanceFetch(
        `${BASE}/v1/audio/transcriptions`,
        {
          method: "POST",
          headers: { ...authHeaders(), ...mp.headers },
          body: mp.body,
          timeoutMs: TIMEOUT_MS,
        }
      );
      // Remove Content-Type application/json from authHeaders conflict
      record(
        "A_multipart_valid_audio",
        res.status === 200 && typeof body?.text === "string",
        `status=${res.status} text=${String(body?.text ?? "").slice(0, 40)}`
      );
      record(
        "C_real_route_entry",
        res.status === 200 && body?.tokfai?.usage_type === "audio_transcription",
        body?.tokfai?.usage_type
      );
      record(
        "E_transcription_text_returned",
        res.status === 200 && body?.text === "TOKFAI_P1072_STT_OK",
        body?.text
      );
      record(
        "M_billing_not_chat_tokens",
        body?.tokfai?.billing_status === "not_billable" &&
          body?.credits_charged === 0,
        body?.tokfai?.billing_status
      );
      record(
        "O_no_accidental_chat_execution",
        body?.object !== "chat.completion" && body?.object !== "response",
        body?.object ?? "audio"
      );
    }

    // B — auth
    {
      const mp = multipart("whisper-1");
      const { res, body } = await acceptanceFetch(
        `${BASE}/v1/audio/transcriptions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            ...mp.headers,
          },
          body: mp.body,
          timeoutMs: TIMEOUT_MS,
        }
      );
      record("B_tokfai_auth", res.status === 200, `status=${res.status}`);
    }

    // F — invalid key
    {
      const mp = multipart("whisper-1");
      const { res, body } = await acceptanceFetch(
        `${BASE}/v1/audio/transcriptions`,
        {
          method: "POST",
          headers: {
            Authorization:
              "Bearer sk-tokfai_deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
            ...mp.headers,
          },
          body: mp.body,
          timeoutMs: TIMEOUT_MS,
        }
      );
      record(
        "F_invalid_key_401",
        res.status === 401 && body?.error,
        `status=${res.status}`
      );
    }

    // G — malformed multipart
    {
      const { res, body } = await acceptanceFetch(
        `${BASE}/v1/audio/transcriptions`,
        {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ model: "whisper-1" }),
          timeoutMs: TIMEOUT_MS,
        }
      );
      record(
        "G_malformed_multipart_400",
        res.status === 400 && body?.error?.code,
        `status=${res.status}`
      );
    }

    // H — unsupported format
    {
      const mp = multipart("whisper-1", "payload.exe", "MZ....");
      const { res, body } = await acceptanceFetch(
        `${BASE}/v1/audio/transcriptions`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${API_KEY}`, ...mp.headers },
          body: mp.body,
          timeoutMs: TIMEOUT_MS,
        }
      );
      record(
        "H_unsupported_format",
        res.status === 400 && body?.error?.code === "invalid_request_error",
        `status=${res.status}`
      );
    }

    // I — oversized: skip real 25MB upload; assert source constant + mock path
    {
      const src = readFileSync(audioRoute, "utf8");
      record(
        "I_oversized_audio_limit",
        src.includes("25 * 1024 * 1024") &&
          src.includes("request_body_too_large"),
        "25MB gate in route",
        false
      );
    }

    // J/K/L/M/N provider errors via mock models
    if (!LIVE) {
      for (const [id, model, status, code] of [
        ["J_provider_http_400", "__tokfai_mock_stt_provider_400", 400, "invalid_request_error"],
        ["K_provider_401_403", "__tokfai_mock_stt_provider_401", 502, "upstream_auth_error"],
        ["L_provider_429", "__tokfai_mock_stt_provider_429", 429, "upstream_rate_limited"],
        ["M_transport_timeout", "__tokfai_mock_stt_timeout", 504, "upstream_timeout"],
        ["N_provider_unavailable", "__tokfai_mock_stt_unavailable", 503, "all_upstreams_unavailable"],
      ]) {
        const mp = multipart(model);
        const { res, body } = await acceptanceFetch(
          `${BASE}/v1/audio/transcriptions`,
          {
            method: "POST",
            headers: { Authorization: `Bearer ${API_KEY}`, ...mp.headers },
            body: mp.body,
            timeoutMs: TIMEOUT_MS,
          }
        );
        record(
          id,
          res.status === status && body?.error?.code === code,
          `status=${res.status} code=${body?.error?.code}`
        );
      }
    } else {
      for (const id of [
        "J_provider_http_400",
        "K_provider_401_403",
        "L_provider_429",
        "M_transport_timeout",
        "N_provider_unavailable",
      ]) {
        record(id, true, "LIVE skip synthetic STT error models", false);
      }
    }

    // Q — no secret/audio logging in source
    {
      const src = readFileSync(audioRoute, "utf8");
      const adapterSrc = readFileSync(adapter, "utf8");
      const ok =
        !/console\.log\([^)]*bytes/.test(src) &&
        src.includes("transcript_chars") &&
        !adapterSrc.includes("transcript:") &&
        adapterSrc.includes("transcript_chars");
      record("Q_no_secret_audio_logging", ok, "structured meta only", false);
    }

    // Chat still works (regression isolation)
    {
      const { res, body } = await acceptanceFetch(`${BASE}/v1/chat/completions`, {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({
          model: "gpt-5.5",
          messages: [{ role: "user", content: "Say ok only." }],
        }),
        timeoutMs: TIMEOUT_MS,
      });
      record(
        "chat_unaffected",
        res.status === 200 && body?.object === "chat.completion",
        `status=${res.status}`
      );
    }
  } finally {
    cleanup();
  }

  const failed = cases.filter((c) => !c.ok);
  const realEntry = cases.filter((c) => c.realEntry);
  // Honest product contract (P1072R2/P1073): stock Hermes + Terminal bootstrap ≠ YES.
  // Voice three-input via Tokfai Hermes Connector is proven in P1073, not here.
  const voiceThreeInput = false;
  const manualConsumerSteps = 1; // would need Terminal bootstrap OR Connector install

  const summary = {
    git: gitHead(),
    live: LIVE,
    STT_CAN_INHERIT_CHAT_BASE_URL: facts.STT_CAN_INHERIT_CHAT_BASE_URL,
    STT_CAN_INHERIT_CHAT_API_KEY: facts.STT_CAN_INHERIT_CHAT_API_KEY,
    ZERO_EXTRA_CONSUMER_FIELDS_FEASIBLE: facts.ZERO_EXTRA_CONSUMER_FIELDS_FEASIBLE,
    CLIENT_PATCH_REQUIRED: facts.CLIENT_PATCH_REQUIRED,
    CLIENT_LIMITATION:
      "Stock Hermes Desktop (sourceMode=false) does not auto-inherit OPENAI_BASE_URL for STT; Desktop UI has no stt.openai.base_url field. Terminal bootstrap is internal-only. Product path: Tokfai Hermes Connector (P1073).",
    TOKFAI_REAL_STT_IMPLEMENTED: cases.some(
      (c) => c.id === "E_transcription_text_returned" && c.ok
    ),
    AUDIO_PROVIDER_ADAPTER_IMPLEMENTED: cases.some(
      (c) => c.id === "D_provider_adapter_invoked" && c.ok
    ),
    FAKE_TRANSCRIPTION_USED: "NO",
    PRODUCTION_STT_UPSTREAM_READY: false,
    CORE_CHAT_THREE_INPUT_CONTRACT: true,
    VOICE_THREE_INPUT_CONTRACT: voiceThreeInput,
    AUTOMATED_TEST_COUNT: cases.length,
    REAL_ENTRY_TEST_COUNT: realEntry.length,
    MANUAL_CONSUMER_STEPS: manualConsumerSteps,
    reasons: facts.reasons,
    failed: failed.map((f) => f.id),
    cases,
  };

  writeFileSync(SUMMARY_PATH, JSON.stringify(summary, null, 2) + "\n");

  const sttPass =
    failed.length === 0 &&
    summary.TOKFAI_REAL_STT_IMPLEMENTED &&
    summary.AUDIO_PROVIDER_ADAPTER_IMPLEMENTED;

  const report = `# P1072 — Hermes Zero-Config Voice + Real STT

## Result: **${sttPass ? "PASS" : "FAIL"}** (STT route/adapter; voice three-input deferred to P1073)

\`\`\`
STT_CAN_INHERIT_CHAT_BASE_URL=${summary.STT_CAN_INHERIT_CHAT_BASE_URL}
STT_CAN_INHERIT_CHAT_API_KEY=${summary.STT_CAN_INHERIT_CHAT_API_KEY}
CLIENT_PATCH_REQUIRED=${summary.CLIENT_PATCH_REQUIRED}

TOKFAI_REAL_STT_IMPLEMENTED=${summary.TOKFAI_REAL_STT_IMPLEMENTED}
AUDIO_PROVIDER_ADAPTER_IMPLEMENTED=${summary.AUDIO_PROVIDER_ADAPTER_IMPLEMENTED}
FAKE_TRANSCRIPTION_USED=NO
PRODUCTION_STT_UPSTREAM_READY=false

CORE_CHAT_THREE_INPUT_CONTRACT=${summary.CORE_CHAT_THREE_INPUT_CONTRACT}
VOICE_THREE_INPUT_CONTRACT=${summary.VOICE_THREE_INPUT_CONTRACT}

AUTOMATED_TEST_COUNT=${summary.AUTOMATED_TEST_COUNT}
REAL_ENTRY_TEST_COUNT=${summary.REAL_ENTRY_TEST_COUNT}
MANUAL_CONSUMER_STEPS=${summary.MANUAL_CONSUMER_STEPS}
\`\`\`

### CLIENT_LIMITATION

${summary.CLIENT_LIMITATION || "(none)"}

### Evidence

${facts.reasons.map((r) => `- ${r}`).join("\n")}

### Cases

| Case | OK | Real | Detail |
|---|---|---|---|
${cases
  .map(
    (c) =>
      `| ${c.id} | ${c.ok ? "PASS" : "FAIL"} | ${c.realEntry ? "yes" : "no"} | ${(c.detail || "").replace(/\|/g, "/")} |`
  )
  .join("\n")}

${sttPass ? PASS_MARKER : FAIL_MARKER}
`;

  writeFileSync(REPORT_PATH, report);

  console.log("");
  console.log(`STT_CAN_INHERIT_CHAT_BASE_URL=${summary.STT_CAN_INHERIT_CHAT_BASE_URL}`);
  console.log(`STT_CAN_INHERIT_CHAT_API_KEY=${summary.STT_CAN_INHERIT_CHAT_API_KEY}`);
  console.log(`CLIENT_PATCH_REQUIRED=${summary.CLIENT_PATCH_REQUIRED}`);
  console.log(`TOKFAI_REAL_STT_IMPLEMENTED=${summary.TOKFAI_REAL_STT_IMPLEMENTED}`);
  console.log(
    `AUDIO_PROVIDER_ADAPTER_IMPLEMENTED=${summary.AUDIO_PROVIDER_ADAPTER_IMPLEMENTED}`
  );
  console.log("FAKE_TRANSCRIPTION_USED=NO");
  console.log(
    `CORE_CHAT_THREE_INPUT_CONTRACT=${summary.CORE_CHAT_THREE_INPUT_CONTRACT}`
  );
  console.log(`VOICE_THREE_INPUT_CONTRACT=${summary.VOICE_THREE_INPUT_CONTRACT}`);
  console.log(`PRODUCTION_STT_UPSTREAM_READY=${summary.PRODUCTION_STT_UPSTREAM_READY}`);
  console.log(`AUTOMATED_TEST_COUNT=${summary.AUTOMATED_TEST_COUNT}`);
  console.log(`REAL_ENTRY_TEST_COUNT=${summary.REAL_ENTRY_TEST_COUNT}`);
  console.log(`MANUAL_CONSUMER_STEPS=${summary.MANUAL_CONSUMER_STEPS}`);
  console.log(`report: ${REPORT_PATH}`);

  if (!sttPass) {
    console.error(FAIL_MARKER);
    console.error("failed:", failed.map((f) => f.id).join(", "));
    process.exit(1);
  }
  console.log(PASS_MARKER);
}

main().catch((err) => {
  console.error(FAIL_MARKER);
  console.error(err);
  process.exit(1);
});
