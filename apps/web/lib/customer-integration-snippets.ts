import {
  TOKFAI_API_BASE_URL,
  TOKFAI_API_KEY_PLACEHOLDER,
  TOKFAI_CLIENT_TEST_PROMPT,
  TOKFAI_RECOMMENDED_MODEL,
} from "@/lib/tokfai-api";

export const INTEGRATION_BASE_URL = TOKFAI_API_BASE_URL;
export const INTEGRATION_KEY_PLACEHOLDER = TOKFAI_API_KEY_PLACEHOLDER;
export const INTEGRATION_DEFAULT_MODEL = TOKFAI_RECOMMENDED_MODEL;

export const CUSTOMER_INTEGRATION_ERROR_CODES = [
  "missing_token",
  "invalid_token",
  "insufficient_credits",
  "upstream_model_busy",
  "model_not_available",
  "upstream_timeout",
  "too_many_requests",
  "gateway_overloaded",
  "batch_cancelled",
] as const;

export type CustomerIntegrationErrorCode =
  (typeof CUSTOMER_INTEGRATION_ERROR_CODES)[number];

export function chatCompletionsCurl(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model = TOKFAI_RECOMMENDED_MODEL
): string {
  return `curl https://api.tokfai.com/v1/chat/completions \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "messages": [
      { "role": "user", "content": "${TOKFAI_CLIENT_TEST_PROMPT}" }
    ],
    "stream": false
  }'`;
}

export function modelsListCurl(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return `curl https://api.tokfai.com/v1/models \\
  -H "Authorization: Bearer ${apiKey}"`;
}

export const OPENAI_JS_SNIPPET = `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "sk-tokfai_xxx",
  baseURL: "https://api.tokfai.com/v1",
});

const completion = await client.chat.completions.create({
  model: "${TOKFAI_RECOMMENDED_MODEL}",
  messages: [{ role: "user", content: "${TOKFAI_CLIENT_TEST_PROMPT}" }],
});

console.log(completion.choices[0]?.message?.content);
console.log("resolved model:", completion.model);`;

export const OPENAI_PYTHON_SNIPPET = `from openai import OpenAI

client = OpenAI(
    api_key="sk-tokfai_xxx",
    base_url="https://api.tokfai.com/v1",
)

completion = client.chat.completions.create(
    model="${TOKFAI_RECOMMENDED_MODEL}",
    messages=[{"role": "user", "content": "${TOKFAI_CLIENT_TEST_PROMPT}"}],
)

print(completion.choices[0].message.content)
print("resolved model:", completion.model)`;

export function openaiSdkConfigSnippet(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model = TOKFAI_RECOMMENDED_MODEL
): string {
  return `Base URL: https://api.tokfai.com/v1
API Key: ${apiKey}
Model: ${model}
Authorization header: Bearer ${apiKey}`;
}

export function cursorConfigSnippet(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  return `Provider: OpenAI-compatible
Base URL: https://api.tokfai.com/v1
API Key: ${apiKey}
Model: auto-fast / auto-pro`;
}

export function cherryStudioConfigSnippet(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model = TOKFAI_RECOMMENDED_MODEL
): string {
  return `Provider: OpenAI Compatible
API Host: https://api.tokfai.com/v1
API Key: ${apiKey}
Model: ${model}`;
}

export const OPENAI_SDK_CONFIG_SNIPPET = openaiSdkConfigSnippet();
export const CURSOR_CONFIG_SNIPPET = cursorConfigSnippet();
export const CHERRY_STUDIO_CONFIG_SNIPPET = cherryStudioConfigSnippet();

export function authorizationHeader(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return `Authorization: Bearer ${apiKey}`;
}

export function batchChatCurl(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model = TOKFAI_RECOMMENDED_MODEL
): string {
  return `curl https://api.tokfai.com/v1/batches/chat \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "${model}",
    "items": [
      { "messages": [{ "role": "user", "content": "Say ok only." }] },
      { "messages": [{ "role": "user", "content": "Say hello only." }] }
    ]
  }'`;
}

export function batchPollCurl(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  batchId = "batch_xxx"
): string {
  return `curl https://api.tokfai.com/v1/batches/${batchId} \\
  -H "Authorization: Bearer ${apiKey}"`;
}

export const BATCH_CHAT_CURL = batchChatCurl();
export const BATCH_POLL_CURL = batchPollCurl();
