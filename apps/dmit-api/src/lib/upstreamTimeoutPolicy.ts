/**
 * Layered upstream timeout policy.
 *
 * Chat stays short (env default). Ordinary /v1/responses gets a medium budget.
 * Codex / coding / heavy responses get 700s — never apply that globally.
 *
 * Exception: Gemini 3 chat models often exceed the short chat budget on
 * /v1/chat/completions while finishing within the ordinary responses budget.
 * Give those models the responses attempt timeout on chat — never the heavy
 * 700s tier.
 */

import { env } from "../env.js";

export type UpstreamTimeoutTier = "chat" | "responses" | "heavy";

/** Documented defaults (env may override). */
export const UPSTREAM_TIMEOUT_DEFAULTS = {
  chatMs: 90_000,
  responsesMs: 300_000,
  heavyMs: 700_000,
  heavyIdleMs: 700_000,
} as const;

export interface UpstreamTimeoutPolicy {
  tier: UpstreamTimeoutTier;
  isHeavy: boolean;
  /** Wall-clock budget for one upstream attempt (non-stream). */
  upstreamTimeoutMs: number;
  /**
   * Idle budget for stream=true: abort only when no bytes arrive for this long.
   * For today's non-stream upstream fetch, equals the attempt timeout.
   */
  idleTimeoutMs: number;
  /** Overall request budget (covers local work + upstream attempt). */
  totalTimeoutMs: number;
  reason: string;
}

/** Models that typically back Codex / long coding tasks on /v1/responses. */
const HEAVY_MODEL_IDS = new Set([
  "gpt-5.5",
  "gpt-5-pro",
  "gpt-5.4-pro",
  "gpt-5-4-pro",
  "gpt5.4-pro",
  "gpt-5.4pro",
  "gpt5.4pro",
  "gpt-5.5-pro",
  "gpt-5-5-pro",
  "gpt-5.5pro",
  "gpt5.5",
  "gpt5-5",
  "gpt5-pro",
]);

/**
 * Gemini 3 chat models that share the same GRSAI path as /v1/responses but
 * need the longer responses attempt budget on /v1/chat/completions.
 * Keep this narrow — do not widen the default chat timeout.
 */
const SLOW_CHAT_GEMINI3_MODEL_IDS = new Set([
  "gemini-3-pro",
  "gemini-3-flash",
  "gemini-3.1-pro",
]);

const CODING_ALIAS_RE = /(^|[-_/])(coding|codex|code)([-_/]|$)/i;

const HEAVY_BODY_SIGNAL_RE =
  /\b(codex|coding|long[-_ ]?task|software engineer|agentic)\b/i;

export function isHeavyResponsesModel(model: string): boolean {
  const trimmed = model.trim().toLowerCase();
  if (!trimmed) return false;
  if (HEAVY_MODEL_IDS.has(trimmed)) return true;
  if (CODING_ALIAS_RE.test(trimmed)) return true;
  return false;
}

export function isSlowChatGemini3Model(model: string): boolean {
  const trimmed = model.trim().toLowerCase();
  return SLOW_CHAT_GEMINI3_MODEL_IDS.has(trimmed);
}

export function hasHeavyBodySignals(body: unknown): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const record = body as Record<string, unknown>;

  if (Array.isArray(record.tools) && record.tools.length > 0) return true;
  if (record.tool_choice != null && record.tool_choice !== "none") return true;

  const instructions =
    typeof record.instructions === "string" ? record.instructions : "";
  if (instructions && HEAVY_BODY_SIGNAL_RE.test(instructions)) return true;

  const metadata = record.metadata;
  if (metadata && typeof metadata === "object") {
    const blob = JSON.stringify(metadata);
    if (HEAVY_BODY_SIGNAL_RE.test(blob)) return true;
  }

  // Cheap scan of message / input text for Codex-style prompts.
  const messages = record.messages;
  if (Array.isArray(messages)) {
    for (const msg of messages.slice(0, 8)) {
      if (!msg || typeof msg !== "object") continue;
      const content = (msg as { content?: unknown }).content;
      if (typeof content === "string" && HEAVY_BODY_SIGNAL_RE.test(content)) {
        return true;
      }
    }
  }

  return false;
}

export function resolveUpstreamTimeoutPolicy(args: {
  route: string;
  requestedModel: string;
  resolvedModel?: string;
  body?: unknown;
  clientStream?: boolean;
}): UpstreamTimeoutPolicy {
  const route = args.route || "/v1/chat/completions";
  const isResponses = route === "/v1/responses";
  const modelHeavy =
    isHeavyResponsesModel(args.requestedModel) ||
    isHeavyResponsesModel(args.resolvedModel ?? "");
  const bodyHeavy = hasHeavyBodySignals(args.body);
  const isHeavy = isResponses && (modelHeavy || bodyHeavy);

  const chatUpstreamMs = env.TOKFAI_UPSTREAM_TIMEOUT_MS;
  const responsesUpstreamMs = env.TOKFAI_RESPONSES_UPSTREAM_TIMEOUT_MS;
  const heavyUpstreamMs = env.TOKFAI_HEAVY_RESPONSES_UPSTREAM_TIMEOUT_MS;
  const heavyIdleMs = env.TOKFAI_HEAVY_RESPONSES_IDLE_TIMEOUT_MS;
  const chatTotalMs = env.TOKFAI_TOTAL_REQUEST_TIMEOUT_MS;

  if (isHeavy) {
    const upstreamTimeoutMs = heavyUpstreamMs;
    // stream=true: idle timeout governs; do not cut solely on short total wall clock.
    const idleTimeoutMs = args.clientStream ? heavyIdleMs : heavyUpstreamMs;
    const governingMs = args.clientStream ? idleTimeoutMs : upstreamTimeoutMs;
    return {
      tier: "heavy",
      isHeavy: true,
      upstreamTimeoutMs,
      idleTimeoutMs,
      totalTimeoutMs: Math.max(chatTotalMs, governingMs + 10_000),
      reason: modelHeavy
        ? "responses_heavy_model"
        : "responses_heavy_body_signals",
    };
  }

  if (isResponses) {
    const upstreamTimeoutMs = responsesUpstreamMs;
    return {
      tier: "responses",
      isHeavy: false,
      upstreamTimeoutMs,
      idleTimeoutMs: upstreamTimeoutMs,
      totalTimeoutMs: Math.max(chatTotalMs, upstreamTimeoutMs + 10_000),
      reason: "responses_default",
    };
  }

  // /v1/chat/completions — keep short; never inherit heavy 700s.
  // Gemini 3 is the known exception: same upstream as responses, but often
  // slower than the short chat default (90s) while finishing within 300s.
  const slowGemini3 =
    isSlowChatGemini3Model(args.requestedModel) ||
    isSlowChatGemini3Model(args.resolvedModel ?? "");
  if (slowGemini3) {
    const upstreamTimeoutMs = Math.max(chatUpstreamMs, responsesUpstreamMs);
    return {
      tier: "chat",
      isHeavy: false,
      upstreamTimeoutMs,
      idleTimeoutMs: upstreamTimeoutMs,
      totalTimeoutMs: Math.max(chatTotalMs, upstreamTimeoutMs + 10_000),
      reason: "chat_slow_gemini3",
    };
  }

  return {
    tier: "chat",
    isHeavy: false,
    upstreamTimeoutMs: chatUpstreamMs,
    idleTimeoutMs: chatUpstreamMs,
    totalTimeoutMs: Math.max(chatTotalMs, chatUpstreamMs + 10_000),
    reason: "chat_default",
  };
}
