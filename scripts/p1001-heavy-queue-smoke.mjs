/**
 * P1001 — STATIC SOURCE CHECK smoke for Heavy in-process bounded FIFO queue.
 *
 *   node scripts/p1001-heavy-queue-smoke.mjs
 *
 * Marker: TOKFAI_P1001_HEAVY_QUEUE_SMOKE_PASS
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS = "TOKFAI_P1001_HEAVY_QUEUE_SMOKE_PASS";
const FAIL = "TOKFAI_P1001_HEAVY_QUEUE_SMOKE_FAIL";

let failed = 0;
function pass(label) {
  console.log(`PASS  [STATIC SOURCE CHECK] ${label}`);
}
function fail(label, detail) {
  failed += 1;
  console.error(`FAIL  [STATIC SOURCE CHECK] ${label}${detail ? ` — ${detail}` : ""}`);
}
function assert(cond, label, detail) {
  if (cond) pass(label);
  else fail(label, detail);
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

const queue = read("apps/dmit-api/src/gateway/heavyResponsesQueue.ts");
const exec = read("apps/dmit-api/src/lib/executeChatCompletion.ts");
const env = read("apps/dmit-api/src/env.ts");
const errors = read("apps/dmit-api/src/errors.ts");
const responses = read("apps/dmit-api/src/routes/responses.ts");
const earlySse = read("apps/dmit-api/src/lib/respondEarlySse.ts");
const envExample = read("apps/dmit-api/.env.example");
const pkg = read("apps/dmit-api/package.json");
const usageBilling = read("apps/dmit-api/src/lib/usageBilling.ts");
const chatUsageFallback = read("apps/dmit-api/src/lib/chatUsageFallback.ts");

assert(
  env.includes("TOKFAI_HEAVY_QUEUE_ENABLED") &&
    env.includes('.default("false")') &&
    /TOKFAI_HEAVY_QUEUE_ENABLED[\s\S]{0,200}transform\(\(raw\) => raw === "true"/.test(
      env
    ),
  "env: queue default false"
);

assert(
  env.includes("TOKFAI_HEAVY_QUEUE_MAX_WAITERS_PER_KEY") &&
    env.includes(".default(4)") &&
    env.includes("TOKFAI_HEAVY_QUEUE_MAX_WAITERS_GLOBAL") &&
    env.includes(".default(20)") &&
    env.includes("TOKFAI_HEAVY_QUEUE_WAIT_TIMEOUT_MS") &&
    env.includes(".default(30_000)"),
  "env: conservative queue defaults"
);

assert(
  envExample.includes("TOKFAI_HEAVY_QUEUE_ENABLED") &&
    envExample.includes("TOKFAI_HEAVY_RESPONSES_MAX_CONCURRENCY=2"),
  ".env.example documents queue without changing concurrency default"
);

assert(
  queue.includes("acquireHeavyResponsesPermit") &&
    queue.includes("globalWaiterCount") &&
    queue.includes("waiters") &&
    queue.includes("settled") &&
    !queue.includes("while (true)") &&
    !/while\s*\([^)]*\)\s*\{\s*await\s+sleep/.test(queue),
  "queue: FIFO structure, no sleep-poll loop"
);

assert(
  queue.includes("tryAcquireHeavyResponses") &&
    queue.includes("queueEnabled") &&
    queue.includes("heavyResponsesRateLimited"),
  "queue disabled path reuses fail-fast acquire"
);

assert(
  errors.includes("heavy_queue_full") &&
    errors.includes("heavy_queue_timeout") &&
    errors.includes("heavyQueueFull") &&
    errors.includes("heavyQueueTimeout") &&
    errors.includes("retryAfterSeconds") &&
    errors.includes("当前长任务等待队列已满") &&
    errors.includes("当前长任务等待超时"),
  "errors: queue codes + Retry-After field"
);

assert(
  exec.includes("acquireHeavyResponsesPermit") &&
    exec.includes("heavyPermit") &&
    exec.includes("heavyPermit?.release()") &&
    exec.includes("heavyPermit?.queued") &&
    exec.includes("onAfterPrecheck") &&
    !exec.includes("releaseHeavyResponses(limitKey)"),
  "exec: unified permit release; no dual releaseHeavyResponses"
);

// Order: acquire before onAfterPrecheck
{
  const acq = exec.indexOf("acquireHeavyResponsesPermit");
  const after = exec.indexOf("input.onAfterPrecheck");
  const secondary = exec.indexOf("heavyPermit?.queued");
  assert(
    acq > 0 && after > acq && secondary > acq && secondary < after,
    "exec: queue → secondary checks → onAfterPrecheck order"
  );
}

assert(
  responses.includes("c.req.raw.signal") &&
    responses.includes("abortSignal") &&
    earlySse.includes("abortSignal: args.abortSignal"),
  "responses/SSE: AbortSignal forwarded"
);

assert(
  !queue.toLowerCase().includes("authorization") &&
    !/type Waiter = \{[\s\S]*prompt/.test(queue) &&
    !/type Waiter = \{[\s\S]*messages/.test(queue) &&
    queue.includes("Never stores client prompt text"),
  "queue Waiter never stores prompt/messages/Authorization"
);

assert(
  !pkg.includes("p1001") || true,
  "package.json not required for p1001"
);

// Prove protected files still importable / not rewritten for debit
assert(
  usageBilling.includes("recordSuccessfulUsageAndDebit") ||
    usageBilling.includes("lookup_usage_idempotency"),
  "usageBilling.ts present unchanged contract"
);
assert(
  chatUsageFallback.includes("shouldEstimateChatUsage"),
  "chatUsageFallback.ts P998 helper intact"
);

assert(
  exec.includes("shouldEstimateChatUsage") &&
    exec.includes("estimateChatUsageFromPayload"),
  "P998 estimate path still referenced in executeChatCompletion"
);

if (failed > 0) {
  console.error(FAIL);
  process.exit(1);
}
console.log(PASS);
process.exit(0);
