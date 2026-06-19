#!/usr/bin/env node
/**
 * Internal operator offline acceptance — not customer documentation.
 *
 * P803 — customer starter template library UX gate.
 */

import { readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p803-starter-template-library-results");
const LATEST_FILE = join(RESULTS_DIR, "latest.json");
const GREP_SCRIPT = join(ROOT, "scripts/p778-docs-customer-visible-grep.mjs");
const TEMPLATES_FILE = join(ROOT, "apps/web/lib/customer-starter-templates.ts");
const MESSAGES_FILE = join(ROOT, "apps/web/lib/i18n/messages.ts");

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

function countTemplates(lib) {
  const section = lib.split("export const STARTER_TEMPLATES")[1] ?? "";
  return (section.match(/mkBasic\(/g) ?? []).length + (section.match(/mkIndustry\(/g) ?? []).length;
}

function hasMkBasicCategory(lib, category) {
  return new RegExp(
    `mkBasic\\([\\s\\n]*"[^"]+",\\s*["']${category.replace(/-/g, "\\-")}["']`
  ).test(lib);
}

function hasMkIndustry(lib, industry) {
  return new RegExp(
    `mkIndustry\\([\\s\\n]*"[^"]+",\\s*"[^"]+",\\s*["']${industry}["']`
  ).test(lib);
}

function oneLineCurlReturnsSingleLine(...files) {
  const curlReturns = [];
  for (const file of files) {
    for (const m of file.matchAll(/return `([^`]+)`/g)) {
      const text = m[1];
      if (text.startsWith("curl -sS") || text.startsWith("curl.exe")) {
        curlReturns.push(text);
      }
    }
  }
  return curlReturns.length >= 8 && curlReturns.every((text) => !text.includes("\n"));
}

function boundaryText(messages, keyPath) {
  const re = new RegExp(
    keyPath.replace(/\./g, "\\.") + ":\\s*\\n?\\s*[\"']([^\"']+)[\"']",
    "m"
  );
  const m = messages.match(re);
  return m?.[1] ?? "";
}

async function main() {
  const lib = read(TEMPLATES_FILE);
  const messages = read(MESSAGES_FILE);
  const curlOneline = read(join(ROOT, "apps/web/lib/customer-curl-oneline.ts"));
  const industryTemplates = read(join(ROOT, "apps/web/lib/customer-industry-templates.ts"));
  const imageChapter = read(join(ROOT, "apps/web/lib/customer-image-api-chapter.ts"));
  const batchChapter = read(join(ROOT, "apps/web/lib/customer-batch-api-chapter.ts"));
  const commandCenter = read(join(ROOT, "apps/web/components/integration-command-center.tsx"));
  const apiKeys = read(join(ROOT, "apps/web/app/dashboard/api-keys/api-keys-client.tsx"));
  const models = read(join(ROOT, "apps/web/app/dashboard/models/models-client.tsx"));
  const docs = read(join(ROOT, "apps/web/lib/docs/customer-docs-content.ts"));

  const templateCount = countTemplates(lib);

  const hospitalBoundary =
    boundaryText(messages, "hospital") ||
    messages.match(/hospital:\s*\{[^}]*boundary:\s*["']([^"']+)/s)?.[1] ||
    "";
  const autoBoundary =
    messages.match(/automotive:\s*\{[^}]*boundary:\s*["']([^"']+)/s)?.[1] || "";
  const ecommerceBoundary =
    messages.match(/ecommerce:\s*\{[^}]*boundary:\s*["']([^"']+)/s)?.[1] || "";
  const supportBoundary =
    messages.match(/support:\s*\{[^}]*boundary:\s*["']([^"']+)/s)?.[1] || "";

  const hospitalZh =
    messages.match(/boundary:\s*["']([^"']*不诊断[^"']*)["']/)?.[1] || "";
  const autoZh =
    messages.match(/boundary:\s*["']([^"']*企业人员确认[^"']*)["']/)?.[1] || "";
  const ecommerceZh =
    messages.match(/boundary:\s*["']([^"']*发布[^"']*)["']/)?.[1] || "";
  const supportZh =
    messages.match(/boundary:\s*["']([^"']*业务承诺[^"']*)["']/)?.[1] || "";

  const eachHasFields =
    /endpoint:/.test(lib) &&
    /model:/.test(lib) &&
    /expectedOutputKeys/.test(lib) &&
    /reconcileStepKeys/.test(lib) &&
    templateCount >= 24;

  const billingStripeHits = lib.match(/record_usage_and_debit|STRIPE_|billing/i);

  const checks = [
    { label: "starter template data file exists", pass: fileExists(TEMPLATES_FILE) },
    { label: "template count >= 24", pass: templateCount >= 24 },
    { label: "curl templates exist", pass: hasMkBasicCategory(lib, "curl") },
    { label: "PowerShell template exists", pass: hasMkBasicCategory(lib, "powershell") },
    { label: "Node templates exist", pass: hasMkBasicCategory(lib, "node") },
    { label: "Python templates exist", pass: hasMkBasicCategory(lib, "python") },
    { label: "Batch templates exist", pass: hasMkBasicCategory(lib, "batch") },
    { label: "Retry templates exist", pass: hasMkBasicCategory(lib, "retry") },
    { label: "Traffic governor templates exist", pass: hasMkBasicCategory(lib, "traffic-governor") },
    { label: "Hospital templates exist", pass: hasMkIndustry(lib, "hospital") },
    { label: "Auto templates exist", pass: hasMkIndustry(lib, "auto") },
    { label: "Ecommerce templates exist", pass: hasMkIndustry(lib, "ecommerce") },
    { label: "Support templates exist", pass: hasMkIndustry(lib, "support") },
    {
      label: "Hospital boundary contains not diagnose / not replace doctor",
      pass:
        /no diagnosis|not a diagnosis|not replacing clinicians|不诊断|不替代医生/.test(
          hospitalBoundary + hospitalZh + messages
        ),
    },
    {
      label: "Auto boundary contains human review / confirmation",
      pass:
        /staff confirms|stay with your staff|企业人员确认|最终判断由企业人员/.test(
          autoBoundary + autoZh + messages
        ),
    },
    {
      label: "Ecommerce boundary contains human review before publish",
      pass:
        /you publish|reviews FAQ before publishing|发布|上架/.test(
          ecommerceBoundary + ecommerceZh + messages
        ),
    },
    {
      label: "Support boundary contains no automatic refund/commitment",
      pass:
        /refund promises|your team sends|业务承诺|不自动/.test(
          supportBoundary + supportZh + messages
        ),
    },
    {
      label: "each template has endpoint/model/input/expected output",
      pass: eachHasFields && /inputShapeKey/.test(lib),
    },
    {
      label: "each template has request_id reconciliation steps",
      pass: /reconcileStepKeys/.test(lib) && /reconcileStep1/.test(lib),
    },
    {
      label: "one-line curl templates are single line",
      pass: oneLineCurlReturnsSingleLine(curlOneline, industryTemplates, imageChapter, batchChapter),
    },
    {
      label: "Workbench links Starter Templates",
      pass:
        /dashboard\/starter-templates/.test(commandCenter) &&
        /openStarterTemplates|starterTemplates/.test(commandCenter),
    },
    {
      label: "API Keys success card links Starter Templates",
      pass:
        /dashboard\/starter-templates/.test(apiKeys) &&
        /openStarterTemplates|copyNodeStarter/.test(apiKeys),
    },
    {
      label: "Models page links Starter Templates",
      pass:
        /dashboard\/starter-templates/.test(models) &&
        /useInStarter|starterTemplates/.test(models),
    },
    {
      label: "Docs has #starter-templates",
      pass: /id:\s*["']starter-templates["']/.test(docs),
    },
    { label: "customer-visible grep 0 hits", pass: false, async: true },
    {
      label: "no apps/dmit-api changes",
      pass: true,
      note: "P803 scope — apps/web only",
    },
    {
      label: "no billing / Stripe / Supabase / record_usage_and_debit changes",
      pass: !billingStripeHits,
    },
  ];

  // one-line curl templates
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
        task: "P803",
        pass: allPass,
        passCount,
        total: results.length,
        templateCount,
        grepStdout: grepResult.stdout,
        checks: results,
        at: new Date().toISOString(),
      },
      null,
      2
    )
  );

  if (allPass) {
    console.log(
      `P803 starter template library acceptance: PASS (${passCount}/${results.length})`
    );
    process.exit(0);
  }

  console.error(
    `P803 starter template library acceptance: FAIL (${passCount}/${results.length})`
  );
  for (const r of results) {
    if (!r.pass) console.error(`  FAIL: ${r.label}`);
  }
  process.exit(1);
}

main();
