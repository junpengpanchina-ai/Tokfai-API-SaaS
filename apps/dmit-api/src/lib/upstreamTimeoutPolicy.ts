/**
 * Layered upstream timeout policy (P7/P10).
 *
 * P10 model budgets (chat pool) — centralized, not scattered in routes:
 * - auto-fast: firstToken 20s, attempt 60s, total 90s
 * - gpt-5.6-sol: firstToken 30s, attempt 90s, total 180s
 * - gpt-5.6-terra: firstToken 45s, attempt 120s, total 180s
 * - default: firstToken 30s, attempt 90s, total 180s
 *
 * Tool / heavy paths keep dedicated budgets but are hard-capped.
 */

import { env } from "../env.js";
import { requestHasTools } from "./toolCallCapability.js";

export type UpstreamTimeoutTier =
  | "chat"
  | "responses"
  | "heavy"
  | "tool_call"
  | "stream";

/** Documented defaults (env may override where model tier does not apply). */
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

/** P10 — per-model chat timeout budgets (source of truth for logs). */
export type ModelTimeoutBudget = {
  policyId: string;
  firstTokenTimeoutMs: number;
  attemptTimeoutMs: number;
  totalTimeoutMs: number;
};

export const MODEL_TIMEOUT_BUDGETS = {
  "auto-fast": {
    policyId: "auto-fast",
    firstTokenTimeoutMs: 20_000,
    attemptTimeoutMs: 60_000,
    totalTimeoutMs: 90_000,
  },
  "gpt-5.6-sol": {
    policyId: "gpt-5.6-sol",
    firstTokenTimeoutMs: 30_000,
    attemptTimeoutMs: 90_000,
    totalTimeoutMs: 180_000,
  },
  "gpt-5.6-terra": {
    policyId: "gpt-5.6-terra",
    firstTokenTimeoutMs: 45_000,
    attemptTimeoutMs: 120_000,
    totalTimeoutMs: 180_000,
  },
  default: {
    policyId: "default",
    firstTokenTimeoutMs: 30_000,
    attemptTimeoutMs: 90_000,
    totalTimeoutMs: 180_000,
  },
} as const satisfies Record<string, ModelTimeoutBudget>;

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
  /** P10 — selected model budget id. */
  modelPolicyId: string;
  firstTokenTimeoutMs: number;
  attemptTimeoutMs: number;
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

function normalizeModelId(model: string): string {
  return model.trim().toLowerCase();
}

/**
 * Resolve P10 model timeout budget. Prefer requested model, then resolved.
 * auto-fast wins over concrete carriers when the client asked for auto-fast.
 */
export function resolveModelTimeoutBudget(args: {
  requestedModel: string;
  resolvedModel?: string;
}): ModelTimeoutBudget {
  const candidates = [
    normalizeModelId(args.requestedModel),
    normalizeModelId(args.resolvedModel ?? ""),
  ].filter(Boolean);

  for (const m of candidates) {
    if (m === "auto-fast") return { ...MODEL_TIMEOUT_BUDGETS["auto-fast"] };
    if (m === "gpt-5.6-terra" || m === "gpt-5-6-terra") {
      return { ...MODEL_TIMEOUT_BUDGETS["gpt-5.6-terra"] };
    }
    if (m === "gpt-5.6-sol" || m === "gpt-5-6-sol") {
      return { ...MODEL_TIMEOUT_BUDGETS["gpt-5.6-sol"] };
    }
  }
  return { ...MODEL_TIMEOUT_BUDGETS.default };
}

export function isHeavyResponsesModel(model: string): boolean {
  const trimmed = normalizeModelId(model);
  if (!trimmed) return false;
  if (HEAVY_MODEL_IDS.has(trimmed)) return true;
  if (CODING_ALIAS_RE.test(trimmed)) return true;
  return false;
}

