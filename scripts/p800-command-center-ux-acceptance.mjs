#!/usr/bin/env node
/**
 * Internal operator offline acceptance — not customer documentation.
 *
 * P800 — customer command center UX polish gate.
 */

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COMMAND_CENTER_STEP_IDS,
  COMMAND_CENTER_STORAGE_KEY,
} from "./p799-command-center-logic.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p800-command-center-ux-results");
const LATEST_FILE = join(RESULTS_DIR, "latest.json");
const GREP_SCRIPT = join(ROOT, "scripts/p778-docs-customer-visible-grep.mjs");

const SAMPLE_CURL =
  'curl -sS https://api.tokfai.com/v1/chat/completions -H "Authorization: Bearer sk-tokfai_test" -H "Content-Type: application/json" -d \'{"model":"auto-fast","messages":[{"role":"user","content":"Say ok only."}],"stream":false}\'';

function read(path) {
  return readFileSync(path, "utf8");
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
  const centerUi = read(join(ROOT, "apps/web/components/integration-command-center.tsx"));
  const centerLib = read(join(ROOT, "apps/web/lib/customer-integration-command-center.ts"));
  const apiKeys = read(join(ROOT, "apps/web/app/dashboard/api-keys/api-keys-client.tsx"));
  const models = read(join(ROOT, "apps/web/app/dashboard/models/models-client.tsx"));
  const docs = read(join(ROOT, "apps/web/lib/docs/customer-docs-content.ts"));
  const copyFields = read(join(ROOT, "apps/web/components/one-line-curl-copy-fields.tsx"));

  const storageType =
    centerLib.match(/type CommandCenterPersistedState\s*=\s*\{[\s\S]*?\n\}/)?.[0] ?? "";

  const checks = [
    {
      label: "Command Center has header and primary CTA",
      pass:
        /gatewayHint/.test(centerUi) &&
        /OneLineCurlCopyFields/.test(centerUi) &&
        /primaryCopy/.test(centerUi),
    },
    {
      label: "Primary CTA is one-line Chat curl",
      pass:
        /primaryCopy=\{true\}/.test(centerUi) &&
        /ctaCopyCurl|copyOneLineChatCurl/.test(centerUi + apiKeys),
    },
    {
      label: "8 steps exist",
      pass: COMMAND_CENTER_STEP_IDS.length === 8,
    },
    {
      label: "Each step has goal/action/expected output keys",
      pass:
        /goalKey/.test(centerLib) &&
        /nextActionKey/.test(centerLib) &&
        /expectedOutputKey/.test(centerLib),
    },
    {
      label: "Copy one-line curl text contains no cd",
      pass: !/\bcd\s/.test(SAMPLE_CURL),
    },
    {
      label: "Copy one-line curl text contains no TOKFAI_API_KEY env var",
      pass: !/TOKFAI_API_KEY/.test(SAMPLE_CURL) && !/process\.env/.test(SAMPLE_CURL),
    },
    {
      label: "Copy one-line curl text can be pasted as one line",
      pass: !SAMPLE_CURL.includes("\n") && SAMPLE_CURL.startsWith("curl "),
    },
    {
      label: "API Keys success card has one-line curl first",
      pass:
        /one-time-secret-copy-chat-curl-primary/.test(apiKeys) &&
        apiKeys.indexOf("one-time-secret-copy-chat-curl-primary") <
          apiKeys.indexOf("startIntegrationWorkbench"),
    },
    {
      label: "API Keys success card links Integration Workbench",
      pass: /\/dashboard\/integration-workbench/.test(apiKeys),
    },
    {
      label: "Models page recommends auto-fast",
      pass:
        /auto-fast/.test(models) &&
        /startFromModelAutoFast|recommendedStartingModel/.test(models),
    },
    {
      label: "Models page links Workbench",
      pass: /\/dashboard\/integration-workbench/.test(models),
    },
    {
      label: "Docs top has 6-step customer path",
      pass:
        /id: "customer-integration-path"/.test(docs) &&
        /customerPathStep1/.test(docs) &&
        /customerPathStep6/.test(docs),
    },
    {
      label: "Usage/Credits links exist",
      pass:
        /\/dashboard\/usage/.test(centerUi + apiKeys) &&
        /\/dashboard\/credits/.test(centerUi + apiKeys),
    },
    {
      label: "Mobile-safe overflow classes",
      pass:
        /min-w-0/.test(centerUi) &&
        /overflow-x-auto/.test(centerUi + copyFields) &&
        /ResponsiveTableScroll/.test(models),
    },
    {
      label: "localStorage does not store API key / secret",
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
        suite: "p800-command-center-ux-acceptance",
        timestamp: new Date().toISOString(),
        pass,
        checks,
      },
      null,
      2
    )
  );

  console.log("=== P800 command center UX acceptance ===");
  for (const check of checks) {
    console.log(
      `[${check.pass ? "PASS" : "FAIL"}] ${check.label}${check.detail ? ` — ${check.detail}` : ""}`
    );
  }
  console.log("");
  console.log(`P800 command center UX acceptance: ${pass ? "PASS" : "FAIL"}`);
  console.log(`results: ${LATEST_FILE}`);
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
