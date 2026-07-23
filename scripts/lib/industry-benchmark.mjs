/**
 * P943 — Industry benchmark shared schema, fixtures, and metric helpers.
 *
 * Hard limits:
 *   - no production path / billing / alias edits
 *   - never live-fetch competitor APIs from this module
 *   - never print full API keys or upstream competitor hosts
 */

/** Fixed probe CSV columns (order matters). */
export const BENCHMARK_CSV_COLUMNS = [
  "model",
  "route",
  "stream",
  "status",
  "latencyMs",
  "creditsCharged",
  "errorCode",
  "requestId",
];

/** Core models used for coverage denominator (stable set). */
export const REQUIRED_MODELS = [
  "gpt-5.5",
  "gpt-5-pro",
  "gpt-5.4-pro",
  "gemini-2.5-flash",
  "gemini-3-pro",
  "gemini-2.5-pro",
];

/**
 * Synthetic competitor aggregate baseline (not live-scraped).
 * Values are industry-median placeholders for framework wiring.
 */
export const COMPETITOR_METRIC_BASELINE = {
  modelCoverage: 0.78,
  successRate: 0.9,
  p95LatencyMs: 4200,
  clientCompatScore: 0.82,
  billingRiskRate: 0.04,
};

/** Tokfai target: 5%–15% sharper than competitor on core metrics. */
export const TARGET_EDGE_MIN = 0.05;
export const TARGET_EDGE_MAX = 0.15;

/**
 * Offline client-compat score for Tokfai — derived from existing p9xx
 * matrix coverage (Cherry / Chatbox / OpenWebUI / workflow / coding),
 * not a re-run of Cherry production paths.
 */
export const TOKFAI_CLIENT_COMPAT_SCORE = 0.92;

export const METRIC_DEFS = [
  {
    metric: "model_coverage",
    betterWhen: "higher",
    baselineKey: "modelCoverage",
  },
  {
    metric: "success_rate",
    betterWhen: "higher",
    baselineKey: "successRate",
  },
  {
    metric: "p95_latency",
    betterWhen: "lower",
    baselineKey: "p95LatencyMs",
  },
  {
    metric: "client_compatibility",
    betterWhen: "higher",
    baselineKey: "clientCompatScore",
  },
  {
    metric: "billing_safety_risk",
    betterWhen: "lower",
    baselineKey: "billingRiskRate",
  },
];

export function emptyProbeRow(overrides = {}) {
  return {
    model: "",
    route: "",
    stream: "",
    status: 0,
    latencyMs: 0,
    creditsCharged: "",
    errorCode: "",
    requestId: "",
    ...overrides,
  };
}

export function normalizeProbeRow(row) {
  const stream =
    row.stream === true || row.stream === "true"
      ? "true"
      : row.stream === false || row.stream === "false"
        ? "false"
        : row.stream == null || row.stream === ""
          ? ""
          : String(row.stream);

  const credits =
    row.creditsCharged == null || row.creditsCharged === ""
      ? ""
      : Number(row.creditsCharged);

  return {
    model: row.model == null ? "" : String(row.model),
    route: row.route == null ? "" : String(row.route),
    stream,
    status: Number(row.status) || 0,
    latencyMs: Math.round(Number(row.latencyMs) || 0),
    creditsCharged:
      credits === "" || Number.isNaN(credits) ? "" : credits,
    errorCode: row.errorCode == null || row.errorCode === ""
      ? ""
      : String(row.errorCode),
    requestId:
      row.requestId == null || row.requestId === ""
        ? ""
        : String(row.requestId),
  };
}

