#!/usr/bin/env node
/**
 * Internal operator offline acceptance — not customer documentation.
 *
 * P791 — capacity model docs, UI links, and mock load gate.
 *
 * Usage:
 *   node scripts/p791-capacity-acceptance.mjs
 */

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { run500OnlineMockLoad } from "./p791-500-online-mock-load.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p791-capacity-results");
const ACCEPTANCE_FILE = join(RESULTS_DIR, "acceptance.json");

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

async function main() {
  if (process.env.LIVE === "1") {
    console.error("P791 capacity acceptance is offline-only — unset LIVE=1");
    process.exit(1);
  }

  console.log("=== P791 capacity acceptance ===");

  const report = {
    suite: "p791-capacity-acceptance",
    timestamp: new Date().toISOString(),
    pass: true,
    checks: [],
  };

  const staticChecks = [
    {
      label: "docs chapter capacity-and-rate-limits",
      file: "apps/web/lib/docs/customer-docs-content.ts",
      pattern: /id:\s*"capacity-and-rate-limits"/,
    },
    {
      label: "customer capacity model",
      file: "apps/web/lib/customer-capacity-model.ts",
      pattern: /ONLINE_USERS_TARGET\s*=\s*500/,
    },
    {
      label: "api keys capacity link",
      file: "apps/web/app/dashboard/api-keys/api-keys-client.tsx",
      pattern: /capacity-and-rate-limits/,
    },
    {
      label: "models capacity link",
      file: "apps/web/app/dashboard/models/models-client.tsx",
      pattern: /capacity-and-rate-limits/,
    },
    {
      label: "workbench readiness panel",
      file: "apps/web/components/integration-workbench-panel.tsx",
      pattern: /CapacityReadinessPanel/,
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

  const loadReport = await run500OnlineMockLoad({
    virtualUsers: parseInt(process.env.VIRTUAL_USERS ?? "500", 10),
    durationSeconds: parseInt(process.env.DURATION_SECONDS ?? "30", 10),
    errorRateThreshold: parseFloat(process.env.ERROR_RATE_THRESHOLD ?? "0.05"),
  });

  report.load = loadReport;
  report.checks.push({
    pass: loadReport.pass,
    label: "500 virtual users mock load",
  });

  if (!loadReport.pass) {
    report.pass = false;
    console.log("[FAIL] mock load gate");
  } else {
    console.log("[PASS] mock load gate");
  }

  const controlled429503 =
    loadReport.status_counts[429] + loadReport.status_counts[503] > 0 ||
    loadReport.error_rate <= loadReport.error_rate_threshold;
  report.checks.push({
    pass: controlled429503,
    label: "429/503 treated as controlled or low error rate",
  });
  if (!controlled429503) {
    report.pass = false;
    console.log("[FAIL] controlled response check");
  } else {
    console.log("[PASS] controlled response check");
  }

  const requestIdOk =
    loadReport.api_request_id_coverage >= 0.99 || loadReport.api_success_count === 0;
  report.checks.push({ pass: requestIdOk, label: "request_id on successes" });
  if (!requestIdOk) {
    report.pass = false;
    console.log("[FAIL] request_id coverage");
  } else {
    console.log("[PASS] request_id coverage");
  }

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(ACCEPTANCE_FILE, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\nP791 capacity acceptance: ${report.pass ? "PASS" : "FAIL"}`);
  console.log(`results: ${ACCEPTANCE_FILE}`);
  process.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
