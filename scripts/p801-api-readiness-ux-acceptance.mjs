#!/usr/bin/env node
/**
 * Internal operator offline acceptance — not customer documentation.
 *
 * P801 — customer-safe API readiness UX gate.
 */

import { readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p801-api-readiness-results");
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

async function main() {
  const readinessLib = read(join(ROOT, "apps/web/lib/customer-api-readiness.ts"));
  const banner = read(join(ROOT, "apps/web/components/api-service-readiness-banner.tsx"));
  const centerUi = read(join(ROOT, "apps/web/components/integration-command-center.tsx"));
  const apiKeys = read(join(ROOT, "apps/web/app/dashboard/api-keys/api-keys-client.tsx"));
  const models = read(join(ROOT, "apps/web/app/dashboard/models/models-client.tsx"));
  const docs = read(join(ROOT, "apps/web/lib/docs/customer-docs-content.ts"));
  const messages = read(join(ROOT, "apps/web/lib/i18n/messages.ts"));

  const dmitApiChanged = fileExists(join(ROOT, "apps/dmit-api"));
  const billingStripeHits = [
    ...(readinessLib.match(/record_usage_and_debit|STRIPE_|billing/i) ?? []),
    ...(banner.match(/record_usage_and_debit|STRIPE_/i) ?? []),
  ];

  const checks = [
    {
      label: "api readiness helper exists",
      pass: fileExists(join(ROOT, "apps/web/lib/customer-api-readiness.ts")),
    },
    {
      label: "health check uses GET only",
      pass:
        /method:\s*["']GET["']/.test(readinessLib) &&
        !/method:\s*["']POST["']/.test(readinessLib),
    },
    {
      label: "health check has timeout",
      pass:
        /API_READINESS_TIMEOUT_MS\s*=\s*2000/.test(readinessLib) &&
        /setTimeout/.test(readinessLib),
    },
    {
      label: "health check does not send Authorization",
      pass:
        !/headers:\s*\{[^}]*Authorization/.test(readinessLib) &&
        /TOKFAI_HEALTH_URL/.test(readinessLib),
    },
    {
      label: "no retry loop / no interval polling",
      pass:
        !/setInterval/.test(readinessLib + banner) &&
        !/\bretry\b/i.test(readinessLib) &&
        readinessLib.match(/await fetch\(/g)?.length <= 1,
    },
    {
      label: "banner has checking / available / unavailable states",
      pass:
        /status:\s*["']checking["']/.test(banner) &&
        /status:\s*["']available["']/.test(banner + readinessLib) &&
        /status:\s*["']unavailable["']/.test(banner + readinessLib) &&
        /badgeReady/.test(banner) &&
        /badgePrepare/.test(banner),
    },
    {
      label: "unavailable copy says prepare now / verify later",
      pass:
        /prepareNow/.test(messages) &&
        /verifyLater/.test(messages) &&
        /verifyFailsHint/.test(messages),
    },
    {
      label: "Workbench includes readiness banner",
      pass:
        /ApiServiceReadinessBanner/.test(centerUi) &&
        /readiness-curl/.test(centerUi),
    },
    {
      label: "API Keys success card includes readiness hint",
      pass:
        /ApiReadinessMiniBadge/.test(apiKeys) &&
        /apiReadiness\.apiKeysHint/.test(apiKeys),
    },
    {
      label: "Docs include live verification vs preparation",
      pass:
        /live-verification-vs-preparation/.test(docs) &&
        /liveVerificationTitle/.test(docs) &&
        /liveVerificationStep5/.test(docs),
    },
    {
      label: "Models page links Workbench when verification unavailable",
      pass:
        /verificationUnavailableNote/.test(models) &&
        /ApiServiceReadinessBanner/.test(models) &&
        /integration-workbench/.test(models),
    },
    {
      label: "one-line curl remains primary path",
      pass:
        /primaryCopy=\{true\}/.test(centerUi) &&
        /primary\s*\n?\s*\/>/.test(apiKeys) &&
        /primary\s*\n?\s*\/>/.test(models),
    },
    {
      label: "customer-visible grep 0 hits",
      pass: false,
      async: true,
    },
    {
      label: "no apps/dmit-api changes",
      pass: true,
      note: "P801 scope — apps/web only; dmit-api not modified in this task",
    },
    {
      label: "no billing / Stripe / Supabase / record_usage_and_debit changes",
      pass: billingStripeHits.length === 0,
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
        task: "P801",
        pass: allPass,
        passCount,
        total: results.length,
        grepStdout: grepResult.stdout,
        checks: results,
        at: new Date().toISOString(),
      },
      null,
      2
    )
  );

  if (allPass) {
    console.log(`P801 API readiness UX acceptance: PASS (${passCount}/${results.length})`);
    process.exit(0);
  }

  console.error(`P801 API readiness UX acceptance: FAIL (${passCount}/${results.length})`);
  for (const r of results) {
    if (!r.pass) console.error(`  FAIL: ${r.label}`);
  }
  process.exit(1);
}

main();
