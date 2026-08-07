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

export type ExplicitToolExecutionIntent = {
  detected: boolean;
  /** Available tool names that matched an execution cue (no prompt text). */
  matchedToolNames: string[];
};

type ExecutionCue = {
  pattern: RegExp;
  matchesTool: (normalizedName: string) => boolean;
};

/** Imperative / agent cues → tool-name families (Cursor + common aliases). */
const EXECUTION_CUES: readonly ExecutionCue[] = [
  {
    pattern:
      /\b(search|grep|find(?:\s+(?:in\s+)?(?:code|files?|repo))?|ripgrep)\b|搜索|查找|检索/i,
    matchesTool: (n) =>
      /^(search|grep|glob|websearch|rg)$/.test(n) || n.includes("search"),
  },
  {
    pattern:
      /\b(?:read|open)(?:\s+(?:the\s+)?(?:file|code|path))?\b|读取|打开文件|读一下|读文件/i,
    matchesTool: (n) => /^(read|cat|get_file)$/.test(n) || n.endsWith("read"),
  },
  {
    pattern:
      /\b(write|edit|modify|patch|refactor)\b|修改|编辑|写入|改一下|创建文件/i,
    matchesTool: (n) =>
      /^(write|edit|strreplace|applypatch|editnotebook|todowrite)$/.test(n) ||
      n.includes("write") ||
      n.includes("edit"),
  },
  {
    pattern:
      /\b(run|execute|shell|terminal|bash|npm\s+run|npx)\b|运行|执行|跑一下|跑测试|终端/i,
    matchesTool: (n) =>
      /^(shell|terminal|awaitshell|bash|run_terminal_cmd)$/.test(n) ||
      n.includes("shell") ||
      n.includes("terminal"),
  },
];

/** Soft informational-only prompts must not force tool repair. */
const INFORMATIONAL_ONLY =
  /^(?:\s*(?:please\s+)?)?(?:explain|describe|summarize|what\s+(?:is|does)|how\s+does|解释|说明一下|讲一下|什么意思)\b/i;

function collectLatestUserTexts(messages: unknown): string[] {
  if (!Array.isArray(messages)) return [];
  const texts: string[] = [];
  for (let i = messages.length - 1; i >= 0; i--) {
    const row = messages[i];
    if (!row || typeof row !== "object" || Array.isArray(row)) continue;
    const role = typeof (row as { role?: unknown }).role === "string"
      ? String((row as { role: string }).role).trim()
      : "";
    if (role === "tool" || role === "function") continue;
    if (role === "assistant") {
      // Stop at prior assistant turn — first-turn intent lives in trailing users.
      if (texts.length > 0) break;
      continue;
    }
    if (role === "user") {
      const text = messageContentToText((row as { content?: unknown }).content);
      if (text.trim()) texts.push(text);
      continue;
    }
  }
  return texts.reverse();
}

/**
 * P1048 — Detect explicit tool *execution* intent from user turns using the
 * real client tools list ({@link extractClientToolFunctions}).
 *
 * "tools[] present" alone is NOT enough. Informational prompts must stay false.
 * Pure; no env / DB / network.
 */
export function detectExplicitToolExecutionIntent(args: {
  messages: unknown;
  tools: unknown;
}): ExplicitToolExecutionIntent {
  const tools = extractClientToolFunctions(args.tools);
  if (tools.length === 0) {
    return { detected: false, matchedToolNames: [] };
  }
  const userText = collectLatestUserTexts(args.messages).join("\n").trim();
  if (!userText) {
    return { detected: false, matchedToolNames: [] };
  }

  const matched = new Set<string>();
  const normalized = tools.map((t) => ({
    name: t.name,
    norm: t.name.trim().toLowerCase(),
  }));

  // Direct tool-name mention (e.g. "use Read", "call Shell").
  const namedHits = new Set<string>();
  for (const t of normalized) {
    if (t.norm.length < 2) continue;
    const re = new RegExp(
      `(?:^|[^a-z0-9_])${t.norm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:[^a-z0-9_]|$)`,
      "i"
    );
    if (re.test(userText)) namedHits.add(t.name);
  }

  const cueHits = new Set<string>();
  for (const cue of EXECUTION_CUES) {
    if (!cue.pattern.test(userText)) continue;
    for (const t of normalized) {
      if (cue.matchesTool(t.norm)) cueHits.add(t.name);
    }
  }

  // Pure informational ask without naming a tool → never force repair.
  if (
    INFORMATIONAL_ONLY.test(userText) &&
    namedHits.size === 0 &&
    !/\b(search|grep|write|edit|modify|run|execute|shell|terminal)\b|搜索|查找|读取|修改|运行|执行/i.test(
      userText
    )
  ) {
    return { detected: false, matchedToolNames: [] };
  }

  for (const n of namedHits) matched.add(n);
  for (const n of cueHits) matched.add(n);

  const matchedToolNames = [...matched];
  return {
    detected: matchedToolNames.length > 0,
    matchedToolNames,
  };
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

function messageContentToText(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (typeof item === "string") {
        parts.push(item);
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const part = item as Record<string, unknown>;
      if (typeof part.text === "string") parts.push(part.text);
      else if (typeof part.content === "string") parts.push(part.content);
    }
    return parts.join("");
  }
  if (typeof content === "object") {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.content === "string") return obj.content;
    try {
      return JSON.stringify(content);
    } catch {
      return "";
    }
  }
  return "";
}

