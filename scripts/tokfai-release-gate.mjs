#!/usr/bin/env node
/**
 * Tokfai release gate — sole pre-release acceptance orchestrator.
 *
 * Does NOT fix product code. Only runs typecheck/build + LIVE smokes +
 * public-beta-ready-all, asserts PASS markers, and greps recent error logs.
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/tokfai-release-gate.mjs
 *   cd apps/dmit-api && TOKFAI_API_KEY=... npm run release-gate
 *
 * Optional:
 *   TOKFAI_PM2_APP=dmit-api   limit pm2 log grep to one process
 *
 * Notes:
 *   p941 core hard gate must emit TOKFAI_P941_API_ISOLATION_CORE_PASS.
 *   Soft models (gemini-3-pro / gemini-2.5-pro) may report DEGRADED on
 *   live upstream timeout without failing the gate; charged timeout still fails.
 *   p942 HTTP probes are mock-gateway contracts (cdn.tokfai.com/demo.png,
 *   example.com/*). LIVE=1 against api.tokfai.com cannot satisfy them.
 *   The gate still sets LIVE=1 for p942, but pins TOKFAI_API_BASE + key to
 *   the local mock started for that step only.
 */

import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const DMIT = join(ROOT, "apps/dmit-api");
const API_KEY = (process.env.TOKFAI_API_KEY ?? "").trim();
const PM2_APP = (process.env.TOKFAI_PM2_APP ?? "").trim();

const PASS_MARKERS = [
  "TOKFAI_P932_CHERRY_STUDIO_REAL_BODY_PASS",
  "TOKFAI_P933_CHERRY_STUDIO_COMPAT_MATRIX_PASS",
  "TOKFAI_P941_API_ISOLATION_CORE_PASS",
  "TOKFAI_P942_VISION_ANALYZE_PASS",
  "TOKFAI_P946_GEMINI_25_FLASH_NONSTREAM_PASS",
  "TOKFAI_PUBLIC_BETA_READY_ALL_PASS",
];

/** Forbidden substrings in step stdout/stderr (requirement #6). */
const STEP_FORBIDDEN = [
  "empty body",
  "api_error_500",
  "charged timeout",
  "message=undefined",
  "code=undefined",
  "message: undefined",
  "code: undefined",
];

/** Forbidden patterns in recent error logs (requirement #7). */
const LOG_FORBIDDEN = [
  "api_error_500",
  "charged timeout",
  "message=undefined",
  "code=undefined",
  "empty body",
  "Cannot set headers after they are sent",
];

const STEPS = [
  {
    id: "typecheck",
    label: "1. npm run typecheck (apps/dmit-api)",
    cwd: DMIT,
    cmd: "npm",
    args: ["run", "typecheck"],
    marker: null,
  },
  {
    id: "build",
    label: "2. npm run build (apps/dmit-api)",
    cwd: DMIT,
    cmd: "npm",
    args: ["run", "build"],
    marker: null,
  },
  {
    id: "p932",
    label: "3. LIVE p932 cherry real-body",
    cwd: ROOT,
    cmd: "node",
    args: ["scripts/p932-cherry-studio-real-body-smoke.mjs"],
    marker: "TOKFAI_P932_CHERRY_STUDIO_REAL_BODY_PASS",
    live: true,
  },
  {
    id: "p933",
    label: "4. LIVE p933 cherry compat matrix",
    cwd: ROOT,
    cmd: "node",
    args: ["scripts/p933-cherry-studio-compat-matrix-smoke.mjs"],
    marker: "TOKFAI_P933_CHERRY_STUDIO_COMPAT_MATRIX_PASS",
    live: true,
  },
  {
    id: "p941",
    label: "5. LIVE p941 api isolation (core hard gate)",
    cwd: ROOT,
    cmd: "node",
    args: ["scripts/p941-api-isolation-smoke.mjs"],
    marker: "TOKFAI_P941_API_ISOLATION_CORE_PASS",
    live: true,
  },
  {
    id: "p942",
    label: "6. LIVE p942 vision analyze (mock base — offline HTTP contract)",
    cwd: ROOT,
    cmd: "node",
    args: ["scripts/p942-vision-analyze-smoke.mjs"],
    marker: "TOKFAI_P942_VISION_ANALYZE_PASS",
    live: true,
    /** p942 mock URL contract cannot pass against production. */
    liveViaMock: true,
  },
  {
    id: "p946",
    label: "7. LIVE p946 gemini-2.5-flash non-stream (30x)",
    cwd: ROOT,
    cmd: "node",
    args: ["scripts/p946-gemini-25-flash-nonstream-smoke.mjs"],
    marker: "TOKFAI_P946_GEMINI_25_FLASH_NONSTREAM_PASS",
    live: true,
  },
  {
    id: "public-beta-ready-all",
    label: "8. public-beta-ready-all",
    cwd: ROOT,
    cmd: "node",
    args: ["scripts/public-beta-ready-all.mjs"],
    marker: "TOKFAI_PUBLIC_BETA_READY_ALL_PASS",
  },
];

