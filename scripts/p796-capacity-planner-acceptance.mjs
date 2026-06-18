#!/usr/bin/env node
/**
 * Internal operator offline acceptance — not customer documentation.
 *
 * P796 — customer capacity planner and integration workbench gate.
 *
 * Usage:
 *   node scripts/p796-capacity-planner-acceptance.mjs
 */

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { planCapacity } from "./p796-planner-logic.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p796-capacity-planner-results");
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
  const messages = read(join(ROOT, "apps/web/lib/i18n/messages.ts"));
  const apiKeys = read(join(ROOT, "apps/web/app/dashboard/api-keys/api-keys-client.tsx"));
  const workbench = read(join(ROOT, "apps/web/components/integration-workbench-panel.tsx"));
  const models = read(join(ROOT, "apps/web/app/dashboard/models/models-client.tsx"));
  const docs = read(join(ROOT, "apps/web/lib/docs/customer-docs-content.ts"));

  const hospital500 = planCapacity({
    ...base,
    industry: "hospital",
    onlineUsers: 500,
    trafficShape: "mixed",
  });
  const auto500 = planCapacity({
    ...base,
    industry: "auto",
    onlineUsers: 500,
    trafficShape: "mixed",
    hasImages: true,
  });
  const ecommerce1000 = planCapacity({
    ...base,
    industry: "ecommerce",
    onlineUsers: 1000,
    trafficShape: "batch",
    needsBatch: true,
    volumePreference: "large",
  });
  const support300 = planCapacity({
    ...base,
    industry: "support",
    onlineUsers: 300,
    trafficShape: "chat",
  });
  const general50 = planCapacity({
    ...base,
    industry: "general",
    onlineUsers: 50,
    trafficShape: "chat",
  });
  const highOnline = planCapacity({
    ...base,
    industry: "general",
    onlineUsers: 600,
    trafficShape: "mixed",
  });

  const checks = [
    assertContains("apps/web/lib/customer-capacity-planner.ts", /planCapacity/, "planner module"),
    assertContains("apps/web/components/capacity-planner-panel.tsx", /CapacityPlannerPanel/, "capacity-planner-panel"),
    assertContains("apps/web/lib/docs/customer-docs-content.ts", /id: "capacity-planner"/, "docs capacity-planner chapter"),
    {
      label: "hospital 500 mixed → Batch-first",
      pass:
        hospital500.batchFirstRecommended &&
        hospital500.recommendedPatternKey.includes("batchFirst"),
    },
    {
      label: "auto 500 mixed → Batch + Image low concurrency",
      pass:
        auto500.batchFirstRecommended &&
        auto500.warningNoteKeys.some((k) => k.includes("imageLowConcurrency")),
    },
    {
      label: "ecommerce 1000 batch → auto-cheap / Batch-first",
      pass:
        ecommerce1000.recommendedModel === "auto-cheap" && ecommerce1000.batchFirstRecommended,
    },
    {
      label: "support 300 chat → Chat governor",
      pass:
        !support300.batchFirstRecommended &&
        support300.recommendedPatternKey.includes("chatGovernor"),
    },
    {
      label: "general 50 chat → low concurrency",
      pass: general50.chatConcurrencyMin <= 10 && general50.chatConcurrencyMax <= 10,
    },
    {
      label: "onlineUsers > 500 warning",
      pass: highOnline.warningNoteKeys.some((k) => k.includes("highOnlineUsers")),
    },
    {
      label: "429 → reduce concurrency + backoff",
      pass:
        /retry429/.test(messages) &&
        /reduce concurrency/i.test(messages) &&
        /retry429/.test(messages),
    },
    {
      label: "503 → Batch / auto-fast",
      pass: /retry503/.test(messages) && /auto-fast/i.test(messages),
    },
    {
      label: "504 → Usage/Credits",
      pass: /retry504/.test(messages) && /Usage/.test(messages),
    },
    {
      label: "API Keys success card capacity planner link",
      pass: /planMyIntegration/.test(apiKeys) && /capacity-planner/.test(apiKeys),
    },
    {
      label: "Workbench Capacity planner",
      pass:
        /CapacityPlannerPanel/.test(workbench) &&
        /workbenchTitle: "Capacity planner"/.test(messages),
    },
    {
      label: "Models Scale safely / Capacity planner",
      pass:
        /scaleSafelyTitle/.test(models) &&
        /capacity-planner/.test(models) &&
        /highTrafficCapacityPlanner/.test(models),
    },
    {
      label: "Node/Python worker copy entry in planner panel",
      pass:
        /node-traffic-governor/.test(read(join(ROOT, "apps/web/components/capacity-planner-panel.tsx"))) &&
        /python-batch-worker/.test(read(join(ROOT, "apps/web/components/capacity-planner-panel.tsx"))),
    },
  ];

  const grep = await runCustomerGrep();
  checks.push({
    pass: grep.pass,
    label: "customer-visible grep",
    detail: grep.stdout,
  });

  const pass = checks.every((c) => c.pass);

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(
    LATEST_FILE,
    JSON.stringify(
      {
        suite: "p796-capacity-planner-acceptance",
        timestamp: new Date().toISOString(),
        pass,
        checks,
        samples: {
          hospital500,
          auto500,
          ecommerce1000,
          support300,
          general50,
        },
      },
      null,
      2
    )
  );

  console.log("=== P796 capacity planner acceptance ===");
  for (const check of checks) {
    console.log(`[${check.pass ? "PASS" : "FAIL"}] ${check.label}${check.detail ? ` — ${check.detail}` : ""}`);
  }
  console.log("");
  console.log(`P796 capacity planner acceptance: ${pass ? "PASS" : "FAIL"}`);
  console.log(`results: ${LATEST_FILE}`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
