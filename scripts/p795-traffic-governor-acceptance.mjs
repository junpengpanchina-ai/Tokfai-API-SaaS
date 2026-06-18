#!/usr/bin/env node
/**
 * Internal operator offline acceptance — not customer documentation.
 *
 * P795 — customer traffic governor and batch worker pack gate.
 *
 * Usage:
 *   node scripts/p795-traffic-governor-acceptance.mjs
 */

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p795-traffic-governor-results");
const LATEST_FILE = join(RESULTS_DIR, "latest.json");
const GREP_SCRIPT = join(ROOT, "scripts/p778-docs-customer-visible-grep.mjs");

const POLICY_FILE = join(ROOT, "apps/web/lib/customer-traffic-governor-policy.ts");
const SNIPPETS_FILE = join(ROOT, "apps/web/lib/customer-traffic-governor-snippets.ts");

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
      resolve({
        pass: code === 0,
        stdout: stdout.trim(),
      });
    });
  });
}

function snippetChecks() {
  const text = read(SNIPPETS_FILE);
  return [
    {
      label: "Node traffic governor snippet",
      pass: /buildNodeTrafficGovernor/.test(text) && /tokfai-worker\.mjs/.test(text),
    },
    {
      label: "Node batch worker snippet",
      pass: /buildNodeBatchWorker/.test(text) && /tokfai-batch-worker\.mjs/.test(text),
    },
    {
      label: "Python traffic governor snippet",
      pass: /buildPythonTrafficGovernor/.test(text) && /tokfai_worker\.py/.test(text),
    },
    {
      label: "Python batch worker snippet",
      pass: /buildPythonBatchWorker/.test(text) && /tokfai_batch_worker\.py/.test(text),
    },
    {
      label: "Browser key safety warning",
      pass: /buildBrowserKeyCautionSnippet/.test(text) && /Do NOT embed sk-tokfai/.test(text),
    },
  ];
}

async function main() {
  const messages = read(join(ROOT, "apps/web/lib/i18n/messages.ts"));
  const apiKeys = read(join(ROOT, "apps/web/app/dashboard/api-keys/api-keys-client.tsx"));
  const workbench = read(join(ROOT, "apps/web/components/integration-workbench-panel.tsx"));
  const models = read(join(ROOT, "apps/web/app/dashboard/models/models-client.tsx"));
  const industryDocs = read(join(ROOT, "apps/web/lib/docs/customer-docs-content.ts"));
  const policy = read(POLICY_FILE);

  const checks = [
    assertContains("apps/web/lib/customer-traffic-governor-policy.ts", /REALTIME_CHAT_GOVERNOR/, "policy module"),
    assertContains("apps/web/lib/customer-traffic-governor-snippets.ts", /TRAFFIC_GOVERNOR_SNIPPET_IDS/, "snippets module"),
    assertContains("apps/web/components/traffic-governor-copy-panel.tsx", /ScaleSafelyPanel/, "traffic-governor-copy-panel"),
    assertContains("apps/web/lib/docs/customer-docs-content.ts", /id: "traffic-governor"/, "docs traffic-governor chapter"),
    assertContains("apps/web/lib/docs/customer-docs-content.ts", /id: "batch-worker"/, "docs batch-worker chapter"),
    assertContains("apps/web/lib/docs/customer-docs-content.ts", /id: "client-side-concurrency"/, "docs client-side-concurrency chapter"),
    ...snippetChecks(),
    {
      label: "Chat concurrency recommendation",
      pass:
        /recommendedConcurrencyMin: 10/.test(policy) &&
        /recommendedConcurrencyMax: 25/.test(policy),
    },
    {
      label: "Image concurrency recommendation",
      pass:
        /recommendedConcurrencyMin: 3/.test(policy) &&
        /recommendedConcurrencyMax: 10/.test(policy),
    },
    {
      label: "Batch item recommendation",
      pass:
        /recommendedItemsPerJobMin: 100/.test(policy) &&
        /recommendedItemsPerJobMax: 1000/.test(policy),
    },
    {
      label: "429 handling — backoff / reduce concurrency",
      pass:
        /error429/.test(messages) &&
        /reduce concurrency/i.test(messages) &&
        /troubleshoot4291/.test(messages),
    },
    {
      label: "503 handling — auto-fast / Batch",
      pass:
        /error503/.test(messages) &&
        /auto-fast/i.test(messages) &&
        /troubleshoot5032/.test(messages),
    },
    {
      label: "504 handling — Usage/Credits",
      pass:
        /error504/.test(messages) &&
        /Usage/.test(messages) &&
        /reconcile3/.test(messages),
    },
    {
      label: "API Keys success card traffic governor links",
      pass:
        /trafficGovernorTitle/.test(apiKeys) &&
        /node-traffic-governor/.test(apiKeys) &&
        /batch-worker/.test(apiKeys),
    },
    {
      label: "Workbench Scale safely cards",
      pass:
        /ScaleSafelyPanel/.test(workbench) &&
        /scaleSafelyTitle/.test(messages),
    },
    {
      label: "Models page high traffic guidance",
      pass:
        /highTrafficOnline500Note/.test(models) &&
        /highTrafficClientQueue/.test(models),
    },
    {
      label: "Industry examples mention Batch worker",
      pass:
        /industryWorkerPatterns/.test(industryDocs) &&
        /Batch worker/.test(messages),
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
        suite: "p795-traffic-governor-acceptance",
        timestamp: new Date().toISOString(),
        pass,
        checks,
      },
      null,
      2
    )
  );

  console.log("=== P795 traffic governor acceptance ===");
  for (const check of checks) {
    console.log(`[${check.pass ? "PASS" : "FAIL"}] ${check.label}${check.detail ? ` — ${check.detail}` : ""}`);
  }
  console.log("");
  console.log(`P795 traffic governor acceptance: ${pass ? "PASS" : "FAIL"}`);
  console.log(`results: ${LATEST_FILE}`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
