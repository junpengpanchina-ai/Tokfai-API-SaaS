#!/usr/bin/env node
/**
 * P957 — Image async timeout hardening smoke.
 *
 * Asserts:
 * 1) Soft wait → processing + timeout_pending (image_task_timeout_pending)
 *    + trackable task_id (not hard fail)
 * 2) Poll continues after soft timeout; later completed+url → billable
 * 3) Hard __tokfai_image_timeout__ → image_task_timeout, not_billable
 * 4) timeout_pending / unpaid image_task_timeout ∉ bad_billing_failures
 * 5) 20 @ C1 summary: allow timeout_pending; forbid 500 / bad billing /
 *    missing_url_success / dirty runtime patterns in scripts
 * 6) P954 isolation codes unchanged (static)
 *
 * Usage (default mock):
 *   node scripts/p957-image-async-timeout-smoke.mjs
 *
 * Acceptance:
 *   TOKFAI_P957_IMAGE_ASYNC_TIMEOUT_PASS
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";
import {
  formatImageConcurrencySummary,
  runPool,
  summarizeImageConcurrencyLoad,
} from "./lib/image-concurrency-load.mjs";
import { pass, fail } from "./lib/client-compat-smoke-bootstrap.mjs";

const SCRIPT = "scripts/p957-image-async-timeout-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS_MARKER = "TOKFAI_P957_IMAGE_ASYNC_TIMEOUT_PASS";
const FAIL_MARKER = "TOKFAI_P957_IMAGE_ASYNC_TIMEOUT_FAIL";

const DIRTY_RUNTIME = [
  "api_error_500",
  "charged timeout",
  "message=undefined",
  "code=undefined",
  "empty body",
  "Cannot set headers after they are sent",
];

function readSrc(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function assertStatic() {
  let ok = true;
  const policy = readSrc("apps/dmit-api/src/images/imageTimeoutPolicy.ts");
  const pub = readSrc("apps/dmit-api/src/images/publicResponse.ts");
  const worker = readSrc("apps/dmit-api/src/images/worker.ts");
  const nano = readSrc("apps/dmit-api/src/upstream/nanoBananaImageProvider.ts");
  const isolation = readSrc("apps/dmit-api/src/lib/imageProviderIsolation.ts");
  const chat = readSrc("apps/dmit-api/src/lib/executeChatCompletion.ts");
  const images = readSrc("apps/dmit-api/src/routes/images.ts");
  const labels = readSrc(
    "apps/web/app/dashboard/image-playground/image-playground-labels.ts"
  );
  const frontendApi = readSrc("apps/web/lib/dashboard-safe/image-api.ts");

  ok =
    (policy.includes("IMAGE_SOFT_WAIT_MS") &&
    policy.includes("IMAGE_HARD_WAIT_MS") &&
    policy.includes("image_task_timeout_pending")
      ? pass("static: soft/hard wait + image_task_timeout_pending")
      : fail("static: soft/hard wait + image_task_timeout_pending")) && ok;

  ok =
    (pub.includes("timeout_pending") &&
    pub.includes("processing") &&
    pub.includes("IMAGE_SOFT_TIMEOUT_CODE") &&
    pub.includes("hasUrl")
      ? pass("static: publicResponse timeout_pending + billable only completed+url")
      : fail(
          "static: publicResponse timeout_pending + billable only completed+url"
        )) && ok;

  ok =
    (worker.includes("markImageTaskWaitWindowExceeded") &&
    worker.includes("onSoftWaitExceeded") &&
    !worker.includes("chatGateway")
      ? pass("static: worker soft wait + no chatGateway")
      : fail("static: worker soft wait + no chatGateway")) && ok;

  ok =
    (nano.includes("NANO_BANANA_HARD_WAIT_MS") &&
    nano.includes("onSoftWaitExceeded") &&
    nano.includes("image_task_timeout_pending")
      ? pass("static: nano banana soft-then-hard wait")
      : fail("static: nano banana soft-then-hard wait")) && ok;

  ok =
    (isolation.includes("IMAGE_MODEL_NOT_FOR_CHAT_CODE") &&
    isolation.includes("MODEL_NOT_IMAGE_CAPABLE_CODE") &&
    chat.includes("image_model_not_for_chat") &&
    images.includes("model_not_image_capable")
      ? pass("static: P954 isolation codes unchanged")
      : fail("static: P954 isolation codes unchanged")) && ok;

  ok =
    (labels.includes("timeoutPendingFriendly") &&
    labels.includes("statusTimeoutPending") &&
    /生成中，可稍后查询/.test(labels) &&
    frontendApi.includes("image_task_timeout_pending")
      ? pass("static: frontend pending copy (not failure)")
      : fail("static: frontend pending copy (not failure)")) && ok;

  const lib = readSrc("scripts/lib/image-concurrency-load.mjs");
  ok =
    (lib.includes("timeout_pending") &&
    /status === "timeout_pending"[\s\S]*bad_billing_failures/.test(lib)
      ? pass("static: timeout_pending only bad if charged")
      : fail("static: timeout_pending only bad if charged")) && ok;

  for (const rel of [
    "apps/dmit-api/src/images/worker.ts",
    "apps/dmit-api/src/images/publicResponse.ts",
    "apps/dmit-api/src/upstream/nanoBananaImageProvider.ts",
  ]) {
    const src = readSrc(rel);
    const hit = DIRTY_RUNTIME.find((p) => src.includes(p));
    ok =
      (!hit
        ? pass(`static dirty-free: ${rel}`)
        : fail(`static dirty-free: ${rel}`, hit)) && ok;
  }

  return ok;
}

async function main() {
  console.log("=== P957 Image async timeout hardening ===");
  console.log(`script: ${SCRIPT}`);
  let ok = assertStatic();

  {
    const rows = [
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
        status: "timeout",
        credits: 0,
        billingStatus: "not_billable",
        url: null,
        errorCode: "image_task_timeout",
        latencyMs: 120_000,
      },
      {
        status: "completed",
        credits: 1400,
        billingStatus: "billable",
        url: "https://example.com/ok.png",
        errorCode: null,
        latencyMs: 8_000,
      },
      {
        status: "completed",
        credits: 0,
        billingStatus: "not_billable",
        url: null,
        errorCode: null,
        latencyMs: 7_000,
      },
    ];
    const summary = summarizeImageConcurrencyLoad(rows);
    const good =
      summary.timeout_pending === 1 &&
      summary.timeout === 1 &&
      summary.billable_success === 1 &&
      summary.missing_url_success === 1 &&
      summary.bad_billing_failures === 0;
    ok =
      (good
        ? pass(
            "summary: unpaid timeout_pending / image_task_timeout not bad_billing"
          )
        : fail(
            "summary: unpaid timeout_pending / image_task_timeout not bad_billing",
            JSON.stringify(summary)
          )) && ok;
  }

  const mock = await ensureMockGateway();
  const BASE = mock.baseUrl.replace(/\/v1$/, "");
  const API_KEY = mock.apiKey;
  const mockChild = mock.child ?? null;

  async function postJson(path, body) {
    return acceptanceFetch(`${BASE}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      timeoutMs: 30_000,
    });
  }

  async function getJson(path) {
    return acceptanceFetch(`${BASE}${path}`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json",
      },
      timeoutMs: 30_000,
    });
  }

  try {
    {
      const { res, body, text } = await postJson("/v1/images/generations", {
        model: "nano-banana",
        prompt: "__tokfai_image_soft_timeout__ soft wait window",
        size: "1024x1024",
        n: 1,
        response_format: "url",
      });
      const taskId = body?.task_id ?? body?.id ?? null;
      if (
        !(res.status === 200 || res.status === 202) ||
        typeof taskId !== "string"
      ) {
        ok =
          fail(
            "soft submit accepted with task_id",
            `status=${res.status} body=${String(text).slice(0, 240)}`
          ) && false;
      } else {
        pass(`soft submit task_id=${taskId}`);
        let softSeen = false;
        let completed = null;
        const deadline = Date.now() + 8_000;
        while (Date.now() < deadline) {
          await sleep(120);
          const poll = await getJson(
            `/v1/images/generations/${encodeURIComponent(taskId)}`
          );
          if (poll.res.status >= 500) {
            ok =
              fail(
                "soft poll must not 500",
                `status=${poll.res.status}`
              ) && false;
            break;
          }
          if (
            poll.body?.processing &&
            (poll.body?.timeout_pending ||
              poll.body?.task_timeout ||
              poll.body?.tokfai?.timeout_pending ||
              poll.body?.tokfai?.task_timeout)
          ) {
            softSeen = true;
            const unpaid =
              poll.body?.tokfai?.billing_status === "not_billable" &&
              Number(poll.body?.tokfai?.credits_charged ?? 0) === 0 &&
              !poll.body?.error;
            ok =
              (unpaid
                ? pass(
                    "soft poll: processing+timeout_pending not_billable (no error)"
                  )
                : fail(
                    "soft poll: processing+timeout_pending not_billable (no error)",
                    JSON.stringify(poll.body?.tokfai)
                  )) && ok;
          }
          if (poll.body?.status === "completed") {
            completed = poll.body;
            break;
          }
        }
        ok =
          (softSeen
            ? pass("soft timeout_pending observed before completion")
            : fail("soft timeout_pending observed before completion")) && ok;
        const billableOk =
          completed?.status === "completed" &&
          typeof completed?.data?.[0]?.url === "string" &&
          completed?.tokfai?.billing_status === "billable";
        ok =
          (billableOk
            ? pass(
                "after soft timeout: completed+url billable via continued poll"
              )
            : fail(
                "after soft timeout: completed+url billable via continued poll",
                JSON.stringify(completed?.tokfai)
              )) && ok;
      }
    }

    {
      const { res, body, text } = await postJson("/v1/images/generations", {
        model: "nano-banana",
        prompt: "__tokfai_image_timeout__ force_image_task_timeout",
        size: "1024x1024",
        n: 1,
        response_format: "url",
      });
      const taskId = body?.task_id ?? body?.id;
      if (!(res.status === 200 || res.status === 202) || !taskId) {
        ok =
          fail(
            "hard timeout submit",
            `status=${res.status} ${String(text).slice(0, 200)}`
          ) && false;
      } else {
        let terminal = null;
        for (let i = 0; i < 30; i++) {
          await sleep(100);
          const poll = await getJson(
            `/v1/images/generations/${encodeURIComponent(taskId)}`
          );
          if (poll.res.status >= 500) {
            ok = fail("hard timeout poll must not 500") && false;
            break;
          }
          if (
            poll.body?.status === "retryable_timeout" ||
            poll.body?.status === "failed"
          ) {
            terminal = poll.body;
            break;
          }
        }
        const okHard =
          terminal?.status === "retryable_timeout" &&
          terminal?.error?.code === "image_task_timeout" &&
          terminal?.tokfai?.billing_status === "not_billable" &&
          Number(terminal?.tokfai?.credits_charged ?? 0) === 0;
        ok =
          (okHard
            ? pass("hard image_task_timeout → not_billable (no debit)")
            : fail(
                "hard image_task_timeout → not_billable (no debit)",
                JSON.stringify(terminal)
              )) && ok;
      }
    }

    // 20 @ C1 — allow timeout_pending; forbid 500 / bad billing / missing url
    {
      const COUNT = 20;
      const CONCURRENCY = 1;
      const POLL_BUDGET_MS = 400;
      let http500 = 0;

      const rows = await runPool(
        Array.from({ length: COUNT }, (_, i) => i),
        CONCURRENCY,
        async (i) => {
          const started = Date.now();
          const create = await postJson("/v1/images/generations", {
            model: "nano-banana",
            prompt: `__tokfai_image_soft_timeout__ c1-${i}`,
            size: "1024x1024",
            n: 1,
            response_format: "url",
          });
          if (create.res.status >= 500) http500 += 1;
          const taskId = create.body?.task_id ?? create.body?.id;
          if (
            !(create.res.status === 200 || create.res.status === 202) ||
            !taskId
          ) {
            return {
              status: "failed",
              credits: 0,
              billingStatus: "not_billable",
              url: null,
              errorCode: create.body?.error?.code ?? `http_${create.res.status}`,
              latencyMs: Date.now() - started,
            };
          }

          let latest = create.body;
          const deadline = Date.now() + POLL_BUDGET_MS;
          while (Date.now() < deadline) {
            await sleep(80);
            const poll = await getJson(
              `/v1/images/generations/${encodeURIComponent(taskId)}`
            );
            if (poll.res.status >= 500) http500 += 1;
            latest = poll.body;
            const st = String(latest?.status ?? "").toLowerCase();
            if (
              st === "completed" ||
              st === "failed" ||
              st === "retryable_timeout"
            ) {
              break;
            }
          }

          const st = String(latest?.status ?? "").toLowerCase();
          if (st === "completed") {
            const url = latest?.data?.[0]?.url ?? null;
            const credits = Number(
              latest?.tokfai?.credits_charged ?? latest?.credits_charged ?? 0
            );
            return {
              status: "completed",
              credits,
              billingStatus: latest?.tokfai?.billing_status ?? "not_billable",
              url,
              errorCode: null,
              latencyMs: Date.now() - started,
              requestId: taskId,
            };
          }
          if (st === "failed" || st === "retryable_timeout") {
            return {
              status: st === "retryable_timeout" ? "timeout" : "failed",
              credits: Number(latest?.tokfai?.credits_charged ?? 0),
              billingStatus: latest?.tokfai?.billing_status ?? "not_billable",
              url: null,
              errorCode: latest?.error?.code ?? st,
              latencyMs: Date.now() - started,
              requestId: taskId,
            };
          }
          return {
            status: "timeout_pending",
            timeoutPending: true,
            credits: Number(latest?.tokfai?.credits_charged ?? 0),
            billingStatus: latest?.tokfai?.billing_status ?? "not_billable",
            url: null,
            errorCode:
              latest?.timeout_code ||
              latest?.tokfai?.timeout_code ||
              "image_task_timeout_pending",
            latencyMs: Date.now() - started,
            requestId: taskId,
          };
        }
      );

      const summary = summarizeImageConcurrencyLoad(rows);
      console.log("");
      console.log(formatImageConcurrencySummary(summary));
      console.log(`http_500_count=${http500}`);

      const c1Ok =
        summary.total_done === COUNT &&
        http500 === 0 &&
        summary.bad_billing_failures === 0 &&
        summary.missing_url_success === 0 &&
        summary.timeout_pending >= 1;
      ok =
        (c1Ok
          ? pass(
              "20 C1: allow timeout_pending; no 500 / bad billing / missing url success"
            )
          : fail(
              "20 C1: allow timeout_pending; no 500 / bad billing / missing url success",
              JSON.stringify({ http500, summary })
            )) && ok;
    }

    {
      const chatReject = await postJson("/v1/chat/completions", {
        model: "nano-banana",
        messages: [{ role: "user", content: "hi" }],
        max_tokens: 8,
      });
      ok =
        (chatReject.res.status === 400 &&
        chatReject.body?.error?.code === "image_model_not_for_chat"
          ? pass("P954: image→chat still image_model_not_for_chat")
          : fail(
              "P954: image→chat still image_model_not_for_chat",
              JSON.stringify(chatReject.body?.error)
            )) && ok;

      const imgReject = await postJson("/v1/images/generations", {
        model: "gemini-2.5-flash",
        prompt: "no",
        size: "1024x1024",
        n: 1,
        response_format: "url",
      });
      ok =
        (imgReject.res.status === 400 &&
        imgReject.body?.error?.code === "model_not_image_capable" &&
        imgReject.body?.tokfai?.billing_status === "not_billable"
          ? pass("P954: text→images still model_not_image_capable not_billable")
          : fail(
              "P954: text→images still model_not_image_capable not_billable",
              JSON.stringify(imgReject.body)
            )) && ok;
    }
  } finally {
    if (mockChild) {
      try {
        mockChild.kill();
      } catch {
        // ignore
      }
    }
  }

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
