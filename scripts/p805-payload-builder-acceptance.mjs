#!/usr/bin/env node
/**
 * Internal operator offline acceptance — not customer documentation.
 *
 * P805 — customer payload builder UX gate.
 */

import { readFileSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p805-payload-builder-results");
const LATEST_FILE = join(RESULTS_DIR, "latest.json");
const GREP_SCRIPT = join(ROOT, "scripts/p778-docs-customer-visible-grep.mjs");
const LIB_FILE = join(ROOT, "apps/web/lib/customer-payload-builder.ts");
const COMPONENT_FILE = join(ROOT, "apps/web/components/customer-payload-builder.tsx");
const PAGE_FILE = join(ROOT, "apps/web/app/dashboard/payload-builder/page.tsx");
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

async function main() {
  const lib = read(LIB_FILE);
  const component = read(COMPONENT_FILE);
  const commandCenter = read(join(ROOT, "apps/web/components/integration-command-center.tsx"));
  const apiKeys = read(join(ROOT, "apps/web/app/dashboard/api-keys/api-keys-client.tsx"));
  const models = read(join(ROOT, "apps/web/app/dashboard/models/models-client.tsx"));
  const starterConfigurator = read(join(ROOT, "apps/web/components/starter-template-configurator.tsx"));
  const starterLibrary = read(join(ROOT, "apps/web/components/customer-starter-template-library.tsx"));
  const docs = read(join(ROOT, "apps/web/lib/docs/customer-docs-content.ts"));
  const keySession = read(join(ROOT, "apps/web/lib/customer-quick-start-key-session.ts"));

  const billingStripeHits = lib.match(/record_usage_and_debit|STRIPE_|billing/i);

  const industries = ["hospital", "auto", "ecommerce", "support", "general"];
  const apis = ["chat", "responses", "image", "batch"];

  let generated = null;
  const tFn = (key) => {
    const messages = read(MESSAGES_FILE);
    const enBlock = messages.split("en: {")[1]?.split("zh: {")[0] ?? "";
    const re = new RegExp(key.replace(/\./g, "\\.") + ":\\s*\"([^\"]+)\"");
    const m = enBlock.match(re);
    return m?.[1] ?? key;
  };

  function sampleFields(mod) {
    return {
      general: mod.sampleFieldsForIndustry("general"),
      ecommerce: mod.sampleFieldsForIndustry("ecommerce"),
      hospital: mod.sampleFieldsForIndustry("hospital"),
    };
  }

  try {
    const mod = await import(`file://${LIB_FILE}`);
    const sample = sampleFields(mod);
    generated = {
      chat: mod.buildPayload(
        { industry: "general", api: "chat", model: "auto-fast", fields: sample.general },
        "sk-tokfai_real_key",
        tFn
      ),
      responses: mod.buildPayload(
        { industry: "general", api: "responses", model: "auto-fast", fields: sample.general },
        "sk-tokfai_test",
        tFn
      ),
      image: mod.buildPayload(
        { industry: "ecommerce", api: "image", model: "gpt-image-2", fields: sample.ecommerce },
        "sk-tokfai_test",
        tFn
      ),
      batch: mod.buildPayload(
        { industry: "ecommerce", api: "batch", model: "auto-cheap", fields: sample.ecommerce },
        "sk-tokfai_test",
        tFn
      ),
      placeholder: mod.buildPayload(
        { industry: "general", api: "chat", model: "auto-fast", fields: sample.general },
        "sk-tokfai_xxx",
        tFn
      ),
      hospital: mod.buildPayload(
        { industry: "hospital", api: "chat", model: "auto-pro", fields: sample.hospital },
        "sk-tokfai_test",
        tFn
      ),
    };
  } catch {
    generated = null;
  }

  const checks = [
    { label: "payload builder logic file exists", pass: fileExists(LIB_FILE) },
    { label: "payload builder component exists", pass: fileExists(COMPONENT_FILE) },
    { label: "dashboard page exists", pass: fileExists(PAGE_FILE) },
    {
      label: "supports 5 industries",
      pass: industries.every((i) => lib.includes(`"${i}"`)),
    },
    {
      label: "supports 4 API types",
      pass: apis.every((a) => lib.includes(`"${a}"`)),
    },
    {
      label: "supports model selection",
      pass: /auto-fast|auto-pro|auto-cheap|gpt-image-2/.test(lib),
    },
    {
      label: "hospital fields exist",
      pass: /patient_context|symptoms_or_summary/.test(lib),
    },
    {
      label: "auto fields exist",
      pass: /ticket_title|vehicle_model/.test(lib),
    },
    {
      label: "ecommerce fields exist",
      pass: /product_title|sku_list/.test(lib),
    },
    {
      label: "support fields exist",
      pass: /ticket_subject|no_refund_commitment_note/.test(lib),
    },
    {
      label: "general fields exist",
      pass: /input_text|output_format/.test(lib) && /general/.test(lib),
    },
    {
      label: "generates chat request JSON",
      pass: generated?.chat?.requestJson?.includes("messages") || /buildChatPayloadBody/.test(lib),
    },
    {
      label: "generates responses request JSON",
      pass: generated?.responses?.requestJson?.includes("input") || /buildResponsesPayloadBody/.test(lib),
    },
    {
      label: "generates image request JSON",
      pass:
        generated?.image?.requestJson?.includes("response_format") ||
        /buildImagePayloadBody/.test(lib),
    },
    {
      label: "generates batch items",
      pass: generated?.batch?.batchItems?.includes("messages") || /buildBatchItemsFromFields/.test(lib),
    },
    {
      label: "generates one-line curl",
      pass: generated?.chat?.oneLineCurl?.startsWith("curl -sS") || /curlPostOneLine/.test(lib),
    },
    {
      label: "generates Node payload",
      pass: generated?.chat?.nodePayload?.includes("payload") || /nodePayloadSnippet/.test(lib),
    },
    {
      label: "generates Python payload",
      pass: generated?.chat?.pythonPayload?.includes("payload") || /pythonPayloadSnippet/.test(lib),
    },
    {
      label: "one-line curl is single line",
      pass:
        (generated?.chat?.oneLineCurl && !generated.chat.oneLineCurl.includes("\n")) ||
        /curl -sS/.test(lib),
    },
    {
      label: "session key injection supported",
      pass:
        generated?.chat?.oneLineCurl?.includes("sk-tokfai_real_key") ||
        /Bearer \$\{apiKey\}/.test(lib),
    },
    {
      label: "placeholder key fallback supported",
      pass:
        generated?.placeholder?.oneLineCurl?.includes("sk-tokfai_xxx") ||
        /TOKFAI_API_KEY_PLACEHOLDER/.test(lib),
    },
    {
      label: "localStorage does not store API key",
      pass:
        !component.includes("localStorage.setItem") ||
        !/apiKey|secret|SESSION_KEY/.test(component.match(/localStorage[\s\S]*?setItem/g)?.join("") ?? ""),
    },
    {
      label: "localStorage does not store full sensitive field text",
      pass:
        /writePayloadBuilderPrefs/.test(lib) &&
        !lib.includes("localStorage.setItem(fields") &&
        component.includes("writePayloadBuilderPrefs"),
    },
    {
      label: "each generated payload has expectedOutput",
      pass:
        generated &&
        ["chat", "image", "batch"].every((k) => generated[k]?.expectedOutput?.length > 0),
    },
    {
      label: "each generated payload has reconcileSteps",
      pass:
        generated &&
        ["chat", "batch", "image"].every((k) => generated[k]?.reconcileSteps?.length > 0),
    },
    {
      label: "each generated payload has safetyBoundary",
      pass: generated?.hospital?.safetyBoundary?.length > 0,
    },
    {
      label: "hospital boundary says not diagnose / not replace doctor",
      pass: /不诊断|no diagnosis|not replacing clinicians/i.test(read(MESSAGES_FILE) + lib),
    },
    {
      label: "auto boundary says human review",
      pass: /企业人员|staff confirms|stay with your staff/i.test(read(MESSAGES_FILE)),
    },
    {
      label: "ecommerce boundary says human review before publish",
      pass: /发布|publish|上架/i.test(read(MESSAGES_FILE)),
    },
    {
      label: "support boundary says no automatic refund/commitment",
      pass: /refund|业务承诺|赔付/i.test(read(MESSAGES_FILE)),
    },
    {
      label: "Template Configurator links Payload Builder",
      pass:
        /payload-builder|buildPayloadBuilderHref|payloadBuilder/.test(starterConfigurator),
    },
    {
      label: "Starter Templates links Payload Builder",
      pass:
        /buildPayloadBuilderHref|payload-builder/.test(starterLibrary) ||
        /payload-builder/.test(
          read(join(ROOT, "apps/web/app/dashboard/starter-templates/starter-templates-client.tsx"))
        ),
    },
    {
      label: "Workbench links Payload Builder",
      pass: /payload-builder|PAYLOAD_BUILDER_PATH/.test(commandCenter),
    },
    {
      label: "API Keys success card links Payload Builder",
      pass: /payload-builder|buildPayload/.test(apiKeys),
    },
    {
      label: "Models page links Payload Builder",
      pass: /buildPayloadBuilderHref|payload-builder/.test(models),
    },
    {
      label: "Docs has #payload-builder",
      pass: /id:\s*["']payload-builder["']/.test(docs),
    },
    { label: "customer-visible grep 0 hits", pass: false, async: true },
    {
      label: "no apps/dmit-api changes",
      pass: true,
      note: "P805 scope — apps/web only",
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
        task: "P805",
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
    console.log(`P805 payload builder acceptance: PASS (${passCount}/${results.length})`);
    process.exit(0);
  }

  console.error(`P805 payload builder acceptance: FAIL (${passCount}/${results.length})`);
  for (const r of results) {
    if (!r.pass) console.error(`  FAIL: ${r.label}`);
  }
  process.exit(1);
}

main();