function toolNameFromCall(tc: unknown): string | null {
  if (!tc || typeof tc !== "object" || Array.isArray(tc)) return null;
  const row = tc as Record<string, unknown>;
  const fn =
    row.function && typeof row.function === "object" && !Array.isArray(row.function)
      ? (row.function as Record<string, unknown>)
      : null;
  const name = typeof fn?.name === "string" ? fn.name.trim() : "";
  return name || null;
}

function toolCallIdFromCall(tc: unknown): string | null {
  if (!tc || typeof tc !== "object" || Array.isArray(tc)) return null;
  const id = (tc as Record<string, unknown>).id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/**
 * P1040 — Convert a legal Cursor tool transcript into plain-text context for
 * emulated_json continuation. Preserves tool names + results in original
 * order. Never emits role=tool/function, assistant.tool_calls, tool_call_id,
 * or function_call. Does not mutate the input array or message objects.
 */
export function transformResumeTranscriptMessages(
  messages: unknown[]
): Record<string, unknown>[] {
  const idToName = new Map<string, string>();
  const out: Record<string, unknown>[] = [];

  for (const raw of messages) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const role = typeof row.role === "string" ? row.role.trim() : "";

    if (role === "system" || role === "user") {
      out.push({
        role,
        content: messageContentToText(row.content),
      });
      continue;
    }

    if (role === "assistant") {
      const text = messageContentToText(row.content);
      if (text.length > 0) {
        out.push({ role: "assistant", content: text });
      }

      if (Array.isArray(row.tool_calls)) {
        for (const tc of row.tool_calls) {
          const name = toolNameFromCall(tc);
          const id = toolCallIdFromCall(tc);
          if (name && id) idToName.set(id, name);
          if (name) {
            out.push({
              role: "assistant",
              content: `Previously requested tool: ${name}`,
            });
          }
        }
      }

      // Legacy single function_call — convert, never forward raw field.
      if (
        row.function_call &&
        typeof row.function_call === "object" &&
        !Array.isArray(row.function_call)
      ) {
        const fc = row.function_call as Record<string, unknown>;
        const name = typeof fc.name === "string" ? fc.name.trim() : "";
        if (name) {
          out.push({
            role: "assistant",
            content: `Previously requested tool: ${name}`,
          });
        }
      }
      continue;
    }

    if (role === "tool" || role === "function") {
      const id =
        typeof row.tool_call_id === "string" ? row.tool_call_id.trim() : "";
      let name =
        typeof row.name === "string" && row.name.trim()
          ? row.name.trim()
          : "";
      if (!name && id) name = idToName.get(id) ?? "";
      if (!name) name = "tool";
      const resultText = messageContentToText(row.content);
      out.push({
        role: "user",
        content: `Tool result for ${name}:\n${resultText}`,
      });
      continue;
    }

    // Unknown roles: keep as plain text context only (no tool fields).
    out.push({
      role: role || "user",
      content: messageContentToText(row.content),
    });
  }

  return out;
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

/**
 * P1040 — Resume-safe emulated_json compiler for continuation arbitration only.
 *
 * Converts completed Cursor tool transcript history into plain-text context,
 * then applies the same instruction injection as {@link compileEmulatedUpstreamBody}.
 * First-turn P1028 must keep calling {@link compileEmulatedUpstreamBody} directly.
 *
 * Does not mutate clientBody or the original upstream messages array.
 */
export function compileEmulatedResumeTranscript(
  upstreamBody: Record<string, unknown>,
  clientBody: Record<string, unknown>,
  opts?: { repair?: boolean }
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...upstreamBody };
  if (Array.isArray(next.messages)) {
    next.messages = transformResumeTranscriptMessages(
      next.messages as unknown[]
    );
  }
  return compileEmulatedUpstreamBody(next, clientBody, opts);
}
