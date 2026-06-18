import { TOKFAI_API_BASE_URL, TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";
import {
  BATCH_MAX_POLL_ATTEMPTS,
  BATCH_POLL_INTERVAL_SECONDS,
  DEFAULT_MAX_ATTEMPTS,
  RETRYABLE_ERROR_CODES,
} from "@/lib/customer-retry-policy";

const CHAT_MODEL = "auto-fast";
const CHAT_PROMPT = "Say ok only.";

function shellSingleQuotedJson(value: unknown): string {
  return JSON.stringify(value).replace(/'/g, "'\\''");
}

function powershellJsonBody(value: unknown): string {
  return JSON.stringify(value).replace(/"/g, '\\"');
}

function chatBodyJson() {
  return {
    model: CHAT_MODEL,
    messages: [{ role: "user", content: CHAT_PROMPT }],
    stream: false,
  };
}

const RETRYABLE_LIST = RETRYABLE_ERROR_CODES.map((c) => `"${c}"`).join(" ");

/** Bash/zsh — safe retry chat curl. Paste in any directory; no cd or clone. */
export function buildBashSafeRetryChatScript(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  const body = shellSingleQuotedJson(chatBodyJson());
  const lines = [
    "# Tokfai safe retry chat — paste in bash/zsh from any directory (no cd, no clone)",
    `API_KEY="${apiKey}"`,
    `URL="${TOKFAI_API_BASE_URL}/chat/completions"`,
    `MAX_ATTEMPTS=${DEFAULT_MAX_ATTEMPTS}`,
    "DELAYS=(5 15 30)",
    "attempt=1",
    'while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do',
    '  response=$(curl -sS -w "\\n%{http_code}" "$URL" \\',
    '    -H "Authorization: Bearer $API_KEY" \\',
    '    -H "Content-Type: application/json" \\',
    `    -d '${body}')`,
    '  http_code=$(echo "$response" | tail -n1)',
    '  json=$(echo "$response" | sed \'$d\')',
    '  if [ "$http_code" = "200" ]; then',
    '    echo "$json"',
    '    echo "$json" | grep -o \'"request_id":"[^"]*"\' | head -1',
    "    exit 0",
    "  fi",
    '  code=$(echo "$json" | grep -o \'"code":"[^"]*"\' | head -1 | cut -d\'"\' -f4)',
    '  case "$code" in',
    "    too_many_requests|too_many_concurrent_requests|gateway_overloaded|upstream_model_busy|upstream_timeout|upstream_error|upstream_rate_limited)",
    "      delay=${DELAYS[$((attempt-1))]:-${DELAYS[2]}}",
    '      echo "retryable $code — wait ${delay}s (attempt $attempt/$MAX_ATTEMPTS)" >&2',
    '      sleep "$delay"',
    "      attempt=$((attempt+1))",
    "      ;;",
    "    *)",
    '      echo "non-retryable $code (HTTP $http_code)" >&2',
    '      echo "$json" >&2',
    "      exit 1",
    "      ;;",
    "  esac",
    "done",
    'echo "max attempts reached" >&2',
    "exit 1",
  ];
  return lines.join("\n");
}

/** PowerShell — safe retry chat with curl.exe */
export function buildPowerShellSafeRetryChatScript(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  const body = powershellJsonBody(chatBodyJson());
  const retryablePs = RETRYABLE_ERROR_CODES.map((c) => `"${c}"`).join(", ");
  const lines = [
    "# Tokfai safe retry chat — paste in PowerShell from any directory",
    `$ApiKey = "${apiKey}"`,
    `$Url = "${TOKFAI_API_BASE_URL}/chat/completions"`,
    `$MaxAttempts = ${DEFAULT_MAX_ATTEMPTS}`,
    "$Delays = @(5, 15, 30)",
    `$Retryable = @(${retryablePs})`,
    "for ($attempt = 1; $attempt -le $MaxAttempts; $attempt++) {",
    '  $raw = curl.exe -sS -w "`n%{http_code}" $Url -H "Authorization: Bearer $ApiKey" -H "Content-Type: application/json" -d "' +
      body +
      '"',
    "  $lines = $raw -split \"`n\"",
    "  $httpCode = $lines[-1]",
    "  $json = ($lines[0..($lines.Length-2)] -join \"`n\")",
    "  if ($httpCode -eq \"200\") {",
    "    Write-Output $json",
    "    exit 0",
    "  }",
    "  if ($json -match '\"code\":\"([^\"]+)\"') { $code = $Matches[1] } else { $code = \"\" }",
    "  if ($Retryable -contains $code) {",
    "    $delay = $Delays[[Math]::Min($attempt - 1, $Delays.Length - 1)]",
    "    Write-Host \"retryable $code — wait ${delay}s (attempt $attempt/$MaxAttempts)\"",
    "    Start-Sleep -Seconds $delay",
    "  } else {",
    "    Write-Error \"non-retryable $code (HTTP $httpCode)\"",
    "    Write-Output $json",
    "    exit 1",
    "  }",
    "}",
    "Write-Error \"max attempts reached\"",
    "exit 1",
  ];
  return lines.join("\n");
}

/** Node.js fetch safe client with exponential backoff */
export function buildNodeSafeRetryClient(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return `// Save as tokfai-safe-client.mjs — run: node tokfai-safe-client.mjs (any folder)
const API_KEY = process.env.TOKFAI_API_KEY ?? "${apiKey}";
const URL = "${TOKFAI_API_BASE_URL}/chat/completions";
const MAX_ATTEMPTS = ${DEFAULT_MAX_ATTEMPTS};
const DELAYS_MS = [5000, 15000, 30000];
const RETRYABLE = new Set([${RETRYABLE_LIST}]);

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function isRetryable(body, status) {
  const code = body?.error?.code;
  if (status === 401 || status === 402 || status === 400 || status === 413) return false;
  if (code && RETRYABLE.has(code)) return true;
  if (status === 429 || status === 503 || status === 504) return true;
  return status >= 500 && status < 600;
}

for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
  const res = await fetch(URL, {
    method: "POST",
    headers: {
      Authorization: \`Bearer \${API_KEY}\`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "${CHAT_MODEL}",
      messages: [{ role: "user", content: "${CHAT_PROMPT}" }],
      stream: false,
    }),
  });
  const body = await res.json();
  if (res.ok) {
    console.log(body.choices?.[0]?.message?.content);
    console.log("request_id:", body.request_id ?? body.tokfai?.request_id);
    console.log("credits_charged:", body.credits_charged ?? body.tokfai?.credits_charged);
    console.log("resolved_model:", body.tokfai?.resolved_model ?? body.model);
    process.exit(0);
  }
  if (!isRetryable(body, res.status) || attempt === MAX_ATTEMPTS - 1) {
    console.error(body.error?.code, body.error?.message);
    process.exit(1);
  }
  const jitter = Math.floor(Math.random() * 3000);
  const wait = DELAYS_MS[attempt] + jitter;
  console.warn(\`retry \${body.error?.code} — wait \${wait}ms\`);
  await sleep(wait);
}`;
}

/** Python requests safe client with backoff */
export function buildPythonSafeRetryClient(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return `# Save as tokfai_safe_client.py — run: python tokfai_safe_client.py (any folder)
import json
import os
import random
import time
import requests

API_KEY = os.environ.get("TOKFAI_API_KEY", "${apiKey}")
URL = "${TOKFAI_API_BASE_URL}/chat/completions"
MAX_ATTEMPTS = ${DEFAULT_MAX_ATTEMPTS}
DELAYS = [5, 15, 30]
RETRYABLE = {${RETRYABLE_ERROR_CODES.map((c) => `"${c}"`).join(", ")}}

def is_retryable(status, body):
    code = (body.get("error") or {}).get("code")
    if status in (401, 402, 400, 413):
        return False
    if code in RETRYABLE:
        return True
    return status in (429, 503, 504) or 500 <= status < 600

payload = {
    "model": "${CHAT_MODEL}",
    "messages": [{"role": "user", "content": "${CHAT_PROMPT}"}],
    "stream": False,
}

for attempt in range(MAX_ATTEMPTS):
    res = requests.post(
        URL,
        headers={"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"},
        json=payload,
        timeout=120,
    )
    body = res.json()
    if res.ok:
        print(body["choices"][0]["message"]["content"])
        tokfai = body.get("tokfai") or {}
        print("request_id:", body.get("request_id") or tokfai.get("request_id"))
        print("credits_charged:", body.get("credits_charged") or tokfai.get("credits_charged"))
        print("resolved_model:", tokfai.get("resolved_model") or body.get("model"))
        break
    err = body.get("error") or {}
    if not is_retryable(res.status_code, body) or attempt == MAX_ATTEMPTS - 1:
        print(err.get("code"), err.get("message"))
        raise SystemExit(1)
    delay = DELAYS[min(attempt, len(DELAYS) - 1)] + random.uniform(0, 3)
    print(f"retry {err.get('code')} — wait {delay:.1f}s")
    time.sleep(delay)`;
}

/** Node batch create + safe poll with max attempts */
export function buildNodeSafeBatchPollClient(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return `// Save as tokfai-safe-batch.mjs — node tokfai-safe-batch.mjs (any folder)
const API_KEY = process.env.TOKFAI_API_KEY ?? "${apiKey}";
const BASE = "${TOKFAI_API_BASE_URL}";
const POLL_INTERVAL_MS = ${BATCH_POLL_INTERVAL_SECONDS * 1000};
const MAX_POLLS = ${BATCH_MAX_POLL_ATTEMPTS};

const createRes = await fetch(\`\${BASE}/batches/chat\`, {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${CHAT_MODEL}",
    items: [{ messages: [{ role: "user", content: "${CHAT_PROMPT}" }] }],
  }),
});
const created = await createRes.json();
if (!createRes.ok) {
  console.error(created.error?.code, created.error?.message);
  process.exit(1);
}
const batchId = created.id;
console.log("batch_id:", batchId, "request_id:", created.request_id);

let status = created.status;
for (let i = 0; i < MAX_POLLS; i++) {
  if (status === "completed" || status === "partial_failed" || status === "failed" || status === "cancelled") {
    break;
  }
  await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  const pollRes = await fetch(\`\${BASE}/batches/\${batchId}\`, {
    headers: { Authorization: \`Bearer \${API_KEY}\` },
  });
  const poll = await pollRes.json();
  status = poll.status;
  console.log("poll", i + 1, status);
}

if (status === "cancelled") {
  console.error("batch_cancelled — do not retry");
  process.exit(1);
}

const itemsRes = await fetch(\`\${BASE}/batches/\${batchId}/items\`, {
  headers: { Authorization: \`Bearer \${API_KEY}\` },
});
const items = await itemsRes.json();
for (const item of items.data ?? []) {
  console.log("item", item.index, item.status, "request_id:", item.request_id);
}`;
}

export const SAFE_CLIENT_SNIPPET_IDS = [
  "bash-safe-retry",
  "powershell-safe-retry",
  "node-safe-retry",
  "python-safe-retry",
  "node-safe-batch-poll",
] as const;

export type SafeClientSnippetId = (typeof SAFE_CLIENT_SNIPPET_IDS)[number];

export function buildSafeClientSnippet(
  id: SafeClientSnippetId,
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  switch (id) {
    case "bash-safe-retry":
      return buildBashSafeRetryChatScript(apiKey);
    case "powershell-safe-retry":
      return buildPowerShellSafeRetryChatScript(apiKey);
    case "node-safe-retry":
      return buildNodeSafeRetryClient(apiKey);
    case "python-safe-retry":
      return buildPythonSafeRetryClient(apiKey);
    case "node-safe-batch-poll":
      return buildNodeSafeBatchPollClient(apiKey);
  }
}
