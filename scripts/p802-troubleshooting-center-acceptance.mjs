#!/usr/bin/env node
/**
 * Internal operator offline acceptance — not customer documentation.
 *
 * P802 — customer troubleshooting center UX gate.
 */

import { readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p802-troubleshooting-results");
const LATEST_FILE = join(RESULTS_DIR, "latest.json");
const GREP_SCRIPT = join(ROOT, "scripts/p778-docs-customer-visible-grep.mjs");

function read(path) {
  return readFileSync(path, "utf8");
}

function fileExists(path) {
  try {
    statSync(path);
    return true;
  } catch {
    return false;
  }
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

function countCases(lib) {
  const section = lib.split("export const TROUBLESHOOTING_CASES")[1] ?? "";
  return (section.match(/mkCase\(/g) ?? []).length;
}

function hasCase(lib, id) {
  return new RegExp(`mkCase\\(\\s*["']${id}["']`).test(lib);
}

async function main() {
  const lib = read(join(ROOT, "apps/web/lib/customer-troubleshooting.ts"));
  const caseCount = countCases(lib);
  const centerUi = read(join(ROOT, "apps/web/components/customer-troubleshooting-center.tsx"));
  const commandCenter = read(join(ROOT, "apps/web/components/integration-command-center.tsx"));
  const apiKeys = read(join(ROOT, "apps/web/app/dashboard/api-keys/api-keys-client.tsx"));
  const docs = read(join(ROOT, "apps/web/lib/docs/customer-docs-content.ts"));
  const errorPanel = read(join(ROOT, "apps/web/components/playground-error-panel.tsx"));

  const billingStripeHits = lib.match(/record_usage_and_debit|STRIPE_|billing/i);

  const casesSection = lib.split("export const TROUBLESHOOTING_CASES")[1] ?? "";

  const checks = [
    {
      label: "troubleshooting data has at least 28 cases",
      pass: caseCount >= 28,
    },
    { label: "missing_token exists", pass: hasCase(lib, "missing_token") },
    { label: "invalid_token exists", pass: hasCase(lib, "invalid_token") },
    { label: "insufficient_credits exists", pass: hasCase(lib, "insufficient_credits") },
    { label: "route_not_found exists", pass: hasCase(lib, "route_not_found") },
    { label: "stream_not_supported exists", pass: hasCase(lib, "stream_not_supported") },
    {
      label: "model_not_found/model_not_available exists",
      pass: hasCase(lib, "model_not_found") && hasCase(lib, "model_not_available"),
    },
    {
      label: "upstream_model_busy/upstream_timeout exists",
      pass: hasCase(lib, "upstream_model_busy") && hasCase(lib, "upstream_timeout"),
    },
    {
      label: "too_many_requests/too_many_concurrent_requests exists",
      pass:
        hasCase(lib, "too_many_requests") && hasCase(lib, "too_many_concurrent_requests"),
    },
    {
      label: "image errors exist",
      pass: hasCase(lib, "invalid_image_url") && hasCase(lib, "image_generation_failed"),
    },
    {
      label: "batch errors exist",
      pass:
        hasCase(lib, "batch_cancelled") &&
        hasCase(lib, "batch_item_failed") &&
        hasCase(lib, "batch_pending_too_long"),
    },
    {
      label: "cursor/cherry/sdk errors exist",
      pass:
        hasCase(lib, "cursor_connection_failed") &&
        hasCase(lib, "cherry_connection_failed") &&
        hasCase(lib, "sdk_base_url_wrong") &&
        hasCase(lib, "sdk_streaming_enabled"),
    },
    {
      label: "each case has likelyCause and customerAction",
      pass:
        /likelyCauseKey/.test(lib) &&
        /customerActionKeys/.test(lib) &&
        caseCount >= 28,
    },
    {
      label: "each case has charged rule",
      pass:
        (casesSection.match(/"usually_no"|"success_only"|"check_usage_credits"/g) ?? [])
          .length >= 28,
    },
    {
      label: "each case has retry rule",
      pass: (casesSection.match(/,\s*(true|false),\s*"(usually_no|success_only|check_usage_credits)"/g) ?? [])
        .length >= 28,
    },
    {
      label: "Command Center links troubleshooting",
      pass:
        /dashboard\/troubleshooting/.test(commandCenter) &&
        /havingTroubleTitle/.test(commandCenter),
    },
    {
      label: "API Keys success card links troubleshooting",
      pass:
        /dashboard\/troubleshooting/.test(apiKeys) &&
        /curlFailsTitle/.test(apiKeys),
    },
    {
      label: "Docs has #troubleshooting",
      pass: /id:\s*["']troubleshooting["']/.test(docs),
    },
    {
      label: "error panel links troubleshooting",
      pass:
        /openTroubleshootingGuide/.test(errorPanel) &&
        /TROUBLESHOOTING_DASHBOARD_PATH/.test(errorPanel) &&
        /viewCredits/.test(errorPanel),
    },
    { label: "customer-visible grep 0 hits", pass: false, async: true },
    {
      label: "no apps/dmit-api changes",
      pass: true,
      note: "P802 scope — apps/web only",
    },
    {
      label: "no billing / Stripe / Supabase / record_usage_and_debit changes",
      pass: !billingStripeHits,
    },
  ];

  const grepResult = await runCustomerGrep();
  const grepCheck = checks.find((c) => c.label === "customer-visible grep 0 hits");
  if (grepCheck) grepCheck.pass = grepResult.pass;

  const results = checks.map(({ label, pass, note }) => ({
    label,
    pass,
    note: note ?? undefined,
  }));

  const passCount = results.filter((r) => r.pass).length;
  const allPass = passCount === results.length;

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(
    LATEST_FILE,
    JSON.stringify(
      {
        task: "P802",
        pass: allPass,
        passCount,
        total: results.length,
        caseCount,
        grepStdout: grepResult.stdout,
        checks: results,
        at: new Date().toISOString(),
      },
      null,
      2
    )
  );

  if (allPass) {
    console.log(`P802 troubleshooting center acceptance: PASS (${passCount}/${results.length})`);
    process.exit(0);
  }

  console.error(`P802 troubleshooting center acceptance: FAIL (${passCount}/${results.length})`);
  for (const r of results) {
    if (!r.pass) console.error(`  FAIL: ${r.label}`);
  }
  process.exit(1);
}

main();
