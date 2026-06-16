import { buildImageApiCurlOneLine } from "@/lib/customer-image-api-chapter";
import { TOKFAI_API_BASE_URL, TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

export const OPENAI_SDK_DEFAULT_MODEL = "auto-fast";
const CHAT_SMOKE_PROMPT = "Say ok only.";

export function buildOpenAiSdkConfigSnippet(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model = OPENAI_SDK_DEFAULT_MODEL
): string {
  return `Base URL: ${TOKFAI_API_BASE_URL}
API Key: ${apiKey}
Model: ${model}
Authorization: Bearer ${apiKey}`;
}

export function buildNodeSdkConfigSnippet(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model = OPENAI_SDK_DEFAULT_MODEL
): string {
  return `baseURL: "${TOKFAI_API_BASE_URL}"
apiKey: process.env.TOKFAI_API_KEY ?? "${apiKey}"
model: "${model}"`;
}

export function buildPythonSdkConfigSnippet(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model = OPENAI_SDK_DEFAULT_MODEL
): string {
  return `base_url: "${TOKFAI_API_BASE_URL}"
api_key: os.environ.get("TOKFAI_API_KEY", "${apiKey}")
model: "${model}"`;
}

export const NODE_SDK_INIT_COMMAND = "npm init -y";
export const NODE_SDK_INSTALL_COMMAND = "npm install openai";

export function buildNodeSdkRunCommand(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return `TOKFAI_API_KEY=${apiKey} node tokfai-test.mjs`;
}

export const PYTHON_VENV_CREATE_COMMAND = "python3 -m venv .venv";
export const PYTHON_VENV_ACTIVATE_BASH = "source .venv/bin/activate";
export const PYTHON_SDK_INSTALL_COMMAND = "pip install openai";

export function buildPythonSdkRunCommand(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return `TOKFAI_API_KEY=${apiKey} python tokfai_test.py`;
}

export function buildNodeChatSdkRunnableFile(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return `// Save as tokfai-test.mjs in any folder — no Tokfai project required
// 1) npm init -y && npm install openai
// 2) TOKFAI_API_KEY=sk-tokfai_... node tokfai-test.mjs
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.TOKFAI_API_KEY ?? "${apiKey}",
  baseURL: "${TOKFAI_API_BASE_URL}",
});

const completion = await client.chat.completions.create({
  model: "${OPENAI_SDK_DEFAULT_MODEL}",
  messages: [{ role: "user", content: "${CHAT_SMOKE_PROMPT}" }],
  stream: false,
});

console.log(completion.choices[0]?.message?.content);

const tokfai = completion as typeof completion & {
  request_id?: string;
  credits_charged?: number;
  tokfai?: {
    request_id?: string;
    credits_charged?: number;
    requested_model?: string;
    resolved_model?: string;
  };
};
console.log("request_id:", tokfai.request_id ?? tokfai.tokfai?.request_id);
console.log("credits_charged:", tokfai.credits_charged ?? tokfai.tokfai?.credits_charged);
console.log(
  "requested_model:",
  tokfai.tokfai?.requested_model ?? "${OPENAI_SDK_DEFAULT_MODEL}"
);
console.log(
  "resolved_model:",
  tokfai.tokfai?.resolved_model ?? completion.model
);`;
}

export function buildPythonChatSdkRunnableFile(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return `# Save as tokfai_test.py in any folder — no Tokfai project required
# 1) python3 -m venv .venv && source .venv/bin/activate
# 2) pip install openai
# 3) TOKFAI_API_KEY=sk-tokfai_... python tokfai_test.py
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("TOKFAI_API_KEY", "${apiKey}"),
    base_url="${TOKFAI_API_BASE_URL}",
)

completion = client.chat.completions.create(
    model="${OPENAI_SDK_DEFAULT_MODEL}",
    messages=[{"role": "user", "content": "${CHAT_SMOKE_PROMPT}"}],
    stream=False,
)

print(completion.choices[0].message.content)

payload = completion.model_dump() if hasattr(completion, "model_dump") else {}
tokfai = payload.get("tokfai") or {}
print("request_id:", payload.get("request_id") or tokfai.get("request_id"))
print("credits_charged:", payload.get("credits_charged") or tokfai.get("credits_charged"))
print("requested_model:", tokfai.get("requested_model") or "${OPENAI_SDK_DEFAULT_MODEL}")
print("resolved_model:", tokfai.get("resolved_model") or completion.model)`;
}

export function buildNodeChatFetchExample(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return `// Node fetch — chat completion (no OpenAI SDK required)
const apiKey = process.env.TOKFAI_API_KEY ?? "${apiKey}";

const res = await fetch("${TOKFAI_API_BASE_URL}/chat/completions", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${apiKey}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${OPENAI_SDK_DEFAULT_MODEL}",
    messages: [{ role: "user", content: "${CHAT_SMOKE_PROMPT}" }],
    stream: false,
  }),
});

const body = await res.json();
if (!res.ok) {
  console.error(body.error?.code, body.error?.message);
  throw new Error(body.error?.code ?? "request_failed");
}

console.log(body.choices[0]?.message?.content);
console.log("request_id:", body.request_id ?? body.tokfai?.request_id);
console.log("credits_charged:", body.credits_charged ?? body.tokfai?.credits_charged);
console.log("resolved_model:", body.tokfai?.resolved_model ?? body.model);`;
}

export function buildNodeChatSdkExample(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return `// npm install openai
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: process.env.TOKFAI_API_KEY ?? "${apiKey}",
  baseURL: "${TOKFAI_API_BASE_URL}",
});

const completion = await client.chat.completions.create({
  model: "${OPENAI_SDK_DEFAULT_MODEL}",
  messages: [{ role: "user", content: "${CHAT_SMOKE_PROMPT}" }],
  stream: false,
});

console.log(completion.choices[0]?.message?.content);

const tokfai = completion as typeof completion & {
  request_id?: string;
  credits_charged?: number;
  tokfai?: { resolved_model?: string; request_id?: string; credits_charged?: number };
};
console.log("request_id:", tokfai.request_id ?? tokfai.tokfai?.request_id);
console.log("credits_charged:", tokfai.credits_charged ?? tokfai.tokfai?.credits_charged);
console.log(
  "resolved_model:",
  tokfai.tokfai?.resolved_model ?? completion.model
);`;
}

export function buildPythonChatSdkExample(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return `# pip install openai
import os
from openai import OpenAI

client = OpenAI(
    api_key=os.environ.get("TOKFAI_API_KEY", "${apiKey}"),
    base_url="${TOKFAI_API_BASE_URL}",
)

completion = client.chat.completions.create(
    model="${OPENAI_SDK_DEFAULT_MODEL}",
    messages=[{"role": "user", "content": "${CHAT_SMOKE_PROMPT}"}],
    stream=False,
)

print(completion.choices[0].message.content)

payload = completion.model_dump() if hasattr(completion, "model_dump") else {}
tokfai = payload.get("tokfai") or {}
print("request_id:", payload.get("request_id") or tokfai.get("request_id"))
print("credits_charged:", payload.get("credits_charged") or tokfai.get("credits_charged"))
print("resolved_model:", tokfai.get("resolved_model") or completion.model)`;
}

export function buildNodeBatchFetchExample(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return `// Tokfai Batch API — extension endpoints (use fetch, not OpenAI SDK)
const baseURL = "${TOKFAI_API_BASE_URL}";
const apiKey = process.env.TOKFAI_API_KEY ?? "${apiKey}";

const createRes = await fetch(\`\${baseURL}/batches/chat\`, {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${apiKey}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${OPENAI_SDK_DEFAULT_MODEL}",
    items: [
      { messages: [{ role: "user", content: "Say ok only." }] },
      { messages: [{ role: "user", content: "Say hello only." }] },
    ],
  }),
});
const batch = await createRes.json();
console.log("batch id:", batch.id);

const pollRes = await fetch(\`\${baseURL}/batches/\${batch.id}\`, {
  headers: { Authorization: \`Bearer \${apiKey}\` },
});
console.log("status:", (await pollRes.json()).status);

const itemsRes = await fetch(\`\${baseURL}/batches/\${batch.id}/items\`, {
  headers: { Authorization: \`Bearer \${apiKey}\` },
});
const itemsBody = await itemsRes.json();
for (const item of itemsBody.data ?? []) {
  console.log("item", item.index, item.status, item.request_id, item.credits_charged);
}`;
}

export function buildPythonBatchRequestsExample(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  return `# pip install requests
# Tokfai Batch API — extension endpoints (use requests, not OpenAI SDK)
import os
import requests

base_url = "${TOKFAI_API_BASE_URL}"
api_key = os.environ.get("TOKFAI_API_KEY", "${apiKey}")
headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}

create = requests.post(
    f"{base_url}/batches/chat",
    headers=headers,
    json={
        "model": "${OPENAI_SDK_DEFAULT_MODEL}",
        "items": [
            {"messages": [{"role": "user", "content": "Say ok only."}]},
            {"messages": [{"role": "user", "content": "Say hello only."}]},
        ],
    },
    timeout=60,
)
batch = create.json()
print("batch id:", batch.get("id"))

poll = requests.get(f"{base_url}/batches/{batch['id']}", headers=headers, timeout=30)
print("status:", poll.json().get("status"))

items = requests.get(
    f"{base_url}/batches/{batch['id']}/items", headers=headers, timeout=30
)
for item in items.json().get("data") or []:
    print("item", item.get("index"), item.get("status"), item.get("request_id"), item.get("credits_charged"))`;
}

export function buildOpenAiSdkImageCurlExample(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return buildImageApiCurlOneLine(apiKey);
}
