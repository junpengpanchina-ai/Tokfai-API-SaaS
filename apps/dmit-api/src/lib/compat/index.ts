/**
 * P1050 — Additive compatibility seam public surface.
 *
 * Not wired into executeChatCompletion / GPT Golden Path.
 * Import from here in tests and future provider adapters only.
 */

export type {
  CanonicalAssistantResult,
  CanonicalFinishReason,
  CanonicalToolCall,
  CanonicalUsage,
  ProtocolFamily,
  ProviderFamily,
} from "./canonicalAgentTypes.js";

export {
  getProviderCapabilityProfile,
  listProviderCapabilityProfiles,
  type ProviderCapabilityFlags,
  type ProviderCapabilityProfile,
} from "./providerCapabilities.js";

export {
  canonicalAssistantFromOpenAiChoice,
  deterministicToolCallId,
  normalizeGeminiStyleToolCall,
  normalizeGeminiStyleToolCalls,
  normalizeOpenAiStyleToolCall,
  normalizeOpenAiStyleToolCalls,
  parseToolCallArguments,
  type ToolCallNormalizationErr,
  type ToolCallNormalizationOk,
  type ToolCallNormalizationResult,
  type ToolCallsNormalizationResult,
} from "./toolCallNormalization.js";

export {
  normalizeGeminiFinishReasonToCanonical,
  normalizeOpenAiFinishReasonToCanonical,
  toCanonicalFinishReason,
} from "./finishReasonNormalization.js";
