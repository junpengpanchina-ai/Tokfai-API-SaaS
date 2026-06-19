#!/usr/bin/env node
/**
 * Internal operator offline acceptance — not customer documentation.
 *
 * P797 — customer integration plan handoff pack gate.
 */

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCustomerIntegrationPlan } from "./p797-plan-logic.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p797-integration-plan-results");
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
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("close", (code) => {
      resolve({ pass: code === 0, stdout: stdout.trim() });
    });
  });
}

const base = {
  hasImages: false,
  needsBatch: false,
  latencyPreference: "balanced",
  volumePreference: "medium",
};

async function main() {
  const hospital = buildCustomerIntegrationPlan({
    ...base,
    industry: "hospital",
    onlineUsers: 500,
    trafficShape: "mixed",
  });
  const auto = buildCustomerIntegrationPlan({
    ...base,
    industry: "auto",
    onlineUsers: 500,
    trafficShape: "mixed",
    hasImages: true,
  });
  const ecommerce = buildCustomerIntegrationPlan({
    ...base,
    industry: "ecommerce",
    onlineUsers: 1000,
    trafficShape: "batch",
    needsBatch: true,
    volumePreference: "large",
  });
  const support = buildCustomerIntegrationPlan({
    ...base,
    industry: "support",
    onlineUsers: 300,
    trafficShape: "chat",
  });
  const general = buildCustomerIntegrationPlan({
    ...base,
    industry: "general",
    onlineUsers: 100,
    trafficShape: "mixed",
  });

  const copyFile = read(join(ROOT, "apps/web/lib/customer-integration-plan-copy.ts"));
  const apiKeys = read(join(ROOT, "apps/web/app/dashboard/api-keys/api-keys-client.tsx"));
  const workbench = read(join(ROOT, "apps/web/components/integration-workbench-panel.tsx"));
  const handoff = read(join(ROOT, "apps/web/components/integration-handoff-panel.tsx"));

  const checks = [
    assertContains("apps/web/lib/customer-integration-plan.ts", /buildCustomerIntegrationPlan/, "integration plan module"),
    assertContains("apps/web/lib/customer-integration-plan-copy.ts", /buildIntegrationPlanMarkdown/, "integration plan copy"),
    assertContains("apps/web/components/integration-handoff-panel.tsx", /IntegrationHandoffPanel/, "handoff panel"),
    assertContains("apps/web/lib/docs/customer-docs-content.ts", /id: "integration-plan"/, "docs integration-plan"),
    {
      label: "hospital plan Batch-first and medical boundary",
      pass:
        hospital.batchFirstRecommended &&
        hospital.boundaryNote?.includes("diagnosis") &&
        hospital.recommendedArchitecture.some((l) => /Batch/i.test(l)),
    },
    {
      label: "auto plan work order and image low concurrency",
      pass:
        auto.recommendedArchitecture.some((l) => /Image/i.test(l)) &&
        auto.recommendedArchitecture.some((l) => /Batch|ticket/i.test(l)),
    },
    {
      label: "ecommerce plan SKU Batch and image low concurrency",
      pass:
        ecommerce.modelPlan.some((m) => m.model === "auto-cheap") &&
        ecommerce.recommendedArchitecture.some((l) => /SKU|Batch/i.test(l)) &&
        ecommerce.recommendedArchitecture.some((l) => /Image/i.test(l)),
    },
    {
      label: "support plan ticket routing and draft reply",
      pass:
        support.recommendedArchitecture.some((l) => /routing|Batch/i.test(l)) &&
        support.recommendedArchitecture.some((l) => /Chat/i.test(l)),
    },
    {
      label: "general plan Chat/Image/Batch split",
      pass:
        general.recommendedArchitecture.some((l) => /Chat/i.test(l)) &&
        general.recommendedArchitecture.some((l) => /Batch/i.test(l)),
    },
    {
      label: "plan includes endpoint split",
      pass: general.endpointSplit.length >= 1 && /\/v1\//.test(JSON.stringify(general.endpointSplit)),
    },
    {
      label: "plan includes model recommendation",
      pass: general.modelPlan.length > 0 && general.modelPlan[0].model,
    },
    {
      label: "plan includes concurrency plan",
      pass: general.concurrencyPlan.chatConcurrency && general.concurrencyPlan.batchItemsPerJob,
    },
    {
      label: "plan includes retry/backoff plan",
      pass: general.retryPlan.length >= 3,
    },
    {
      label: "plan includes API Key security",
      pass: general.securityNotes.some((n) => /sk-tokfai|browser/i.test(n)),
    },
    {
      label: "plan includes Usage/Credits reconciliation",
      pass: general.reconciliationSteps.some((s) => /Usage|request_id/i.test(s)),
    },
    {
      label: "plan includes go-live acceptance",
      pass: general.acceptanceChecklist.length >= 13,
    },
    {
      label: "Workbench Handoff pack",
      pass: /IntegrationHandoffPanel/.test(handoff) && /CapacityPlannerPanel/.test(workbench),
    },
    {
      label: "API Keys integration plan entry",
      pass: /copyIntegrationPlan/.test(apiKeys) && /integration-plan/.test(apiKeys),
    },
    {
      label: "plain text / markdown / JSON copy",
      pass:
        /buildIntegrationPlanPlainText/.test(copyFile) &&
        /buildIntegrationPlanMarkdown/.test(copyFile) &&
        /buildIntegrationPlanJson/.test(copyFile),
    },
  ];

  const grep = await runCustomerGrep();
  checks.push({ pass: grep.pass, label: "customer-visible grep", detail: grep.stdout });

  const pass = checks.every((c) => c.pass);

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(
    LATEST_FILE,
    JSON.stringify(
      { suite: "p797-integration-plan-acceptance", timestamp: new Date().toISOString(), pass, checks },
      null,
      2
    )
  );

  console.log("=== P797 integration plan acceptance ===");
  for (const check of checks) {
    console.log(`[${check.pass ? "PASS" : "FAIL"}] ${check.label}${check.detail ? ` — ${check.detail}` : ""}`);
  }
  console.log("");
  console.log(`P797 integration plan acceptance: ${pass ? "PASS" : "FAIL"}`);
  console.log(`results: ${LATEST_FILE}`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
