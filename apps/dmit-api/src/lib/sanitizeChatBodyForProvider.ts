/**
 * P9 — Provider-specific outbound chat body sanitizer.
 *
 * Tokfai accepts OpenAI-compatible client bodies; before forwarding to
 * GRSAI (grsai-primary / grsai-secondary) we strip unsupported fields,
 * convert roles, and flatten multimodal content to strings.
 *
 * Other providers are returned unchanged (identity).
 */

import { log } from "../logger.js";
import { getProviderCapabilityProfile } from "./compat/providerCapabilities.js";

const GRSAI_PROVIDER_IDS = new Set([
  "grsai-primary",
  "grsai-secondary",
  // Legacy secondary id shares the same OpenAI-compat limitations when enabled.
  "openai-compatible-secondary",
]);

/** Top-level keys always dropped for GRSAI. */
const GRSAI_DROP_KEYS = [
  "tools",
  "tool_choice",
  "parallel_tool_calls",
  "reasoning",
  "prompt_cache_key",
  "store",
  "metadata",
  "include",
  "truncation",
  "previous_response_id",
] as const;

/** Roles merged into a single system preamble. */
const SYSTEM_MERGE_ROLES = new Set([
  "developer",
  "context",
  "user_context",
  "model",
]);

const ALLOWED_ROLES = new Set(["system", "user", "assistant"]);

export type SanitizeChatBodyForProviderResult =
  | {
      ok: true;
      body: Record<string, unknown>;
      changed: boolean;
      droppedKeys: string[];
      convertedRoles: string[];
      contentShapeBefore: string;
      contentShapeAfter: string;
      messageCount: number;
      multimodalDowngraded: boolean;
    }
  | {
      ok: false;
      code: "empty_messages";
      message: string;
      droppedKeys: string[];
      convertedRoles: string[];
      contentShapeBefore: string;
      contentShapeAfter: string;
      messageCount: number;
    };

function isGrsaiProvider(providerId: string): boolean {
  return GRSAI_PROVIDER_IDS.has(providerId.trim().toLowerCase());
}

function contentShape(messages: unknown): string {
  if (!Array.isArray(messages) || messages.length === 0) return "empty";
  let hasString = false;
  let hasArray = false;
  let hasNull = false;
  let hasOther = false;
  for (const m of messages) {
    if (!m || typeof m !== "object") continue;
    const c = (m as { content?: unknown }).content;
    if (typeof c === "string") hasString = true;
    else if (Array.isArray(c)) hasArray = true;
    else if (c === null || c === undefined) hasNull = true;
    else hasOther = true;
  }
  const parts: string[] = [];
  if (hasString) parts.push("string");
  if (hasArray) parts.push("array");
  if (hasNull) parts.push("null");
  if (hasOther) parts.push("other");
  return parts.length > 0 ? parts.join("+") : "empty";
}

function extractTextFromContentPart(part: unknown): string {
  if (typeof part === "string") return part;
  if (!part || typeof part !== "object") return "";
  const p = part as Record<string, unknown>;
  if (typeof p.text === "string") return p.text;
  if (typeof p.content === "string") return p.content;
  return "";
}

function partIsImage(part: unknown): boolean {
  if (!part || typeof part !== "object") return false;
  const p = part as Record<string, unknown>;
  const type = typeof p.type === "string" ? p.type.toLowerCase() : "";
  if (type === "image_url" || type === "input_image" || type === "image") {
    return true;
  }
  return p.image_url != null || p.image != null;
}

function flattenContentToString(
  content: unknown,
  supportsVision: boolean
): { text: string; multimodalDowngraded: boolean } {
  if (typeof content === "string") {
    return { text: content, multimodalDowngraded: false };
  }
  if (content === null || content === undefined) {
    return { text: "", multimodalDowngraded: false };
  }
  if (!Array.isArray(content)) {
    if (typeof content === "object") {
      const obj = content as Record<string, unknown>;
      if (typeof obj.text === "string") {
        return { text: obj.text, multimodalDowngraded: false };
      }
    }
    return { text: "", multimodalDowngraded: false };
  }

  const texts: string[] = [];
  let sawImage = false;
  for (const part of content) {
    if (partIsImage(part)) {
      sawImage = true;
      if (supportsVision) {
        // GRSAI ordinary chat still requires string content — note only.
        texts.push("[image]");
      }
      continue;
    }
    const t = extractTextFromContentPart(part);
    if (t) texts.push(t);
  }

  let multimodalDowngraded = Array.isArray(content);
  let text = texts.join("");
  if (sawImage && !supportsVision) {
    text = `${text}${text ? "\n" : ""}[image omitted: provider does not support vision]`;
    multimodalDowngraded = true;
  } else if (sawImage && supportsVision) {
    multimodalDowngraded = true;
  }
  return { text, multimodalDowngraded };
}

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(extractTextFromContentPart).filter(Boolean).join("");
  }
  return "";
}