function maskKey(key) {
  if (!key || key.length <= 12) return "(not set)";
  return `${key.slice(0, 12)}…${key.slice(-4)} (len=${key.length})`;
}

function runCapture(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    encoding: "utf8",
    env: { ...process.env, ...(opts.env ?? {}) },
    maxBuffer: 32 * 1024 * 1024,
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  return {
    status: result.error ? 1 : (result.status ?? 1),
    stdout,
    stderr,
    combined: `${stdout}\n${stderr}`,
    error: result.error,
  };
}

function printSection(title) {
  console.log(`\n════════ ${title} ════════`);
}

/**
 * Scan step output for forbidden failure phrases.
 * Skip PASS assertion lines — suites often document "empty body" retries as PASS.
 */
function findForbidden(text, needles) {
  const lines = String(text ?? "").split(/\r?\n/);
  const hits = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    // Ignore successful assertion lines (e.g. "PASS … retries empty body").
    if (/^PASS\b/i.test(trimmed)) continue;
    if (/\bPASS\b/.test(trimmed) && !/\bFAIL\b/i.test(trimmed)) continue;
    for (const needle of needles) {
      if (trimmed.includes(needle)) {
        hits.push({
          needle,
          snippet: trimmed.slice(0, 200),
        });
        break;
      }
    }
    if (hits.length >= 20) break;
  }
  return hits;
}

function grepLogLines(text, needles) {
  const lines = String(text ?? "").split(/\r?\n/);
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (const needle of needles) {
      if (line.includes(needle)) {
        hits.push(`L${i + 1}: ${line.slice(0, 240)}`);
        break;
      }
    }
    if (hits.length >= 40) break;
  }
  return hits;
}

function git(args) {
  return runCapture("git", args, { cwd: ROOT });
}

function collectGitMeta() {
  const hash = git(["rev-parse", "HEAD"]).stdout.trim() || "(unknown)";
  const short = git(["rev-parse", "--short", "HEAD"]).stdout.trim() || "(unknown)";
  const status = git(["status", "--short"]).stdout.trim();
  const changed =
    status ||
    git(["diff", "--name-only", "HEAD~1...HEAD"]).stdout.trim() ||
    "(no changed files detected)";
  return { hash, short, changed };
}

function collectPm2() {
  const which = runCapture("bash", ["-lc", "command -v pm2 || true"]);
  if (!which.stdout.trim()) {
    return {
      available: false,
      statusText: "pm2: not installed / not in PATH",
      logsText: "",
    };
  }
  const status = runCapture("pm2", ["status"]);
  const logArgs = PM2_APP
    ? ["logs", PM2_APP, "--lines", "800", "--nostream", "--err", "--raw"]
    : ["logs", "--lines", "800", "--nostream", "--err", "--raw"];
  const logs = runCapture("pm2", logArgs);
  return {
    available: true,
    statusText: status.combined.trim() || "(empty pm2 status)",
    logsText: logs.combined,
  };
}

function failGate(reason, extra = {}) {
  console.error(`\nRELEASE GATE STOPPED: ${reason}`);
  if (extra.detail) console.error(extra.detail);
  printFinalReport({
    meta: extra.meta ?? collectGitMeta(),
    results: extra.results ?? [],
    allOk: false,
    pm2: extra.pm2 ?? collectPm2(),
    logHits: extra.logHits ?? [],
  });
  console.log("TOKFAI_RELEASE_GATE_FAIL");
  process.exit(1);
}

function printFinalReport({ meta, results, allOk, pm2, logHits = [] }) {
  console.log("\n════════════════════════════════════════");
  console.log("RELEASE GATE REPORT");
  console.log("════════════════════════════════════════");
  console.log(`git_commit: ${meta.hash}`);
  console.log(`git_short:  ${meta.short}`);
  console.log("changed_files:");
  console.log(meta.changed || "(none)");
  console.log("");
  console.log("PASS results:");
  for (const marker of PASS_MARKERS) {
    const row = results.find((r) => r.marker === marker);
    if (!row) {
      console.log(`  FAIL  ${marker} — not reached`);
      continue;
    }
    console.log(
      `  ${row.ok ? "PASS" : "FAIL"}  ${marker}${
        !row.ok && row.detail ? ` — ${row.detail}` : ""
      }`
    );
  }
  console.log("");
  console.log("Other steps:");
  for (const row of results) {
    if (row.marker) continue;
    console.log(`  ${row.ok ? "PASS" : "FAIL"}  ${row.id} — ${row.detail}`);
  }
  console.log("");
  console.log("pm2 status:");
  console.log(pm2.statusText);
  console.log("");
  console.log("error log grep (last ~800 lines):");
  if (!pm2.available) {
    console.log("  (pm2 unavailable — could not read process logs)");
  } else if (!logHits.length) {
    console.log(
      "  (no matches for api_error_500 / charged timeout / message=undefined / code=undefined / empty body / Cannot set headers after they are sent)"
    );
  } else {
    for (const hit of logHits.slice(0, 30)) console.log(`  ${hit}`);
  }
  console.log("");
  if (allOk) {
    console.log("TOKFAI_RELEASE_GATE_PASS");
  }
}

