/**
 * Unified client model resolution for Tokfai chat / responses / catalog.
 *
 * All OpenAI-compatible entry points must call resolveChatModel() so Cherry
 * Studio display names, openai/ prefixes, and family aliases map to the same
 * canonical ids before allowlist + upstream routing.
 */

/** Smart routing aliases — resolved server-side with ordered fallback. */
export const MODEL_ALIAS_CHAINS = {
  "auto-fast": ["gemini-3-flash", "gemini-2.5-flash", "gemini-3-pro"],
  "auto-pro": ["gpt-5.5", "gpt-5.4", "gemini-3-pro"],
  "auto-cheap": ["gemini-2.5-flash", "gemini-3-flash"],
  /**
   * Client-facing GPT-5 family names that may not exist upstream.
   * Map to currently available GPT tiers with ordered fallback.
   */
  "gpt-5": ["gpt-5.5", "gpt-5.4"],
  "gpt-5-chat": ["gpt-5.5", "gpt-5.4"],
  /**
   * gpt-5-pro: exposed as a quality alias (not a separate upstream SKU).
   * Resolves to strongest available GPT tiers.
   */
  "gpt-5-pro": ["gpt-5.5", "gpt-5.4"],
  "gpt-5.1": ["gpt-5.5", "gpt-5.4"],
  "gpt-5.2": ["gpt-5.5", "gpt-5.4"],
  /**
   * Cherry Studio / older Gemini client ids → currently available Gemini chat models.
   */
  "gemini-3.1-flash": ["gemini-3-flash"],
  "gemini-3.1-pro": ["gemini-3-pro"],
} as const;

export type ModelAliasId = keyof typeof MODEL_ALIAS_CHAINS;

export const MODEL_ALIAS_IDS = Object.keys(
  MODEL_ALIAS_CHAINS
) as ModelAliasId[];

/**
 * 1:1 rewrites after normalizeClientModelId().
 * These ids are NOT listed on GET /v1/models — they only accept inbound calls.
 */
export const CLIENT_MODEL_REWRITES: Record<string, string> = {
  // Cherry / OpenAI Provider GPT display-name variants
  "gpt-5.4-pro": "gpt-5.4",
  "gpt-5.5-pro": "gpt-5.5",
  "gpt-5.4pro": "gpt-5.4",
  "gpt-5.5pro": "gpt-5.5",
  "gpt-5-4": "gpt-5.4",
  "gpt-5-5": "gpt-5.5",
  "gpt-5-4-pro": "gpt-5.4",
  "gpt-5-5-pro": "gpt-5.5",
};

export type ResolvedChatModel = {
  /** Original client string (trimmed). */
  requestedRaw: string;
  /** After prefix/case/whitespace normalization. */
  normalized: string;
  /** After 1:1 rewrite; used for allowlist / alias chain lookup. */
  canonicalId: string;
  /** True when canonicalId is a MODEL_ALIAS_CHAINS key. */
  isAlias: boolean;
  /** Ordered upstream attempt ids. */
  attempts: string[];
};

/**
 * Normalize Cherry / SDK / OpenAI-style model identifiers to a stable key.
 *
 * Examples:
 *   "GPT 5.4 Pro"           → "gpt-5.4-pro"
 *   "openai/gpt-5.4-pro"    → "gpt-5.4-pro"
 *   "models/gpt-5.4"        → "gpt-5.4"
 *   "gpt-5.4"               → "gpt-5.4"
 */
export function normalizeClientModelId(raw: string): string {
  let value = raw.trim();
  if (!value) return value;

  try {
    value = decodeURIComponent(value);
  } catch {
    // keep raw trim when not URI-encoded
  }

  value = value.replace(/^models\//i, "");
  value = value.replace(/^openai\//i, "");
  value = value.replace(/^google\//i, "");
  value = value.replace(/^grsai\//i, "");

  value = value.trim().toLowerCase();
  value = value.replace(/[_\s]+/g, "-");
  value = value.replace(/-+/g, "-");
  value = value.replace(/^-|-$/g, "");

  return value;
}

export function isModelAlias(model: string): model is ModelAliasId {
  return Object.prototype.hasOwnProperty.call(MODEL_ALIAS_CHAINS, model);
}

/**
 * Resolve a client model string into canonical id + upstream attempt chain.
 * Call this once at the start of chat/responses execution.
 *
 * Also exported as resolveModel() — the single entry used by all OpenAI routes.
 */
export function resolveChatModel(
  raw: string,
  skipModels: ReadonlySet<string> = new Set()
): ResolvedChatModel {
  const requestedRaw = raw.trim();
  const normalized = normalizeClientModelId(requestedRaw);
  const canonicalId = CLIENT_MODEL_REWRITES[normalized] ?? normalized;

  if (isModelAlias(canonicalId)) {
    const attempts = MODEL_ALIAS_CHAINS[canonicalId].filter(
      (id) => !skipModels.has(id)
    );
    return {
      requestedRaw,
      normalized,
      canonicalId,
      isAlias: true,
      attempts: [...attempts],
    };
  }

  return {
    requestedRaw,
    normalized,
    canonicalId,
    isAlias: false,
    attempts: [canonicalId],
  };
}

/** Alias for resolveChatModel — preferred name in route/docs. */
export const resolveModel = resolveChatModel;

/** @deprecated Prefer resolveChatModel() / resolveModel() — kept for existing call sites. */
export function resolveModelAttempts(
  requestedModel: string,
  skipModels: ReadonlySet<string> = new Set()
): { requestedModel: string; isAlias: boolean; attempts: string[] } {
  const resolved = resolveChatModel(requestedModel, skipModels);
  return {
    requestedModel: resolved.canonicalId,
    isAlias: resolved.isAlias,
    attempts: resolved.attempts,
  };
}

/**
 * Alias ids advertised on GET /v1/models (callable smart routes only).
 * Rewrite-only Cherry aliases (gpt-5.4-pro, etc.) stay off the list.
 */
export const CATALOG_ALIAS_IDS: ModelAliasId[] = [
  "auto-fast",
  "auto-pro",
  "auto-cheap",
  "gpt-5",
  "gpt-5-chat",
  "gpt-5-pro",
  "gpt-5.1",
  "gpt-5.2",
];

export function listAliasModelsForCatalog(): Array<{
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}> {
  const now = Math.floor(Date.now() / 1000);
  return CATALOG_ALIAS_IDS.map((id) => ({
    id,
    object: "model" as const,
    created: now,
    owned_by: "tokfai",
  }));
}

/** Human-readable supported chat models for error messages. */
export function formatSupportedChatModelsMessage(
  concreteIds: string[]
): string {
  const ids = [...new Set([...CATALOG_ALIAS_IDS, ...concreteIds])].sort((a, b) =>
    a.localeCompare(b)
  );
  return ids.join(", ");
}
