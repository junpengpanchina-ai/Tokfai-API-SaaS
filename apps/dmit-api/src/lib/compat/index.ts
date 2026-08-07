/**
 * P1050 — Additive compatibility seam public surface.
 * P1051 — Explicit Gemini provider adapter (providers/geminiAdapter).
 *
 * Not wired into executeChatCompletion / GPT Golden Path.
 * Import from here in tests and explicit Gemini provider paths only.
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

export {
  adaptGeminiResponseToOpenAI,
  applyGeminiAdapterToolResumeToUpstreamChatBody,
  buildToolCallIdToNameMap,
  canonicalGeminiResultToOpenAI,
  convertOpenAIMessagesForGeminiAdapterResume,
  convertOpenAIToolContinuationToGeminiContents,
  convertOpenAIToolResultsToGeminiFunctionResponses,
  convertOpenAIToolsToGemini,
  convertOpenAIToolsToGeminiTools,
  GEMINI_ADAPTER_TOOL_RESUME_MODELS,
  guardExplicitGeminiAdapter,
  isExplicitGeminiProviderPath,
  isRegisteredGeminiAdapterToolResumeModel,
  modelSupportsCanonicalToolResumeViaGeminiAdapter,
  normalizeGeminiResponse,
  normalizeGeminiUsage,
  type GeminiContent,
  type GeminiFunctionDeclaration,
  type GeminiFunctionResponsePart,
  type GeminiToolsEntry,
  type NormalizeGeminiResponseOptions,
  type OpenAiAssistantMessage,
} from "./providers/geminiAdapter.js";
