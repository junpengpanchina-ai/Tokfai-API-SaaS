/**
 * Hard denylist for GET /v1/models only.
 * Chat/completions may still resolve these ids via MODEL_ALIAS_CHAINS /
 * CLIENT_MODEL_REWRITES — this module must never be used to block chat routing.
 */

/** Exact ids that must never appear in /v1/models `data` / `models`. */
export const PUBLIC_MODELS_HARD_DENIED_IDS: readonly string[] = [
  "auto-fast",
  "auto-pro",
  "auto-cheap",
  "gpt-5",
  "gpt-5-chat",
  "gpt-5-pro",
  "gpt-5.1",
  "gpt-5.2",
  "gpt-5-4",
  "gpt-5.4",
  "gpt-5-4-pro",
  "gpt-5.4-pro",
  "deepseek-chat",
  "deepseek-v3",
] as const;

const HARD_DENIED = new Set(
  PUBLIC_MODELS_HARD_DENIED_IDS.map((id) => id.toLowerCase())
);

/** Extra pattern coverage for dashed / odd spellings. */
const DENIED_PUBLIC_MODEL_ID_RE =
  /^(auto-(fast|pro|cheap)|gpt-5(-chat|-pro)?|gpt-5\.(1|2)|gpt-5-4(-pro)?|gpt-5\.4(-pro)?|deepseek-chat|deepseek-v3)$/i;

const TOKFAI_GPT_LABEL_RE = /Tokfai\s+GPT/i;

export function isDeniedPublicModelId(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  if (!id) return true;
  if (HARD_DENIED.has(id)) return true;
  return DENIED_PUBLIC_MODEL_ID_RE.test(id);
}

/** Strip Tokfai GPT* branding from labels; keep plain GPT-* text. */
export function sanitizePublicModelLabel(
  modelId: string,
  label: string | null | undefined
): string | undefined {
  if (typeof label !== "string") return undefined;
  let trimmed = label.trim();
  if (!trimmed) return undefined;

  // Remove every "Tokfai GPT" occurrence (not only a leading prefix).
  while (TOKFAI_GPT_LABEL_RE.test(trimmed)) {
    trimmed = trimmed.replace(TOKFAI_GPT_LABEL_RE, "GPT").replace(/\s+/g, " ").trim();
  }

  if (/^gpt([\d._-]|$)/i.test(modelId) && /^Tokfai\s+/i.test(trimmed)) {
    trimmed = trimmed.replace(/^Tokfai\s+/i, "").trim();
  }

  return trimmed || undefined;
}

type PublicModelListFields = {
  id: string;
  name?: string;
  display_name?: string;
  title?: string;
  slug?: string;
};

function rowHasTokfaiGptLabel(item: PublicModelListFields): boolean {
  for (const key of ["name", "display_name", "title", "slug"] as const) {
    const value = item[key];
    if (typeof value === "string" && TOKFAI_GPT_LABEL_RE.test(value)) {
      return true;
    }
  }
  return false;
}

/**
 * Last-line filter before /v1/models JSON leaves the process.
 * Drops alias/smart-route ids and strips Tokfai GPT* display fields.
 */
export function filterPublicModelsList<T extends PublicModelListFields>(
  items: readonly T[]
): T[] {
  const out: T[] = [];
  for (const item of items) {
    if (isDeniedPublicModelId(item.id)) continue;
    if (typeof item.slug === "string" && isDeniedPublicModelId(item.slug)) {
      continue;
    }

    const name = sanitizePublicModelLabel(item.id, item.name);
    const displayName = sanitizePublicModelLabel(item.id, item.display_name);
    const title = sanitizePublicModelLabel(item.id, item.title);

    const next: T = {
      ...item,
      ...(item.name !== undefined ? { name: name ?? item.name } : {}),
      ...(item.display_name !== undefined
        ? { display_name: displayName ?? item.display_name }
        : {}),
      ...(item.title !== undefined ? { title: title ?? item.title } : {}),
    };

    // Absolute rule: never emit rows that still contain "Tokfai GPT".
    if (rowHasTokfaiGptLabel(next)) continue;

    out.push(next);
  }
  return out;
}

export type ModelsListPayloadLike = {
  object: "list";
  data: PublicModelListFields[];
  models?: PublicModelListFields[];
};

/**
 * Scrub a finished /v1/models payload (both `data` and Codex `models`).
 * Call this immediately before res.json / c.json.
 */
export function scrubModelsListPayload<T extends ModelsListPayloadLike>(
  payload: T
): T {
  const data = filterPublicModelsList(payload.data ?? []);
  const models = filterPublicModelsList(
    Array.isArray(payload.models) ? payload.models : data
  );
  return {
    ...payload,
    object: "list",
    data,
    models,
  };
}
