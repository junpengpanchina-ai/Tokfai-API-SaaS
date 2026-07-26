/**
 * P952 — Image concurrency load helpers (summary + synthetic fixtures).
 *
 * Used by:
 *   scripts/p952-image-concurrency-load.mjs
 *   scripts/p952-image-concurrency-policy-smoke.mjs
 *
 * No LIVE calls here — pure aggregation / fixtures.
 */

/** Required summary keys for P952 acceptance. */
export const P952_SUMMARY_KEYS = [
  "total_done",
  "completed",
  "failed",
  "timeout",
  "billable_success",
  "bad_billing_failures",
  "missing_url_success",
  "error_codes",
  "latency",
];

export const P952_LATENCY_KEYS = ["min", "p50", "p90", "p95", "max"];

/**
 * @typedef {object} ImageLoadRow
 * @property {string} [status] completed|failed|timeout|retryable_timeout|…
 * @property {number|null} [credits]
 * @property {string} [billingStatus] billable|not_billable|charged|…
 * @property {string|null} [url]
 * @property {string|null} [errorCode]
 * @property {number|null} [latencyMs]
 * @property {boolean} [clientTimeout]
 */

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeStatus(row) {
  const raw = String(row?.status ?? "").toLowerCase();
  if (row?.clientTimeout) return "timeout";
  if (raw === "succeeded") return "completed";
  if (
    raw === "retryable_timeout" ||
    raw === "image_task_timeout" ||
    raw === "image_generation_timeout" ||
    raw === "timeout"
  ) {
    return "timeout";
  }
  if (raw === "completed" || raw === "failed") return raw;
  if (raw) return raw;
  return "unknown";
}

function hasUrl(row) {
  return typeof row?.url === "string" && row.url.trim().length > 0;
}

function creditsOf(row) {
  const n = num(row?.credits);
  return n == null ? 0 : n;
}

function isBillableStatus(row) {
  const b = String(row?.billingStatus ?? "").toLowerCase();
  return b === "billable" || b === "charged";
}

function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = Math.ceil((p / 100) * sortedAsc.length) - 1;
  const idx = Math.min(sortedAsc.length - 1, Math.max(0, rank));
  return sortedAsc[idx];
}

/**
 * Aggregate image load rows into the P952 summary shape.
 * @param {ImageLoadRow[]} rows
 */
export function summarizeImageConcurrencyLoad(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let completed = 0;
  let failed = 0;
  let timeout = 0;
  let billable_success = 0;
  let bad_billing_failures = 0;
  let missing_url_success = 0;
  /** @type {Record<string, number>} */
  const error_codes = {};
  /** @type {number[]} */
  const latencies = [];

  for (const row of list) {
    const status = normalizeStatus(row);
    const credits = creditsOf(row);
    const urlOk = hasUrl(row);
    const billable = isBillableStatus(row);

    if (status === "completed") {
      completed += 1;
      if (!urlOk) missing_url_success += 1;
      if (urlOk && credits > 0 && billable) billable_success += 1;
      // completed without url but charged → billing integrity failure
      if (!urlOk && (credits > 0 || billable)) bad_billing_failures += 1;
    } else if (status === "failed") {
      failed += 1;
      if (credits > 0 || billable) bad_billing_failures += 1;
    } else if (status === "timeout") {
      timeout += 1;
      if (credits > 0 || billable) bad_billing_failures += 1;
    } else {
      // unknown terminal — count toward failed bucket for ops visibility
      failed += 1;
      if (credits > 0 || billable) bad_billing_failures += 1;
    }

    const code =
      typeof row?.errorCode === "string" && row.errorCode.trim()
        ? row.errorCode.trim()
        : status === "completed"
          ? null
          : status;
    if (code) {
      error_codes[code] = (error_codes[code] ?? 0) + 1;
    }

    const ms = num(row?.latencyMs);
    if (ms != null && ms >= 0) latencies.push(ms);
  }

  latencies.sort((a, b) => a - b);
  const latency = {
    min: latencies.length ? latencies[0] : null,
    p50: percentile(latencies, 50),
    p90: percentile(latencies, 90),
    p95: percentile(latencies, 95),
    max: latencies.length ? latencies[latencies.length - 1] : null,
  };

  return {
    total_done: list.length,
    completed,
    failed,
    timeout,
    billable_success,
    bad_billing_failures,
    missing_url_success,
    error_codes,
    latency,
  };
}

