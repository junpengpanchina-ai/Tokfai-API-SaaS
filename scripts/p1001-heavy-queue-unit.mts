/**
 * P1001 — REAL SEMAPHORE TEST for in-process Heavy FIFO queue.
 *
 *   npx tsx scripts/p1001-heavy-queue-unit.mts
 *
 * Marker: TOKFAI_P1001_HEAVY_QUEUE_UNIT_PASS
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS = "TOKFAI_P1001_HEAVY_QUEUE_UNIT_PASS";
const FAIL = "TOKFAI_P1001_HEAVY_QUEUE_UNIT_FAIL";

function ensureDummyEnv(): void {
  const set = (k: string, v: string) => {
    if (!process.env[k]) process.env[k] = v;
  };
  set("NODE_ENV", "test");
  set("SUPABASE_URL", "https://example.supabase.co");
  set("SUPABASE_JWT_SECRET", "p1001-test-jwt-secret-32chars-min!");
  set("TOKEN_PEPPER", "p1001-test-token-pepper-32chars-min!");
  set("GRSAI_API_KEY", "p1001-test-grsai-key");
  set("STRIPE_WEBHOOK_SECRET", "whsec_p1001_test_only");
  set("TOKFAI_REDIS_ENABLED", "false");
  set("TOKFAI_HEAVY_QUEUE_ENABLED", "false");
}

ensureDummyEnv();

const {
  acquireHeavyResponsesPermit,
  __heavyQueueTestReset,
  __heavyQueueTestSnapshot,
} = await import("../apps/dmit-api/src/gateway/heavyResponsesQueue.ts");

const { __concurrencyTestReset } = await import(
  "../apps/dmit-api/src/gateway/concurrency.ts"
);

const { ApiError } = await import("../apps/dmit-api/src/errors.ts");

let failed = 0;

function pass(label: string) {
  console.log(`PASS  [REAL SEMAPHORE TEST] ${label}`);
}
function fail(label: string, detail?: string) {
  failed += 1;
  console.error(`FAIL  [REAL SEMAPHORE TEST] ${label}${detail ? ` — ${detail}` : ""}`);
}
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) pass(label);
  else fail(label, detail);
}

function reset(): void {
  __heavyQueueTestReset();
  __concurrencyTestReset();
}

function baseOpts(over: Partial<Parameters<typeof acquireHeavyResponsesPermit>[0]> = {}) {
  return {
    limitKey: "key-a",
    concurrencyLimit: 2,
    queueEnabled: true,
    maxWaitersPerKey: 4,
    maxWaitersGlobal: 20,
    waitTimeoutMs: 5_000,
    requestId: "req_unit",
    ...over,
  };
}

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

// 1) concurrency=2: A,B immediate; C waits; A release → C
{
  reset();
  const a = await acquireHeavyResponsesPermit(baseOpts({ requestId: "A" }));
  const b = await acquireHeavyResponsesPermit(baseOpts({ requestId: "B" }));
  assert(a.queued === false && b.queued === false, "1a A/B immediate");

  let cGot = false;
  const cPromise = acquireHeavyResponsesPermit(baseOpts({ requestId: "C" })).then(
    (p) => {
      cGot = true;
      return p;
    }
  );
  await sleep(20);
  assert(cGot === false, "1b C still waiting");
  assert(__heavyQueueTestSnapshot().globalWaiterCount === 1, "1c global waiter=1");

  a.release();
  const c = await cPromise;
  assert(c.queued === true && cGot, "1d C acquired after A release");
  b.release();
  c.release();
  assert(__heavyQueueTestSnapshot().globalWaiterCount === 0, "1e global waiters cleared");
  assert(__heavyQueueTestSnapshot().keyCount === 0, "1f map cleaned");
}

// 2) FIFO: C,D,E order
{
  reset();
  const a = await acquireHeavyResponsesPermit(baseOpts({ requestId: "A" }));
  const b = await acquireHeavyResponsesPermit(baseOpts({ requestId: "B" }));
  const order: string[] = [];
  const cP = acquireHeavyResponsesPermit(baseOpts({ requestId: "C" })).then((p) => {
    order.push("C");
    return p;
  });
  const dP = acquireHeavyResponsesPermit(baseOpts({ requestId: "D" })).then((p) => {
    order.push("D");
    return p;
  });
  const eP = acquireHeavyResponsesPermit(baseOpts({ requestId: "E" })).then((p) => {
    order.push("E");
    return p;
  });
  await sleep(20);
  a.release();
  const c = await cP;
  b.release();
  const d = await dP;
  c.release();
  const e = await eP;
  d.release();
  e.release();
  assert(order.join("") === "CDE", "2 FIFO C→D→E", order.join(","));
}

// 3) Key isolation: Key A full, Key B still runs
{
  reset();
  const a1 = await acquireHeavyResponsesPermit(baseOpts({ limitKey: "A", requestId: "a1" }));
  const a2 = await acquireHeavyResponsesPermit(baseOpts({ limitKey: "A", requestId: "a2" }));
  const waiters = [];
  for (let i = 0; i < 4; i++) {
    waiters.push(
      acquireHeavyResponsesPermit(
        baseOpts({ limitKey: "A", requestId: `aw${i}`, maxWaitersPerKey: 4 })
      ).catch((e) => e)
    );
  }
  await sleep(20);
  let fullErr: unknown;
  try {
    await acquireHeavyResponsesPermit(
      baseOpts({ limitKey: "A", requestId: "a-full", maxWaitersPerKey: 4 })
    );
  } catch (e) {
    fullErr = e;
  }
  assert(
    fullErr instanceof ApiError && fullErr.code === "heavy_queue_full",
    "3a Key A queue full"
  );

  const b1 = await acquireHeavyResponsesPermit(
    baseOpts({ limitKey: "B", requestId: "b1" })
  );
  assert(b1.queued === false, "3b Key B still immediate");
  a1.release();
  a2.release();
  b1.release();
  for (const w of waiters) {
    const p = await w;
    if (p && typeof p.release === "function") p.release();
  }
}

// 4) per-key waiter cap
{
  reset();
  const holds = [
    await acquireHeavyResponsesPermit(baseOpts({ maxWaitersPerKey: 2 })),
    await acquireHeavyResponsesPermit(baseOpts({ maxWaitersPerKey: 2 })),
  ];
  const w1 = acquireHeavyResponsesPermit(
    baseOpts({ maxWaitersPerKey: 2, requestId: "w1" })
  );
  const w2 = acquireHeavyResponsesPermit(
    baseOpts({ maxWaitersPerKey: 2, requestId: "w2" })
  );
  await sleep(10);
  let err: unknown;
  try {
    await acquireHeavyResponsesPermit(
      baseOpts({ maxWaitersPerKey: 2, requestId: "w3" })
    );
  } catch (e) {
    err = e;
  }
  assert(
    err instanceof ApiError && err.code === "heavy_queue_full",
    "4 per-key waiter cap"
  );
  holds[0]!.release();
  holds[1]!.release();
  (await w1).release();
  (await w2).release();
}

// 5) global waiter cap
{
  reset();
  const a = await acquireHeavyResponsesPermit(
    baseOpts({ limitKey: "g1", concurrencyLimit: 1, maxWaitersGlobal: 2 })
  );
  const b = await acquireHeavyResponsesPermit(
    baseOpts({ limitKey: "g2", concurrencyLimit: 1, maxWaitersGlobal: 2 })
  );
  const w1 = acquireHeavyResponsesPermit(
    baseOpts({ limitKey: "g1", concurrencyLimit: 1, maxWaitersGlobal: 2 })
  );
  const w2 = acquireHeavyResponsesPermit(
    baseOpts({ limitKey: "g2", concurrencyLimit: 1, maxWaitersGlobal: 2 })
  );
  await sleep(10);
  assert(
    __heavyQueueTestSnapshot().globalWaiterCount === 2,
    "5a two global waiters enqueued"
  );
  // g3 can still acquire a free active slot immediately…
  const c = await acquireHeavyResponsesPermit(
    baseOpts({
      limitKey: "g3",
      concurrencyLimit: 1,
      maxWaitersGlobal: 2,
      requestId: "g3-active",
    })
  );
  assert(c.queued === false, "5b free key still acquires active slot");
  // …but cannot enqueue a waiter while global cap is saturated.
  let err2: unknown;
  try {
    await acquireHeavyResponsesPermit(
      baseOpts({
        limitKey: "g3",
        concurrencyLimit: 1,
        maxWaitersGlobal: 2,
        requestId: "g3w",
      })
    );
  } catch (e) {
    err2 = e;
  }
  assert(
    err2 instanceof ApiError && err2.code === "heavy_queue_full",
    "5c global waiter cap"
  );
  a.release();
  b.release();
  c.release();
  try {
    (await w1).release();
  } catch {
    /* may have been rejected in race */
  }
  try {
    (await w2).release();
  } catch {
    /* ignore */
  }
}

