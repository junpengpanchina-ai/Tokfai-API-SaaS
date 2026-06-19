#!/usr/bin/env node
/**
 * Internal operator offline acceptance — not customer documentation.
 *
 * P798 — customer go-live tracker and evidence pack gate.
 */

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { buildGoLiveTrackerPlan, GO_LIVE_PHASES } from "./p798-tracker-logic.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p798-go-live-tracker-results");
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

function hasTask(plan, id) {
  return plan.tasks.some((t) => t.id === id);
}

function hasPhase(plan, phase) {
  return plan.tasks.some((t) => t.phase === phase);
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
  const general = buildGoLiveTrackerPlan({
    ...base,
    industry: "general",
    onlineUsers: 100,
    trafficShape: "mixed",
  });
  const hospital = buildGoLiveTrackerPlan({
    ...base,
    industry: "hospital",
    onlineUsers: 500,
    trafficShape: "mixed",
  });
  const auto = buildGoLiveTrackerPlan({
    ...base,
    industry: "auto",
    onlineUsers: 500,
    trafficShape: "mixed",
    hasImages: true,
  });
  const ecommerce = buildGoLiveTrackerPlan({
    ...base,
    industry: "ecommerce",
    onlineUsers: 1000,
    trafficShape: "batch",
    needsBatch: true,
    volumePreference: "large",
  });
  const support = buildGoLiveTrackerPlan({
    ...base,
    industry: "support",
    onlineUsers: 300,
    trafficShape: "chat",
  });
  const imagePlan = buildGoLiveTrackerPlan({
    ...base,
    industry: "general",
    onlineUsers: 100,
    trafficShape: "image",
    hasImages: true,
  });

  const trackerLib = read(join(ROOT, "apps/web/lib/customer-go-live-tracker.ts"));
  const copyLib = read(join(ROOT, "apps/web/lib/customer-go-live-copy.ts"));
  const panel = read(join(ROOT, "apps/web/components/go-live-tracker-panel.tsx"));
  const capacityPanel = read(join(ROOT, "apps/web/components/capacity-planner-panel.tsx"));
  const apiKeys = read(join(ROOT, "apps/web/app/dashboard/api-keys/api-keys-client.tsx"));
  const models = read(join(ROOT, "apps/web/app/dashboard/models/models-client.tsx"));
  const docs = read(join(ROOT, "apps/web/lib/docs/customer-docs-content.ts"));

  const checks = [
    assertContains("apps/web/lib/customer-go-live-tracker.ts", /buildGoLiveTrackerPlan/, "tracker module"),
    assertContains("apps/web/lib/customer-go-live-copy.ts", /buildFinalAcceptanceReport/, "go-live copy module"),
    assertContains("apps/web/components/go-live-tracker-panel.tsx", /GoLiveTrackerPanel/, "tracker panel"),
    {
      label: "tracker contains all phases",
      pass: GO_LIVE_PHASES.every((phase) => hasPhase(general, phase)),
    },
    {
      label: "API Key creation task exists",
      pass: hasTask(general, "create-api-key"),
    },
    {
      label: "one-line Chat curl task exists",
      pass: hasTask(general, "copy-chat-curl"),
    },
    {
      label: "request_id evidence task exists",
      pass: hasTask(general, "run-chat-request-id"),
    },
    {
      label: "Usage reconciliation task exists",
      pass: hasTask(general, "search-usage-request-id"),
    },
    {
      label: "Credits reconciliation task exists",
      pass: hasTask(general, "search-credits-reference"),
    },
    {
      label: "traffic governor task exists",
      pass: hasTask(general, "configure-traffic-governor"),
    },
    {
      label: "Batch worker task exists",
      pass: hasTask(general, "configure-batch-worker"),
    },
    {
      label: "Image low concurrency task exists when image workload",
      pass: hasTask(imagePlan, "configure-image-low-concurrency"),
    },
    {
      label: "retry/backoff task exists",
      pass: hasTask(general, "enable-retry-backoff"),
    },
    {
      label: "revoke exposed key task exists",
      pass: hasTask(general, "revoke-exposed-key"),
    },
    {
      label: "hospital plan includes medical boundary and manual review",
      pass:
        hasTask(hospital, "hospital-medical-boundary") &&
        hasTask(hospital, "hospital-doctor-review") &&
        /medical boundary|diagnosis/i.test(trackerLib),
    },
    {
      label: "auto plan includes enterprise reviewer",
      pass: hasTask(auto, "auto-enterprise-reviewer"),
    },
    {
      label: "ecommerce plan includes publish review",
      pass: hasTask(ecommerce, "ecommerce-publish-review"),
    },
    {
      label: "support plan includes CRM/ticket owner",
      pass: hasTask(support, "support-crm-owner"),
    },
    {
      label: "Workbench has Go-live tracker",
      pass: /GoLiveTrackerPanel/.test(capacityPanel) && /GoLiveTrackerPanel/.test(panel),
    },
    {
      label: "API Keys success card has Start go-live tracker",
      pass:
        /startGoLiveTracker|Start go-live tracker/.test(apiKeys) &&
        /go-live-tracker/.test(apiKeys),
    },
    {
      label: "Models page has Go-live readiness",
      pass:
        /goLiveReadinessTitle|Go-live readiness/.test(models) &&
        /go-live-tracker/.test(models),
    },
    {
      label: "Docs has #go-live-tracker",
      pass: /id: "go-live-tracker"/.test(docs),
    },
    {
      label: "copy task list / evidence pack / final report / technical handoff",
      pass:
        /buildGoLiveTaskListPlainText/.test(copyLib) &&
        /buildEvidencePackMarkdown/.test(copyLib) &&
        /buildFinalAcceptanceReport/.test(copyLib) &&
        /buildTechnicalHandoffNote/.test(copyLib),
    },
    {
      label: "localStorage key without API key storage",
      pass:
        /tokfai_go_live_tracker_state/.test(trackerLib) &&
        /tasks: Record<string, GoLiveTaskState>/.test(trackerLib) &&
        !/apiKey|api_key/i.test(
          trackerLib.match(/type GoLiveTrackerStorage\s*\{[\s\S]*?\n\}/)?.[0] ?? ""
        ),
    },
  ];

  const grep = await runCustomerGrep();
  checks.push({ pass: grep.pass, label: "customer-visible grep", detail: grep.stdout });

  const pass = checks.every((c) => c.pass);

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(
    LATEST_FILE,
    JSON.stringify(
      {
        suite: "p798-go-live-tracker-acceptance",
        timestamp: new Date().toISOString(),
        pass,
        checks,
      },
      null,
      2
    )
  );

  console.log("=== P798 go-live tracker acceptance ===");
  for (const check of checks) {
    console.log(
      `[${check.pass ? "PASS" : "FAIL"}] ${check.label}${check.detail ? ` — ${check.detail}` : ""}`
    );
  }
  console.log("");
  console.log(`P798 go-live tracker acceptance: ${pass ? "PASS" : "FAIL"}`);
  console.log(`results: ${LATEST_FILE}`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
