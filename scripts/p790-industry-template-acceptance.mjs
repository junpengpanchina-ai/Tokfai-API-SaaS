#!/usr/bin/env node
/**
 * Internal operator offline acceptance — not customer documentation.
 *
 * P790 — industry integration template pack against P786 mock gateway.
 *
 * Usage:
 *   node scripts/p790-industry-template-acceptance.mjs
 */

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RESULTS_DIR = join(ROOT, "p790-industry-template-results");
const RESULTS_FILE = join(RESULTS_DIR, "latest.json");

const PLACEHOLDER = "sk-tokfai_xxx";

function shellSingleQuotedJson(value) {
  return JSON.stringify(value).replace(/'/g, "'\\''");
}

function curlPost(base, apiKey, path, body) {
  const payload = shellSingleQuotedJson(body);
  return `curl -sS ${base}${path} -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d '${payload}'`;
}

function hospitalChartCurl(apiKey, base) {
  return curlPost(base, apiKey, "/chat/completions", {
    model: "auto-pro",
    messages: [
      {
        role: "user",
        content:
          "请把以下患者自述整理成结构化摘要，分为主诉、持续时间、伴随症状、需医生确认的问题。不要诊断，不要给治疗方案。\n\n患者自述：头痛三天，偶有恶心，无发热。",
      },
    ],
    stream: false,
  });
}

function hospitalBatchCurl(apiKey, base) {
  return curlPost(base, apiKey, "/batches/chat", {
    model: "auto-fast",
    items: [
      {
        messages: [
          {
            role: "user",
            content:
              "整理问诊文本为结构化要点（主诉、持续时间、需医生确认项）。不要诊断。\n\n患者：咳嗽一周，夜间加重，无胸痛。",
          },
        ],
      },
      {
        messages: [
          {
            role: "user",
            content:
              "整理问诊文本为结构化要点（主诉、持续时间、需医生确认项）。不要诊断。\n\n患者：腹痛两天，饭后明显，无便血。",
          },
        ],
      },
    ],
  });
}

function autoChatCurl(apiKey, base) {
  return curlPost(base, apiKey, "/chat/completions", {
    model: "auto-pro",
    messages: [
      {
        role: "user",
        content:
          "请把以下售后工单整理为：问题类型、用户描述、可能涉及模块、需要人工确认的问题、建议回复草稿。\n\n工单：车辆怠速不稳，仪表盘偶尔亮起发动机故障灯。",
      },
    ],
    stream: false,
  });
}

function autoImageCurl(apiKey, base) {
  return curlPost(base, apiKey, "/images/generations", {
    model: "gpt-image-2",
    prompt: "Clean studio photo of a car front bumper with minor scratch for service documentation.",
    size: "1024x1024",
    n: 1,
    response_format: "url",
  });
}

function ecommerceBatchCurl(apiKey, base) {
  return curlPost(base, apiKey, "/batches/chat", {
    model: "auto-cheap",
    items: [
      {
        messages: [
          {
            role: "user",
            content: "商品：无线蓝牙耳机。请生成标题、3条卖点、详情页短文案（80字内）。",
          },
        ],
      },
      {
        messages: [
          {
            role: "user",
            content: "商品：便携榨汁杯。请生成标题、3条卖点、详情页短文案（80字内）。",
          },
        ],
      },
    ],
  });
}

function ecommerceImageCurl(apiKey, base) {
  return curlPost(base, apiKey, "/images/generations", {
    model: "gpt-image-2",
    prompt: "Product photo of wireless earbuds on white background, e-commerce listing style.",
    size: "1024x1024",
    n: 1,
    response_format: "url",
  });
}

function supportChatCurl(apiKey, base) {
  return curlPost(base, apiKey, "/chat/completions", {
    model: "auto-fast",
    messages: [
      {
        role: "user",
        content:
          "请基于以下 FAQ 和用户问题，生成客服回复草稿。不要承诺退款、赔偿、发货时间，涉及政策时提示人工确认。\n\nFAQ：退货需在签收7天内申请。用户问：我买了10天还能退吗？",
      },
    ],
    stream: false,
  });
}

function supportBatchCurl(apiKey, base) {
  return curlPost(base, apiKey, "/batches/chat", {
    model: "auto-fast",
    items: [
      {
        messages: [
          {
            role: "user",
            content:
              "工单分类与意图：退款申请 / 物流咨询 / 产品故障。输入：我要退款，订单号 A1001。",
          },
        ],
      },
      {
        messages: [
          {
            role: "user",
            content:
              "工单分类与意图：退款申请 / 物流咨询 / 产品故障。输入：快递三天没更新，什么时候到？",
          },
        ],
      },
    ],
  });
}

function isOneLineCurl(curl) {
  if (curl.includes("\n")) return false;
  if (/\\\s*$/.test(curl)) return false;
  if (/\bcd\s/.test(curl)) return false;
  if (/node\s+scripts/i.test(curl)) return false;
  return true;
}

function runCurlShell(curl, timeoutMs = 30_000) {
  const out = execFileSync("bash", ["-lc", curl], {
    encoding: "utf8",
    timeout: timeoutMs,
    maxBuffer: 4 * 1024 * 1024,
  });
  return JSON.parse(out);
}

function summarize(body) {
  return {
    request_id: body?.request_id ?? body?.tokfai?.request_id ?? null,
    credits_charged: body?.credits_charged ?? null,
    resolved_model: body?.tokfai?.resolved_model ?? body?.model ?? null,
    error_code: body?.error?.code ?? null,
  };
}

async function main() {
  if (process.env.LIVE === "1") {
    console.error("P790 industry templates run against mock only — unset LIVE=1");
    process.exit(1);
  }

  console.log("=== P790 industry template acceptance (mock) ===");

  const mock = await ensureMockGateway();
  const base = mock.baseUrl.replace(/\/+$/, "");
  const apiKey = mock.apiKey;

  const report = {
    suite: "p790-industry-template-acceptance",
    timestamp: new Date().toISOString(),
    mock_base: base,
    mock_spawned: mock.spawned,
    pass: true,
    cases: [],
  };

  const templateCases = [
    {
      id: "hospital-chat",
      build: () => hospitalChartCurl(apiKey, base),
      validate: (body) =>
        body?.choices?.[0]?.message?.content &&
        body?.request_id &&
        body?.tokfai?.resolved_model,
    },
    {
      id: "hospital-batch",
      build: () => hospitalBatchCurl(apiKey, base),
      validate: (body) => body?.id && body?.status === "completed",
    },
    {
      id: "auto-chat",
      build: () => autoChatCurl(apiKey, base),
      validate: (body) =>
        body?.choices?.[0]?.message?.content &&
        body?.request_id &&
        body?.tokfai?.resolved_model,
    },
    {
      id: "auto-image",
      build: () => autoImageCurl(apiKey, base),
      validate: (body) =>
        body?.data?.[0]?.url && body?.request_id && body?.credits_charged != null,
    },
    {
      id: "ecommerce-batch",
      build: () => ecommerceBatchCurl(apiKey, base),
      validate: (body) => body?.id && body?.status === "completed",
    },
    {
      id: "ecommerce-image",
      build: () => ecommerceImageCurl(apiKey, base),
      validate: (body) =>
        body?.data?.[0]?.url && body?.request_id && body?.credits_charged != null,
    },
    {
      id: "support-chat",
      build: () => supportChatCurl(apiKey, base),
      validate: (body) =>
        body?.choices?.[0]?.message?.content &&
        body?.request_id &&
        body?.tokfai?.resolved_model,
    },
    {
      id: "support-batch",
      build: () => supportBatchCurl(apiKey, base),
      validate: (body) => body?.id && body?.status === "completed",
    },
  ];

  for (const item of templateCases) {
    const curl = item.build();
    const row = {
      id: item.id,
      one_line: isOneLineCurl(curl),
      pass: false,
      http: null,
      ...summarize({}),
    };

    if (!row.one_line) {
      report.pass = false;
      row.notes = "curl is not single-line safe";
      console.log(`[FAIL] ${item.id} — not one-line`);
    } else {
      try {
        const body = runCurlShell(curl);
        const ok = item.validate(body);
        const summary = summarize(body);
        row.pass = ok;
        row.http = ok ? 200 : null;
        Object.assign(row, summary);
        if (!ok) {
          report.pass = false;
          row.notes = "validation failed";
        }
        console.log(
          `[${ok ? "PASS" : "FAIL"}] ${item.id} HTTP=${row.http ?? "—"} code=${summary.error_code ?? "—"} request_id=${summary.request_id ?? "—"} credits=${summary.credits_charged ?? "—"} model=${summary.resolved_model ?? "—"}`
        );
      } catch (err) {
        report.pass = false;
        row.notes = err instanceof Error ? err.message : String(err);
        console.log(`[FAIL] ${item.id} — ${row.notes}`);
      }
    }

    report.cases.push(row);
  }

  const placeholderCurl = hospitalChartCurl(PLACEHOLDER, base);
  const placeholderBody = runCurlShell(placeholderCurl);
  const placeholderOk = placeholderBody?.error?.code === "invalid_token";
  const placeholderSummary = summarize(placeholderBody);
  report.cases.push({
    id: "placeholder-invalid-token",
    pass: placeholderOk,
    http: 401,
    ...placeholderSummary,
  });
  if (!placeholderOk) report.pass = false;
  console.log(
    `[${placeholderOk ? "PASS" : "FAIL"}] placeholder-invalid-token code=${placeholderSummary.error_code}`
  );

  const missingCurl = `curl -sS ${base}/chat/completions -H "Content-Type: application/json" -d '${shellSingleQuotedJson({
    model: "auto-fast",
    messages: [{ role: "user", content: "Say ok only." }],
    stream: false,
  })}'`;
  const missingBody = runCurlShell(missingCurl);
  const missingOk = missingBody?.error?.code === "missing_token";
  const missingSummary = summarize(missingBody);
  report.cases.push({
    id: "no-auth-missing-token",
    pass: missingOk,
    http: 401,
    ...missingSummary,
  });
  if (!missingOk) report.pass = false;
  console.log(
    `[${missingOk ? "PASS" : "FAIL"}] no-auth-missing-token code=${missingSummary.error_code}`
  );

  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(RESULTS_FILE, `${JSON.stringify(report, null, 2)}\n`);

  if (mock.spawned && mock.child) {
    mock.child.kill();
  }

  console.log(`\nP790 industry template acceptance: ${report.pass ? "PASS" : "FAIL"}`);
  console.log(`results: ${RESULTS_FILE}`);
  process.exit(report.pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
