/**
 * P993-IMAGE-CIRCUIT — Read-only image breaker diagnostics.
 *
 * Usage:
 *   npx tsx scripts/inspect-image-circuit.ts
 *
 * Prints in-process breaker snapshots. Does NOT print API keys.
 * Note: when Redis is enabled, this process only sees state after hydrate
 * or local mutations; for production ops, run against the live DMIT host
 * or inspect Redis keys tokfai:image_circuit:*.
 */

import {
  IMAGE_CIRCUIT_DEFAULTS,
  listImageCircuitSnapshots,
} from "../apps/dmit-api/src/images/imageCircuitBreaker.ts";

function main(): void {
  const snaps = listImageCircuitSnapshots();
  const report = {
    store: "process_memory",
    notes: [
      "PM2 single instance today — in-memory breaker is authoritative per process.",
      "PM2 restart without Redis clears breaker state (all closed).",
      "When TOKFAI_REDIS_ENABLED, state is also mirrored under redisKey(image_circuit, key).",
      "Chat/responses breakers use a different key space and are never listed here.",
    ],
    config: IMAGE_CIRCUIT_DEFAULTS,
    breakers: snaps.map((s) => ({
      key: s.key,
      state: s.state,
      consecutive_failures: s.consecutive_failures,
      rolling_requests: s.rolling_requests,
      rolling_failures: s.rolling_failures,
      failure_rate: Number(s.failure_rate.toFixed(4)),
      opened_at: s.opened_at,
      retry_at: s.retry_at,
      half_open_in_flight: s.half_open_in_flight,
      last_failure_code: s.last_failure_code,
      open_count: s.open_count,
    })),
    count: snaps.length,
  };
  console.log(JSON.stringify(report, null, 2));
}

main();
