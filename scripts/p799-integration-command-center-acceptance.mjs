#!/usr/bin/env node
/**
 * Internal operator offline acceptance — not customer documentation.
 *
 * P799 — customer integration command center gate.
 */

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMMAND_CENTER_STEP_IDS,
  COMMAND_CENTER_STORAGE_KEY,
  DEFAULT_COMMAND_CENTER_STATE,
} from "./p799-command-center-logic.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p799-command-center-results");
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

async function main() {
  const centerLib = read(join(ROOT, "apps/web/lib/customer-integration-command-center.ts"));
  const centerUi = read(join(ROOT, "apps/web/components/integration-command-center.tsx"));
  const apiKeys = read(join(ROOT, "apps/web/app/dashboard/api-keys/api-keys-client.tsx"));
  const models = read(join(ROOT, "apps/web/app/dashboard/models/models-client.tsx"));
  const docs = read(join(ROOT, "apps/web/lib/docs/customer-docs-content.ts"));
  const nav = read(join(ROOT, "apps/web/lib/dashboard-nav.ts"));
  const page = read(
    join(ROOT, "apps/web/app/dashboard/integration-workbench/integration-workbench-client.tsx")
  );

  const storageType = centerLib.match(
    /type CommandCenterPersistedState\s*=\s*\{[\s\S]*?\n\}/
  )?.[0] ?? "";

  const checks = [
    assertContains(
      "apps/web/lib/customer-integration-command-center.ts",
      /INTEGRATION_COMMAND_CENTER_STEPS/,
      "command center module"
    ),
    assertContains(
      "apps/web/components/integration-command-center.tsx",
      /IntegrationCommandCenter/,
      "command center UI"
    ),
    {
      label: "command center has 8 steps",
      pass: COMMAND_CENTER_STEP_IDS.length === 8,
    },
    {
      label: "step 1 links API Keys",
      pass: /\/dashboard\/api-keys/.test(centerUi) && hasStep(centerUi, "create-api-key"),
    },
    {
      label: "step 2 has one-line Chat curl copy",
      pass:
        hasStep(centerUi, "verify-curl") &&
        /chatCurlOneLine/.test(centerUi) &&
        /OneLineCurlCopyFields/.test(centerUi),
    },
    {
      label: "step 2 expected output includes HTTP 200 / request_id / credits_charged",
      pass:
        /verify-curl/.test(centerUi) &&
        /verifyCurl:[\s\S]*?credits_charged/.test(
          read(join(ROOT, "apps/web/lib/i18n/messages.ts"))
        ),
    },
    {
      label: "step 3 has industry and workload selection",
      pass:
        hasStep(centerUi, "choose-workload") &&
        /PLANNER_INDUSTRIES/.test(centerUi) &&
        /TRAFFIC_SHAPES/.test(centerUi),
    },
    {
      label: "step 4 uses Capacity Planner",
      pass:
        hasStep(centerUi, "plan-capacity") &&
        /CapacityPlannerPanel/.test(centerUi),
    },
    {
      label: "step 5 uses Integration Plan",
      pass:
        hasStep(centerUi, "generate-plan") &&
        /buildIntegrationPlanPlainText/.test(centerUi),
    },
    {
      label: "step 6 includes Node/Python traffic governor and Batch worker",
      pass:
        hasStep(centerUi, "copy-templates") &&
        /node-traffic-governor/.test(centerUi) &&
        /python-traffic-governor/.test(centerUi) &&
        /node-batch-worker/.test(centerUi) &&
        /python-batch-worker/.test(centerUi),
    },
    {
      label: "step 7 uses Go-live Tracker",
      pass:
        hasStep(centerUi, "go-live-tracker") &&
        /go-live-tracker/.test(centerUi) &&
        /buildGoLiveTrackerCopies/.test(centerUi),
    },
    {
      label: "step 8 links Usage and Credits",
      pass:
        hasStep(centerUi, "reconcile-usage-credits") &&
        /\/dashboard\/usage/.test(centerUi) &&
        /\/dashboard\/credits/.test(centerUi),
    },
    {
      label: "API Keys success card links Integration Workbench",
      pass:
        /startIntegrationWorkbench|keyReadyMessage/.test(apiKeys) &&
        /\/dashboard\/integration-workbench/.test(apiKeys),
    },
    {
      label: "Models page links Integration Workbench",
      pass:
        /openIntegrationWorkbench|startFromModelTitle/.test(models) &&
        /\/dashboard\/integration-workbench/.test(models),
    },
    {
      label: "Docs has #integration-workbench chapter",
      pass: /id: "integration-workbench"/.test(docs) &&
        /integration-command-center-panel/.test(docs),
    },
    {
      label: "dashboard route /integration-workbench",
      pass: /integration-workbench/.test(page) && /IntegrationCommandCenter/.test(page),
    },
    {
      label: "sidebar nav integration workbench",
      pass: /\/dashboard\/integration-workbench/.test(nav),
    },
    {
      label: "localStorage does not store API key words",
      pass:
        COMMAND_CENTER_STORAGE_KEY === "tokfai_integration_command_center_state" &&
        !/apiKey|api_key|secret/i.test(storageType),
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
        suite: "p799-integration-command-center-acceptance",
        timestamp: new Date().toISOString(),
        pass,
        checks,
      },
      null,
      2
    )
  );

  console.log("=== P799 integration command center acceptance ===");
  for (const check of checks) {
    console.log(
      `[${check.pass ? "PASS" : "FAIL"}] ${check.label}${check.detail ? ` — ${check.detail}` : ""}`
    );
  }
  console.log("");
  console.log(`P799 integration command center acceptance: ${pass ? "PASS" : "FAIL"}`);
  console.log(`results: ${LATEST_FILE}`);
  process.exit(pass ? 0 : 1);
}

function hasStep(text, id) {
  return text.includes(id);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
