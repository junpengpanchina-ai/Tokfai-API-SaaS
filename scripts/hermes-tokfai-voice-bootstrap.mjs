#!/usr/bin/env node
/**
 * INTERNAL helper only (P1072/P1073).
 *
 * Consumers must NOT run this from Terminal.
 * Product path: scripts/hermes-tokfai-connector.mjs (gui | install | connect).
 */

import { homedir } from "node:os";
import { join } from "node:path";
import {
  applyHermesTokfaiSttSync,
  normalizeBaseUrl,
} from "./lib/hermes-tokfai-stt-sync.mjs";

const PASS = "TOKFAI_HERMES_VOICE_BOOTSTRAP_OK";
const FAIL = "TOKFAI_HERMES_VOICE_BOOTSTRAP_FAIL";

function arg(name, envName) {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return process.env[envName] ?? "";
}

const baseUrl = normalizeBaseUrl(arg("--base-url", "TOKFAI_BASE_URL"));
const apiKey = arg("--api-key", "TOKFAI_API_KEY");
const model = arg("--model", "TOKFAI_MODEL") || "gpt-5.5";
const hermesHome = process.env.HERMES_HOME || join(homedir(), ".hermes");
const dryRun =
  process.env.DRY_RUN === "1" || process.argv.includes("--dry-run");

if (!baseUrl.startsWith("http")) {
  console.error(FAIL);
  console.error("Base URL required");
  process.exit(1);
}
if (!apiKey.startsWith("sk-tokfai_")) {
  console.error(FAIL);
  console.error("API Key must be sk-tokfai_...");
  process.exit(1);
}

const result = applyHermesTokfaiSttSync({
  hermesHome,
  baseUrl,
  apiKey,
  model,
  dryRun,
  mode: "connect",
  backupTag: "p1072-bootstrap",
});

console.log("INTERNAL: prefer scripts/hermes-tokfai-connector.mjs for consumers");
console.log(JSON.stringify(result, null, 2));
console.log(result.ok ? PASS : FAIL);
process.exit(result.ok ? 0 : 1);
