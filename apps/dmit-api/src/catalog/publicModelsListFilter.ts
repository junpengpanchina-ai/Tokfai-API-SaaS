import { listPublicModelsHiddenAliasIds } from "../upstream/modelAliases.js";

/**
 * Final denylist for GET /v1/models.
 * Chat/completions may still resolve these ids via alias chains.
 *
 * Exact ids from listPublicModelsHiddenAliasIds() plus pattern coverage so
 * dashed/compat spellings cannot leak through DB or allowlist merges.
 */
const DENIED_PUBLIC_MODEL_ID_RE =
  /^(auto-(fast|pro|cheap)|gpt-5(-chat|-pro)?|gpt-5\.(1|2)|gpt-5-4(-pro)?|gpt-5\.4(-pro)?|deepseek-chat|deepseek-v3)$/i;

export function isDeniedPublicModelId(modelId: string): boolean {
  const id = modelId.trim().toLowerCase();
  if (!id) return true;
  if (listPublicModelsHiddenAliasIds().some((hidden) => hidden.toLowerCase() === id)) {
    return true;
  }
  return DENIED_PUBLIC_MODEL_ID_RE.test(id);
}

/** Strip "Tokfai GPT*" labels; keep concrete GPT ids with plain GPT-* names. */
export function sanitizePublicModelLabel(
  modelId: string,
  label: string | null | undefined
): string | undefined {
  if (typeof label !== "string") return undefined;
  const trimmed = label.trim();
  if (!trimmed) return undefined;
  if (/^Tokfai\s+GPT\b/i.test(trimmed)) {
    return trimmed.replace(/^Tokfai\s+/i, "").trim() || undefined;
  }
  // Defense: any GPT-family id must not keep a Tokfai-prefixed label.
  if (/^gpt([\d._-]|$)/i.test(modelId) && /^Tokfai\s+/i.test(trimmed)) {
    return trimmed.replace(/^Tokfai\s+/i, "").trim() || undefined;
  }
  return trimmed;
}

type PublicModelListFields = {
  id: string;
  name?: string;
  display_name?: string;
  title?: string;
};

/**
 * Last-line filter before /v1/models JSON leaves the process.
 * Drops alias/smart-route ids and sanitizes Tokfai GPT* display fields.
 */
export function filterPublicModelsList<T extends PublicModelListFields>(
  items: readonly T[]
): T[] {
  const out: T[] = [];
  for (const item of items) {
    if (isDeniedPublicModelId(item.id)) continue;

    const name = sanitizePublicModelLabel(item.id, item.name);
    const displayName = sanitizePublicModelLabel(item.id, item.display_name);
    const title = sanitizePublicModelLabel(item.id, item.title);

    // If any remaining label is still "Tokfai GPT*", drop the row entirely.
    const labels = [name, displayName, title].filter(
      (v): v is string => typeof v === "string"
    );
    if (labels.some((v) => /^Tokfai\s+GPT\b/i.test(v))) continue;

    out.push({
      ...item,
      ...(item.name !== undefined ? { name: name ?? item.name } : {}),
      ...(item.display_name !== undefined
        ? { display_name: displayName ?? item.display_name }
        : {}),
      ...(item.title !== undefined ? { title: title ?? item.title } : {}),
    });
  }
  return out;
}
