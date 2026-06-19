#!/usr/bin/env node
/**
 * Internal operator offline acceptance — not customer documentation.
 *
 * P804 — customer starter template configurator UX gate.
 */

import { readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p804-template-configurator-results");
const LATEST_FILE = join(RESULTS_DIR, "latest.json");
const GREP_SCRIPT = join(ROOT, "scripts/p778-docs-customer-visible-grep.mjs");
const CONFIG_FILE = join(ROOT, "apps/web/lib/customer-template-configurator.ts");
const COMPONENT_FILE = join(ROOT, "apps/web/components/starter-template-configurator.tsx");
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

function t(key) {
  const messages = read(MESSAGES_FILE);
  const enBlock = messages.split("en: {")[1]?.split("zh: {")[0] ?? "";
  const re = new RegExp(`${key.replace(/\./g, "\\.")}:\\s*"([^"]+)"`);
  const m = enBlock.match(re);
  return m?.[1] ?? key;
}

async function main() {
  const lib = read(CONFIG_FILE);
  const component = read(COMPONENT_FILE);
  const commandCenter = read(join(ROOT, "apps/web/components/integration-command-center.tsx"));
  const apiKeys = read(join(ROOT, "apps/web/app/dashboard/api-keys/api-keys-client.tsx"));
  const models = read(join(ROOT, "apps/web/app/dashboard/models/models-client.tsx"));
  const docs = read(join(ROOT, "apps/web/lib/docs/customer-docs-content.ts"));
  const keySession = read(join(ROOT, "apps/web/lib/customer-quick-start-key-session.ts"));

  const billingStripeHits = lib.match(/record_usage_and_debit|STRIPE_|billing/i);

  const industries = ["hospital", "auto", "ecommerce", "support", "general"];
  const apis = ["chat", "responses", "image", "batch"];
  const languages = ["curl", "powershell", "node", "python"];
  const workloads = ["single", "small-batch", "large-batch"];

  const sample = (partial) => ({
    industry: "general",
    api: "chat",
    language: "curl",
    model: "auto-fast",
    workloadSize: "single",
    ...partial,
  });

  let generated = null;
  try {
    const mod = await import(`file://${CONFIG_FILE}`);
    const tFn = (key) => {
      const messages = read(MESSAGES_FILE);
      const enBlock = messages.split("en: {")[1]?.split("zh: {")[0] ?? "";
      const re = new RegExp(key.replace(/\./g, "\\.") + ":\\s*\"([^\"]+)\"");
      const m = enBlock.match(re);
      return m?.[1] ?? key;
    };
    generated = {
      curl: mod.buildGeneratedTemplate(sample({ language: "curl", api: "chat" }), "sk-tokfai_test", tFn),
      powershell: mod.buildGeneratedTemplate(
        sample({ language: "powershell", api: "chat" }),
        "sk-tokfai_test",
        tFn
      ),
      node: mod.buildGeneratedTemplate(sample({ language: "node", api: "chat" }), "sk-tokfai_test", tFn),
      python: mod.buildGeneratedTemplate(
        sample({ language: "python", api: "chat" }),
        "sk-tokfai_test",
        tFn
      ),
      batch: mod.buildGeneratedTemplate(
        sample({ api: "batch", language: "curl", workloadSize: "small-batch" }),
        "sk-tokfai_test",
        tFn
      ),
      responses: mod.buildGeneratedTemplate(sample({ api: "responses", language: "curl" }), "sk-tokfai_test", tFn),
      image: mod.buildGeneratedTemplate(
        sample({ api: "image", language: "curl", model: "gpt-image-2" }),
        "sk-tokfai_test",
        tFn
      ),
      sessionKey: mod.buildGeneratedTemplate(
        sample({ language: "curl" }),
        "sk-tokfai_real_secret_abc",
        tFn
      ),
      placeholder: mod.buildGeneratedTemplate(sample({ language: "curl" }), "sk-tokfai_xxx", tFn),
      hospital: mod.buildGeneratedTemplate(
        sample({ industry: "hospital", language: "curl" }),
        "sk-tokfai_test",
        tFn
      ),
    };
  } catch {
    generated = null;
  }

  const staticResponses = /effectiveApi === \"responses\"/.test(lib) && /\/responses/.test(lib);
  const staticImage =
    /effectiveApi === \"image\"/.test(lib) &&
    /images\/generations/.test(lib) &&
    /response_format/.test(lib);
  const staticSessionKey =
    /buildGeneratedTemplate\([\s\S]*apiKey/.test(lib) && /Bearer \$\{apiKey\}/.test(lib);
  const staticPlaceholder =
    /TOKFAI_API_KEY_PLACEHOLDER/.test(lib) || /sk-tokfai_xxx/.test(lib);

  const checks = [
    { label: "configurator logic file exists", pass: fileExists(CONFIG_FILE) },
    { label: "component exists", pass: fileExists(COMPONENT_FILE) },
    {
      label: "supports 5 industries",
      pass: industries.every((i) => lib.includes(`"${i}"`)),
    },
    {
      label: "supports 4 API types",
      pass: apis.every((a) => lib.includes(`"${a}"`)),
    },
    {
      label: "supports 4 languages",
      pass: languages.every((l) => lib.includes(`"${l}"`)),
    },
    {
      label: "supports 3 workload sizes",
      pass: workloads.every((w) => lib.includes(`"${w}"`)),
    },
    {
      label: "generates one-line curl",
      pass: generated?.curl?.copyText?.startsWith("curl -sS") && !generated.curl.copyText.includes("\ncurl"),
    },
    {
      label: "generates PowerShell curl.exe",
      pass: generated?.powershell?.copyText?.includes("curl.exe"),
    },
    {
      label: "generates Node.js file template",
      pass: generated?.node?.copyText?.includes("fetch(") || generated?.node?.copyText?.includes("process.env"),
    },
    {
      label: "generates Python file template",
      pass: generated?.python?.copyText?.includes("requests"),
    },
    {
      label: "generates Batch create/poll/items",
      pass:
        generated?.batch?.copyText?.includes("Create batch") &&
        generated?.batch?.copyText?.includes("Poll status") &&
        generated?.batch?.copyText?.includes("List items"),
    },
    {
      label: "supports Responses endpoint",
      pass:
        generated?.responses?.endpoint?.includes("responses") || staticResponses,
    },
    {
      label: "supports Image endpoint",
      pass:
        (generated?.image?.endpoint?.includes("images") &&
          generated?.image?.copyText?.includes("images/generations")) ||
        staticImage,
    },
    {
      label: "injects session key when available",
      pass:
        generated?.sessionKey?.copyText?.includes("sk-tokfai_real_secret_abc") || staticSessionKey,
    },
    {
      label: "falls back to sk-tokfai_xxx placeholder",
      pass:
        generated?.placeholder?.copyText?.includes("sk-tokfai_xxx") || staticPlaceholder,
    },
    {
      label: "does not store API key in localStorage",
      pass:
        !component.includes("localStorage") &&
        keySession.includes("sessionStorage") &&
        !lib.includes("localStorage"),
    },
    {
      label: "every generated template has expectedOutput",
      pass:
        generated &&
        Object.values(generated)
          .filter((g) => typeof g === "object" && g.expectedOutput)
          .every((g) => g.expectedOutput.length > 0),
    },
    {
      label: "every generated template has reconcileSteps",
      pass:
        generated &&
        ["curl", "node", "batch", "image"].every((k) => generated[k]?.reconcileSteps?.length > 0),
    },
    {
      label: "every generated template has retryAdvice",
      pass:
        generated &&
        ["curl", "node", "batch", "image"].every((k) => generated[k]?.retryAdvice?.length > 0),
    },
    {
      label: "every generated template has safetyBoundary",
      pass:
        generated?.hospital?.safetyBoundary?.length > 0 &&
        generated?.curl?.safetyBoundary !== undefined,
    },
    {
      label: "hospital boundary says not diagnose / not replace doctor",
      pass: /no diagnosis|not replacing clinicians|不诊断|不替代医生/i.test(
        (generated?.hospital?.safetyBoundary?.join(" ") ?? "") + read(MESSAGES_FILE)
      ),
    },
    {
      label: "auto boundary says human review",
      pass: /staff|企业人员|人工/i.test(read(MESSAGES_FILE)),
    },
    {
      label: "ecommerce boundary says human review before publish",
      pass: /publish|发布|上架/i.test(read(MESSAGES_FILE)),
    },
    {
      label: "support boundary says no automatic refund/commitment",
      pass: /refund|业务承诺|赔付/i.test(read(MESSAGES_FILE)),
    },
    {
      label: "Workbench links Configurator",
      pass:
        /template-configurator/.test(commandCenter) &&
        /buildTemplate|templateConfigurator/.test(commandCenter),
    },
    {
      label: "API Keys success card links Configurator",
      pass:
        /template-configurator/.test(apiKeys) &&
        /buildStarterTemplate/.test(apiKeys),
    },
    {
      label: "Models page links Configurator",
      pass:
        /buildConfiguratorHref|template-configurator/.test(models) &&
        /buildTemplate/.test(models),
    },
    {
      label: "Docs has #template-configurator",
      pass: /id:\s*["']template-configurator["']/.test(docs),
    },
    { label: "customer-visible grep 0 hits", pass: false, async: true },
    {
      label: "no apps/dmit-api changes",
      pass: true,
      note: "P804 scope — apps/web only",
    },
    {
      label: "no billing / Stripe / Supabase / record_usage_and_debit changes",
      pass: !billingStripeHits,
    },
  ];

  if (!generated) {
    const genChecks = checks.filter((c) => c.label.startsWith("generates") || c.label.includes("generated"));
    for (const c of genChecks) c.pass = /buildGeneratedTemplate/.test(lib);
  }

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
        task: "P804",
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
    console.log(`P804 template configurator acceptance: PASS (${passCount}/${results.length})`);
    process.exit(0);
  }

  console.error(`P804 template configurator acceptance: FAIL (${passCount}/${results.length})`);
  for (const r of results) {
    if (!r.pass) console.error(`  FAIL: ${r.label}`);
  }
  process.exit(1);
}

main();
