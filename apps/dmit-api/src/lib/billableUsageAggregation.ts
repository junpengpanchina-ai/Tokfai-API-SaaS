/**
 * P1030 — Request-scoped billable usage components for AUTO arbitration.
 *
 * Pure helpers only: no DB, env, logging of user content, or debit side effects.
 * Components live only inside a single client request / provider attempt.
 */

import type { NormalizedChatUsage } from "./chatUsageFallback.js";

export type BillableUsageStage = "native" | "auto_arbitration";

export type BillableUsageComponent = {
  stage: BillableUsageStage;
  providerId: string;
  attemptedModel: string;
  billableModel: string;
  usage: NormalizedChatUsage;
};

/** Deep-enough value copy of token fields (immutable for later mutation safety). */
export function cloneNormalizedUsage(
  usage: NormalizedChatUsage
): NormalizedChatUsage {
  return {
    promptTokens: finiteTokenOrNull(usage.promptTokens),
    completionTokens: finiteTokenOrNull(usage.completionTokens),
    totalTokens: finiteTokenOrNull(usage.totalTokens),
  };
}

/**
 * Aggregate token fields across successful upstream components.
 * - Does not mutate inputs
 * - Null-safe / finite-only addition
 * - total_tokens = prompt_tokens + completion_tokens when any side is present
 * - No details / nested fields (none exist on NormalizedChatUsage)
 */
export function mergeNormalizedUsages(
  parts: readonly NormalizedChatUsage[]
): NormalizedChatUsage {
  let promptSum = 0;
  let completionSum = 0;
  let sawPrompt = false;
  let sawCompletion = false;

  for (const part of parts) {
    const p = finiteTokenOrNull(part.promptTokens);
    const c = finiteTokenOrNull(part.completionTokens);
    if (p != null) {
      promptSum += Math.max(0, p);
      sawPrompt = true;
    }
    if (c != null) {
      completionSum += Math.max(0, c);
      sawCompletion = true;
    }
  }

  if (!sawPrompt && !sawCompletion) {
    return {
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
    };
  }

  const promptTokens = sawPrompt ? promptSum : 0;
  const completionTokens = sawCompletion ? completionSum : 0;
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  };
}

export function hasBillableUsageStage(
  components: readonly BillableUsageComponent[],
  stage: BillableUsageStage
): boolean {
  return components.some((c) => c.stage === stage);
}

function finiteTokenOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : null;
}