/** Pretty-print summary for CLI load runs. */
export function formatImageConcurrencySummary(summary) {
  const lat = summary.latency ?? {};
  const codes = summary.error_codes ?? {};
  const codeLine =
    Object.keys(codes).length === 0
      ? "(none)"
      : Object.entries(codes)
          .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");

  return [
    "=== P952 image concurrency summary ===",
    `total_done=${summary.total_done}`,
    `completed=${summary.completed}`,
    `failed=${summary.failed}`,
    `timeout=${summary.timeout}`,
    `billable_success=${summary.billable_success}`,
    `bad_billing_failures=${summary.bad_billing_failures}`,
    `missing_url_success=${summary.missing_url_success}`,
    `error_codes: ${codeLine}`,
    `latency_ms: min=${lat.min ?? "n/a"} p50=${lat.p50 ?? "n/a"} p90=${lat.p90 ?? "n/a"} p95=${lat.p95 ?? "n/a"} max=${lat.max ?? "n/a"}`,
  ].join("\n");
}

/**
 * Synthetic fixtures covering billable success, upstream fail (not billed),
 * timeout (not billed), and a bad billing failure for unit checks.
 */
export function buildSyntheticImageLoadRows() {
  return [
    {
      status: "completed",
      credits: 1400,
      billingStatus: "billable",
      url: "https://cdn.example.com/a.png",
      errorCode: null,
      latencyMs: 8_000,
    },
    {
      status: "completed",
      credits: 1400,
      billingStatus: "billable",
      url: "https://cdn.example.com/b.png",
      errorCode: null,
      latencyMs: 12_000,
    },
    {
      status: "failed",
      credits: 0,
      billingStatus: "not_billable",
      url: null,
      errorCode: "upstream_image_error",
      latencyMs: 15_000,
    },
    {
      status: "failed",
      credits: 0,
      billingStatus: "not_billable",
      url: null,
      errorCode: "upstream_image_error",
      latencyMs: 18_000,
    },
    {
      status: "retryable_timeout",
      credits: 0,
      billingStatus: "not_billable",
      url: null,
      errorCode: "image_task_timeout",
      latencyMs: 120_000,
    },
    {
      // Integrity probe: failed but charged (must count as bad_billing_failures)
      status: "failed",
      credits: 100,
      billingStatus: "billable",
      url: null,
      errorCode: "upstream_image_error",
      latencyMs: 9_000,
    },
    {
      // completed without url
      status: "completed",
      credits: 0,
      billingStatus: "not_billable",
      url: null,
      errorCode: null,
      latencyMs: 7_000,
    },
  ];
}

/**
 * Self-test expectations for buildSyntheticImageLoadRows().
 * @returns {{ ok: boolean, failures: string[] }}
 */
export function judgeSyntheticImageSummary(summary) {
  const failures = [];
  if (summary.total_done !== 7) {
    failures.push(`total_done=${summary.total_done} want 7`);
  }
  if (summary.completed !== 3) {
    failures.push(`completed=${summary.completed} want 3`);
  }
  if (summary.failed !== 3) {
    failures.push(`failed=${summary.failed} want 3`);
  }
  if (summary.timeout !== 1) {
    failures.push(`timeout=${summary.timeout} want 1`);
  }
  if (summary.billable_success !== 2) {
    failures.push(`billable_success=${summary.billable_success} want 2`);
  }
  if (summary.bad_billing_failures !== 1) {
    failures.push(
      `bad_billing_failures=${summary.bad_billing_failures} want 1`
    );
  }
  if (summary.missing_url_success !== 1) {
    failures.push(
      `missing_url_success=${summary.missing_url_success} want 1`
    );
  }
  if ((summary.error_codes?.upstream_image_error ?? 0) !== 3) {
    failures.push(
      `error_codes.upstream_image_error=${summary.error_codes?.upstream_image_error} want 3`
    );
  }
  for (const k of P952_LATENCY_KEYS) {
    if (summary.latency?.[k] == null) {
      failures.push(`latency.${k} missing`);
    }
  }
  if (summary.latency?.min !== 7_000) {
    failures.push(`latency.min=${summary.latency?.min} want 7000`);
  }
  if (summary.latency?.max !== 120_000) {
    failures.push(`latency.max=${summary.latency?.max} want 120000`);
  }
  return { ok: failures.length === 0, failures };
}

export function runPool(items, concurrency, worker) {
  const limit = Math.max(1, Math.min(concurrency, items.length || 1));
  let cursor = 0;
  const results = new Array(items.length);

  async function pump() {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      results[i] = await worker(items[i], i);
    }
  }

  return Promise.all(Array.from({ length: limit }, () => pump())).then(
    () => results
  );
}