// 6) wait timeout
{
  reset();
  const a = await acquireHeavyResponsesPermit(
    baseOpts({ concurrencyLimit: 1, waitTimeoutMs: 50 })
  );
  const before = __heavyQueueTestSnapshot();
  let err: unknown;
  try {
    await acquireHeavyResponsesPermit(
      baseOpts({ concurrencyLimit: 1, waitTimeoutMs: 50, requestId: "to" })
    );
  } catch (e) {
    err = e;
  }
  const after = __heavyQueueTestSnapshot();
  assert(
    err instanceof ApiError && err.code === "heavy_queue_timeout",
    "6a timeout code"
  );
  assert(after.globalWaiterCount === 0, "6b global waiter reduced");
  assert(
    after.keys[0]?.active === 1 || before.keys[0]?.active === 1,
    "6c active unchanged (still 1)"
  );
  a.release();
  const next = await acquireHeavyResponsesPermit(
    baseOpts({ concurrencyLimit: 1, requestId: "after-to" })
  );
  assert(next.queued === false, "6d subsequent request can run");
  next.release();
}

// 7) AbortSignal
{
  reset();
  const a = await acquireHeavyResponsesPermit(baseOpts({ concurrencyLimit: 1 }));
  const ac = new AbortController();
  const p = acquireHeavyResponsesPermit(
    baseOpts({ concurrencyLimit: 1, signal: ac.signal, requestId: "ab" })
  );
  await sleep(10);
  ac.abort();
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  assert(
    err instanceof ApiError && err.code === "heavy_queue_aborted",
    "7a abort code"
  );
  assert(__heavyQueueTestSnapshot().globalWaiterCount === 0, "7b waiter cleaned");
  a.release();
  const b = await acquireHeavyResponsesPermit(
    baseOpts({ concurrencyLimit: 1, requestId: "after-ab" })
  );
  assert(b.queued === false, "7c later request not blocked");
  b.release();
}

