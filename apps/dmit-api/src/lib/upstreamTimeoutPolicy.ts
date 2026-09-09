/**
 * Layered upstream timeout policy (P7).
 *
 * Chat / ordinary responses:
 * - stream first-token / idle: 30s (TOKFAI_STREAM_FIRST_TOKEN_TIMEOUT_MS)
 * - non-stream attempt: 90s (TOKFAI_CHAT_TIMEOUT_MS / UPSTREAM)
 * - hard wall: 180s (TOKFAI_TOTAL_REQUEST_TIMEOUT_MS)
 *
 * Users must not wait a full 180s on a single hung attempt.
 * Tool / heavy paths still use dedicated budgets but are hard-capped at 180s.
 */

import { env } from "../env.js";
import { requestHasTools } from "./toolCallCapability.js";

export type UpstreamTimeoutTier =
  | "chat"
  | "responses"
  | "heavy"
  | "tool_call"
  | "stream";

/** Documented defaults (env may override). */
export const UPSTREAM_TIMEOUT_DEFAULTS = {
  attemptMs: 90_000,
  chatMs: 90_000,
  streamFirstTokenMs: 30_000,
  streamMs: 180_000,
  toolCallMs: 180_000,
  responsesMs: 90_000,
  heavyMs: 180_000,
  heavyIdleMs: 180_000,
  hardMs: 180_000,
} as const;

