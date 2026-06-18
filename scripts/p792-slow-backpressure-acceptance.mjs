#!/usr/bin/env node
/**
 * Internal operator offline acceptance — not customer documentation.
 *
 * P792 — slow upstream backpressure acceptance gate.
 *
 * Usage:
 *   node scripts/p792-slow-backpressure-acceptance.mjs
 */

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { run500OnlineSlowLoad } from "./p792-500-online-slow-load.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p792-slow-load-results");
const ACCEPTANCE_FILE = join(RESULTS_DIR, "acceptance.json");
const LATEST_FILE = join(RESULTS_DIR, "latest.json");
const GREP_SCRIPT = join(ROOT, "scripts/p778-docs-customer-visible-grep.mjs");

function read(path) {
  return readFileSync(path, "utf8");
}

function assertContains(file, pattern, label) {
  const text = read(join(ROOT, file));
  if (!pattern.test(text)) {
    return { pass: false, label, file };
  }
  return { pass: true, label, file };
}

async function runCustomerGrep() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [GREP_SCRIPT], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("close", (code) => {
      resolve({
        pass: code === 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      });
    });
  });
}

async function main() {
  if (process.env.LIVE === "1") {
    console.error("P792 slow backpressure acceptance is offline-only — unset LIVE=1");
    process.exit(1);
  }

  console.log("=== P792 slow backpressure acceptance ===");

  const report = {
    suite: "p792-slow-backpressure-acceptance",
    timestamp: new Date().toISOString(),
    pass: true,
    checks: [],
  };

  const staticChecks = [
    {
      label: "slow upstream mock script",
      file: "scripts/p792-slow-upstream-mock.mjs",
      pattern: /startSlowUpstreamMockGateway/,
    },
    {
      label: "slow load script",
      file: "scripts/p792-500-online-slow-load.mjs",
      pattern: /run500OnlineSlowLoad/,
    },
    {
      label: "docs slow upstream section",
      file: "apps/web/lib/docs/customer-docs-content.ts",
      pattern: /integration\.capacity\.slowUpstreamBody/,
    },
    {
      label: "workbench slow upstream card",
      file: "apps/web/components/integration-workbench-panel.tsx",
      pattern: /slowUpstreamTitle/,
    },
    {
      label: "api keys online guide link",
      file: "apps/web/app/dashboard/api-keys/api-keys-client.tsx",
      pattern: /online500Guide/,
    },
    {
      label: "models high traffic batch link",
      file: "apps/web/app/dashboard/models/models-client.tsx",
      pattern: /highTrafficBatchNote/,
    },
  ];

  for (const check of staticChecks) {
    const result = assertContains(check.file, check.pattern, check.label);
    report.checks.push(result);
    if (!result.pass) {
      report.pass = false;
      console.log(`[FAIL] ${check.label}`);
    } else {
      console.log(`[PASS] ${check.label}`);
    }
  }

  const loadReport = await run500OnlineSlowLoad({
    virtualUsers: parseInt(process.env.VIRTUAL_USERS ?? "500", 10),
    durationSeconds: parseInt(process.env.DURATION_SECONDS ?? "60", 10),
    rampUpSeconds: parseInt(process.env.RAMP_UP_SECONDS ?? "20", 10),
  });

  report.load = loadReport;
  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(LATEST_FILE, `${JSON.stringify(loadReport, null, 2)}\n`);

  const loadPass = loadReport.pass;
  report.checks.push({ pass: loadPass, label: "500 virtual users slow load" });
  if (!loadPass) {
    report.pass = false;
    console.log("[FAIL] slow load gate");
  } else {
    console.log("[PASS] slow load gate");
  }

  const requestIdOk =
    loadReport.api_request_id_coverage >= 0.99 || loadReport.api_success_count === 0;
  report.checks.push({ pass: requestIdOk, label: "request_id on api successes" });
  if (!requestIdOk) {
    report.pass = false;
    console.log("[FAIL] request_id coverage");
  } else {
    console.log("[PASS] request_id coverage");
  }

  const controlledPresent =
    loadReport.status_counts[429] +
      loadReport.status_counts[503] +
      loadReport.status_counts[504] >
      0 ||
    loadReport.controlled_error_count > 0;
  report.checks.push({
    pass: controlledPresent,
    label: "429/503/504 controlled errors observed",
  });
  if (!controlledPresent) {
    report.pass = false;
    console.log("[FAIL] controlled error presence");
  } else {
    console.log("[PASS] controlled error presence");
  }

  const memoryOk = loadReport.memory_mb.heap_growth <= loadReport.memory_mb.heap_growth_limit;
  report.checks.push({ pass: memoryOk, label: "memory growth within limit" });
  if (!memoryOk) {
    report.pass = false;
    console.log("[FAIL] memory growth");
  } else {
    console.log("[PASS] memory growth");
  }

  const uncontrolledOk = loadReport.uncontrolled_error_count === 0;
  report.checks.push({ pass: uncontrolledOk, label: "no uncontrolled errors" });
  if (!uncontrolledOk) {
    report.pass = false;
    console.log("[FAIL] uncontrolled errors");
  } else {
    console.log("[PASS] uncontrolled errors");
  }

  const slowLatencyOk = loadReport.latency_ms.p95 >= 500;
  report.checks.push({
    pass: slowLatencyOk,
    label: "p95 latency reflects slow upstream (>= 500ms)",
  });
  if (!slowLatencyOk) {
    report.pass = false;
    console.log("[FAIL] slow upstream latency signal");
  } else {
    console.log("[PASS] slow upstream latency signal");
  }

  const grepResult = await runCustomerGrep();
  report.checks.push({
    pass: grepResult.pass,
    label: "customer-visible grep",
    detail: grepResult.stdout || grepResult.stderr,
  });
  if (!grepResult.pass) {
    report.pass = false;
    console.log("[FAIL] customer-visible grep");
    if (grepResult.stderr) console.error(grepResult.stderr);
  } else {
    console.log(`[PASS] customer-visible grep — ${grepResult.stdout}`);
  }

  await writeFile(ACCEPTANCE_FILE, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\nP792 slow backpressure acceptance: ${report.pass ? "PASS" : "FAIL"}`);
  console.log(`results: ${ACCEPTANCE_FILE}`);
  process.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