/**
 * Sanitize an outbound chat/completions JSON body for a specific provider.
 * Non-GRSAI providers: identity copy (ok, unchanged).
 *
 * @param opts.phase
 *   - `messages` — convert roles / multimodal only (keep tools for local orchestration)
 *   - `outbound` (default) — full GRSAI strip including tools / response_format / etc.
 */
export function sanitizeChatBodyForProvider(
  providerId: string,
  body: Record<string, unknown>,
  opts?: { phase?: "messages" | "outbound" }
): SanitizeChatBodyForProviderResult {
  const phase = opts?.phase ?? "outbound";
  const shapeBefore = contentShape(body.messages);

  if (!isGrsaiProvider(providerId)) {
    const messages = Array.isArray(body.messages) ? body.messages : [];
    return {
      ok: true,
      body: { ...body },
      changed: false,
      droppedKeys: [],
      convertedRoles: [],
      contentShapeBefore: shapeBefore,
      contentShapeAfter: shapeBefore,
      messageCount: messages.length,
      multimodalDowngraded: false,
    };
  }

  const caps = getProviderCapabilityProfile(providerId);
  // Ordinary GRSAI chat path: force text-only string content (pool rejects
  // multimodal / tool-heavy OpenAI bodies). Vision flag still drives omit copy.
  const supportsVision = caps.supportsVision === true;

  const droppedKeys: string[] = [];
  const convertedRoles: string[] = [];
  let multimodalDowngraded = false;
  const out: Record<string, unknown> = { ...body };

  if (phase === "outbound") {
    for (const key of GRSAI_DROP_KEYS) {
      if (key in out && out[key] !== undefined) {
        delete out[key];
        droppedKeys.push(key);
      }
    }

    // response_format: keep only text / json_object
    if (out.response_format !== undefined && out.response_format !== null) {
      const rf = out.response_format;
      let keep = false;
      if (typeof rf === "string") {
        keep = rf === "text" || rf === "json_object";
      } else if (rf && typeof rf === "object") {
        const type = (rf as { type?: unknown }).type;
        keep = type === "text" || type === "json_object";
      }
      if (!keep) {
        delete out.response_format;
        droppedKeys.push("response_format");
      }
    }

    // max_completion_tokens → max_tokens (keep existing max_tokens)
    if (out.max_completion_tokens !== undefined) {
      if (out.max_tokens === undefined || out.max_tokens === null) {
        out.max_tokens = out.max_completion_tokens;
      }
      delete out.max_completion_tokens;
      droppedKeys.push("max_completion_tokens");
    }
  }

  const rawMessages = Array.isArray(out.messages) ? out.messages : [];
  const systemChunks: string[] = [];
  const normalized: Array<Record<string, unknown>> = [];

  for (const raw of rawMessages) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const roleRaw =
      typeof row.role === "string" ? row.role.trim().toLowerCase() : "user";

    if (SYSTEM_MERGE_ROLES.has(roleRaw)) {
      const flat = flattenContentToString(row.content, supportsVision);
      if (flat.multimodalDowngraded) multimodalDowngraded = true;
      const text = flat.text.trim();
      if (text) systemChunks.push(text);
      convertedRoles.push(`${roleRaw}->system`);
      continue;
    }

    if (roleRaw === "tool" || roleRaw === "function") {
      const flat = flattenContentToString(row.content, supportsVision);
      if (flat.multimodalDowngraded) multimodalDowngraded = true;
      const name =
        typeof row.name === "string" && row.name.trim()
          ? row.name.trim()
          : "tool";
      const merged = `[tool_result name=${name}] ${flat.text}`.trim();
      normalized.push({ role: "user", content: merged });
      convertedRoles.push(`${roleRaw}->user`);
      continue;
    }

    if (!ALLOWED_ROLES.has(roleRaw)) {
      const flat = flattenContentToString(row.content, supportsVision);
      if (flat.multimodalDowngraded) multimodalDowngraded = true;
      normalized.push({
        role: "user",
        content: flat.text,
      });
      convertedRoles.push(`${roleRaw}->user`);
      continue;
    }

    // system / user / assistant
    const flat = flattenContentToString(row.content, supportsVision);
    if (flat.multimodalDowngraded) multimodalDowngraded = true;
    const next: Record<string, unknown> = {
      role: roleRaw,
      content: flat.text,
    };
    // Drop tool_calls on assistant for GRSAI outbound (unsupported).
    if (
      phase === "outbound" &&
      roleRaw === "assistant" &&
      row.tool_calls != null
    ) {
      droppedKeys.push("messages[].tool_calls");
      convertedRoles.push("assistant.tool_calls->dropped");
    } else if (
      roleRaw === "assistant" &&
      Array.isArray(row.tool_calls) &&
      row.tool_calls.length > 0 &&
      phase === "messages"
    ) {
      // Keep tool_calls for local orchestration until outbound strip.
      next.tool_calls = row.tool_calls;
    }
    normalized.push(next);
  }

  if (systemChunks.length > 0) {
    const mergedSystem = systemChunks.join("\n\n");
    const existingSystemIdx = normalized.findIndex((m) => m.role === "system");
    if (existingSystemIdx >= 0) {
      const prev = messageText(normalized[existingSystemIdx]!.content);
      normalized[existingSystemIdx] = {
        role: "system",
        content: prev ? `${mergedSystem}\n\n${prev}` : mergedSystem,
      };
    } else {
      normalized.unshift({ role: "system", content: mergedSystem });
    }
  }

  // Deduplicate droppedKeys
  const uniqueDropped = [...new Set(droppedKeys)];

  if (normalized.length === 0) {
    return {
      ok: false,
      code: "empty_messages",
      message:
        "messages must contain at least one system/user/assistant message after provider sanitization.",
      droppedKeys: uniqueDropped,
      convertedRoles,
      contentShapeBefore: shapeBefore,
      contentShapeAfter: "empty",
      messageCount: 0,
    };
  }

  out.messages = normalized;
  if (phase === "outbound") {
    // Ensure no tools leak on the wire.
    delete out.tools;
    delete out.tool_choice;
    delete out.parallel_tool_calls;
  }

  const shapeAfter = contentShape(normalized);
  const changed =
    uniqueDropped.length > 0 ||
    convertedRoles.length > 0 ||
    multimodalDowngraded ||
    shapeBefore !== shapeAfter;

  return {
    ok: true,
    body: out,
    changed,
    droppedKeys: uniqueDropped,
    convertedRoles,
    contentShapeBefore: shapeBefore,
    contentShapeAfter: shapeAfter,
    messageCount: normalized.length,
    multimodalDowngraded,
  };
}

