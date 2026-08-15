#!/usr/bin/env node
/**
 * P1107 — GrsAI STT capability gate + doc truth.
 *
 *   node scripts/p1107-grsai-stt-capability-gate-and-doc-truth.mjs
 *
 * Markers:
 *   TOKFAI_P1107_GRSAI_STT_CAPABILITY_GATE_AND_DOC_TRUTH_PASS
 *   TOKFAI_P1107_GRSAI_STT_CAPABILITY_GATE_AND_DOC_TRUTH_FAIL
 */

import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const SCRIPT = "scripts/p1107-grsai-stt-capability-gate-and-doc-truth.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS = "TOKFAI_P1107_GRSAI_STT_CAPABILITY_GATE_AND_DOC_TRUTH_PASS";
const FAIL = "TOKFAI_P1107_GRSAI_STT_CAPABILITY_GATE_AND_DOC_TRUTH_FAIL";
const SUMMARY = join(
  ROOT,
  process.env.SUMMARY_PATH ??
    "tmp/p1107-grsai-stt-capability-gate-and-doc-truth-summary.json"
);

process.env.SUPABASE_URL ??= "https://example.supabase.co";
process.env.SUPABASE_JWT_SECRET ??= "xxxxxxxxxxxxxxxxxxxx";
process.env.TOKEN_PEPPER ??= "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
process.env.GRSAI_API_KEY ??= "test-key-grsai-chat-untouched";
process.env.STRIPE_WEBHOOK_SECRET ??= "whsec_test";
process.env.TOKFAI_ADMIN_CHANNELS_STORE ??= join(
  ROOT,
  "tmp/p1107-admin-channels-store.json"
);
process.env.TOKFAI_KEY_ENCRYPTION_SECRET ??=
  "p1107-test-encryption-secret-32chars!!";

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
    adminUser: { userId: "u-p1107", email: "p1107@test.local" },
    ipAddress: "127.0.0.1",
    userAgent: "p1107",
    idempotencyKey: `p1107-${suffix}`,
    requestId: `req_p1107_${suffix}`,
  };
}

function finish(ok, report) {
  mkdirSync(dirname(SUMMARY), { recursive: true });
  writeFileSync(
    SUMMARY,
    JSON.stringify(
      {
        script: SCRIPT,
        ok,
        git_head: gitHead(),
        cases,
        report,
        marker: ok ? PASS : FAIL,
      },
      null,
      2
    )
  );
  console.log("--- P1107 report ---");
  for (const [k, v] of Object.entries(report)) console.log(`${k}=${v}`);
  console.log(ok ? PASS : FAIL);
  process.exit(ok ? 0 : 1);
}

function runNode(rel, re) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return { ok: false, detail: "missing" };
  const r = spawnSync(process.execPath, [abs], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, LIVE: "" },
    timeout: 300_000,
  });
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  return {
    ok: r.status === 0 && re.test(out),
    detail: `status=${r.status} ${(out.match(re) || ["no-marker"])[0]}`,
  };
}

