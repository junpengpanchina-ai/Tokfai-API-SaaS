#!/usr/bin/env node
/**
 * Node probe that replicates verified curl for POST /v1/responses (non-stream).
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_xxx node scripts/live-responses-curl-compatible-probe.mjs
 *
 * Success banner:
 *   TOKFAI_LIVE_RESPONSES_CURL_COMPATIBLE_PASS
 */

import {
  LIVE_RESPONSES_PROMPT,
  maskApiKeyShort,
  postResponsesNonStreamCurlCompatible,
  printCurlCompatibleDebug,
  responsesNonStreamSucceeded,
} from "./lib/live-curl-compatible-fetch.mjs";
import { normalizeApiBase } from "./lib/public-beta-live-helpers.mjs";

const API_KEY = (process.env.TOKFAI_API_KEY ?? "").trim();
const BASE = normalizeApiBase(process.env.TOKFAI_API_BASE);
const MODEL = (process.env.TOKFAI_PROBE_MODEL ?? "gpt-5.5").trim() || "gpt-5.5";
const TIMEOUT_MS = Math.max(
  30_000,
  parseInt(process.env.TOKFAI_LIVE_TIMEOUT_MS ?? "120000", 10) || 120_000
);

async function main() {
  console.log("=== Tokfai live responses curl-compatible probe ===");
  console.log(`base: ${BASE}`);
  console.log(`api_key: ${maskApiKeyShort(API_KEY)}`);
  console.log(`model: ${MODEL}`);
  console.log(`prompt: ${LIVE_RESPONSES_PROMPT}`);
  console.log("");

  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error("TOKFAI_API_KEY is required (sk-tokfai_...).");
    process.exit(1);
  }

  const result = await postResponsesNonStreamCurlCompatible({
    apiBase: BASE,
    apiKey: API_KEY,
    model: MODEL,
    timeoutMs: TIMEOUT_MS,
  });

  if (responsesNonStreamSucceeded(result)) {
    const outputText =
      typeof result.body?.output_text === "string"
        ? result.body.output_text.slice(0, 80)
        : "(output present)";
    const rid =
      result.body?.request_id ??
      result.headers?.["x-request-id"] ??
      result.body?.id ??
      "(n/a)";
    console.log(
      `PASS  responses non-stream ${MODEL} — HTTP ${result.status} request_id=${rid} output_text=${JSON.stringify(outputText)}`
    );
    console.log("TOKFAI_LIVE_RESPONSES_CURL_COMPATIBLE_PASS");
    process.exit(0);
  }

  printCurlCompatibleDebug(result, API_KEY);
  console.error(
    `\nFAIL  responses non-stream ${MODEL} — HTTP ${result.status}` +
      (result.emptyRawBody ? " EMPTY_RAW_BODY_FROM_FETCH" : "")
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
