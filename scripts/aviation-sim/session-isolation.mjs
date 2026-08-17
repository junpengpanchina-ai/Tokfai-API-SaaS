#!/usr/bin/env node
/**
 * Session isolation self-check against in-process mock state (design-level).
 * Does not prove DMIT production isolation until wired to dual API keys.
 */
const store = new Map();

function put(tenant, key, value) {
  const bag = store.get(tenant) || new Map();
  bag.set(key, value);
  store.set(tenant, bag);
}

function get(tenant, key) {
  return store.get(tenant)?.get(key);
}

put("A", "previous_response_id", "resp_A");
put("A", "tool_result", "secret_A");
put("A", "billing", { charged: 1, tenant: "A" });
put("B", "previous_response_id", "resp_B");
put("B", "tool_result", "secret_B");
put("B", "billing", { charged: 1, tenant: "B" });

const checks = [
  ["A_state_not_in_B", get("B", "tool_result") !== "secret_A"],
  ["B_cannot_resume_A", get("B", "previous_response_id") !== "resp_A"],
  ["billing_not_crossed", get("A", "billing").tenant === "A" && get("B", "billing").tenant === "B"],
];

const failed = checks.filter(([, ok]) => !ok);
console.log(
  JSON.stringify(
    {
      P1233_SESSION_ISOLATION: failed.length === 0 ? "INPROC_PASS" : "FAIL",
      checks,
      note: "INPROC only — DMIT dual-key isolation still required for SESSION_ISOLATION_PASS",
    },
    null,
    2
  )
);
process.exit(failed.length ? 1 : 0);
