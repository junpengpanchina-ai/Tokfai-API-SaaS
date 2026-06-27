import { TOKFAI_API_BASE_URL, TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

const DEFAULT_MODEL = "auto-fast";
const CHAT_PROMPT = "Say ok only.";

export function buildNodeSdkConfigSnippetSafe(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model = DEFAULT_MODEL
): string {
  return `baseURL: "${TOKFAI_API_BASE_URL}"
apiKey: process.env.TOKFAI_API_KEY ?? "${apiKey}"
model: "${model}"`;
}

export function buildPythonSdkConfigSnippetSafe(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model = DEFAULT_MODEL
): string {
  return `base_url: "${TOKFAI_API_BASE_URL}"
api_key: os.environ.get("TOKFAI_API_KEY", "${apiKey}")
model: "${model}"`;
}

export function buildNodeChatSdkRunnableFileSafe(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  return `import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "${apiKey}",
  baseURL: "${TOKFAI_API_BASE_URL}",
});

const completion = await client.chat.completions.create({
  model: "${DEFAULT_MODEL}",
  messages: [{ role: "user", content: "${CHAT_PROMPT}" }],
  stream: false,
});

console.log(completion.choices[0]?.message?.content);`;
}

export function buildPythonChatSdkRunnableFileSafe(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  return `from openai import OpenAI

client = OpenAI(
    api_key="${apiKey}",
    base_url="${TOKFAI_API_BASE_URL}",
)

completion = client.chat.completions.create(
    model="${DEFAULT_MODEL}",
    messages=[{"role": "user", "content": "${CHAT_PROMPT}"}],
    stream=False,
)

print(completion.choices[0].message.content)`;
}