/** Log sanitizer outcome (never logs message contents). */
export function logChatBodySanitized(args: {
  requestId: string;
  providerId: string;
  result: SanitizeChatBodyForProviderResult;
}): void {
  const { requestId, providerId, result } = args;
  const base = {
    requestId,
    providerId,
    droppedKeys: result.droppedKeys.slice(0, 40),
    convertedRoles: result.convertedRoles.slice(0, 40),
    contentShapeBefore: result.contentShapeBefore,
    contentShapeAfter: result.contentShapeAfter,
    messageCount: result.messageCount,
    billing_status: "not_billable" as const,
  };

  if (!result.ok) {
    log.warn("chat_body_sanitized", {
      ...base,
      ok: false,
      code: result.code,
    });
    return;
  }

  if (!result.changed && result.droppedKeys.length === 0) {
    return;
  }

  log.info("chat_body_sanitized", {
    ...base,
    ok: true,
    multimodalDowngraded: result.multimodalDowngraded,
  });

  if (result.droppedKeys.length > 0) {
    log.info("chat_body_sanitize_field_dropped", {
      requestId,
      providerId,
      droppedKeys: result.droppedKeys.slice(0, 40),
      messageCount: result.messageCount,
      billing_status: "not_billable",
    });
  }
  if (result.convertedRoles.length > 0) {
    log.info("chat_body_sanitize_role_converted", {
      requestId,
      providerId,
      convertedRoles: result.convertedRoles.slice(0, 40),
      messageCount: result.messageCount,
      billing_status: "not_billable",
    });
  }
  if (result.multimodalDowngraded) {
    log.info("chat_body_sanitize_multimodal_downgraded", {
      requestId,
      providerId,
      contentShapeBefore: result.contentShapeBefore,
      contentShapeAfter: result.contentShapeAfter,
      messageCount: result.messageCount,
      billing_status: "not_billable",
    });
  }
}

export function isGrsaiChatProvider(providerId: string): boolean {
  return isGrsaiProvider(providerId);
}

/**
 * P9 — whether an upstream error may trigger provider/model fallback.
 * 400 / invalid_request_error: only when allow_fallback and the *next*
 * provider declares supportsOriginalBody.
 */
export function isUpstreamInvalidRequest(err: {
  code?: string | null;
  status?: number | null;
  upstreamStatus?: number | null;
  type?: string | null;
}): boolean {
  const code = (err.code ?? "").toLowerCase();
  if (code === "invalid_request_error") return true;
  if (err.type === "invalid_request_error") return true;
  if (err.upstreamStatus === 400 || err.status === 400) {
    return (
      code.includes("invalid") ||
      code === "upstream_error" ||
      code === "" ||
      code === "invalid_request_error"
    );
  }
  return false;
}
