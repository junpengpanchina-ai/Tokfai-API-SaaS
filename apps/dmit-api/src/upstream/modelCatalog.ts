export type TokfaiModelKind = "chat" | "image";

export interface TokfaiModelCatalogItem {
  id: string;
  object: "model";
  owned_by: string;
  provider: "grsai";
  upstream_model: string;
  enabled: boolean;
  kind: TokfaiModelKind;
  input_per_1k: number;
  output_per_1k: number;
  note?: string;
}

export const MODEL_CATALOG: Record<string, TokfaiModelCatalogItem> = {
  "gemini-3.1-pro": {
    id: "gemini-3.1-pro",
    object: "model",
    owned_by: "tokfai",
    provider: "grsai",
    upstream_model: "gemini-3.1-pro",
    enabled: true,
    kind: "chat",
    input_per_1k: 0.002,
    output_per_1k: 0.004,
    note: "Slow/experimental — explicit use only; may upstream_timeout."
  },

  "gemini-3-pro": {
    id: "gemini-3-pro",
    object: "model",
    owned_by: "tokfai",
    provider: "grsai",
    upstream_model: "gemini-3-pro",
    enabled: true,
    kind: "chat",
    input_per_1k: 0.002,
    output_per_1k: 0.004,
    note: "Gemini 3 Pro."
  },

  "gemini-3-flash": {
    id: "gemini-3-flash",
    object: "model",
    owned_by: "tokfai",
    provider: "grsai",
    upstream_model: "gemini-3-flash",
    enabled: true,
    kind: "chat",
    input_per_1k: 0.0006,
    output_per_1k: 0.003,
    note: "Fast Gemini 3 model."
  },

  "gemini-3.1-flash-lite": {
    id: "gemini-3.1-flash-lite",
    object: "model",
    owned_by: "tokfai",
    provider: "grsai",
    upstream_model: "gemini-3.1-flash-lite",
    enabled: true,
    kind: "chat",
    input_per_1k: 0.00035,
    output_per_1k: 0.002,
    note: "Low cost Gemini model."
  },

  "gemini-3.5-flash": {
    id: "gemini-3.5-flash",
    object: "model",
    owned_by: "tokfai",
    provider: "grsai",
    upstream_model: "gemini-3.5-flash",
    enabled: true,
    kind: "chat",
    input_per_1k: 0.0017,
    output_per_1k: 0.012,
    note: "Gemini 3.5 Flash."
  },

  "gemini-2.5-flash": {
    id: "gemini-2.5-flash",
    object: "model",
    owned_by: "tokfai",
    provider: "grsai",
    upstream_model: "gemini-2.5-flash",
    enabled: true,
    kind: "chat",
    input_per_1k: 0.00043,
    output_per_1k: 0.0029,
    note: "Gemini 2.5 Flash."
  },

  "gemini-2.5-pro": {
    id: "gemini-2.5-pro",
    object: "model",
    owned_by: "tokfai",
    provider: "grsai",
    upstream_model: "gemini-2.5-pro",
    enabled: true,
    kind: "chat",
    input_per_1k: 0.0018,
    output_per_1k: 0.009,
    note: "Gemini 2.5 Pro."
  },

  "gpt-4o-mini": {
    id: "gpt-4o-mini",
    object: "model",
    owned_by: "tokfai",
    provider: "grsai",
    upstream_model: "gpt-4o-mini",
    enabled: false,
    kind: "chat",
    input_per_1k: 0.00015,
    output_per_1k: 0.0006,
    note: "Internal only — not registered upstream."
  },

  "gpt-5.4": {
    id: "gpt-5.4",
    object: "model",
    owned_by: "tokfai",
    provider: "grsai",
    upstream_model: "gpt-5.4",
    enabled: true,
    kind: "chat",
    input_per_1k: 0.001,
    output_per_1k: 0.008,
    note: "GRSAI GPT 5.4."
  },

  "gpt-5.5": {
    id: "gpt-5.5",
    object: "model",
    owned_by: "tokfai",
    provider: "grsai",
    upstream_model: "gpt-5.5",
    enabled: true,
    kind: "chat",
    input_per_1k: 0.0032,
    output_per_1k: 0.02,
    note: "GRSAI GPT 5.5."
  },

  "nano-banana": {
    id: "nano-banana",
    object: "model",
    owned_by: "tokfai",
    provider: "grsai",
    upstream_model: "nano-banana",
    enabled: true,
    kind: "image",
    input_per_1k: 0.0001,
    output_per_1k: 0.0002,
    note: "Image model placeholder pricing."
  },

  "nano-banana-fast": {
    id: "nano-banana-fast",
    object: "model",
    owned_by: "tokfai",
    provider: "grsai",
    upstream_model: "nano-banana-fast",
    enabled: true,
    kind: "image",
    input_per_1k: 0.0001,
    output_per_1k: 0.0002,
    note: "Fast image model placeholder pricing."
  },

  "nano-banana-pro": {
    id: "nano-banana-pro",
    object: "model",
    owned_by: "tokfai",
    provider: "grsai",
    upstream_model: "nano-banana-pro",
    enabled: true,
    kind: "image",
    input_per_1k: 0.0001,
    output_per_1k: 0.0002,
    note: "Pro image model placeholder pricing."
  },

  "nano-banana-2": {
    id: "nano-banana-2",
    object: "model",
    owned_by: "tokfai",
    provider: "grsai",
    upstream_model: "nano-banana-2",
    enabled: true,
    kind: "image",
    input_per_1k: 0.0001,
    output_per_1k: 0.0002,
    note: "Image model placeholder pricing."
  },

  "gpt-image-2": {
    id: "gpt-image-2",
    object: "model",
    owned_by: "tokfai",
    provider: "grsai",
    upstream_model: "gpt-image-2",
    enabled: true,
    kind: "image",
    input_per_1k: 0.0001,
    output_per_1k: 0.0002,
    note: "Image generation model placeholder pricing."
  }
};

export function listEnabledModels(): TokfaiModelCatalogItem[] {
  return Object.values(MODEL_CATALOG).filter((model) => model.enabled);
}

export function listAllowedModels(): string[] {
  return listEnabledModels()
    .filter((model) => !model.id.startsWith("test-admin-"))
    .map((model) => model.id);
}

export function getModelConfig(model: string): TokfaiModelCatalogItem | null {
  return MODEL_CATALOG[model] ?? null;
}

export function isAllowedModel(model: string): boolean {
  return Boolean(MODEL_CATALOG[model]?.enabled);
}
