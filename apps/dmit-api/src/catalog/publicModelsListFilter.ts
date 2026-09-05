/**
 * Last-mile scrub for GET /v1/models only.
 * Must not be used to block /v1/chat/completions alias routing.
 */

/** Alias / pseudo-model ids that must never appear in the public list. */
export const DENY_PUBLIC_MODEL_IDS = new Set([
  "auto-fast",
  "auto-pro",
  "auto-cheap",
  "gpt-5-chat",
  "gpt-5-pro",
  "gpt-5-4",
  "gpt-5-4-pro",
  // Dotted compat spellings of the same aliases
  "gpt-5.4",
  "gpt-5.4-pro",
]);

/** @deprecated Prefer DENY_PUBLIC_MODEL_IDS — kept for existing smoke imports. */
export const PUBLIC_MODELS_HARD_DENIED_IDS = [
  ...DENY_PUBLIC_MODEL_IDS,
] as const;

type PublicModelLike = {
  id?: unknown;
  name?: unknown;
  display_name?: unknown;
  displayName?: unknown;
  title?: unknown;
  slug?: unknown;
  [key: string]: unknown;
};

function lower(value: unknown): string {
  return String(value ?? "").toLowerCase();
}

/**
 * Deny by hard id set, or by any name/display_name/title containing "tokfai gpt".
 * Call after label sanitize when keeping concrete GPT models (e.g. gpt-5.6-*).
 */
export function isDeniedPublicModel(model: PublicModelLike): boolean {
  const id = lower(model?.id);
  const name = lower(model?.name);
  const displayName = lower(model?.display_name ?? model?.displayName);
  const title = lower(model?.title);
  const slug = lower(model?.slug);

  if (DENY_PUBLIC_MODEL_IDS.has(id) || DENY_PUBLIC_MODEL_IDS.has(slug)) {
    return true;
  }
  if (displayName.includes("tokfai gpt")) return true;
  if (title.includes("tokfai gpt")) return true;
  if (name.includes("tokfai gpt")) return true;
  return false;
}

export function isDeniedPublicModelId(modelId: string): boolean {
  return isDeniedPublicModel({ id: modelId });
}

/** Strip "Tokfai GPT" branding so concrete GPT ids can remain listed. */
export function sanitizePublicModelLabel(
  _modelId: string,
  label: string | null | undefined
): string | undefined {
  if (typeof label !== "string") return undefined;
  let trimmed = label.trim();
  if (!trimmed) return undefined;
  while (/Tokfai\s+GPT/i.test(trimmed)) {
    trimmed = trimmed.replace(/Tokfai\s+GPT/gi, "GPT").replace(/\s+/g, " ").trim();
  }
  if (/^Tokfai\s+/i.test(trimmed) && /^gpt([\d._-]|$)/i.test(_modelId)) {
    trimmed = trimmed.replace(/^Tokfai\s+/i, "").trim();
  }
  return trimmed || undefined;
}

function sanitizeModelRow<T extends PublicModelLike>(model: T): T {
  const id = String(model?.id ?? "");
  const name = sanitizePublicModelLabel(id, model.name as string | undefined);
  const displayName = sanitizePublicModelLabel(
    id,
    (model.display_name ?? model.displayName) as string | undefined
  );
  const title = sanitizePublicModelLabel(id, model.title as string | undefined);

  return {
    ...model,
    ...(model.name !== undefined ? { name: name ?? model.name } : {}),
    ...(model.display_name !== undefined
      ? { display_name: displayName ?? model.display_name }
      : {}),
    ...(model.displayName !== undefined
      ? { displayName: displayName ?? model.displayName }
      : {}),
    ...(model.title !== undefined ? { title: title ?? model.title } : {}),
  };
}

export function filterPublicModelsList<T extends PublicModelLike>(
  items: readonly T[]
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const raw of items) {
    const model = sanitizeModelRow(raw);
    if (isDeniedPublicModel(model)) continue;
    const id = String(model?.id ?? "").trim();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(model);
  }
  return out;
}

export type ModelsListPayloadLike = {
  object?: string;
  data?: PublicModelLike[];
  models?: PublicModelLike[];
  [key: string]: unknown;
};

/**
 * Last-mile scrub immediately before /v1/models JSON response.
 * Scrubs both `data` and `models`, drops denied rows, dedupes ids per list.
 */
export function scrubPublicModelsPayload<T extends ModelsListPayloadLike>(
  payload: T
): T {
  const next: T = { ...payload };

  const scrubList = (list: PublicModelLike[]): PublicModelLike[] => {
    const seen = new Set<string>();
    const out: PublicModelLike[] = [];
    for (const raw of list) {
      const model = sanitizeModelRow(raw);
      if (isDeniedPublicModel(model)) continue;
      const id = String(model?.id ?? "").trim();
      if (!id) continue;
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(model);
    }
    return out;
  };

  if (Array.isArray(next.data)) {
    next.data = scrubList(next.data);
  }

  if (Array.isArray(next.models)) {
    // Independent seen set so Codex `models[]` stays populated as a scrubbed
    // mirror of `data[]` (shared seen would empty the second array).
    next.models = scrubList(next.models);
  }

  return next;
}

/** Alias used by existing call sites. */
export const scrubModelsListPayload = scrubPublicModelsPayload;
