#!/usr/bin/env node
/**
 * P961 — Image upstream cost reconciliation / orphan cost guard smoke.
 *
 * Asserts:
 * 1) Static: persist provider_task_id on submit, timeout_pending → reconcile,
 *    orphan_cost_audit, required log fields, no Chat/P954 edits
 * 2) Scenario matrix: success / timeout_pending / later_completed /
 *    provider_failed / missing_url
 * 3) Orphan alarms: provider_success_unpaid, charged_missing_url,
 *    stale_timeout_pending
 * 4) timeout_pending unpaid ∉ bad_billing_failures
 * 5) Mock soft-timeout still processing+timeout_pending not_billable
 *
 * Usage:
 *   node scripts/p961-image-cost-reconciliation-smoke.mjs
 *
 * Acceptance:
 *   TOKFAI_P961_IMAGE_COST_RECONCILIATION_PASS
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import { pass, fail } from "./lib/client-compat-smoke-bootstrap.mjs";
import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";
import {
  auditOrphanCost,
  decideReconcileAction,
  ORPHAN_TIMEOUT_PENDING_THRESHOLD_MS,
  P961_ORPHAN_ALARM_FIXTURES,
  P961_SCENARIO_FIXTURES,
} from "./lib/image-cost-reconciliation.mjs";
import { summarizeImageConcurrencyLoad } from "./lib/image-concurrency-load.mjs";

const SCRIPT = "scripts/p961-image-cost-reconciliation-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P961_IMAGE_COST_RECONCILIATION_PASS";
const FAIL_MARKER = "TOKFAI_P961_IMAGE_COST_RECONCILIATION_FAIL";

const REQUIRED_LOG_FIELDS = [
  "tokfai_request_id",
  "provider_task_id",
  "provider_status",
  "customer_billing_status",
  "credits_charged",
  "reconcile_result",
];

function readSrc(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function assertStatic() {
  let ok = true;

  const worker = readSrc("apps/dmit-api/src/images/worker.ts");
  const tasksDb = readSrc("apps/dmit-api/src/images/tasksDb.ts");
  const reconcile = readSrc("apps/dmit-api/src/images/costReconcile.ts");
  const audit = readSrc("apps/dmit-api/src/images/orphanCostAudit.ts");
  const logger = readSrc("apps/dmit-api/src/logger.ts");
  const index = readSrc("apps/dmit-api/src/index.ts");
  const migration = readSrc(
    "supabase/migrations/0037_p961_image_cost_reconciliation.sql"
  );
  const asyncProv = readSrc("apps/dmit-api/src/upstream/imageAsyncProvider.ts");
  const nano = readSrc("apps/dmit-api/src/upstream/nanoBananaImageProvider.ts");
  const policy = readSrc("apps/dmit-api/src/images/imageTimeoutPolicy.ts");
  const isolation = readSrc("apps/dmit-api/src/lib/imageProviderIsolation.ts");
  const chat = readSrc("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const images = readSrc("apps/dmit-api/src/routes/images.ts");

  ok =
    (migration.includes("provider_task_id") &&
    migration.includes("upstream_request_id") &&
    migration.includes("reconcile_status") &&
    migration.includes("orphan_cost_flags")
      ? pass("static: migration P961 reconcile columns")
      : fail("static: migration P961 reconcile columns")) && ok;

  ok =
    (tasksDb.includes("markImageTaskUpstreamSubmitted") &&
    tasksDb.includes("provider_task_id") &&
    tasksDb.includes("listImageTasksNeedingReconcile") &&
    tasksDb.includes('reconcile_status: "pending"')
      ? pass("static: tasksDb persist upstream + reconcile pending")
      : fail("static: tasksDb persist upstream + reconcile pending")) && ok;

  ok =
    (worker.includes("onUpstreamSubmitted") &&
    worker.includes("markImageTaskUpstreamSubmitted") &&
    worker.includes("keepReconcilePending") &&
    worker.includes("image_timeout_pending") &&
    !worker.includes("chatGateway")
      ? pass("static: worker submit persist + soft timeout reconcile")
      : fail("static: worker submit persist + soft timeout reconcile")) && ok;

  ok =
    (asyncProv.includes("onUpstreamSubmitted") &&
    nano.includes("onUpstreamSubmitted")
      ? pass("static: providers call onUpstreamSubmitted")
      : fail("static: providers call onUpstreamSubmitted")) && ok;

  ok =
    (reconcile.includes("startImageCostReconcileLoop") &&
    reconcile.includes("later_completed") &&
    reconcile.includes("orphan_cost_audit") &&
    reconcile.includes("provider_failed") &&
    reconcile.includes("hard_timeout") &&
    index.includes("startImageCostReconcileLoop")
      ? pass("static: reconcile loop + later_completed/orphan")
      : fail("static: reconcile loop + later_completed/orphan")) && ok;

  ok =
    (audit.includes("auditOrphanCost") &&
    audit.includes("provider_success_unpaid") &&
    audit.includes("charged_missing_url") &&
    audit.includes("stale_timeout_pending") &&
    audit.includes("decideReconcileAction")
      ? pass("static: orphanCostAudit helpers")
      : fail("static: orphanCostAudit helpers")) && ok;

  ok =
    (REQUIRED_LOG_FIELDS.every((f) => logger.includes(`"${f}"`)) &&
    REQUIRED_LOG_FIELDS.every((f) => reconcile.includes(f))
      ? pass("static: logger allowlist + reconcile log fields")
      : fail("static: logger allowlist + reconcile log fields")) && ok;

  ok =
    (policy.includes("P961") &&
    policy.includes("timeout_pending") &&
    policy.includes("Does not touch Chat")
      ? pass("static: timeout policy notes P961, no chat")
      : fail("static: timeout policy notes P961, no chat")) && ok;

  ok =
    (isolation.includes("IMAGE_MODEL_NOT_FOR_CHAT_CODE") &&
    isolation.includes("MODEL_NOT_IMAGE_CAPABLE_CODE") &&
    chat.includes("image_model_not_for_chat") &&
    images.includes("model_not_image_capable")
      ? pass("static: P954 isolation codes unchanged")
      : fail("static: P954 isolation codes unchanged")) && ok;

  // Chat main path must not import image reconcile.
  ok =
    (!chat.includes("costReconcile") &&
    !chat.includes("orphanCostAudit") &&
    !chat.includes("markImageTaskUpstreamSubmitted")
      ? pass("static: Chat path untouched by P961")
      : fail("static: Chat path untouched by P961")) && ok;

  return ok;
}

function assertScenarios() {
  let ok = true;

  for (const key of Object.keys(P961_SCENARIO_FIXTURES)) {
    const fx = P961_SCENARIO_FIXTURES[key];
    const decision = decideReconcileAction(fx.decide);
    const audit = auditOrphanCost(fx);

    const actionOk = decision.action === fx.expectAction;
    const auditOk = audit.ok === fx.expectAuditOk;

    ok =
      (actionOk && auditOk
        ? pass(
            `scenario:${fx.name} action=${decision.action} audit_ok=${audit.ok}`
          )
        : fail(
            `scenario:${fx.name}`,
            `action=${decision.action} expect=${fx.expectAction}; audit_ok=${audit.ok} expect=${fx.expectAuditOk} alarms=${audit.alarms.join(",")}`
          )) && ok;

    if (fx.name === "timeout_pending") {
      ok =
        (decision.billable === false &&
        decision.customerBillingStatus === "pending"
          ? pass("scenario:timeout_pending not immediately billed")
          : fail("scenario:timeout_pending not immediately billed")) && ok;
    }

    if (fx.name === "later_completed") {
      ok =
        (decision.billable === true &&
        decision.customerBillingStatus === "charged"
          ? pass("scenario:later_completed billable after reconcile")
          : fail("scenario:later_completed billable after reconcile")) && ok;
    }

    if (fx.name === "provider_failed") {
      ok =
        (decision.customerBillingStatus === "not_billable"
          ? pass("scenario:provider_failed stays not_billable")
          : fail("scenario:provider_failed stays not_billable")) && ok;
    }
  }

  for (const key of Object.keys(P961_ORPHAN_ALARM_FIXTURES)) {
    const fx = P961_ORPHAN_ALARM_FIXTURES[key];
    const audit = auditOrphanCost(fx);
    ok =
      (!audit.ok && audit.alarms.includes(fx.expectAlarm)
        ? pass(`orphan_alarm:${fx.expectAlarm}`)
        : fail(
            `orphan_alarm:${fx.expectAlarm}`,
            JSON.stringify(audit)
          )) && ok;
  }

  // Hard timeout decision
  const hard = decideReconcileAction({
    providerStatus: "processing",
    providerUrl: null,
    hardTimedOut: true,
  });
  ok =
    (hard.action === "hard_timeout" && hard.customerBillingStatus === "not_billable"
      ? pass("scenario:provider hard timeout → retryable path not_billable")
      : fail("scenario:provider hard timeout → retryable path not_billable")) &&
    ok;

  // unpaid timeout_pending not bad_billing
  const summary = summarizeImageConcurrencyLoad([
    {
      status: "timeout_pending",
      credits: 0,
      billingStatus: "not_billable",
      url: null,
      errorCode: "image_task_timeout_pending",
      latencyMs: 5_000,
      timeoutPending: true,
    },
    {
      status: "completed",
      credits: 1400,
      billingStatus: "billable",
      url: "https://example.com/ok.png",
      errorCode: null,
      latencyMs: 8_000,
    },
  ]);
  ok =
    (summary.timeout_pending === 1 &&
    summary.bad_billing_failures === 0 &&
    summary.billable_success === 1
      ? pass("summary: unpaid timeout_pending ∉ bad_billing_failures")
      : fail(
          "summary: unpaid timeout_pending ∉ bad_billing_failures",
          JSON.stringify(summary)
        )) && ok;

  ok =
    (ORPHAN_TIMEOUT_PENDING_THRESHOLD_MS >= 60_000
      ? pass("orphan threshold defined (≥60s)")
      : fail("orphan threshold defined (≥60s)")) && ok;

  return ok;
}

async function assertMockSoftTimeout() {
  let ok = true;
  const mock = await ensureMockGateway();
  const BASE = mock.baseUrl.replace(/\/v1$/, "");
  const API_KEY = mock.apiKey;
  const mockChild = mock.child ?? null;

  try {
    const create = await acceptanceFetch(`${BASE}/v1/images/generations`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "nano-banana",
        prompt: "__tokfai_image_soft_timeout__ p961 soft",
        size: "1024x1024",
        n: 1,
        response_format: "url",
      }),
      timeoutMs: 30_000,
    });

    const taskId = create.body?.task_id ?? create.body?.id;
    if (
      !(create.res.status === 200 || create.res.status === 202) ||
      typeof taskId !== "string"
    ) {
      return (
        fail(
          "mock soft submit",
          `status=${create.res.status}`
        ) && false
      );
    }
    pass(`mock soft submit task_id=${taskId}`);

    let softSeen = false;
    let completed = null;
    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      await sleep(120);
      const poll = await acceptanceFetch(
        `${BASE}/v1/images/generations/${encodeURIComponent(taskId)}`,
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            "Content-Type": "application/json",
          },
          timeoutMs: 15_000,
        }
      );
      if (poll.res.status >= 500) {
        ok = fail("mock soft poll must not 500") && false;
        break;
      }
      if (
        poll.body?.processing &&
        (poll.body?.timeout_pending ||
          poll.body?.tokfai?.timeout_pending ||
          poll.body?.task_timeout)
      ) {
        if (!softSeen) {
          softSeen = true;
          const unpaid =
            poll.body?.tokfai?.billing_status === "not_billable" &&
            Number(poll.body?.tokfai?.credits_charged ?? 0) === 0 &&
            !poll.body?.error;
          ok =
            (unpaid
              ? pass("mock: timeout_pending processing not_billable")
              : fail(
                  "mock: timeout_pending processing not_billable",
                  JSON.stringify(poll.body?.tokfai)
                )) && ok;
        }
      }
      if (poll.body?.status === "completed") {
        completed = poll.body;
        break;
      }
    }

    ok =
      (softSeen
        ? pass("mock: soft timeout_pending observed")
        : fail("mock: soft timeout_pending observed")) && ok;

    ok =
      (completed?.status === "completed" &&
      typeof completed?.data?.[0]?.url === "string" &&
      completed?.tokfai?.billing_status === "billable"
        ? pass("mock: later completed+url billable (success path)")
        : fail(
            "mock: later completed+url billable (success path)",
            JSON.stringify(completed?.tokfai)
          )) && ok;

    // P954 still holds on mock
    const chatReject = await acceptanceFetch(`${BASE}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "nano-banana",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 8,
      }),
      timeoutMs: 15_000,
    });
    ok =
      (chatReject.res.status === 400 &&
      chatReject.body?.error?.code === "image_model_not_for_chat"
        ? pass("P954: image→chat still rejected")
        : fail(
            "P954: image→chat still rejected",
            JSON.stringify(chatReject.body?.error)
          )) && ok;
  } finally {
    if (mockChild) {
      try {
        mockChild.kill();
      } catch {
        // ignore
      }
    }
  }

  return ok;
}

async function main() {
  console.log("=== P961 Image cost reconciliation / orphan cost guard ===");
  console.log(`script: ${SCRIPT}`);

  let ok = assertStatic();
  ok = assertScenarios() && ok;
  ok = (await assertMockSoftTimeout()) && ok;

  if (ok) {
    console.log(PASS_MARKER);
    process.exit(0);
  }
  console.error(FAIL_MARKER);
  process.exit(1);
}

main().catch((err) => {
  console.error(FAIL_MARKER, err);
  process.exit(1);
});