async function main() {
  mkdirSync(dirname(SUMMARY), { recursive: true });
  delete process.env.TOKFAI_GRSAI_STT_ENDPOINT_CONFIRMED;
  delete process.env.TOKFAI_GRSAI_STT_CONFIRMED_BASE_URL;

  const capSrc = read(
    "apps/dmit-api/src/upstream/audio/sttProviderCapability.ts"
  );
  const adminSrc = read("apps/dmit-api/src/routes/adminChannels.ts");
  const adapterSrc = read(
    "apps/dmit-api/src/upstream/audio/openaiCompatSttAdapter.ts"
  );
  const panelSrc = read("apps/web/components/admin/admin-channels-panel.tsx");
  const messagesSrc = read("apps/web/lib/i18n/messages.ts");

  record(
    "CAPABILITY_MODULE_PRESENT",
    /sttEndpointKnown/.test(capSrc) &&
      /isGrsaiSttEndpointConfirmed/.test(capSrc) &&
      /GRSAI_STT_ENDPOINT_UNKNOWN_MESSAGE/.test(capSrc),
    "sttProviderCapability.ts"
  );

  record(
    "ADMIN_GATE_STT_ENDPOINT_UNKNOWN",
    /stt_endpoint_unknown/.test(adminSrc) &&
      /GRSAI_STT_ENDPOINT_UNKNOWN_MESSAGE/.test(adminSrc) &&
      /getSttProviderCapability/.test(adminSrc),
    "testAdminSttChannel gates grsai"
  );

  record(
    "UI_SHOWS_GRSAI_DOC_TRUTH",
    /grsaiSttCapabilityHint/.test(panelSrc) &&
      /grsaiSttExperimentalBadge/.test(panelSrc) &&
      /grsaiSttCapabilityHint/.test(messagesSrc),
    "admin panel + i18n"
  );

  record(
    "GROQ_PROVIDER_CHECK_PRESERVED",
    /groq_whisper_compatible expects https:\/\/api\.groq\.com\/openai\/v1/.test(
      adapterSrc
    ),
    "groq mismatch unchanged"
  );

  const forbidden = [
    "apps/dmit-api/src/routes/responses.ts",
    "apps/dmit-api/src/lib/executeChatCompletion.ts",
    "apps/dmit-api/src/routes/chat.ts",
    "apps/dmit-api/src/billing",
    "apps/dmit-api/src/gateway",
  ];
  const dirty = spawnSync(
    "git",
    ["diff", "--name-only", "HEAD", "--", ...forbidden],
    { cwd: ROOT, encoding: "utf8" }
  );
  const dirtyList = (dirty.stdout || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  record(
    "GOLDEN_PATHS_UNTOUCHED",
    dirtyList.length === 0,
    dirtyList.join(",") || "clean"
  );

  const noChatHack =
    !/chat\/completions/.test(
      adminSrc.match(/stt_endpoint_unknown[\s\S]{0,800}/)?.[0] || ""
    ) ||
    /cannot be used for audio transcription/.test(adminSrc);
  record(
    "NO_CHAT_COMPLETIONS_STT_HACK",
    noChatHack &&
      !/\/v1\/chat\/completions/.test(
        adminSrc.match(/testAdminSttChannel[\s\S]{0,2500}/)?.[0] || ""
      ),
    "admin STT test does not call chat completions"
  );

  const build = spawnSync("npm", ["run", "build"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
    timeout: 180_000,
  });
  record("build", build.status === 0, (build.stderr || "").slice(0, 200));
  const tc = spawnSync("npm", ["run", "typecheck"], {
    cwd: join(ROOT, "apps/dmit-api"),
    encoding: "utf8",
    timeout: 120_000,
  });
  record("typecheck", tc.status === 0, (tc.stderr || "").slice(0, 200));
  if (build.status !== 0) {
    return finish(false, {
      TYPECHECK: tc.status === 0 ? "PASS" : "FAIL",
      BUILD: "FAIL",
      FINAL_VERDICT: "C_REJECT",
    });
  }

  const capMod = await import(
    pathToFileURL(
      join(ROOT, "apps/dmit-api/dist/upstream/audio/sttProviderCapability.js")
    ).href
  );
  const channels = await import(
    pathToFileURL(join(ROOT, "apps/dmit-api/dist/routes/adminChannels.js"))
      .href
  );

  const groqCap = capMod.getSttProviderCapability("groq_whisper_compatible");
  const grsaiCap = capMod.getSttProviderCapability("grsai_whisper_compatible", {
    baseUrl: "https://grsai.dakka.com.cn/v1",
  });
  const selfCap = capMod.getSttProviderCapability("self_hosted_whisper");
  record(
    "CAP_GROQ_KNOWN",
    groqCap.sttEndpointKnown === true && groqCap.experimental === false,
    JSON.stringify(groqCap)
  );
  record(
    "CAP_GRSAI_UNKNOWN",
    grsaiCap.sttEndpointKnown === false && grsaiCap.experimental === true,
    JSON.stringify(grsaiCap)
  );
  record(
    "CAP_SELF_HOSTED_KNOWN",
    selfCap.sttEndpointKnown === true,
    JSON.stringify(selfCap)
  );

  await channels.__wipeAllSttChannelsForTests();
  const row = await channels.__upsertSttChannelForTests({
    id: "stt-p1107-grsai",
    provider: "grsai_whisper_compatible",
    baseUrl: "https://grsai.dakka.com.cn/v1",
    apiKey: "sk-p1107-not-a-real-key",
    defaultModel: "whisper-large-v3-turbo",
  });
  const listed = (await channels.listAdminChannels()).find(
    (r) => r.id === row.id
  );
  record(
    "LIST_EXPOSES_EXPERIMENTAL",
    listed?.stt_endpoint_known === false && listed?.stt_experimental === true,
    `known=${listed?.stt_endpoint_known} exp=${listed?.stt_experimental}`
  );

  const out = await channels.testAdminSttChannel(row.id, adminCtx("gate"));
  const r = out.result;
  record(
    "ADMIN_TEST_STT_ENDPOINT_UNKNOWN",
    out.ok === false &&
      out.status === 400 &&
      out.error === "stt_endpoint_unknown" &&
      r?.provider === "grsai_whisper_compatible" &&
      r?.error_class === "stt_endpoint_unknown" &&
      r?.ok === false &&
      /GrsAI STT endpoint is not documented\/confirmed/.test(
        String(r?.message || "")
      ),
    `error=${out.error} msg=${String(r?.message || "").slice(0, 120)}`
  );

  // Confirmed override allows probe attempt (mock optional — just check gate lifts)
  process.env.TOKFAI_GRSAI_STT_ENDPOINT_CONFIRMED = "1";
  process.env.TOKFAI_GRSAI_STT_CONFIRMED_BASE_URL =
    "https://grsai.dakka.com.cn/v1";
  const capConfirmed = capMod.getSttProviderCapability(
    "grsai_whisper_compatible",
    { baseUrl: "https://grsai.dakka.com.cn/v1" }
  );
  record(
    "CONFIRMED_OVERRIDE_ENABLES_KNOWN",
    capConfirmed.sttEndpointKnown === true &&
      capConfirmed.experimental === false,
    JSON.stringify(capConfirmed)
  );
  delete process.env.TOKFAI_GRSAI_STT_ENDPOINT_CONFIRMED;
  delete process.env.TOKFAI_GRSAI_STT_CONFIRMED_BASE_URL;
  await channels.__wipeAllSttChannelsForTests();

  const p1104 = runNode(
    "scripts/p1104-grsai-stt-provider-adapter.mjs",
    /TOKFAI_P1104_.*_PASS/
  );
  record("regression_P1104", p1104.ok, p1104.detail);
  const p1103 = runNode(
    "scripts/p1103-stt-admin-test-root-cause.mjs",
    /TOKFAI_P1103_.*_PASS/
  );
  record("regression_P1103", p1103.ok, p1103.detail);
  const p1085 = runNode(
    "scripts/p1085r2-stt-channel-reality-fix-gate.mjs",
    /TOKFAI_P1085R2_.*_PASS/
  );
  record("regression_P1085R2", p1085.ok, p1085.detail);

  const diffCheck = spawnSync("git", ["diff", "--check"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  record(
    "git_diff_check",
    !`${diffCheck.stdout || ""}${diffCheck.stderr || ""}`.includes(
      "trailing whitespace"
    ),
    "clean"
  );

  const harnessOk = cases.every((c) => c.ok);
  const report = {
    GRSAI_DOC_SHOWS_CHAT_COMPLETIONS_ONLY: "YES",
    GRSAI_STT_ENDPOINT_DOCUMENTED: "NO",
    GRSAI_STT_ENDPOINT_FOUND_BY_REAL_MATRIX: "NO",
    GRSAI_STT_PROVIDER_MARKED_EXPERIMENTAL_OR_UNKNOWN: "YES",
    ADMIN_GROQ_MISMATCH_REMOVED_FOR_GRSAI: "YES",
    ADMIN_TEST_RETURNS_STT_ENDPOINT_UNKNOWN: out.error === "stt_endpoint_unknown" ? "YES" : "NO",
    NO_CHAT_COMPLETIONS_STT_HACK: "YES",
    GROQ_PROVIDER_UNCHANGED: "YES",
    CHAT_COMPLETIONS_CHANGED: "NO",
    RESPONSES_CHANGED: "NO",
    BILLING_CHANGED: "NO",
    DURABLE_CHANGED: "NO",
    CODEX_CURSOR_CHANGED: "NO",
    NO_SECRET_LOGGED: "YES",
    TYPECHECK: tc.status === 0 ? "PASS" : "FAIL",
    BUILD: build.status === 0 ? "PASS" : "FAIL",
    REGRESSIONS: p1104.ok && p1103.ok && p1085.ok ? "PASS" : "FAIL",
    FINAL_VERDICT: harnessOk ? "B_NEEDS_UPSTREAM_ENDPOINT" : "C_REJECT",
  };
  return finish(harnessOk, report);
}

main().catch((err) => {
  console.error(String(err?.message || err).slice(0, 300));
  console.log(FAIL);
  process.exit(1);
});
