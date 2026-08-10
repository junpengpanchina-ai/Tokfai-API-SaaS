/**
 * P1080 — STATIC SOURCE CHECK for responses stream cancel/queue hotfix.
 *
 *   node scripts/p1080-responses-stream-cancel-queue-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS = "TOKFAI_P1080_RESPONSES_STREAM_CANCEL_QUEUE_SMOKE_PASS";
const FAIL = "TOKFAI_P1080_RESPONSES_STREAM_CANCEL_QUEUE_SMOKE_FAIL";

let failed = 0;
function assert(cond, label, detail) {
  if (cond) console.log(`PASS  [STATIC] ${label}`);
  else {
    failed += 1;
    console.error(`FAIL  [STATIC] ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const grsai = read("apps/dmit-api/src/upstream/grsai.ts");
const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
const early = read("apps/dmit-api/src/lib/earlySseStream.ts");
const respond = read("apps/dmit-api/src/lib/respondEarlySse.ts");
const queue = read("apps/dmit-api/src/gateway/heavyResponsesQueue.ts");
const policy = read("apps/dmit-api/src/lib/upstreamTimeoutPolicy.ts");
const sse = read("apps/dmit-api/src/lib/responsesSse.ts");
const env = read("apps/dmit-api/src/env.ts");

assert(
  grsai.includes("abortSignal") &&
    grsai.includes("combineAbortSignals") &&
    grsai.includes("responses_client_cancel_abort_upstream") &&
    grsai.includes("clientAborted"),
  "grsai: client abort aborts upstream fetch"
);

assert(
  early.includes("onClientCancel") && early.includes("notifyClientCancelExactlyOnce"),
  "earlySse: cancel notifies abort chain"
);

assert(
  respond.includes("upstreamAbort") &&
    respond.includes("responses_client_cancel_abort_upstream") &&
    respond.includes("failureToResponsesSseEnvelope") &&
    respond.includes("responsesFailedSseBody"),
  "respondEarlySse: abort chain + responses failed SSE"
);

assert(
  exec.includes('clientStream && route === "/v1/responses"') &&
    exec.includes("client_cancel") &&
    exec.includes("client_cancel_after_provider_pending") &&
    exec.includes("abortSignal"),
  "exec: stream queue + cancel billing guard"
);

{
  const after = exec.indexOf("input.onAfterPrecheck");
  const acq = exec.indexOf("heavyPermit = await acquireHeavyResponsesPermit");
  assert(
    after > 0 && acq > after,
    "exec: onAfterPrecheck before Heavy acquire (SSE while queued)"
  );
}

assert(
  queue.includes("heavy_slot_released") &&
    queue.includes("reason?: string") &&
    exec.includes('? "client_cancel"'),
  "queue: heavy_slot_released + exec client_cancel reason"
);

assert(
  policy.includes("responses_stream_no_output_guard") &&
    env.includes("TOKFAI_RESPONSES_STREAM_NO_OUTPUT_TIMEOUT_MS"),
  "policy/env: no-output timeout"
);

assert(
  sse.includes("responsesFailedSseBody") && sse.includes("response.failed"),
  "responsesSse: failed+[DONE] helper"
);

assert(
  !exec.includes('route: "/v1/chat/completions",\n        clientStream: true,\n        abortSignal') &&
    true,
  "chat stream path not forced into responses abort wiring via route change"
);

if (failed > 0) {
  console.error(FAIL);
  process.exit(1);
}
console.log(PASS);
process.exit(0);