export function isSlowChatGemini3Model(model: string): boolean {
  return SLOW_CHAT_GEMINI3_MODEL_IDS.has(normalizeModelId(model));
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

function absoluteHardCapMs(): number {
  return Math.max(
    5_000,
    env.TOKFAI_TOTAL_REQUEST_TIMEOUT_MS || UPSTREAM_TIMEOUT_DEFAULTS.hardMs
  );
}

function clampTo(ms: number, maxMs: number): number {
  return Math.min(Math.max(1_000, ms), maxMs);
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

  const modelBudget = resolveModelTimeoutBudget({
    requestedModel: args.requestedModel,
    resolvedModel: args.resolvedModel,
  });

  const absoluteHard = absoluteHardCapMs();
  // Model total may be lower than env hard wall (e.g. auto-fast 90s).
  const requestHardMs = clampTo(
    Math.min(modelBudget.totalTimeoutMs, absoluteHard),
    absoluteHard
  );
  const firstTokenMs = clampTo(
    modelBudget.firstTokenTimeoutMs,
    requestHardMs
  );
  const modelAttemptMs = clampTo(
    modelBudget.attemptTimeoutMs,
    requestHardMs
  );

  const attemptMs = env.TOKFAI_UPSTREAM_TIMEOUT_MS;
  const chatMs = env.TOKFAI_CHAT_TIMEOUT_MS;
  const streamMs = env.TOKFAI_STREAM_TIMEOUT_MS;
  const toolCallMs = env.TOKFAI_TOOL_CALL_TIMEOUT_MS;
  const responsesUpstreamMs = env.TOKFAI_RESPONSES_UPSTREAM_TIMEOUT_MS;
  const heavyUpstreamMs = env.TOKFAI_HEAVY_RESPONSES_UPSTREAM_TIMEOUT_MS;
  const heavyIdleMs = env.TOKFAI_HEAVY_RESPONSES_IDLE_TIMEOUT_MS;

  const base = (
    partial: Omit<
      UpstreamTimeoutPolicy,
      | "streamFirstTokenTimeoutMs"
      | "modelPolicyId"
      | "firstTokenTimeoutMs"
      | "attemptTimeoutMs"
    > & { attemptTimeoutMs?: number }
  ): UpstreamTimeoutPolicy => {
    const attemptTimeoutMs = clampTo(
      partial.attemptTimeoutMs ?? partial.upstreamTimeoutMs,
      requestHardMs
    );
    return {
      ...partial,
      upstreamTimeoutMs: clampTo(partial.upstreamTimeoutMs, requestHardMs),
      idleTimeoutMs: clampTo(partial.idleTimeoutMs, requestHardMs),
      totalTimeoutMs: clampTo(partial.totalTimeoutMs, requestHardMs),
      streamFirstTokenTimeoutMs: firstTokenMs,
      modelPolicyId: modelBudget.policyId,
      firstTokenTimeoutMs: firstTokenMs,
      attemptTimeoutMs,
    };
  };

  if (isHeavy) {
    const upstreamTimeoutMs = clampTo(heavyUpstreamMs, requestHardMs);
    let idleTimeoutMs = args.clientStream
      ? clampTo(Math.min(heavyIdleMs, firstTokenMs), requestHardMs)
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
        totalTimeoutMs: requestHardMs,
        reason: "responses_stream_first_token_guard",
      });
    }
    return base({
      tier: "heavy",
      isHeavy: true,
      upstreamTimeoutMs,
      idleTimeoutMs: args.clientStream
        ? clampTo(
            Math.min(heavyIdleMs, Math.max(firstTokenMs, chatMs)),
            requestHardMs
          )
        : upstreamTimeoutMs,
      totalTimeoutMs: requestHardMs,
      reason: modelHeavy
        ? "responses_heavy_model"
        : "responses_heavy_body_signals",
    });
  }

  if (isResponses) {
    const upstreamTimeoutMs = clampTo(
      Math.max(attemptMs, responsesUpstreamMs, chatMs, modelAttemptMs),
      requestHardMs
    );
    if (args.clientStream === true && !requestHasTools(args.body)) {
      const idle = clampTo(
        Math.min(
          upstreamTimeoutMs,
          firstTokenMs,
          env.TOKFAI_RESPONSES_STREAM_NO_OUTPUT_TIMEOUT_MS
        ),
        requestHardMs
      );
      return base({
        tier: "responses",
        isHeavy: false,
        upstreamTimeoutMs: idle,
        idleTimeoutMs: idle,
        totalTimeoutMs: requestHardMs,
        reason: "responses_stream_first_token_guard",
      });
    }
    return base({
      tier: "responses",
      isHeavy: false,
      upstreamTimeoutMs,
      idleTimeoutMs: upstreamTimeoutMs,
      totalTimeoutMs: requestHardMs,
      reason: "responses_default",
    });
  }

  // /v1/chat/completions — tool_call tier (hard-capped by model total).
  const hasTools = requestHasTools(args.body);
  if (hasTools) {
    const upstreamTimeoutMs = clampTo(
      Math.max(attemptMs, toolCallMs, modelAttemptMs),
      requestHardMs
    );
    return base({
      tier: "tool_call",
      isHeavy: false,
      upstreamTimeoutMs,
      idleTimeoutMs: args.clientStream
        ? clampTo(
            Math.min(upstreamTimeoutMs, Math.max(firstTokenMs, chatMs)),
            requestHardMs
          )
        : upstreamTimeoutMs,
      totalTimeoutMs: requestHardMs,
      reason: "chat_tool_call",
      attemptTimeoutMs: upstreamTimeoutMs,
    });
  }

  // Client stream=true without tools — model first-token budget.
  if (args.clientStream) {
    const idle = clampTo(
      Math.min(Math.max(modelAttemptMs, streamMs), firstTokenMs),
      requestHardMs
    );
    return base({
      tier: "stream",
      isHeavy: false,
      upstreamTimeoutMs: idle,
      idleTimeoutMs: idle,
      totalTimeoutMs: requestHardMs,
      reason: `chat_stream_first_token:${modelBudget.policyId}`,
      attemptTimeoutMs: modelAttemptMs,
    });
  }

  const slowGemini3 =
    isSlowChatGemini3Model(args.requestedModel) ||
    isSlowChatGemini3Model(args.resolvedModel ?? "");
  if (slowGemini3) {
    const upstreamTimeoutMs = clampTo(
      Math.max(attemptMs, chatMs, responsesUpstreamMs, modelAttemptMs),
      requestHardMs
    );
    return base({
      tier: "chat",
      isHeavy: false,
      upstreamTimeoutMs,
      idleTimeoutMs: upstreamTimeoutMs,
      totalTimeoutMs: requestHardMs,
      reason: "chat_slow_gemini3",
      attemptTimeoutMs: upstreamTimeoutMs,
    });
  }

  const gemini25FlashChat =
    route === "/v1/chat/completions" &&
    (normalizeModelId(args.requestedModel) === "gemini-2.5-flash" ||
      normalizeModelId(args.resolvedModel ?? "") === "gemini-2.5-flash");
  if (gemini25FlashChat) {
    const upstreamTimeoutMs = clampTo(
      Math.max(attemptMs, chatMs, modelAttemptMs),
      requestHardMs
    );
    return base({
      tier: "chat",
      isHeavy: false,
      upstreamTimeoutMs,
      idleTimeoutMs: upstreamTimeoutMs,
      totalTimeoutMs: requestHardMs,
      reason: "chat_gemini25_flash_nonstream_stream_fallback",
      attemptTimeoutMs: upstreamTimeoutMs,
    });
  }

  // Default non-stream chat — P10 model attempt / total budgets win.
  return base({
    tier: "chat",
    isHeavy: false,
    upstreamTimeoutMs: modelAttemptMs,
    idleTimeoutMs: modelAttemptMs,
    totalTimeoutMs: requestHardMs,
    reason: `chat_model_budget:${modelBudget.policyId}`,
    attemptTimeoutMs: modelAttemptMs,
  });
}