async function main() {
  console.log("=== Tokfai RELEASE GATE ===");
  console.log(`api_key: ${maskKey(API_KEY)}`);
  console.log(`cwd: ${ROOT}`);
  console.log(
    "Rule: typecheck/build alone ≠ done; pm2 online alone ≠ available."
  );

  const meta = collectGitMeta();
  const results = [];

  if (!API_KEY.startsWith("sk-tokfai_")) {
    failGate("TOKFAI_API_KEY missing or invalid (need sk-tokfai_...)", {
      meta,
      results: [
        {
          id: "api-key",
          ok: false,
          detail: "TOKFAI_API_KEY required before any gate step",
        },
      ],
    });
  }

  for (const step of STEPS) {
    printSection(step.label);

    const env = {};
    let mockChild = null;

    if (step.liveViaMock) {
      // LIVE=1 required by gate contract; pin base+key to local mock so the
      // offline vision URL contract can actually PASS (prod has no mock routes).
      try {
        const mock = await ensureMockGateway();
        mockChild = mock.child ?? null;
        env.LIVE = "1";
        env.TOKFAI_API_KEY = mock.apiKey;
        env.TOKFAI_API_BASE = mock.baseUrl;
        console.log(
          `p942 LIVE via mock: ${mock.baseUrl} (prod cannot satisfy mock URL probes)`
        );
      } catch (err) {
        results.push({
          id: step.id,
          marker: step.marker,
          ok: false,
          detail: `mock gateway failed: ${err?.message ?? err}`,
        });
        failGate(`step "${step.id}" could not start mock gateway`, {
          meta,
          results,
        });
      }
    } else if (step.live) {
      env.LIVE = "1";
      env.TOKFAI_API_KEY = API_KEY;
    } else if (step.id === "public-beta-ready-all") {
      env.TOKFAI_API_KEY = API_KEY;
      // Offline suite scripts honor LIVE=1; prior live steps / parent shell must
      // not force them onto the real API (rate-limit 429 after P946).
      // Live probes inside public-beta-ready-all key off TOKFAI_API_KEY only.
      env.LIVE = "0";
    }

    let r;
    try {
      r = runCapture(step.cmd, step.args, {
        cwd: step.cwd,
        env,
      });
    } finally {
      if (mockChild) {
        try {
          mockChild.kill();
        } catch {
          // ignore
        }
      }
    }

    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    if (r.error) {
      console.error(`spawn error: ${r.error.message}`);
    }

    if (r.status !== 0) {
      results.push({
        id: step.id,
        marker: step.marker,
        ok: false,
        detail: `exit=${r.status}`,
      });
      failGate(`step "${step.id}" exited ${r.status}`, { meta, results });
    }

    if (step.marker) {
      if (!r.combined.includes(step.marker)) {
        results.push({
          id: step.id,
          marker: step.marker,
          ok: false,
          detail: `MISSING marker ${step.marker}`,
        });
        failGate(
          `step "${step.id}" missing PASS marker: ${step.marker}`,
          { meta, results }
        );
      }
    }

    const forbidden = findForbidden(r.combined, STEP_FORBIDDEN);
    if (forbidden.length) {
      results.push({
        id: step.id,
        marker: step.marker,
        ok: false,
        detail: `forbidden output: ${forbidden[0].needle} — ${forbidden[0].snippet}`,
      });
      failGate(
        `step "${step.id}" emitted forbidden pattern: ${forbidden[0].needle}`,
        { meta, results }
      );
    }

    results.push({
      id: step.id,
      marker: step.marker,
      ok: true,
      detail: step.marker ? "PASS" : "exit=0",
    });
  }

  printSection("pm2 error-log grep (last ~800 lines)");
  const pm2 = collectPm2();
  console.log(pm2.statusText);
  const logHits = grepLogLines(pm2.logsText, LOG_FORBIDDEN);
  if (logHits.length) {
    results.push({
      id: "pm2-log-grep",
      ok: false,
      detail: `${logHits.length} forbidden hit(s); first: ${logHits[0]}`,
    });
    failGate("recent error logs contain forbidden patterns", {
      meta,
      results,
      pm2,
      logHits,
    });
  }
  results.push({
    id: "pm2-log-grep",
    ok: true,
    detail: pm2.available
      ? "PASS (no forbidden patterns)"
      : "SKIP (pm2 unavailable)",
  });

  for (const marker of PASS_MARKERS) {
    const row = results.find((r) => r.marker === marker);
    if (!row?.ok) {
      failGate(`required PASS marker not green: ${marker}`, {
        meta,
        results,
        pm2,
        logHits,
      });
    }
  }

  printFinalReport({ meta, results, allOk: true, pm2, logHits });
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  console.log("TOKFAI_RELEASE_GATE_FAIL");
  process.exit(1);
});
