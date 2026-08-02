/**
 * P993-IMAGE-CIRCUIT unit tests (no DB / no live upstream).
 *
 * Marker: TOKFAI_P993_IMAGE_CIRCUIT_PASS
 *
 *   npx tsx scripts/p993-image-circuit-unit.mts
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  __imageCircuitTestReset,
  acquireImageCircuit,
  classifyImageFailureCode,
  imageCircuitKey,
  IMAGE_CIRCUIT_PROVIDER_ID,
  listImageCircuitSnapshots,
  peekImageCircuit,
  recordImageCircuitResult,
} from "../apps/dmit-api/src/images/imageCircuitBreaker.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS = "TOKFAI_P993_IMAGE_CIRCUIT_PASS";
const FAIL = "TOKFAI_P993_IMAGE_CIRCUIT_FAIL";

let failed = 0;
let now = 1_000_000;

function pass(label: string) {
  console.log(`PASS  ${label}`);
}
function fail(label: string, detail?: string) {
  failed += 1;
  console.error(`FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
}
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) pass(label);
  else fail(label, detail);
}

function reset(): void {
  now = 1_000_000;
  __imageCircuitTestReset({
    now: () => now,
    config: null,
    clear: true,
  });
}

function key(model = "nano-banana-fast", op: "text_to_image" | "image_to_image" = "text_to_image") {
  return imageCircuitKey(IMAGE_CIRCUIT_PROVIDER_ID, model, op);
}

function runBreakerTests(): void {
  // 1) 3 consecutive timeouts → OPEN
  reset();
  {
    const k = key();
    for (let i = 0; i < 3; i++) {
      assert(acquireImageCircuit(k).allowed, `1.setup acquire#${i + 1}`);
      recordImageCircuitResult({
        key: k,
        success: false,
        code: "upstream_timeout",
        category: "provider",
      });
    }
    const snap = listImageCircuitSnapshots().find((s) => s.key === k);
    assert(snap?.state === "open", "1. consecutive 3 timeouts → OPEN", snap?.state);
  }

  // 2) OPEN does not allow acquire
  {
    const k = key();
    const a = acquireImageCircuit(k);
    assert(
      !a.allowed && a.skippedReason === "circuit_open",
      "2. OPEN skips provider call"
    );
  }

  // 3) OPEN can fall back to another model key that is closed
  {
    const k2 = key("nano-banana");
    const a = acquireImageCircuit(k2);
    assert(a.allowed && a.stateAfter === "closed", "3. fallback model still CLOSED/allowed");
  }

  // 4) classification for all_image_upstreams_unavailable is provider (used when all open)
  assert(
    classifyImageFailureCode("all_image_upstreams_unavailable") === "provider",
    "4. all_image_upstreams_unavailable classified"
  );

  // 5) cooldown → HALF_OPEN
  {
    const k = key();
    now += 60_000; // initialOpenMs
    const a = acquireImageCircuit(k);
    assert(
      a.allowed && a.stateAfter === "half_open",
      "5. after cooldown → HALF_OPEN probe allowed",
      `${a.stateAfter} allowed=${a.allowed}`
    );
  }

  // 6) HALF_OPEN success x2 → CLOSED
  {
    const k = key();
    // first success (probe already acquired above — need fresh half_open)
    recordImageCircuitResult({ key: k, success: true, category: "provider" });
    let snap = listImageCircuitSnapshots().find((s) => s.key === k);
    // still half_open after 1 success
    assert(
      snap?.state === "half_open" || snap?.state === "closed",
      "6a. after 1 success still half_open or closed"
    );
    if (snap?.state === "half_open") {
      assert(acquireImageCircuit(k).allowed, "6b. second probe acquire");
      recordImageCircuitResult({ key: k, success: true, category: "provider" });
    }
    snap = listImageCircuitSnapshots().find((s) => s.key === k);
    assert(snap?.state === "closed", "6. HALF_OPEN 2 successes → CLOSED", snap?.state);
  }

  // 7) HALF_OPEN failure → re-OPEN
  reset();
  {
    const k = key("nano-banana-2");
    for (let i = 0; i < 3; i++) {
      acquireImageCircuit(k);
      recordImageCircuitResult({
        key: k,
        success: false,
        code: "upstream_timeout",
        category: "provider",
      });
    }
    now += 60_000;
    assert(acquireImageCircuit(k).allowed, "7a. enter HALF_OPEN");
    recordImageCircuitResult({
      key: k,
      success: false,
      code: "upstream_timeout",
      category: "provider",
    });
    const snap = listImageCircuitSnapshots().find((s) => s.key === k);
    assert(snap?.state === "open", "7. HALF_OPEN failure → OPEN", snap?.state);
  }

  // 8) 400 / invalid request does not trip
  reset();
  {
    const k = key();
    for (let i = 0; i < 5; i++) {
      acquireImageCircuit(k);
      recordImageCircuitResult({
        key: k,
        success: false,
        code: "invalid_request_error",
        category: classifyImageFailureCode("invalid_request_error"),
      });
    }
    const snap = listImageCircuitSnapshots().find((s) => s.key === k);
    assert(
      snap?.state === "closed" && snap.consecutive_failures === 0,
      "8. invalid_request does not open breaker"
    );
  }

  // 9) content policy refusal does not trip
  reset();
  {
    const k = key();
    for (let i = 0; i < 5; i++) {
      acquireImageCircuit(k);
      recordImageCircuitResult({
        key: k,
        success: false,
        code: "content_policy_refusal",
        category: classifyImageFailureCode("content_policy_refusal"),
      });
    }
    const snap = listImageCircuitSnapshots().find((s) => s.key === k);
    assert(snap?.state === "closed", "9. content_policy_refusal does not open");
  }

  // 10) provider asset 404 counts
  reset();
  {
    const k = key();
    for (let i = 0; i < 3; i++) {
      acquireImageCircuit(k);
      recordImageCircuitResult({
        key: k,
        success: false,
        code: "provider_asset_unavailable",
        category: "provider",
      });
    }
    const snap = listImageCircuitSnapshots().find((s) => s.key === k);
    assert(snap?.state === "open", "10. provider_asset_unavailable trips OPEN");
  }

  // 11) persist failure does not lower health
  reset();
  {
    const k = key();
    for (let i = 0; i < 5; i++) {
      acquireImageCircuit(k);
      recordImageCircuitResult({
        key: k,
        success: false,
        code: "asset_persist_failed",
        category: classifyImageFailureCode("asset_persist_failed"),
      });
    }
    const snap = listImageCircuitSnapshots().find((s) => s.key === k);
    assert(
      snap?.state === "closed" && (snap?.consecutive_failures ?? 0) === 0,
      "11. asset_persist_failed does not lower provider health"
    );
  }

  // HALF_OPEN busy
  reset();
  {
    const k = key("gpt-image-2");
    for (let i = 0; i < 3; i++) {
      acquireImageCircuit(k);
      recordImageCircuitResult({
        key: k,
        success: false,
        code: "upstream_timeout",
        category: "provider",
      });
    }
    now += 60_000;
    assert(acquireImageCircuit(k).allowed, "busy.setup probe1");
    const busy = acquireImageCircuit(k);
    assert(
      !busy.allowed && busy.skippedReason === "breaker_half_open_busy",
      "HALF_OPEN second acquire → busy"
    );
    // peek must not mutate
    const peek = peekImageCircuit(k);
    assert(
      !peek.allowed && peek.skippedReason === "breaker_half_open_busy",
      "peek half_open busy without mutate"
    );
  }
}

function runStaticGuards(): void {
  const worker = readFileSync(
    join(ROOT, "apps/dmit-api/src/images/worker.ts"),
    "utf8"
  );
  const routes = readFileSync(
    join(ROOT, "apps/dmit-api/src/routes/images.ts"),
    "utf8"
  );
  const chat = readFileSync(
    join(ROOT, "apps/dmit-api/src/lib/executeChatCompletion.ts"),
    "utf8"
  );
  const breaker = readFileSync(
    join(ROOT, "apps/dmit-api/src/images/imageCircuitBreaker.ts"),
    "utf8"
  );
  const chatBreaker = readFileSync(
    join(ROOT, "apps/dmit-api/src/upstream/modelCircuitBreaker.ts"),
    "utf8"
  );

  assert(
    worker.includes("acquireImageCircuit") &&
      worker.includes("buildImageAttemptChain") &&
      worker.includes("recordImageCircuitResult"),
    "12/13. worker uses circuit + attempt chain before charge"
  );
  assert(
    worker.includes("await recordImageUsageAndDebit") &&
      worker.indexOf("const acquired = acquireImageCircuit") <
        worker.indexOf("await recordImageUsageAndDebit"),
    "12. acquire happens before sole debit call"
  );
  assert(
    !routes.includes("debit_credits") &&
      !routes.includes("recordImageUsageAndDebit") &&
      !routes.includes("acquireImageCircuit("),
    "14. GET/POST routes: no debit; POST only peeks"
  );
  assert(
    routes.includes("peekImageCircuit"),
    "14b. POST preflight uses peekImageCircuit"
  );
  assert(
    !chat.includes("imageCircuitBreaker") &&
      !chat.includes("acquireImageCircuit"),
    "15. chat/completions untouched by image circuit"
  );
  assert(
    breaker.includes('redisKey("image_circuit"') &&
      !chatBreaker.includes("image_circuit"),
    "15b. image circuit Redis namespace isolated from chat"
  );
  assert(
    classifyImageFailureCode("insufficient_credits") === "client" &&
      classifyImageFailureCode("usage_billing_failed") === "internal",
    "classification: credits/billing not provider"
  );
}

async function main(): Promise<void> {
  console.log("P993 image circuit unit tests");
  runBreakerTests();
  runStaticGuards();
  if (failed > 0) {
    console.error(FAIL);
    process.exit(1);
  }
  console.log(PASS);
}

main().catch((err) => {
  console.error(err);
  console.error(FAIL);
  process.exit(1);
});
