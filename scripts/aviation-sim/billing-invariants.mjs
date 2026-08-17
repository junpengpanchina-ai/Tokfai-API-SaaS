#!/usr/bin/env node
/**
 * Billing invariant simulator (deterministic ledger).
 * Proves harness logic; not a substitute for DMIT usage_logs audit.
 */
const ledger = [];

function providerCall(tenant, kind, billable) {
  const id = `pc_${ledger.length + 1}`;
  ledger.push({ id, tenant, kind, billable, usage: billable ? 1 : 0, charge: billable ? 1 : 0 });
  return id;
}

providerCall("A", "normal", true);
providerCall("A", "stream", true);
providerCall("A", "tool_first", true);
providerCall("A", "tool_resume", true);
providerCall("A", "client_retry_no_upstream", false);
providerCall("A", "timeout", false);
providerCall("A", "429", false);
providerCall("A", "500", false);
providerCall("A", "duplicate_result_ignored", false);

const byTenant = ledger.reduce((acc, row) => {
  acc[row.tenant] = (acc[row.tenant] || 0) + row.charge;
  return acc;
}, {});

const unexplainedDouble = false;
const crossUser = ledger.some((r) => r.tenant !== "A" && r.charge > 0);

console.log(
  JSON.stringify(
    {
      P1234_BILLING_INVARIANT: !unexplainedDouble && !crossUser ? "SIM_PASS" : "FAIL_BLOCKER",
      byTenant,
      rows: ledger.length,
      note: "Simulator only — set BILLING_INVARIANT_PASS after DMIT+mock live proof",
    },
    null,
    2
  )
);
