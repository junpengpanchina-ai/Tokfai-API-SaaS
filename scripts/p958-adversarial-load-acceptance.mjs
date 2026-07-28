#!/usr/bin/env node
/**
 * P958 — Adversarial high-load acceptance (杠精测试员模式).
 *
 * Goal: prove under mixed high load that the system does not avalanche —
 * not that every request succeeds.
 *
 * Acceptable: 429, timeout_pending, image_task_timeout, soft Abort
 * Forbidden: 500 avalanche, bad_billing, missing_url_success,
 *            Cannot set headers, charged timeout, message/code=undefined
 *
 * Usage:
 *   TOKFAI_API_KEY=sk-tokfai_... node scripts/p958-adversarial-load-acceptance.mjs
 *
 * Optional:
 *   TOKFAI_API_BASE=https://api.tokfai.com
 *   P958_CHAT_N=50 P958_CHAT_C=10
 *   P958_IMAGE_N=12 P958_IMAGE_C=2
 *   P958_SPIKE_C=20 P958_SPIKE_SEC=15
 *   P958_SKIP_IMAGE=1
 *
 * Markers:
 *   TOKFAI_P958_ADVERSARIAL_LOAD_PASS / _FAIL
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import {
  formatImageConcurrencySummary,
  runPool,
  summarizeImageConcurrencyLoad,
} from "./lib/image-concurrency-load.mjs";

const SCRIPT = "scripts/p958-adversarial-load-acceptance.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "tmp");
const PASS_MARKER = "TOKFAI_P958_ADVERSARIAL_LOAD_PASS";
const FAIL_MARKER = "TOKFAI_P958_ADVERSARIAL_LOAD_FAIL";

const API_KEY = (process.env.TOKFAI_API_KEY ?? "").trim();
const BASE = (process.env.TOKFAI_API_BASE ?? "https://api.tokfai.com")
  .replace(/\/+$/, "")
  .replace(/\/v1$/, "");
const CHAT_N = Math.max(1, parseInt(process.env.P958_CHAT_N ?? "50", 10) || 50);
const CHAT_C = Math.max(1, parseInt(process.env.P958_CHAT_C ?? "10", 10) || 10);
const IMAGE_N = Math.max(1, parseInt(process.env.P958_IMAGE_N ?? "12", 10) || 12);
const IMAGE_C = Math.max(1, parseInt(process.env.P958_IMAGE_C ?? "2", 10) || 2);
const SPIKE_C = Math.max(1, parseInt(process.env.P958_SPIKE_C ?? "20", 10) || 20);
const SPIKE_SEC = Math.max(5, parseInt(process.env.P958_SPIKE_SEC ?? "15", 10) || 15);
const SKIP_IMAGE = process.env.P958_SKIP_IMAGE === "1";
const CHAT_MODEL = (process.env.P958_CHAT_MODEL ?? "gemini-2.5-flash").trim();
const IMAGE_MODEL = (process.env.P958_IMAGE_MODEL ?? "nano-banana").trim();
const IMAGE_POLL_MS = Math.max(
  30_000,
  parseInt(process.env.P958_IMAGE_POLL_MS ?? "120000", 10) || 120_000
);

const FORBIDDEN_STEP = [
  "empty body",
  "api_error_500",
  "charged timeout",
  "message=undefined",
  "code=undefined",
  "Cannot set headers after they are sent",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function maskKey(key) {
  if (!key || key.length <= 12) return "(not set)";
  return `${key.slice(0, 12)}…${key.slice(-4)} (len=${key.length})`;
}

function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return null;
  const rank = Math.ceil((p / 100) * sortedAsc.length) - 1;
  return sortedAsc[Math.min(sortedAsc.length - 1, Math.max(0, rank))];
}

function latencyStats(msList) {
  const xs = msList.filter((n) => Number.isFinite(n) && n >= 0).sort((a, b) => a - b);
  return {
    n: xs.length,
    min: xs[0] ?? null,
    p50: percentile(xs, 50),
    p95: percentile(xs, 95),
    max: xs[xs.length - 1] ?? null,
  };
}

async function api(method, path, body, timeoutMs = 90_000) {
  return acceptanceFetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: body == null ? undefined : JSON.stringify(body),
    timeoutMs,
  });
}

function countHttp(rows) {
  /** @type {Record<string, number>} */
  const by = {};
  for (const r of rows) {
    const k = String(r.http ?? r.status ?? "unknown");
    by[k] = (by[k] ?? 0) + 1;
  }
  return by;
}

