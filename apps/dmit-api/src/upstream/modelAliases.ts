/** Smart routing aliases — resolved server-side with ordered fallback. */
export const MODEL_ALIAS_CHAINS = {
  "auto-fast": ["gemini-3-flash", "gemini-2.5-flash", "gemini-3-pro"],
  "auto-pro": ["gpt-5.5", "gpt-5.4", "gemini-3.1-pro", "gemini-3-pro"],
  "auto-cheap": ["gemini-2.5-flash", "gemini-3-flash"],
} as const;

export type ModelAliasId = keyof typeof MODEL_ALIAS_CHAINS;

export const MODEL_ALIAS_IDS = Object.keys(
  MODEL_ALIAS_CHAINS
) as ModelAliasId[];

export function isModelAlias(model: string): model is ModelAliasId {
  return Object.prototype.hasOwnProperty.call(MODEL_ALIAS_CHAINS, model);
}

export function resolveModelAttempts(
  requestedModel: string,
  skipModels: ReadonlySet<string> = new Set()
): { requestedModel: string; isAlias: boolean; attempts: string[] } {
  if (isModelAlias(requestedModel)) {
    const attempts = MODEL_ALIAS_CHAINS[requestedModel].filter(
      (id) => !skipModels.has(id)
    );
    return { requestedModel, isAlias: true, attempts: [...attempts] };
  }
  return { requestedModel, isAlias: false, attempts: [requestedModel] };
}

export function listAliasModelsForCatalog(): Array<{
  id: string;
  object: "model";
  created: number;
  owned_by: string;
}> {
  const now = Math.floor(Date.now() / 1000);
  return MODEL_ALIAS_IDS.map((id) => ({
    id,
    object: "model" as const,
    created: now,
    owned_by: "tokfai",
  }));
}