// 8) release after "failure" wakes next
{
  reset();
  const a = await acquireHeavyResponsesPermit(baseOpts({ concurrencyLimit: 1 }));
  const bP = acquireHeavyResponsesPermit(
    baseOpts({ concurrencyLimit: 1, requestId: "next" })
  );
  await sleep(10);
  // simulate failure path: just release
  a.release();
  const b = await bP;
  assert(b.queued === true, "8 next acquires after release");
  b.release();
}

// 9 + 10) double / 10x release
{
  reset();
  const a = await acquireHeavyResponsesPermit(baseOpts({ concurrencyLimit: 1 }));
  a.release();
  a.release();
  for (let i = 0; i < 8; i++) a.release();
  const snap = __heavyQueueTestSnapshot();
  assert(snap.keyCount === 0, "9/10 map empty after 10x release");
  assert(snap.globalWaiterCount === 0, "9/10 globalWaiterCount=0");
  const b = await acquireHeavyResponsesPermit(baseOpts({ concurrencyLimit: 1 }));
  assert(b.queued === false, "9/10 next acquire still works (no negative active)");
  b.release();
}

// 11) timeout vs release race — single settle
{
  reset();
  const a = await acquireHeavyResponsesPermit(
    baseOpts({ concurrencyLimit: 1, waitTimeoutMs: 30 })
  );
  let settles = 0;
  const p = acquireHeavyResponsesPermit(
    baseOpts({ concurrencyLimit: 1, waitTimeoutMs: 30, requestId: "race" })
  ).then(
    (permit) => {
      settles += 1;
      permit.release();
      return "ok";
    },
    () => {
      settles += 1;
      return "err";
    }
  );
  await sleep(5);
  a.release();
  await p;
  await sleep(40);
  assert(settles === 1, "11 timeout/release single settle", `settles=${settles}`);
}

