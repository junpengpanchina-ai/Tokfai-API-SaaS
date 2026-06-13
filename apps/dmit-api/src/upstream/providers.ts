import { env } from "../env.js";

/** Resolved upstream provider — API key loaded from env at boot. */
export interface UpstreamProvider {
  id: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  chatPath: string;
  enabled: boolean;
  priority: number;
  weight: number;
  timeoutMs: number;
  /** `"*"` = all chat models; otherwise explicit Tokfai model IDs. */
  supportedModels: readonly string[] | "*";
}

const ALL_MODELS = "*" as const;

function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) {
    return trimmed.slice(0, -3);
  }
  return trimmed;
}

function normalizeChatPath(raw: string): string {
  return raw.startsWith("/") ? raw : `/${raw}`;
}

function parseProviderOrder(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Static provider definitions merged with runtime env. */
function buildProviderRegistry(): Map<string, UpstreamProvider> {
  const timeoutMs = env.TOKFAI_UPSTREAM_TIMEOUT_MS ?? env.GRSAI_CHAT_TIMEOUT_MS;

  const grsaiPrimary: UpstreamProvider = {
    id: "grsai-primary",
    label: "GRSAI Primary",
    baseUrl: env.GRSAI_BASE_URL,
    apiKey: env.GRSAI_API_KEY,
    chatPath: env.GRSAI_CHAT_COMPLETIONS_PATH,
    enabled: true,
    priority: 1,
    weight: 100,
    timeoutMs,
    supportedModels: ALL_MODELS,
  };

  const secondaryEnabled = env.TOKFAI_UPSTREAM_SECONDARY_ENABLED;
  const secondaryKey = env.TOKFAI_UPSTREAM_SECONDARY_API_KEY ?? "";
  const secondaryBase = env.TOKFAI_UPSTREAM_SECONDARY_BASE_URL ?? "";

  const openaiCompatibleSecondary: UpstreamProvider = {
    id: "openai-compatible-secondary",
    label: "OpenAI-Compatible Secondary",
    baseUrl: secondaryBase ? normalizeBaseUrl(secondaryBase) : "",
    apiKey: secondaryKey,
    chatPath: normalizeChatPath(
      env.TOKFAI_UPSTREAM_SECONDARY_CHAT_PATH ?? "/v1/chat/completions"
    ),
    enabled:
      secondaryEnabled &&
      secondaryBase.length > 0 &&
      secondaryKey.length > 0,
    priority: 2,
    weight: 50,
    timeoutMs,
    supportedModels: ["gpt-5.4", "gpt-5.5"],
  };

  return new Map([
    [grsaiPrimary.id, grsaiPrimary],
    [openaiCompatibleSecondary.id, openaiCompatibleSecondary],
  ]);
}

const REGISTRY = buildProviderRegistry();

export function getProviderById(id: string): UpstreamProvider | undefined {
  return REGISTRY.get(id);
}

export function listProviders(): UpstreamProvider[] {
  return [...REGISTRY.values()].sort((a, b) => a.priority - b.priority);
}

export function listEnabledProviders(): UpstreamProvider[] {
  return listProviders().filter((p) => p.enabled);
}

function providerSupportsModel(
  provider: UpstreamProvider,
  model: string
): boolean {
  if (provider.supportedModels === ALL_MODELS) return true;
  return provider.supportedModels.includes(model);
}

const DEFAULT_MULTI_PROVIDER_MODELS = new Set(["gpt-5.4", "gpt-5.5"]);

function configuredOrderForModel(model: string): string[] {
  if (model === "gpt-5.4") {
    const fromEnv = parseProviderOrder(env.TOKFAI_MODEL_PROVIDER_ORDER_GPT_5_4);
    if (fromEnv.length > 0) return fromEnv;
    return ["grsai-primary", "openai-compatible-secondary"];
  }

  if (model === "gpt-5.5") {
    const fromEnv = parseProviderOrder(env.TOKFAI_MODEL_PROVIDER_ORDER_GPT_5_5);
    if (fromEnv.length > 0) return fromEnv;
    return ["grsai-primary", "openai-compatible-secondary"];
  }

  if (DEFAULT_MULTI_PROVIDER_MODELS.has(model)) {
    return ["grsai-primary", "openai-compatible-secondary"];
  }

  return ["grsai-primary"];
}

/**
 * Ordered enabled providers for a Tokfai model ID (after alias resolution).
 * Disabled or unsupported providers are skipped.
 */
export function resolveProviderAttempts(model: string): UpstreamProvider[] {
  const order = configuredOrderForModel(model);
  const seen = new Set<string>();
  const resolved: UpstreamProvider[] = [];

  for (const id of order) {
    if (seen.has(id)) continue;
    seen.add(id);

    const provider = REGISTRY.get(id);
    if (!provider?.enabled) continue;
    if (!providerSupportsModel(provider, model)) continue;

    resolved.push(provider);
  }

  if (resolved.length === 0) {
    const fallback = REGISTRY.get("grsai-primary");
    if (fallback?.enabled && providerSupportsModel(fallback, model)) {
      return [fallback];
    }
  }

  return resolved;
}

/** Non-sensitive provider summary for ops scripts / logs. */
export function describeProviders(): Array<{
  id: string;
  label: string;
  enabled: boolean;
  priority: number;
  host: string | null;
  chatPath: string;
  supportedModels: readonly string[] | "*";
}> {
  return listProviders().map((p) => ({
    id: p.id,
    label: p.label,
    enabled: p.enabled,
    priority: p.priority,
    host: p.baseUrl ? new URL(p.baseUrl).host : null,
    chatPath: p.chatPath,
    supportedModels: p.supportedModels,
  }));
}
