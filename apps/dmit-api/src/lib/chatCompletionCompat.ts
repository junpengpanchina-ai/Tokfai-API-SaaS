/**
 * Cherry Studio / OpenAI-compatible chat request normalization.
 *
 * - Accept common client shapes (null optional numbers, content parts arrays)
 * - Never forward unknown / vendor-incompatible fields upstream
 * - Strip GPT-rejected sampling params so upstream 400s do not leak
 * - Pre-schema client-body sanitize for Cherry Studio malformed payloads
 */

export type NormalizedChatMessage = {
  role: string;
  content: string;
};

/** Optional fields Cherry / SDKs often send as explicit null — drop before schema. */
export const CHAT_NULLABLE_OPTIONAL_KEYS = [
  "temperature",
  "top_p",
  "presence_penalty",
  "frequency_penalty",
  "max_tokens",
  "max_completion_tokens",
  "tools",
  "tool_choice",
  "response_format",
  "stream_options",
  "provider_options",
  "extra_body",
] as const;

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
 * Role compat for Cherry / OpenAI SDK variants:
 * developer → system; assistant|user|system kept; anything else → user.
 */
export function normalizeChatMessageRole(role: unknown): string {
  if (typeof role !== "string" || !role.trim()) return "user";
  const lower = role.trim().toLowerCase();
  if (lower === "developer") return "system";
  if (lower === "assistant" || lower === "user" || lower === "system") {
    return lower;
  }
  return "user";
}

/**
 * Flatten OpenAI-style content parts to a plain string for upstream chat.
 * Supports string, [{type:"text"|"input_text", text:"..."}], {text:"..."}, etc.
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
      // { type: "text" | "input_text", text: "..." } and { text: "..." }
      if (typeof part.text === "string") {
        parts.push(part.text);
        continue;
      }
      if (typeof part.content === "string") {
        parts.push(part.content);
        continue;
      }
      // ignore image_url / tool / illegal object parts for text chat compat
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
    out.push({
      role: normalizeChatMessageRole(row.role),
      content: normalizeChatMessageContent(row.content),
    });
  }

  return { ok: true, messages: out };
}

export type NormalizeClientChatCompletionBodyResult =
  | {
      noop: true;
      rejectedReason: "empty_messages";
      normalized: boolean;
      /** Body retained for model/stream in noop response. */
      body: Record<string, unknown>;
    }
  | {
      noop: false;
      normalized: boolean;
      /** Sanitized object, or original non-object for schema 400. */
      body: unknown;
    };

function stripNullOptionalFields(
  body: Record<string, unknown>
): { body: Record<string, unknown>; changed: boolean } {
  let changed = false;
  const out: Record<string, unknown> = { ...body };
  for (const key of CHAT_NULLABLE_OPTIONAL_KEYS) {
    if (out[key] === null) {
      delete out[key];
      changed = true;
    }
  }
  return { body: out, changed };
}

/**
 * OpenAI / Cherry compat: when only max_completion_tokens is set, promote it to
 * max_tokens and drop max_completion_tokens so upstream never sees the OpenAI-
 * only field (many providers reject it as invalid_request_error).
 */
export function promoteMaxCompletionTokensOnly(
  body: Record<string, unknown>
): { body: Record<string, unknown>; changed: boolean } {
  const maxTokens = coerceOptionalNumber(body.max_tokens);
  const maxCompletion = coerceOptionalNumber(body.max_completion_tokens);
  if (maxTokens !== undefined || maxCompletion === undefined) {
    return { body, changed: false };
  }
  const out: Record<string, unknown> = { ...body };
  out.max_tokens = maxCompletion;
  delete out.max_completion_tokens;
  return { body: out, changed: true };
}

/**
 * Pre-schema Cherry Studio / OpenAI client body sanitize for /v1/chat/completions.
 *
 * - Drop null optional sampling / tools / format fields
 * - max_completion_tokens-only → max_tokens (delete max_completion_tokens)
 * - Normalize message roles + flatten content parts to strings
 * - messages missing / null / [] / non-array / all-empty-content → noop
 *   (caller returns 200 not_billable; never upstream / never debit)
 */
export function normalizeClientChatCompletionBody(
  rawBody: unknown
): NormalizeClientChatCompletionBodyResult {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    // Non-object bodies fall through to schema → concrete OpenAI 400 envelope.
    return {
      noop: false,
      normalized: false,
      body: rawBody,
    };
  }

  const original = rawBody as Record<string, unknown>;
  let normalized = false;

  const stripped = stripNullOptionalFields(original);
  let body = stripped.body;
  if (stripped.changed) normalized = true;

  const promoted = promoteMaxCompletionTokensOnly(body);
  body = promoted.body;
  if (promoted.changed) normalized = true;

  const messagesRaw = body.messages;

  // A: missing / null / non-array / [] → empty noop
  if (
    messagesRaw === undefined ||
    messagesRaw === null ||
    !Array.isArray(messagesRaw) ||
    messagesRaw.length === 0
  ) {
    return {
      noop: true,
      rejectedReason: "empty_messages",
      normalized: true,
      body,
    };
  }

  const normalizedMessages: Record<string, unknown>[] = [];
  let messagesChanged = false;

  for (const raw of messagesRaw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      // Illegal message entry → skip; may collapse to empty noop below.
      messagesChanged = true;
      continue;
    }
    const row = raw as Record<string, unknown>;
    const role = normalizeChatMessageRole(row.role);
    const content = normalizeChatMessageContent(row.content);
    if (role !== row.role || content !== row.content) {
      messagesChanged = true;
    }
    // Preserve other passthrough keys on the message object for schema .passthrough().
    normalizedMessages.push({ ...row, role, content });
  }

  if (messagesChanged) normalized = true;

  // B: all content empty after extract → same empty noop (no upstream / no debit)
  const hasText = normalizedMessages.some((m) => {
    const c = m.content;
    return typeof c === "string" && c.trim().length > 0;
  });
  if (!hasText) {
    return {
      noop: true,
      rejectedReason: "empty_messages",
      normalized: true,
      body: { ...body, messages: normalizedMessages },
    };
  }

  body = {
    ...body,
    messages: normalizedMessages,
  };

  return {
    noop: false,
    normalized,
    body,
  };
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

  // max_completion_tokens-only → max_tokens. Never forward max_completion_tokens
  // (GRSAI / OpenAI-compat proxies often 400 on that field). Clamping is done by
  // buildUpstreamChatBody via resolveMaxOutputTokens.
  const rawMax =
    coerceOptionalNumber(body.max_tokens) ??
    coerceOptionalNumber(body.max_completion_tokens);
  if (rawMax !== undefined) {
    upstream.max_tokens = rawMax;
  }

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
