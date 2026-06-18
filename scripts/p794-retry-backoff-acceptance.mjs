#!/usr/bin/env node
/**
 * Internal operator offline acceptance — not customer documentation.
 *
 * P794 — customer safe retry and backoff pack gate.
 *
 * Usage:
 *   node scripts/p794-retry-backoff-acceptance.mjs
 */

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p794-retry-backoff-results");
const LATEST_FILE = join(RESULTS_DIR, "latest.json");
const GREP_SCRIPT = join(ROOT, "scripts/p778-docs-customer-visible-grep.mjs");

const POLICY_FILE = join(ROOT, "apps/web/lib/customer-retry-policy.ts");
const SNIPPETS_FILE = join(ROOT, "apps/web/lib/customer-safe-client-snippets.ts");

function read(path) {
  return readFileSync(path, "utf8");
}

function extractConstArray(fileText, constName) {
  const re = new RegExp(
    `export const ${constName} = \\[([\\s\\S]*?)\\] as const`,
    "m"
  );
  const match = fileText.match(re);
  if (!match) return [];
  return [...match[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

function loadPolicyFromSource() {
  const text = read(POLICY_FILE);
  const retryable = extractConstArray(text, "RETRYABLE_ERROR_CODES");
  const nonRetryable = extractConstArray(text, "NON_RETRYABLE_ERROR_CODES");
  const retryableSet = new Set(retryable);
  const nonRetryableSet = new Set(nonRetryable);

  function isRetryable(code) {
    return code ? retryableSet.has(code) : false;
  }

  function isNonRetryable(code) {
    return code ? nonRetryableSet.has(code) : false;
  }

  function shouldRetry(status, code) {
    if (status === 401 || status === 402 || status === 400 || status === 413) return false;
    if (code && isNonRetryable(code)) return false;
    if (status === 429 || status === 503 || status === 504) return true;
    if (status >= 500 && status < 600) return code ? isRetryable(code) : true;
    return false;
  }

  return { retryable, nonRetryable, isRetryable, isNonRetryable, shouldRetry };
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

function snippetChecks() {
  const text = read(SNIPPETS_FILE);
  const checks = [
    {
      label: "bash safe retry template",
      pass: /buildBashSafeRetryChatScript/.test(text) && /MAX_ATTEMPTS/.test(text),
    },
    {
      label: "PowerShell safe retry template",
      pass: /buildPowerShellSafeRetryChatScript/.test(text) && /curl\.exe/.test(text),
    },
    {
      label: "Node safe client template",
      pass: /buildNodeSafeRetryClient/.test(text) && /request_id/.test(text),
    },
    {
      label: "Python safe client template",
      pass: /buildPythonSafeRetryClient/.test(text) && /credits_charged/.test(text),
    },
    {
      label: "Batch safe polling template",
      pass:
        /buildNodeSafeBatchPollClient/.test(text) &&
        /MAX_POLLS/.test(text) &&
        /cancelled/.test(text),
    },
  ];
  return checks;
}

async function main() {
  if (process.env.LIVE === "1") {
    console.error("P794 retry backoff acceptance is offline-only — unset LIVE=1");
    process.exit(1);
  }

  console.log("=== P794 retry backoff acceptance ===");

  const report = {
    suite: "p794-retry-backoff-acceptance",
    timestamp: new Date().toISOString(),
    pass: true,
    checks: [],
    policy: {},
  };

  const staticChecks = [
    {
      label: "customer-retry-policy module",
      file: "apps/web/lib/customer-retry-policy.ts",
      pattern: /shouldRetryHttpStatus/,
    },
    {
      label: "customer-safe-client-snippets module",
      file: "apps/web/lib/customer-safe-client-snippets.ts",
      pattern: /buildSafeClientSnippet/,
    },
    {
      label: "safe-retry-copy-panel",
      file: "apps/web/components/safe-retry-copy-panel.tsx",
      pattern: /SafeRetryCopyPanel/,
    },
    {
      label: "docs safe retry panel",
      file: "apps/web/lib/docs/customer-docs-content.ts",
      pattern: /safe-retry-copy-panel/,
    },
    {
      label: "504 usage credits docs",
      file: "apps/web/lib/i18n/messages.ts",
      pattern: /when5042:/,
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

  const policy = loadPolicyFromSource();
  report.policy = {
    retryableCount: policy.retryable.length,
    nonRetryableCount: policy.nonRetryable.length,
  };

  const policyTests = [
    {
      label: "429 too_many_requests is retryable",
      pass: policy.isRetryable("too_many_requests"),
    },
    {
      label: "503 gateway_overloaded is retryable",
      pass: policy.isRetryable("gateway_overloaded"),
    },
    {
      label: "504 upstream_timeout is retryable",
      pass: policy.isRetryable("upstream_timeout"),
    },
    {
      label: "504 guidance — reconcile before retry (docs)",
      pass:
        /when5042:/.test(read(join(ROOT, "apps/web/lib/i18n/messages.ts"))) &&
        /reconcile3:/.test(read(join(ROOT, "apps/web/lib/i18n/messages.ts"))),
    },
    {
      label: "401 invalid_token is not retryable",
      pass: policy.isNonRetryable("invalid_token") && !policy.shouldRetry(401, "invalid_token"),
    },
    {
      label: "402 insufficient_credits is not retryable",
      pass:
        policy.isNonRetryable("insufficient_credits") &&
        !policy.shouldRetry(402, "insufficient_credits"),
    },
    {
      label: "400 model_not_found is not retryable",
      pass:
        policy.isNonRetryable("model_not_found") && !policy.shouldRetry(400, "model_not_found"),
    },
  ];

  for (const test of policyTests) {
    report.checks.push(test);
    if (!test.pass) {
      report.pass = false;
      console.log(`[FAIL] ${test.label}`);
    } else {
      console.log(`[PASS] ${test.label}`);
    }
  }

  for (const check of snippetChecks()) {
    report.checks.push(check);
    if (!check.pass) {
      report.pass = false;
      console.log(`[FAIL] ${check.label}`);
    } else {
      console.log(`[PASS] ${check.label}`);
    }
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

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(LATEST_FILE, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\nP794 retry backoff acceptance: ${report.pass ? "PASS" : "FAIL"}`);
  console.log(`results: ${LATEST_FILE}`);
  process.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