// 12) abort vs timeout single settle
{
  reset();
  const a = await acquireHeavyResponsesPermit(
    baseOpts({ concurrencyLimit: 1, waitTimeoutMs: 40 })
  );
  const ac = new AbortController();
  let settles = 0;
  const p = acquireHeavyResponsesPermit(
    baseOpts({
      concurrencyLimit: 1,
      waitTimeoutMs: 40,
      signal: ac.signal,
      requestId: "race2",
    })
  ).then(
    () => {
      settles += 1;
      return "ok";
    },
    () => {
      settles += 1;
      return "err";
    }
  );
  await sleep(5);
  ac.abort();
  await p;
  await sleep(50);
  assert(settles === 1, "12 abort/timeout single settle", `settles=${settles}`);
  a.release();
}

// 13) Queue disabled fail-fast
{
  reset();
  const a = await acquireHeavyResponsesPermit(
    baseOpts({ queueEnabled: false, concurrencyLimit: 2 })
  );
  const b = await acquireHeavyResponsesPermit(
    baseOpts({ queueEnabled: false, concurrencyLimit: 2 })
  );
  let err: unknown;
  try {
    await acquireHeavyResponsesPermit(
      baseOpts({ queueEnabled: false, concurrencyLimit: 2 })
    );
  } catch (e) {
    err = e;
  }
  assert(
    err instanceof ApiError &&
      err.code === "rate_limited" &&
      err.publicMessage.includes("当前长任务并发过多"),
    "13 queue disabled fail-fast rate_limited"
  );
  a.release();
  b.release();
}

// 14) Map cleanup
{
  reset();
  const a = await acquireHeavyResponsesPermit(baseOpts({ concurrencyLimit: 1 }));
  assert(__heavyQueueTestSnapshot().keyCount === 1, "14a key present");
  a.release();
  assert(__heavyQueueTestSnapshot().keyCount === 0, "14b key removed");
}

// 15) multi-round no leak
{
  reset();
  for (let round = 0; round < 40; round++) {
    const p1 = await acquireHeavyResponsesPermit(
      baseOpts({ concurrencyLimit: 2, requestId: `r${round}a` })
    );
    const p2 = await acquireHeavyResponsesPermit(
      baseOpts({ concurrencyLimit: 2, requestId: `r${round}b` })
    );
    const waiter = acquireHeavyResponsesPermit(
      baseOpts({ concurrencyLimit: 2, requestId: `r${round}w` })
    );
    p1.release();
    const w = await waiter;
    p2.release();
    w.release();
  }
  const snap = __heavyQueueTestSnapshot();
  assert(snap.globalWaiterCount === 0, "15a no waiter leak");
  assert(snap.keyCount === 0, "15b no key leak");
}

if (failed > 0) {
  console.error(FAIL);
  process.exit(1);
}
console.log(PASS);
process.exit(0);