function hasAvalanche500(httpMap, total) {
  const n500 = Number(httpMap["500"] ?? 0);
  if (n500 <= 0) return false;
  // Avalanche: ≥10% of requests are 500, or ≥5 absolute 500s in a small burst
  return n500 >= 5 || (total > 0 && n500 / total >= 0.1);
}

async function chatOnce(i, timeoutMs = 90_000) {
  const started = Date.now();
  try {
    const { res, body, text } = await api(
      "POST",
      "/v1/chat/completions",
      {
        model: CHAT_MODEL,
        messages: [{ role: "user", content: `P958 chat #${i}. Reply OK only.` }],
        max_tokens: 8,
        stream: false,
      },
      timeoutMs
    );
    const code = body?.error?.code ?? null;
    const ok = res.status === 200 && !code;
    return {
      ok,
      http: res.status,
      code,
      latencyMs: Date.now() - started,
      requestId: body?.id ?? body?.tokfai?.request_id ?? null,
      sample: ok ? null : String(text).slice(0, 180),
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const aborted = /abort|timeout/i.test(msg);
    return {
      ok: false,
      http: aborted ? 0 : 0,
      code: aborted ? "client_abort" : "client_error",
      latencyMs: Date.now() - started,
      requestId: null,
      sample: msg.slice(0, 180),
    };
  }
}

async function imageJob(i) {
  const started = Date.now();
  const row = {
    status: "failed",
    credits: 0,
    billingStatus: "not_billable",
    url: null,
    errorCode: null,
    latencyMs: null,
    http: null,
    requestId: null,
  };
  try {
    const create = await api(
      "POST",
      "/v1/images/generations",
      {
        model: IMAGE_MODEL,
        prompt: `P958 adversarial image #${i}: a simple geometric shape on white`,
        size: "1024x1024",
        n: 1,
        response_format: "url",
      },
      60_000
    );
    row.http = create.res.status;
    const taskId = create.body?.task_id ?? create.body?.id ?? null;
    row.requestId = taskId;
    if (
      !(create.res.status === 200 || create.res.status === 202) ||
      !taskId
    ) {
      row.status = create.res.status === 429 ? "timeout" : "failed";
      row.errorCode =
        create.body?.error?.code ?? `http_${create.res.status}`;
      row.credits = Number(create.body?.tokfai?.credits_charged ?? 0);
      row.billingStatus =
        create.body?.tokfai?.billing_status ?? "not_billable";
      row.latencyMs = Date.now() - started;
      return row;
    }

    let latest = create.body;
    const deadline = Date.now() + IMAGE_POLL_MS;
    while (Date.now() < deadline) {
      await sleep(2500);
      const poll = await api(
        "GET",
        `/v1/images/generations/${encodeURIComponent(taskId)}`,
        undefined,
        60_000
      );
      if (poll.res.status >= 500) {
        row.http = poll.res.status;
        row.status = "failed";
        row.errorCode = poll.body?.error?.code ?? `http_${poll.res.status}`;
        row.latencyMs = Date.now() - started;
        return row;
      }
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
    row.credits = Number(
      latest?.tokfai?.credits_charged ?? latest?.credits_charged ?? 0
    );
    row.billingStatus = latest?.tokfai?.billing_status ?? "not_billable";
    row.latencyMs = Date.now() - started;
    if (st === "completed") {
      row.status = "completed";
      row.url = latest?.data?.[0]?.url ?? null;
      row.errorCode = null;
      return row;
    }
    if (st === "failed") {
      row.status = "failed";
      row.errorCode = latest?.error?.code ?? "failed";
      return row;
    }
    if (st === "retryable_timeout") {
      row.status = "timeout";
      row.errorCode = latest?.error?.code ?? "image_task_timeout";
      return row;
    }
    // Still in-flight after poll budget — soft pending (acceptable)
    row.status = "timeout_pending";
    row.timeoutPending = true;
    row.errorCode =
      latest?.timeout_code ||
      latest?.tokfai?.timeout_code ||
      (latest?.timeout_pending || latest?.task_timeout
        ? "image_task_timeout_pending"
        : "timeout_pending");
    return row;
  } catch (err) {
    row.latencyMs = Date.now() - started;
    row.errorCode = "client_error";
    row.sample = err instanceof Error ? err.message : String(err);
    return row;
  }
}

function judgeImageSummary(summary) {
  const failures = [];
  if (summary.bad_billing_failures > 0) {
    failures.push(`bad_billing_failures=${summary.bad_billing_failures}`);
  }
  if (summary.missing_url_success > 0) {
    failures.push(`missing_url_success=${summary.missing_url_success}`);
  }
  return { ok: failures.length === 0, failures };
}

async function main() {
  console.log("=== P958 Adversarial high-load acceptance ===");
  console.log(`script: ${SCRIPT}`);
  console.log(`base: ${BASE}`);
  console.log(`key: ${maskKey(API_KEY)}`);
  console.log(
    `chat=${CHAT_N}@C${CHAT_C} image=${IMAGE_N}@C${IMAGE_C} spike=C${SPIKE_C}/${SPIKE_SEC}s`
  );
  console.log("");

  if (!API_KEY.startsWith("sk-tokfai_")) {
    console.error(FAIL_MARKER, "TOKFAI_API_KEY required");
    process.exit(1);
  }

  const report = {
    suite: "p958-adversarial-load",
    started_at: new Date().toISOString(),
    base: BASE,
    api_key_masked: maskKey(API_KEY),
    chat_model: CHAT_MODEL,
    image_model: IMAGE_MODEL,
    steps: {},
    pass: true,
    failures: [],
  };

  function failStep(name, detail) {
    report.pass = false;
    report.failures.push(`${name}: ${detail}`);
    console.error(`FAIL  ${name} — ${detail}`);
  }
  function passStep(name, detail = "") {
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  }

  // ── 1. Baseline health ─────────────────────────────────────────────
  {
    const name = "baseline_health";
    const health = await acceptanceFetch(`${BASE}/v1/health`, {
      method: "GET",
      timeoutMs: 10_000,
    });
    const models = await api("GET", "/v1/models", undefined, 30_000);
    const chat = await chatOnce("baseline", 60_000);
    report.steps[name] = {
      health_http: health.res.status,
      models_http: models.res.status,
      chat,
    };
    if (health.res.status !== 200) {
      failStep(name, `health=${health.res.status}`);
    } else if (models.res.status !== 200) {
      failStep(name, `models=${models.res.status}`);
    } else if (!chat.ok && chat.http !== 429) {
      failStep(name, `chat http=${chat.http} code=${chat.code}`);
    } else {
      passStep(
        name,
        `health=200 models=200 chat=${chat.ok ? "ok" : `http=${chat.http}`}`
      );
    }
  }

  // ── 2. Chat stress ─────────────────────────────────────────────────
  {
    const name = "chat_stress";
    const rows = await runPool(
      Array.from({ length: CHAT_N }, (_, i) => i),
      CHAT_C,
      (i) => chatOnce(i)
    );
    const http = countHttp(rows);
    const ok = rows.filter((r) => r.ok).length;
    const n429 = rows.filter(
      (r) => r.http === 429 || /too_many/.test(String(r.code ?? ""))
    ).length;
    const n500 = Number(http["500"] ?? 0);
    const lat = latencyStats(rows.map((r) => r.latencyMs));
    report.steps[name] = {
      total: CHAT_N,
      concurrency: CHAT_C,
      ok,
      ok_rate: ok / CHAT_N,
      http,
      n429,
      n500,
      latency: lat,
      sample_errors: rows
        .filter((r) => !r.ok)
        .slice(0, 5)
        .map((r) => ({ http: r.http, code: r.code, sample: r.sample })),
    };
    if (hasAvalanche500(http, CHAT_N)) {
      failStep(name, `500 avalanche http=${JSON.stringify(http)}`);
    } else if (n500 > 0) {
      failStep(name, `unexpected 500 count=${n500}`);
    } else {
      passStep(
        name,
        `ok=${ok}/${CHAT_N} (${((ok / CHAT_N) * 100).toFixed(1)}%) 429=${n429} 500=0 p95=${lat.p95}`
      );
    }
  }

  // ── 3. Image async stress ──────────────────────────────────────────
  if (!SKIP_IMAGE) {
    const name = "image_async_stress";
    const rows = await runPool(
      Array.from({ length: IMAGE_N }, (_, i) => i),
      IMAGE_C,
      (i) => imageJob(i)
    );
    const summary = summarizeImageConcurrencyLoad(rows);
    const http = countHttp(rows);
    const judged = judgeImageSummary(summary);
    report.steps[name] = {
      total: IMAGE_N,
      concurrency: IMAGE_C,
      summary,
      http,
      judged,
    };
    console.log(formatImageConcurrencySummary(summary));
    if (hasAvalanche500(http, IMAGE_N) || Number(http["500"] ?? 0) > 0) {
      failStep(name, `http 500 present ${JSON.stringify(http)}`);
    } else if (!judged.ok) {
      failStep(name, judged.failures.join("; "));
    } else {
      passStep(
        name,
        `completed=${summary.completed} timeout_pending=${summary.timeout_pending ?? 0} timeout=${summary.timeout} failed=${summary.failed} bad_billing=0`
      );
    }
  } else {
    report.steps.image_async_stress = { skipped: true };
    console.log("SKIP  image_async_stress (P958_SKIP_IMAGE=1)");
  }

  // ── 4. Mixed stress (chat + image overlapping) ─────────────────────
  {
    const name = "mixed_stress";
    const chatN = Math.min(20, CHAT_N);
    const imgN = SKIP_IMAGE ? 0 : Math.min(6, IMAGE_N);
    const started = Date.now();
    const [chatRows, imageRows] = await Promise.all([
      runPool(Array.from({ length: chatN }, (_, i) => i), Math.min(5, CHAT_C), (i) =>
        chatOnce(`mix-${i}`)
      ),
      imgN
        ? runPool(Array.from({ length: imgN }, (_, i) => i), Math.min(2, IMAGE_C), (i) =>
            imageJob(`mix-${i}`)
          )
        : Promise.resolve([]),
    ]);
    const chatHttp = countHttp(chatRows);
    const imgSummary = summarizeImageConcurrencyLoad(imageRows);
    const imgHttp = countHttp(imageRows);
    const chat500 = Number(chatHttp["500"] ?? 0);
    const img500 = Number(imgHttp["500"] ?? 0);
    const imgJudge = judgeImageSummary(imgSummary);
    report.steps[name] = {
      duration_ms: Date.now() - started,
      chat: {
        total: chatN,
        ok: chatRows.filter((r) => r.ok).length,
        http: chatHttp,
      },
      image: { total: imgN, summary: imgSummary, http: imgHttp },
    };
    if (chat500 > 0 || img500 > 0) {
      failStep(name, `500 present chat=${chat500} image=${img500}`);
    } else if (!imgJudge.ok) {
      failStep(name, imgJudge.failures.join("; "));
    } else {
      passStep(
        name,
        `chat_ok=${report.steps[name].chat.ok}/${chatN} image_completed=${imgSummary.completed} pending=${imgSummary.timeout_pending ?? 0} bad_billing=0`
      );
    }
  }

  // ── 5. Negative route isolation ────────────────────────────────────
  {
    const name = "negative_route_isolation";
    const imageOnChat = await api("POST", "/v1/chat/completions", {
      model: "nano-banana",
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 8,
    });
    const textOnImage = await api("POST", "/v1/images/generations", {
      model: "gemini-2.5-flash",
      prompt: "should not generate",
      size: "1024x1024",
      n: 1,
      response_format: "url",
    });
    const a =
      imageOnChat.res.status === 400 &&
      imageOnChat.body?.error?.code === "image_model_not_for_chat" &&
      (imageOnChat.body?.tokfai?.billing_status === "not_billable" ||
        imageOnChat.body?.tokfai?.credits_charged === 0 ||
        imageOnChat.body?.tokfai == null);
    const b =
      textOnImage.res.status === 400 &&
      textOnImage.body?.error?.code === "model_not_image_capable" &&
      textOnImage.body?.tokfai?.billing_status === "not_billable";
    report.steps[name] = {
      image_on_chat: {
        http: imageOnChat.res.status,
        code: imageOnChat.body?.error?.code ?? null,
        billing: imageOnChat.body?.tokfai?.billing_status ?? null,
      },
      text_on_image: {
        http: textOnImage.res.status,
        code: textOnImage.body?.error?.code ?? null,
        billing: textOnImage.body?.tokfai?.billing_status ?? null,
      },
    };
    if (!a || !b) {
      failStep(
        name,
        `image→chat=${JSON.stringify(report.steps[name].image_on_chat)} text→image=${JSON.stringify(report.steps[name].text_on_image)}`
      );
    } else {
      passStep(name, "image_model_not_for_chat + model_not_image_capable (not_billable)");
    }
  }

  // ── 6. Spike test (expect 429, forbid 500) ─────────────────────────
  {
    const name = "spike_test";
    const deadline = Date.now() + SPIKE_SEC * 1000;
    let i = 0;
    /** @type {any[]} */
    const rows = [];
    await runPool(Array.from({ length: SPIKE_C }, (_, k) => k), SPIKE_C, async () => {
      while (Date.now() < deadline) {
        const idx = i++;
        rows.push(await chatOnce(`spike-${idx}`, 30_000));
      }
    });
    const http = countHttp(rows);
    const n429 = rows.filter(
      (r) => r.http === 429 || /too_many/.test(String(r.code ?? ""))
    ).length;
    const n500 = Number(http["500"] ?? 0);
    const ok = rows.filter((r) => r.ok).length;
    report.steps[name] = {
      concurrency: SPIKE_C,
      duration_sec: SPIKE_SEC,
      total: rows.length,
      ok,
      n429,
      n500,
      http,
    };
    if (n500 > 0 || hasAvalanche500(http, rows.length)) {
      failStep(name, `500 present ${JSON.stringify(http)}`);
    } else {
      passStep(
        name,
        `total=${rows.length} ok=${ok} 429=${n429} 500=0 (429 acceptable)`
      );
    }
  }

  // ── 7. Recovery test ───────────────────────────────────────────────
  {
    const name = "recovery_test";
    await sleep(2000);
    const health = await acceptanceFetch(`${BASE}/v1/health`, {
      method: "GET",
      timeoutMs: 10_000,
    });
    const chat = await chatOnce("recovery", 90_000);
    let image = null;
    if (!SKIP_IMAGE) {
      const create = await api("POST", "/v1/images/generations", {
        model: IMAGE_MODEL,
        prompt: "P958 recovery: a blue circle",
        size: "1024x1024",
        n: 1,
        response_format: "url",
      });
      image = {
        http: create.res.status,
        task_id: create.body?.task_id ?? create.body?.id ?? null,
        code: create.body?.error?.code ?? null,
      };
    }
    report.steps[name] = {
      health_http: health.res.status,
      chat,
      image,
    };
    const imageOk =
      SKIP_IMAGE ||
      image?.http === 202 ||
      image?.http === 200 ||
      image?.http === 429;
    if (health.res.status !== 200) {
      failStep(name, `health=${health.res.status}`);
    } else if (!chat.ok && chat.http !== 429) {
      failStep(name, `chat http=${chat.http} code=${chat.code}`);
    } else if (!imageOk) {
      failStep(name, `image http=${image?.http} code=${image?.code}`);
    } else {
      passStep(
        name,
        `health=200 chat=${chat.ok ? "ok" : "429"} image=${image?.http ?? "skip"}`
      );
    }
  }

  // ── Forbidden substring scan across step samples ───────────────────
  {
    const blob = JSON.stringify(report.steps);
    const hit = FORBIDDEN_STEP.find((p) => blob.includes(p));
    if (hit) {
      failStep("dirty_step_payload", hit);
    } else {
      passStep("dirty_step_payload", "no forbidden substrings in step JSON");
    }
  }

  report.finished_at = new Date().toISOString();
  await mkdir(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, "p958-adversarial-load-result.json");
  await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log("");
  console.log(`wrote: ${outPath}`);

  if (report.pass) {
    console.log(PASS_MARKER);
    process.exit(0);
  }
  console.error(FAIL_MARKER);
  console.error(report.failures.join("\n"));
  process.exit(1);
}

main().catch((err) => {
  console.error(FAIL_MARKER, err);
  process.exit(1);
});
