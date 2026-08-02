/**
 * P993-IMAGE-CIRCUIT — Image attempt / fallback chain.
 *
 * Reuses capability + allowlist + static price tiers from catalog.
 * Never jumps from a cheap model to a clearly more expensive one.
 * Breaker filtering happens at acquire time in the worker (not here).
 */

import {
  isModelAllowedForImage,
  priceCreditsForImage,
} from "../catalog/modelCatalog.js";
import {
  getModelCapability,
  type ModelCapability,
} from "../capabilities/modelCapabilityPolicy.js";
import { isUnavailableImageModel } from "../upstream/imageModelAliases.js";
import {
  IMAGE_CIRCUIT_PROVIDER_ID,
  type ImageCircuitOperation,
} from "./imageCircuitBreaker.js";

/** Static retail credits for price-tier guard (same as modelPricing defaults). */
const STATIC_IMAGE_CREDITS: Record<string, number> = {
  "nano-banana": 1,
  "nano-banana-fast": 1,
  "nano-banana-2": 3,
  "gpt-image-2": 600,
  "gpt-image-2-vip": 1300,
};

/**
 * Preferred fallback order per resolved catalog id.
 * Only same-or-cheaper models are kept after price filtering.
 */
const IMAGE_FALLBACK_CHAINS: Record<string, string[]> = {
  "nano-banana": ["nano-banana", "nano-banana-fast"],
  "nano-banana-fast": ["nano-banana-fast", "nano-banana"],
  "nano-banana-2": ["nano-banana-2", "nano-banana-fast", "nano-banana"],
  "gpt-image-2": ["gpt-image-2"],
  "gpt-image-2-vip": ["gpt-image-2-vip", "gpt-image-2"],
};

export type ImageAttemptCandidate = {
  model: string;
  provider: string;
  operation: ImageCircuitOperation;
};

export type ImagePublicAttempt = {
  model: string;
  provider: string;
  result:
    | "success"
    | "failed"
    | "skipped"
    | "timeout";
  skipped_reason?: string | null;
  failure_category?: string | null;
  failure_code?: string | null;
  duration_ms?: number | null;
  breaker_key?: string | null;
  breaker_state_before?: string | null;
  breaker_state_after?: string | null;
};

function capabilityForOperation(
  operation: ImageCircuitOperation
): ModelCapability {
  return operation === "image_to_image" ? "image_edit" : "image_generation";
}

function staticCredits(model: string): number {
  return STATIC_IMAGE_CREDITS[model] ?? Number.POSITIVE_INFINITY;
}

/**
 * Build ordered attempt models for an image request.
 * Validates operation capability, allowlist, unavailability, price tier.
 */
export async function buildImageAttemptChain(args: {
  requestedModel: string;
  resolvedModel: string;
  operation: ImageCircuitOperation;
  imagesCount: number;
  tenantId?: string | null;
}): Promise<ImageAttemptCandidate[]> {
  const resolved = args.resolvedModel.trim().toLowerCase();
  const chain = IMAGE_FALLBACK_CHAINS[resolved] ?? [resolved];
  const neededCap = capabilityForOperation(args.operation);
  const basePrice = await safePrice(resolved, args.tenantId);

  const out: ImageAttemptCandidate[] = [];
  const seen = new Set<string>();

  for (const model of chain) {
    const m = model.trim().toLowerCase();
    if (!m || seen.has(m)) continue;
    seen.add(m);

    if (isUnavailableImageModel(m)) continue;

    const caps = getModelCapability(m);
    if (!caps.includes(neededCap)) continue;

    // image_to_image requires at least one reference image upstream.
    if (args.operation === "image_to_image" && args.imagesCount < 1) {
      // Still allow the primary resolved model to surface a normal validation
      // error later; skip only fallbacks.
      if (m !== resolved) continue;
    }

    const allowed = await isModelAllowedForImage(m);
    if (!allowed) continue;

    const price = await safePrice(m, args.tenantId);
    // Forbid jumping to a clearly higher price tier than the requested model.
    if (price > basePrice && staticCredits(m) > staticCredits(resolved)) {
      continue;
    }

    out.push({
      model: m,
      provider: IMAGE_CIRCUIT_PROVIDER_ID,
      operation: args.operation,
    });
  }

  if (out.length === 0) {
    out.push({
      model: resolved,
      provider: IMAGE_CIRCUIT_PROVIDER_ID,
      operation: args.operation,
    });
  }

  return out;
}

async function safePrice(model: string, tenantId?: string | null): Promise<number> {
  try {
    const n = await priceCreditsForImage(model, tenantId);
    if (Number.isFinite(n) && n > 0) return n;
  } catch {
    // fall through
  }
  return staticCredits(model);
}

export function sanitizePublicAttempts(
  attempts: ImagePublicAttempt[]
): ImagePublicAttempt[] {
  return attempts.map((a) => ({
    model: a.model,
    provider: a.provider,
    result: a.result,
    skipped_reason: a.skipped_reason ?? null,
    failure_category: a.failure_category ?? null,
    failure_code: a.failure_code ?? null,
    duration_ms: a.duration_ms ?? null,
    breaker_key: a.breaker_key ?? null,
    breaker_state_before: a.breaker_state_before ?? null,
    breaker_state_after: a.breaker_state_after ?? null,
  }));
}