export interface UpstreamTimeoutPolicy {
  tier: UpstreamTimeoutTier;
  isHeavy: boolean;
  /** Wall-clock budget for one upstream attempt (non-stream). */
  upstreamTimeoutMs: number;
  /**
   * Idle / first-token budget for stream=true: abort when no bytes arrive.
   * For non-stream upstream fetch used to satisfy client stream, equals attempt.
   */
  idleTimeoutMs: number;
  /** Overall request budget (covers local work + retries/fallback). */
  totalTimeoutMs: number;
  /** Stream first-token budget (for logs / stream_first_token_timeout). */
  streamFirstTokenTimeoutMs: number;
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
 * need a longer responses attempt budget on /v1/chat/completions.
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

function hardCapMs(): number {
  return Math.max(
    5_000,
    env.TOKFAI_TOTAL_REQUEST_TIMEOUT_MS || UPSTREAM_TIMEOUT_DEFAULTS.hardMs
  );
}

function clampHard(ms: number): number {
  return Math.min(Math.max(1_000, ms), hardCapMs());
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

  const attemptMs = env.TOKFAI_UPSTREAM_TIMEOUT_MS;
  const chatMs = env.TOKFAI_CHAT_TIMEOUT_MS;
  const streamMs = env.TOKFAI_STREAM_TIMEOUT_MS;
  const firstTokenMs =
    env.TOKFAI_STREAM_FIRST_TOKEN_TIMEOUT_MS ??
    UPSTREAM_TIMEOUT_DEFAULTS.streamFirstTokenMs;
  const toolCallMs = env.TOKFAI_TOOL_CALL_TIMEOUT_MS;
  const responsesUpstreamMs = env.TOKFAI_RESPONSES_UPSTREAM_TIMEOUT_MS;
  const heavyUpstreamMs = env.TOKFAI_HEAVY_RESPONSES_UPSTREAM_TIMEOUT_MS;
  const heavyIdleMs = env.TOKFAI_HEAVY_RESPONSES_IDLE_TIMEOUT_MS;
  const hardMs = hardCapMs();

  const base = (
    partial: Omit<UpstreamTimeoutPolicy, "streamFirstTokenTimeoutMs">
  ): UpstreamTimeoutPolicy => ({
    ...partial,
    upstreamTimeoutMs: clampHard(partial.upstreamTimeoutMs),
    idleTimeoutMs: clampHard(partial.idleTimeoutMs),
    totalTimeoutMs: clampHard(partial.totalTimeoutMs),
    streamFirstTokenTimeoutMs: clampHard(firstTokenMs),
  });

  if (isHeavy) {
    const upstreamTimeoutMs = clampHard(heavyUpstreamMs);
    let idleTimeoutMs = args.clientStream
      ? clampHard(Math.min(heavyIdleMs, firstTokenMs))
      : upstreamTimeoutMs;
    const streamNoOutputGuard =
      args.clientStream === true && !requestHasTools(args.body);
    if (streamNoOutputGuard) {
      const noOutputMs = Math.min(
        env.TOKFAI_RESPONSES_STREAM_NO_OUTPUT_TIMEOUT_MS,
        firstTokenMs
      );
      idleTimeoutMs = Math.min(idleTimeoutMs, noOutputMs);
      return base({
        tier: "heavy",
        isHeavy: true,
        upstreamTimeoutMs: Math.min(upstreamTimeoutMs, idleTimeoutMs),
        idleTimeoutMs,
        totalTimeoutMs: hardMs,
        reason: "responses_stream_first_token_guard",
      });
    }
    return base({
      tier: "heavy",
      isHeavy: true,
      upstreamTimeoutMs,
      idleTimeoutMs: args.clientStream
        ? clampHard(Math.min(heavyIdleMs, Math.max(firstTokenMs, chatMs)))
        : upstreamTimeoutMs,
      totalTimeoutMs: hardMs,
      reason: modelHeavy
        ? "responses_heavy_model"
        : "responses_heavy_body_signals",
    });
  }

  if (isResponses) {
    const upstreamTimeoutMs = clampHard(
      Math.max(attemptMs, responsesUpstreamMs, chatMs)
    );
    if (args.clientStream === true && !requestHasTools(args.body)) {
      const idle = clampHard(
        Math.min(
          upstreamTimeoutMs,
          firstTokenMs,
          env.TOKFAI_RESPONSES_STREAM_NO_OUTPUT_TIMEOUT_MS
        )
      );
      return base({
        tier: "responses",
        isHeavy: false,
        upstreamTimeoutMs: idle,
        idleTimeoutMs: idle,
        totalTimeoutMs: hardMs,
        reason: "responses_stream_first_token_guard",
      });
    }
    return base({
      tier: "responses",
      isHeavy: false,
      upstreamTimeoutMs,
      idleTimeoutMs: upstreamTimeoutMs,
      totalTimeoutMs: hardMs,
      reason: "responses_default",
    });
  }

  // /v1/chat/completions — tool_call tier (hard-capped).
  const hasTools = requestHasTools(args.body);
  if (hasTools) {
    const upstreamTimeoutMs = clampHard(Math.max(attemptMs, toolCallMs));
    return base({
      tier: "tool_call",
      isHeavy: false,
      upstreamTimeoutMs,
      idleTimeoutMs: args.clientStream
        ? clampHard(Math.min(upstreamTimeoutMs, Math.max(firstTokenMs, chatMs)))
        : upstreamTimeoutMs,
      totalTimeoutMs: hardMs,
      reason: "chat_tool_call",
    });
  }

  // Client stream=true without tools — first-token 30s (do not wait 180s).
  if (args.clientStream) {
    const idle = clampHard(Math.min(Math.max(attemptMs, streamMs), firstTokenMs));
    return base({
      tier: "stream",
      isHeavy: false,
      upstreamTimeoutMs: idle,
      idleTimeoutMs: idle,
      totalTimeoutMs: hardMs,
      reason: "chat_stream_first_token",
    });
  }

  const slowGemini3 =
    isSlowChatGemini3Model(args.requestedModel) ||
    isSlowChatGemini3Model(args.resolvedModel ?? "");
  if (slowGemini3) {
    const upstreamTimeoutMs = clampHard(
      Math.max(attemptMs, chatMs, responsesUpstreamMs)
    );
    return base({
      tier: "chat",
      isHeavy: false,
      upstreamTimeoutMs,
      idleTimeoutMs: upstreamTimeoutMs,
      totalTimeoutMs: hardMs,
      reason: "chat_slow_gemini3",
    });
  }

  const gemini25FlashChat =
    route === "/v1/chat/completions" &&
    (args.requestedModel.trim().toLowerCase() === "gemini-2.5-flash" ||
      (args.resolvedModel ?? "").trim().toLowerCase() === "gemini-2.5-flash");
  if (gemini25FlashChat) {
    const upstreamTimeoutMs = clampHard(Math.max(attemptMs, chatMs));
    return base({
      tier: "chat",
      isHeavy: false,
      upstreamTimeoutMs,
      idleTimeoutMs: upstreamTimeoutMs,
      totalTimeoutMs: hardMs,
      reason: "chat_gemini25_flash_nonstream_stream_fallback",
    });
  }

  // Default non-stream chat: 90s attempt, 180s hard wall for retries/fallback.
  const chatWallMs = clampHard(Math.max(attemptMs, chatMs));
  return base({
    tier: "chat",
    isHeavy: false,
    upstreamTimeoutMs: chatWallMs,
    idleTimeoutMs: chatWallMs,
    totalTimeoutMs: hardMs,
    reason: "chat_default",
  });
}