function csvEscape(value) {
  const s = value == null ? "" : String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function probesToCsv(rows) {
  const lines = [BENCHMARK_CSV_COLUMNS.join(",")];
  for (const raw of rows) {
    const row = normalizeProbeRow(raw);
    lines.push(
      BENCHMARK_CSV_COLUMNS.map((col) => csvEscape(row[col])).join(",")
    );
  }
  return `${lines.join("\n")}\n`;
}

export function parseBenchmarkCsv(text) {
  const lines = String(text ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return [];

  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  for (const col of BENCHMARK_CSV_COLUMNS) {
    if (!header.includes(col)) {
      throw new Error(`benchmark CSV missing column: ${col}`);
    }
  }

  const rows = [];
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const obj = {};
    for (let i = 0; i < header.length; i++) {
      obj[header[i]] = cells[i] ?? "";
    }
    rows.push(
      normalizeProbeRow({
        model: obj.model,
        route: obj.route,
        stream: obj.stream,
        status: obj.status,
        latencyMs: obj.latencyMs,
        creditsCharged: obj.creditsCharged,
        errorCode: obj.errorCode,
        requestId: obj.requestId,
      })
    );
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

export function percentile(sortedAsc, p) {
  if (!sortedAsc.length) return null;
  if (sortedAsc.length === 1) return sortedAsc[0];
  const rank = (p / 100) * (sortedAsc.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const w = rank - lo;
  return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w;
}

export function isSuccessStatus(status) {
  const n = Number(status);
  return n >= 200 && n < 300;
}

export function aggregateProbeMetrics(rows, opts = {}) {
  const required = opts.requiredModels ?? REQUIRED_MODELS;
  const clientCompatScore =
    typeof opts.clientCompatScore === "number"
      ? opts.clientCompatScore
      : TOKFAI_CLIENT_COMPAT_SCORE;

  const list = Array.isArray(rows) ? rows.map(normalizeProbeRow) : [];
  const success = list.filter((r) => isSuccessStatus(r.status));
  const failed = list.filter((r) => !isSuccessStatus(r.status));

  const successModels = new Set(
    success.map((r) => r.model).filter((m) => m && m.length > 0)
  );
  const requiredHit = required.filter((m) => successModels.has(m));
  const modelCoverage =
    required.length === 0 ? 0 : requiredHit.length / required.length;

  const successRate = list.length === 0 ? 0 : success.length / list.length;

  const latencies = success
    .map((r) => r.latencyMs)
    .filter((n) => Number.isFinite(n) && n >= 0)
    .sort((a, b) => a - b);
  const p95LatencyMs = percentile(latencies, 95);

  let chargedOnError = 0;
  let timeoutChargeHits = 0;
  for (const r of failed) {
    const credits =
      r.creditsCharged === "" ? 0 : Number(r.creditsCharged);
    if (Number.isFinite(credits) && credits > 0) chargedOnError += 1;
    const code = String(r.errorCode ?? "").toLowerCase();
    const msg = `${code}`;
    if (
      (code.includes("timeout") || msg.includes("timeout")) &&
      Number.isFinite(credits) &&
      credits > 0
    ) {
      timeoutChargeHits += 1;
    }
  }
  const failDenom = Math.max(1, failed.length);
  const billingRiskRate =
    chargedOnError / failDenom + timeoutChargeHits * 0.25;

  return {
    modelCoverage,
    successRate,
    p95LatencyMs: p95LatencyMs == null ? null : Math.round(p95LatencyMs),
    clientCompatScore,
    billingRiskRate,
    probeCount: list.length,
    successCount: success.length,
    failCount: failed.length,
  };
}

/**
 * Compare Tokfai metrics to competitor baseline.
 * higher-is-better: edge = (tokfai - base) / base
 * lower-is-better:  edge = (base - tokfai) / base
 * meet when edge ∈ [5%, 15%] (also accept above-band as meet+).
 */
export function compareMetrics(tokfai, competitor = COMPETITOR_METRIC_BASELINE) {
  const rows = [];
  for (const def of METRIC_DEFS) {
    const base = Number(competitor[def.baselineKey]);
    let tokfaiValue = tokfai[def.baselineKey];
    if (tokfaiValue == null && def.metric === "p95_latency") {
      tokfaiValue = null;
    }
    const t = tokfaiValue == null ? null : Number(tokfaiValue);

    let deltaPct = null;
    let edge = null;
    if (t != null && Number.isFinite(t) && Number.isFinite(base) && base !== 0) {
      if (def.betterWhen === "higher") {
        edge = (t - base) / base;
        deltaPct = ((t - base) / base) * 100;
      } else {
        edge = (base - t) / base;
        deltaPct = ((t - base) / base) * 100;
      }
    }

    let targetBand = "below";
    if (edge == null || !Number.isFinite(edge)) {
      targetBand = "unknown";
    } else if (edge >= TARGET_EDGE_MIN) {
      // At or above the 5% floor — including >15% still counts as meeting the
      // "at least 5% sharper" product goal (band max is aspirational, not a cap).
      targetBand = edge <= TARGET_EDGE_MAX ? "meet" : "above";
    } else {
      targetBand = "below";
    }

    rows.push({
      metric: def.metric,
      betterWhen: def.betterWhen,
      tokfai: t,
      competitorBaseline: base,
      deltaPct: deltaPct == null ? "" : Number(deltaPct.toFixed(2)),
      edgePct: edge == null ? "" : Number((edge * 100).toFixed(2)),
      targetBand,
    });
  }
  return rows;
}

export function metricsSummaryToCsv(compareRows) {
  const cols = [
    "metric",
    "betterWhen",
    "tokfai",
    "competitorBaseline",
    "deltaPct",
    "edgePct",
    "targetBand",
  ];
  const lines = [cols.join(",")];
  for (const row of compareRows) {
    lines.push(cols.map((c) => csvEscape(row[c])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Built-in synthetic competitor probe rows (same schema).
 * SYNTHETIC — not live competitor traffic.
 */
export function buildSyntheticCompetitorProbes() {
  const routes = [
    { route: "POST /v1/chat/completions", stream: "false", latency: 2800 },
    { route: "POST /v1/chat/completions", stream: "true", latency: 3100 },
    { route: "POST /v1/responses", stream: "false", latency: 3500 },
    { route: "POST /v1/responses", stream: "true", latency: 3900 },
  ];

  const rows = [];
  for (const model of REQUIRED_MODELS) {
    for (const r of routes) {
      // Soft / flaky models: timeouts (uncharged). gemini-2.5-pro has no
      // successes so competitor model_coverage stays below 1.0.
      const alwaysFail = model === "gemini-2.5-pro";
      const softStreamFail =
        model === "gemini-3-pro" && r.stream === "true";
      const fail = alwaysFail || softStreamFail;
      rows.push(
        normalizeProbeRow({
          model,
          route: r.route,
          stream: r.stream,
          status: fail ? 504 : 200,
          latencyMs: fail ? r.latency + 8000 : r.latency,
          creditsCharged: fail ? "" : 0.01,
          errorCode: fail ? "upstream_timeout" : "",
          requestId: fail
            ? `syn_comp_${model}_timeout`
            : `syn_comp_${model}_${r.stream}`,
        })
      );
    }
  }
  return rows;
}

/**
 * Synthetic Tokfai probe rows for SELF_TEST (slightly sharper than baseline).
 */
export function buildSyntheticTokfaiProbes() {
  const routes = [
    { route: "POST /v1/chat/completions", stream: "false", latency: 2400 },
    { route: "POST /v1/chat/completions", stream: "true", latency: 2600 },
    { route: "POST /v1/responses", stream: "false", latency: 3000 },
    { route: "POST /v1/responses", stream: "true", latency: 3300 },
  ];

  const rows = [];
  for (const model of REQUIRED_MODELS) {
    for (const r of routes) {
      rows.push(
        normalizeProbeRow({
          model,
          route: r.route,
          stream: r.stream,
          status: 200,
          latencyMs: r.latency,
          creditsCharged: 0.0065,
          errorCode: "",
          requestId: `syn_tokfai_${model}_${r.stream}`,
        })
      );
    }
  }
  return rows;
}
