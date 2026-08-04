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
  content: string | null;
  /** OpenAI tool/function message fields — preserved for Cursor / tool loops. */
  name?: string;
  tool_call_id?: string;
  tool_calls?: unknown;
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
 * Role compat for Cherry / OpenAI / Cursor SDK variants:
 * developer → system; assistant|user|system|tool|function kept; else → user.
 * P970: never rewrite tool/function → user (breaks tool call loops).
 */
export function normalizeChatMessageRole(role: unknown): string {
  if (typeof role !== "string" || !role.trim()) return "user";
  const lower = role.trim().toLowerCase();
  if (lower === "developer") return "system";
  if (
    lower === "assistant" ||
    lower === "user" ||
    lower === "system" ||
    lower === "tool" ||
    lower === "function"
  ) {
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
    const role = normalizeChatMessageRole(row.role);
    const contentRaw = normalizeChatMessageContent(row.content);
    // OpenAI tool/function messages often use empty content + tool_call_id.
    const content =
      role === "tool" || role === "function"
        ? contentRaw.length > 0
          ? contentRaw
          : null
        : contentRaw;

    const msg: NormalizedChatMessage = { role, content };
    if (typeof row.name === "string" && row.name.trim()) {
      msg.name = row.name.trim();
    }
    if (typeof row.tool_call_id === "string" && row.tool_call_id.trim()) {
      msg.tool_call_id = row.tool_call_id.trim();
    }
    if (Array.isArray(row.tool_calls) && row.tool_calls.length > 0) {
      msg.tool_calls = row.tool_calls;
    }
    out.push(msg);
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
    const contentFlat = normalizeChatMessageContent(row.content);
    const content =
      role === "tool" || role === "function"
        ? contentFlat.length > 0
          ? contentFlat
          : null
        : contentFlat;
    if (role !== row.role || content !== row.content) {
      messagesChanged = true;
    }
    // Preserve tool_calls / tool_call_id / name for Cursor tool loops.
    const next: Record<string, unknown> = { ...row, role, content };
    if (Array.isArray(row.tool_calls) && row.tool_calls.length > 0) {
      next.tool_calls = row.tool_calls;
    } else {
      delete next.tool_calls;
    }
    if (typeof row.tool_call_id === "string" && row.tool_call_id.trim()) {
      next.tool_call_id = row.tool_call_id.trim();
    }
    if (typeof row.name === "string" && row.name.trim()) {
      next.name = row.name.trim();
    }
    normalizedMessages.push(next);
  }

  if (messagesChanged) normalized = true;

  // B: all content empty after extract → empty noop (no upstream / no debit).
  // Tool-role messages / assistant tool_calls count as non-empty payload.
  const hasText = normalizedMessages.some((m) => {
    const c = m.content;
    return typeof c === "string" && c.trim().length > 0;
  });
  const hasToolPayload = normalizedMessages.some((m) => {
    const role = String(m.role ?? "");
    if (role === "tool" || role === "function") return true;
    if (Array.isArray(m.tool_calls) && m.tool_calls.length > 0) return true;
    if (typeof m.tool_call_id === "string" && m.tool_call_id.trim()) return true;
    return false;
  });
  const hasToolsArg =
    Array.isArray(body.tools) && (body.tools as unknown[]).length > 0;
  if (!hasText && !hasToolPayload && !hasToolsArg) {
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
  n?: unknown;
  seed?: unknown;
  logprobs?: unknown;
  top_logprobs?: unknown;
  [key: string]: unknown;
};

/**
 * OpenAI-compatible top-level fields that MAY be considered for upstream.
 * Anything else is dropped (never passthrough). Values are never logged.
 *
 * Note: not every allowlisted field is forwarded today — GPT sampling /
 * max_completion_tokens / stream_options remain intentionally stripped or
 * remapped so we do not change the proven Chat/Stream main path.
 */
export const UPSTREAM_CHAT_BODY_ALLOWLIST = [
  "model",
  "messages",
  "stream",
  "tools",
  "tool_choice",
  "parallel_tool_calls",
  "response_format",
  "max_tokens",
  "max_completion_tokens",
  "temperature",
  "top_p",
  "stop",
  "presence_penalty",
  "frequency_penalty",
  "seed",
  "user",
  "n",
  "logprobs",
  "top_logprobs",
] as const;

const UPSTREAM_CHAT_BODY_ALLOWLIST_SET = new Set<string>(
  UPSTREAM_CHAT_BODY_ALLOWLIST
);

/**
 * Forbidden client top-level key names (case-insensitive substring / exact).
 * Never forwarded; names must not appear in logs (HGK dirty greps).
 */
export const FORBIDDEN_UPSTREAM_CHAT_KEY_PATTERNS = [
  /^api_key$/i,
  /^authorization$/i,
  /^bearer$/i,
  /^password$/i,
  /^secret$/i,
  /^token$/i,
  /^postgres$/i,
  /^database_url$/i,
  /^supabase$/i,
  /^service_role$/i,
  /^stripe$/i,
  /^webhook$/i,
  /^headers$/i,
  /^env$/i,
  /^process$/i,
  /^cookie$/i,
  /api[_-]?key/i,
  /service[_-]?role/i,
  /database[_-]?url/i,
  /authorization/i,
  /\bbearer\b/i,
  /password/i,
  /postgres/i,
  /supabase/i,
  /\bsecret\b/i,
  /\bcookie\b/i,
  /\bstripe\b/i,
  /\bwebhook\b/i,
] as const;

/** True when a client body key must never be forwarded upstream. */
export function isForbiddenUpstreamChatKey(key: string): boolean {
  return FORBIDDEN_UPSTREAM_CHAT_KEY_PATTERNS.some((re) => re.test(key));
}

/**
 * Scrub sensitive key *names* for logs. Never logs values.
 * Returns allowlisted / benign names only + `redacted_keys:N` when any were hidden.
 */
export function redactBodyKeyNamesForLog(keys: string[]): string[] {
  const safe: string[] = [];
  let redacted = 0;
  for (const key of keys) {
    if (isForbiddenUpstreamChatKey(key)) {
      redacted += 1;
      continue;
    }
    // Belt-and-suspenders: never emit forbidden literals even as substrings.
    if (
      /database_url|postgres|service_role|api_key|authorization|bearer|cookie|password|\bsecret\b|\btoken\b|supabase|stripe|webhook/i.test(
        key
      )
    ) {
      redacted += 1;
      continue;
    }
    safe.push(key);
  }
  if (redacted > 0) safe.push(`redacted_keys:${redacted}`);
  return safe;
}

/**
 * List top-level client keys that will not be forwarded.
 * For logs use {@link redactBodyKeyNamesForLog} — never print forbidden names.
 */
export function listDroppedUpstreamChatKeys(
  body: Record<string, unknown> | null | undefined
): string[] {
  if (!body || typeof body !== "object") return [];
  const dropped: string[] = [];
  for (const key of Object.keys(body)) {
    if (!UPSTREAM_CHAT_BODY_ALLOWLIST_SET.has(key) || isForbiddenUpstreamChatKey(key)) {
      dropped.push(key);
    }
  }
  return dropped.sort();
}

/** Names-only audit list safe for structured logs (forbidden names scrubbed). */
export function listDroppedUpstreamChatKeysForLog(
  body: Record<string, unknown> | null | undefined
): string[] {
  return redactBodyKeyNamesForLog(listDroppedUpstreamChatKeys(body));
}

/**
 * Build a whitelist-only upstream chat body.
 * Unknown Cherry / SDK fields (metadata, provider_options, enable_thinking, …)
 * and forbidden secret-shaped keys are intentionally dropped — never passthrough.
 */
export function sanitizeUpstreamChatBody(
  body: SanitizeChatBodyInput,
  model: string
):
  | {
      ok: true;
      upstream: Record<string, unknown>;
      droppedKeys: string[];
    }
  | { ok: false; message: string; droppedKeys: string[] } {
  const droppedKeys = listDroppedUpstreamChatKeys(
    body as Record<string, unknown>
  );

  const normalized = normalizeChatMessages(body.messages);
  if (!normalized.ok) {
    return { ok: false, message: normalized.message, droppedKeys };
  }

  // Start from an empty object — never Object.assign / spread the client body.
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
    // OpenAI-compatible parallel_tool_calls (Cursor Agent / GPT native path).
    if (typeof body.parallel_tool_calls === "boolean") {
      upstream.parallel_tool_calls = body.parallel_tool_calls;
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

  // n / seed / logprobs / top_logprobs / presence_penalty / frequency_penalty /
  // stream_options / Cherry extras: accepted at schema when present, but not
  // newly expanded onto the upstream payload here (preserves proven main path).

  // Final safety: never forward null/undefined keys (Cherry sends many nulls).
  for (const key of Object.keys(upstream)) {
    if (upstream[key] === null || upstream[key] === undefined) {
      delete upstream[key];
    }
  }

  // Absolute guard: upstream object may only contain allowlisted keys.
  for (const key of Object.keys(upstream)) {
    if (!UPSTREAM_CHAT_BODY_ALLOWLIST_SET.has(key) || isForbiddenUpstreamChatKey(key)) {
      delete upstream[key];
      if (!droppedKeys.includes(key)) droppedKeys.push(key);
    }
  }

  return { ok: true, upstream, droppedKeys: [...droppedKeys].sort() };
}
