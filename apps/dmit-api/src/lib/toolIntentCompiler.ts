/**
 * P1017 / P1026 — Compile client tools/tool_choice into emulated JSON instructions.
 * Upstream body must NOT include native tools / tool_choice fields.
 */

export const EMULATED_TOOL_INTENT_SYSTEM_PROMPT = `You are a strict JSON Tool Intent emitter for Tokfai Emulated Tool Calling.

Return exactly one minified JSON object.
Do not use Markdown or code fences.
Do not explain your answer.
Never reproduce tool descriptions.
Select only names from the supplied tool list.
arguments must be a JSON object.
When tool_choice is required, assistant_text is forbidden.

Do NOT generate tool_call_id or id fields (Tokfai generates ids later).
Do NOT output any characters outside the single JSON object.

Exactly one of these two envelopes is allowed:

Tool call:
{"type":"tool_call","tool_calls":[{"name":"...","arguments":{}}]}

Ordinary text:
{"type":"assistant_text","content":"..."}

If you call tools, type must be "tool_call" and you must not include content.
If you answer with text, type must be "assistant_text" and you must not include tool_calls.`;

export const EMULATED_REPAIR_USER_MESSAGE = `Your previous reply was not valid Tool Intent JSON.
Return exactly one minified JSON object matching the required envelope.
Do not use Markdown or code fences.
Do not explain your answer.
Never reproduce tool descriptions.
Select only names from the supplied tool list.
arguments must be a JSON object.
When tool_choice is required, assistant_text is forbidden.
No tool_call_id.`;

type ToolFn = {
  name: string;
  description?: string;
  parameters?: unknown;
};

export function extractClientToolFunctions(tools: unknown): ToolFn[] {
  if (!Array.isArray(tools)) return [];
  const out: ToolFn[] = [];
  for (const row of tools) {
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const rec = row as Record<string, unknown>;
    const fn =
      rec.function && typeof rec.function === "object" && !Array.isArray(rec.function)
        ? (rec.function as Record<string, unknown>)
        : rec;
    const name = typeof fn.name === "string" ? fn.name.trim() : "";
    if (!name) continue;
    out.push({
      name,
      description:
        typeof fn.description === "string" ? fn.description : undefined,
      parameters: fn.parameters,
    });
  }
  return out;
}

export function summarizeToolChoice(toolChoice: unknown): string {
  if (toolChoice == null || toolChoice === "auto") {
    return "auto: you may return tool_call or assistant_text.";
  }
  if (toolChoice === "none") {
    return "none: return assistant_text only; do not call tools.";
  }
  if (toolChoice === "required") {
    return "required: you MUST return type=tool_call with at least one tool. assistant_text is forbidden.";
  }
  if (typeof toolChoice === "object" && !Array.isArray(toolChoice)) {
    const row = toolChoice as Record<string, unknown>;
    const fn =
      row.function && typeof row.function === "object"
        ? (row.function as Record<string, unknown>)
        : row;
    const name = typeof fn.name === "string" ? fn.name.trim() : "";
    if (name) {
      return `forced function: you MUST call only "${name}". assistant_text is forbidden.`;
    }
  }
  return "auto: you may return tool_call or assistant_text.";
}

function buildToolsDescription(tools: ToolFn[]): string {
  return tools
    .map((t) => {
      const params =
        t.parameters === undefined
          ? "{}"
          : JSON.stringify(t.parameters);
      const desc = t.description ? ` — ${t.description}` : "";
      return `- ${t.name}${desc}\n  parameters: ${params}`;
    })
    .join("\n");
}

/**
 * Transform an upstream chat body for emulated_json mode:
 * - strip tools / tool_choice
 * - inject system + user instruction messages describing tools
 */
export function compileEmulatedUpstreamBody(
  upstreamBody: Record<string, unknown>,
  clientBody: Record<string, unknown>,
  opts?: { repair?: boolean }
): Record<string, unknown> {
  const tools = extractClientToolFunctions(clientBody.tools);
  const toolChoice = clientBody.tool_choice;
  const parallel = clientBody.parallel_tool_calls;

  const next: Record<string, unknown> = { ...upstreamBody };
  delete next.tools;
  delete next.tool_choice;
  delete next.parallel_tool_calls;

  const parallelHint =
    parallel === false
      ? "parallel_tool_calls=false: return at most ONE tool call."
      : "You may return multiple tool_calls when needed (max 8).";

  const instruction =
    "Available tools (description only; there is NO native tools API field):\n" +
    buildToolsDescription(tools) +
    "\n\nSelection rule:\n" +
    summarizeToolChoice(toolChoice) +
    "\n" +
    parallelHint;

  const messages = Array.isArray(next.messages)
    ? [...(next.messages as unknown[])]
    : [];

  messages.unshift({
    role: "system",
    content: EMULATED_TOOL_INTENT_SYSTEM_PROMPT,
  });
  messages.push({
    role: "user",
    content: instruction,
  });
  if (opts?.repair) {
    messages.push({
      role: "user",
      content: EMULATED_REPAIR_USER_MESSAGE,
    });
  }

  next.messages = messages;
  // Prefer low temperature when present; do not force if GPT rejects it —
  // callers may already have stripped sampling for GPT models.
  if (next.temperature === undefined) {
    next.temperature = 0;
  }
  return next;
}
