/**
 * Cherry Studio / OpenAI-compatible chat request normalization.
 *
 * - Accept common client shapes (null optional numbers, content parts arrays)
 * - Never forward unknown / vendor-incompatible fields upstream
 * - Strip GPT-rejected sampling params so upstream 400s do not leak
 */

export type NormalizedChatMessage = {
  role: string;
  content: string;
};

/** Coerce null / empty string → undefined for optional numeric fields. */
export function coerceOptionalNumber(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

export function coerceOptionalBoolean(value: unknown): boolean | undefined {
  if (value === null || value === undefined || value === "") return undefined;
  if (typeof value === "boolean") return value;
  if (value === "true" || value === 1) return true;
  if (value === "false" || value === 0) return false;
  return undefined;
}

/**
 * Flatten OpenAI-style content parts to a plain string for upstream chat.
 * Supports string, [{type:"text", text:"..."}], and similar shapes.
 */
export function normalizeChatMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content === null || content === undefined) return "";

  if (Array.isArray(content)) {
    const parts: string[] = [];
    for (const item of content) {
      if (typeof item === "string") {
        parts.push(item);
        continue;
      }
      if (!item || typeof item !== "object") continue;
      const part = item as Record<string, unknown>;
      if (typeof part.text === "string") {
        parts.push(part.text);
        continue;
      }
      if (typeof part.content === "string") {
        parts.push(part.content);
        continue;
      }
      // Nested parts: { type: "text", text: ... } already handled;
      // ignore image_url / tool parts for text chat compat.
    }
    return parts.join("");
  }

  if (typeof content === "object") {
    const obj = content as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.content === "string") return obj.content;
  }

  return "";
}

export function normalizeChatMessages(
  messages: unknown
):
  | { ok: true; messages: NormalizedChatMessage[] }
  | { ok: false; message: string } {
  if (!Array.isArray(messages) || messages.length === 0) {
    return {
      ok: false,
      message: "messages must be a non-empty array.",
    };
  }

  const out: NormalizedChatMessage[] = [];
  for (const raw of messages) {
    if (!raw || typeof raw !== "object") {
      return {
        ok: false,
        message: "Each message must be an object with role and content.",
      };
    }
    const row = raw as Record<string, unknown>;
    const role =
      typeof row.role === "string" && row.role.trim()
        ? row.role.trim()
        : "";
    if (!role) {
      return {
        ok: false,
        message: "Each message must include a non-empty role.",
      };
    }
    out.push({
      role,
      content: normalizeChatMessageContent(row.content),
    });
  }

  return { ok: true, messages: out };
}

/** GPT family often rejects custom temperature / top_p / penalties. */
export function shouldStripGptSamplingParams(model: string): boolean {
  const id = model.trim().toLowerCase();
  return (
    id.startsWith("gpt") ||
    id.startsWith("o1") ||
    id.startsWith("o3") ||
    id.startsWith("o4")
  );
}

export type SanitizeChatBodyInput = {
  model?: string;
  messages: unknown;
  temperature?: unknown;
  top_p?: unknown;
  max_tokens?: unknown;
  max_completion_tokens?: unknown;
  stream?: unknown;
  stream_options?: unknown;
  presence_penalty?: unknown;
  frequency_penalty?: unknown;
  stop?: unknown;
  tools?: unknown;
  tool_choice?: unknown;
  response_format?: unknown;
  user?: unknown;
  [key: string]: unknown;
};

/**
 * Build a whitelist-only upstream chat body.
 * Unknown Cherry / SDK fields (metadata, provider_options, enable_thinking, …)
 * are intentionally dropped — never passthrough to upstream.
 */
export function sanitizeUpstreamChatBody(
  body: SanitizeChatBodyInput,
  model: string
):
  | { ok: true; upstream: Record<string, unknown> }
  | { ok: false; message: string } {
  const normalized = normalizeChatMessages(body.messages);
  if (!normalized.ok) {
    return { ok: false, message: normalized.message };
  }

  const upstream: Record<string, unknown> = {
    model,
    messages: normalized.messages,
    stream: false,
  };

  const stripSampling = shouldStripGptSamplingParams(model);
  if (!stripSampling) {
    const temperature = coerceOptionalNumber(body.temperature);
    if (temperature !== undefined) upstream.temperature = temperature;
    const topP = coerceOptionalNumber(body.top_p);
    if (topP !== undefined) upstream.top_p = topP;
  }

  // max_tokens / max_completion_tokens are handled by caller (clamping).
  // stop / user are generally safe when present and well-typed.
  if (typeof body.user === "string" && body.user.trim()) {
    upstream.user = body.user.trim();
  }

  if (typeof body.stop === "string" && body.stop.length > 0) {
    upstream.stop = body.stop;
  } else if (Array.isArray(body.stop)) {
    const stops = body.stop.filter(
      (s): s is string => typeof s === "string" && s.length > 0
    );
    if (stops.length > 0) upstream.stop = stops;
  }

  // Non-empty tools only — empty tools:[] from Cherry must not be forwarded.
  // tool_choice: null / undefined is never forwarded (upstream rejects null).
  if (Array.isArray(body.tools) && body.tools.length > 0) {
    upstream.tools = body.tools;
    if (body.tool_choice !== undefined && body.tool_choice !== null) {
      upstream.tool_choice = body.tool_choice;
    }
  }

  // response_format: only forward simple json_object / text shapes.
  // null / undefined / unknown shapes are stripped (never cause client 400).
  if (body.response_format && typeof body.response_format === "object") {
    const rf = body.response_format as Record<string, unknown>;
    if (rf.type === "json_object" || rf.type === "text") {
      upstream.response_format = { type: rf.type };
    }
  }

  // stream_options / presence_penalty / frequency_penalty / Cherry extras:
  // intentionally omitted from whitelist — accepted at schema, never forwarded.

  // Final safety: never forward null/undefined keys (Cherry sends many nulls).
  for (const key of Object.keys(upstream)) {
    if (upstream[key] === null || upstream[key] === undefined) {
      delete upstream[key];
    }
  }

  return { ok: true, upstream };
}
