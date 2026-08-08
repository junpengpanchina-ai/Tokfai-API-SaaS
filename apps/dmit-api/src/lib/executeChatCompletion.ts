import { z } from "zod";

import { isImageModel } from "../capabilities/modelCapabilityPolicy.js";
import { IMAGE_MODEL_NOT_FOR_CHAT_CODE } from "./imageProviderIsolation.js";
import { isSlowExperimentalChatModel } from "../catalog/modelRegistry.js";
import {
  ALL_TOOL_UPSTREAMS_UNAVAILABLE_CODE,
  MODEL_NOT_TOOL_CAPABLE_CODE,
  MODEL_NOT_TOOL_CAPABLE_MESSAGE,
  TOOL_CALL_NOT_GENERATED_CODE,
  TOOL_ROUND_RESUME_UNAVAILABLE_CODE,
  TOOL_ROUND_RESUME_UNAVAILABLE_MESSAGE,
  TOOLS_CAPABLE_FALLBACK_MODELS,
  clientRequiresToolCall,
  effectiveToolChoice,
  extractResponseFinishReason,
  isStrictToolCallRequest,
  isVerifiedToolCapableModel,
  modelSupportsTools,
  normalizeToolCallsOnChatCompletion,
  requestHasTools,
  requestHasNonEmptyTools,
  resolveNativeToolResumeAttempts,
  resolveToolResumeAttempts,
  resolveToolsCapableAttempts,
  resolveToolCallingMode,
  canNativeEmulatedRepair,
  responseHasToolCalls,
  shouldAttemptAutoToolIntentArbitration,
  shouldAttemptResumeToolContinuationArbitration,
  stripToolsFromChatBody,
  toolChoiceSummary,
  type ToolCallingMode,
} from "./toolCallCapability.js";
import {
  applyGeminiAdapterToolResumeToUpstreamChatBody,
  isRegisteredGeminiAdapterToolResumeModel,
} from "./compat/providers/geminiAdapter.js";
import {
  compileEmulatedResumeTranscript,
  compileEmulatedUpstreamBody,
  detectExplicitToolExecutionIntent,
  shouldContinueIncompleteToolTask,
} from "./toolIntentCompiler.js";
import {
  applyToolIntentToChatCompletion,
  extractAssistantContentFromCompletion,
  parseToolIntentFromContent,
} from "./toolIntentParser.js";
import {
  TOOL_EMULATION_UNAVAILABLE_CODE,
  TOOL_NAME_NOT_ALLOWED_CODE,
  isToolIntentRepairableCode,
  toolIntentApiError,
} from "./toolIntentErrors.js";
import {
  adaptGrsaiNativeForcedToolChoiceBody,
  assertNativeForcedToolCallsMatch,
  forcedToolChoiceClientError,
  resolveForcedToolChoice,
  shouldAdaptGrsaiNativeObjectToolChoice,
} from "./grsaiNativeToolChoiceAdapter.js";
import {
  applyNativeToolRepairToUpstreamBody,
  selectNativeRepairTool,
  shouldAttemptNativeToolRepair,
  type NativeRepairToolSelection,
} from "./nativeToolRepair.js";
import { normalizeOpenAiFinishReasonOnChatCompletion } from "./openaiFinishReason.js";
import { chatBodyKeysForLog } from "./chatCompletionDiagnostics.js";

function toolsCapableSuggestions(): string[] {
  return [
    "auto-pro",
    "gpt-5-pro",
    ...TOOLS_CAPABLE_FALLBACK_MODELS,
  ];
}

import { ApiError } from "../errors.js";
import { env } from "../env.js";
import { log } from "../logger.js";
import type { ChatCaller } from "../middleware/chatAuth.js";
import { supabase } from "../supabase.js";
import type { UsageLogInsert } from "../types.js";
import {
  isModelAllowedForChat,
  listAvailableChatModelIds,
  priceCreditsFor,
} from "../catalog/modelCatalog.js";
import { isModelEnabledForTenant } from "../tenants/resolve.js";
import { providerFetch, isChatFallbackEligible } from "../upstream/grsai.js";
import {
  formatModelNotRegisteredMessage,
  MODEL_NOT_AVAILABLE_CODE,
  resolveChatModel,
} from "../upstream/modelAliases.js";
import { resolveProviderAttempts } from "../upstream/providers.js";
import {
  filterAttemptsByCircuitBreaker,
  recordModelFailure,
  recordModelSuccess,
} from "../upstream/modelCircuitBreaker.js";
import {
  filterProvidersByTimeoutCircuit,
  recordProviderModelSuccess,
  recordProviderModelTimeout,
} from "../upstream/providerModelCircuitBreaker.js";
import { providerFetchChatPreferNativeNonStream } from "../upstream/providerFetchChatStreamAssembled.js";
import { buildUpstreamChatBody, droppedUpstreamChatKeysForAudit } from "./upstreamChatBody.js";
import {
  CHAT_USAGE_ESTIMATION_ALGORITHM,
  coalesceUpstreamUsageTotal,
  estimateChatUsageFromPayload,
  shouldEstimateChatUsage,
  type NormalizedChatUsage,
} from "./chatUsageFallback.js";
import {
  cloneNormalizedUsage,
  hasBillableUsageStage,
  mergeNormalizedUsages,
  type BillableUsageComponent,
  type BillableUsageStage,
} from "./billableUsageAggregation.js";
import {
  applyNativeResumeFastPathInstruction,
  countTools,
  ensureClientSafeToolCallIdsOnCompletion,
  extractCompletedToolSignatures,
  extractHistoricalToolCallIds,
  extractResponseToolCallMeta,
  filterNovelToolCallsOnCompletion,
  shouldApplyNativeResumeFastPath,
  summarizeRoleCounts,
  toolChoiceKind,
  validateCursorToolTranscript,
} from "./cursorToolProtocol.js";
import {
  isGemini25FlashNonStreamStreamFallbackPath,
  isGemini25FlashStreamFallbackEligible,
} from "./gemini25FlashNonStreamStreamFallback.js";
import {
  releaseGlobalUpstream,
  tryAcquireGlobalUpstream,
} from "../gateway/concurrency.js";
import {
  acquireHeavyResponsesPermit,
  type HeavyQueueAcquireResult,
} from "../gateway/heavyResponsesQueue.js";
import {
  assertCreditPeriodLimits,
  assertTokenBudget,
  isUnlimitedBillingUser,
  logUnlimitedBillingGranted,
  resolveMaxOutputTokens,
} from "../gateway/keySafetyLimits.js";
import {
  assertTrialQuotaGuards,
  logCommercialRequestTrace,
  TRIAL_QUOTA_ERROR_CODES,
} from "../gateway/trialQuotaGuard.js";
import { logGatewayOverloaded } from "../routes/chatGatewayLogs.js";
import {
  lookupBillingIdempotency,
  recordSuccessfulUsageAndDebit as persistSuccessfulUsageAndDebit,
} from "./usageBilling.js";
import { resolveUpstreamTimeoutPolicy } from "./upstreamTimeoutPolicy.js";
import {
  buildFailureRoutingEvidence,
  buildSuccessRoutingEvidence,
  mergeTokfaiRouting,
  routingEvidenceSnapshot,
  routingEvidenceToLogFields,
  type TokfaiRoutingEvidence,
} from "./routingEvidence.js";

/**
 * Client fields that must NEVER influence billing or tenant resolution.
 * Server derives tenant/user/plan/balance from the verified API key / JWT only.
 */
const FORBIDDEN_CLIENT_BILLING_KEYS = [
  "tenant_id",
  "price",
  "credits",
  "cost",
  "credits_charged",
  "resolved_model",
  "bypass_billing",
  "unlimited",
  "free",
] as const;

/**
 * Cherry / AI SDK often send null or stringified numbers for unset optionals.
 * Coerce when possible; strip unrecognized values instead of 400ing the client.
 */
function coerceOptionalFiniteNumberInput(v: unknown): unknown {
  if (v === null || v === undefined || v === "") return undefined;
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function coerceOptionalPositiveIntInput(v: unknown): unknown {
  if (v === null || v === undefined || v === "") return undefined;
  let n: number | undefined;
  if (typeof v === "number" && Number.isFinite(v)) n = v;
  else if (typeof v === "string" && v.trim() !== "") {
    const parsed = Number(v);
    if (Number.isFinite(parsed)) n = parsed;
  }
  if (n === undefined) return undefined;
  const i = Math.trunc(n);
  // Non-positive → strip (Cherry may send 0); do not hard-400.
  return i > 0 ? i : undefined;
}

const optionalFiniteNumber = z.preprocess(
  coerceOptionalFiniteNumberInput,
  z.number().finite().optional()
);

const optionalPositiveInt = z.preprocess(
  coerceOptionalPositiveIntInput,
  z.number().int().positive().optional()
);

const optionalBoolean = z.preprocess((v) => {
  if (v === null || v === "") return undefined;
  if (v === "true" || v === 1) return true;
  if (v === "false" || v === 0) return false;
  if (typeof v === "boolean") return v;
  // Unrecognized stream values → omit (default non-stream) rather than 400.
  return undefined;
}, z.boolean().optional());

export const ChatMessageSchema = z
  .object({
    role: z.string().min(1),
    /** string | content-parts array | null — normalized before upstream. */
    content: z.unknown().optional(),
  })
  .passthrough();

export const ChatCompletionRequestSchema = z
  .object({
    model: z.preprocess(
      (v) => (v === null || v === "" ? undefined : v),
      z.string().min(1).optional()
    ),
    messages: z.array(ChatMessageSchema).min(1),
    temperature: optionalFiniteNumber,
    top_p: optionalFiniteNumber,
    max_tokens: optionalPositiveInt,
    max_completion_tokens: optionalPositiveInt,
    presence_penalty: optionalFiniteNumber,
    frequency_penalty: optionalFiniteNumber,
    stop: z.unknown().optional(),
    tools: z.unknown().optional(),
    tool_choice: z.unknown().optional(),
    parallel_tool_calls: optionalBoolean,
    response_format: z.unknown().optional(),
    metadata: z.unknown().optional(),
    user: z.preprocess(
      (v) => (v === null || v === "" ? undefined : v),
      z.string().optional()
    ),
    /** OpenAI SDK / Cherry compat — accepted, not forwarded upstream. */
    stream_options: z.unknown().optional(),
    stream: optionalBoolean,
  })
  .passthrough();

export type ChatCompletionRequestBody = z.infer<
  typeof ChatCompletionRequestSchema
>;

interface ChatCompletionUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

interface ChatCompletionChoice {
  finish_reason?: string | null;
}

interface ChatCompletionResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
}

const UPSTREAM_ERROR_CODES = new Set([
  "upstream_auth_error",
  "upstream_rate_limited",
  "upstream_model_busy",
  "upstream_model_unavailable",
  "model_not_available",
  "model_not_supported",
  "upstream_timeout",
  "upstream_error",
  "all_upstreams_unavailable",
  "gateway_overloaded",
]);

export interface ExecuteChatCompletionInput {
  caller: ChatCaller;
  requestId: string;
  body: ChatCompletionRequestBody;
  route?: string;
  limitKey?: string;
  idempotencyKey?: string | null;
  /** Client asked for SSE; upstream remains non-stream, but idle timeout applies. */
  clientStream?: boolean;
  /**
   * Called after model/credit/budget prechecks succeed and immediately before
   * upstream provider attempts. Used by stream=true to flush the first SSE
   * frame without waiting on the model. Not invoked on precheck failures or
   * idempotent replay. Heavy queue wait (P1001) completes before this hook.
   */
  onAfterPrecheck?: () => void | Promise<void>;
  /** Client disconnect signal — Heavy queue wait aborts when aborted (P1001). */
  abortSignal?: AbortSignal;
}

export type ExecuteChatCompletionResult =
  | {
      ok: true;
      response: Record<string, unknown>;
      creditsCharged: number;
      resolvedModel: string;
      requestedModel: string;
      requestId: string;
    }
  | {
      ok: false;
      errorCode: string;
      errorMessage: string;
      requestId: string;
      httpStatus: number;
      /** Optional Retry-After seconds for Heavy queue capacity errors (P1001). */
      retryAfterSeconds?: number;
      suggestedModels?: string[];
      /** P984 — client-safe routing / billing evidence for error tokfai. */
      routing?: TokfaiRoutingEvidence;
    };

export async function executeChatCompletion(
  input: ExecuteChatCompletionInput
): Promise<ExecuteChatCompletionResult> {
  const startedAt = Date.now();
  const { caller, requestId } = input;
  const route = input.route ?? "/v1/chat/completions";
  const limitKey = input.limitKey ?? caller.apiKeyId ?? `user:${caller.userId}`;
  const clientStream = input.clientStream === true;

  // Never trust client billing / tenant overrides — strip before any use.
  const body = stripClientBillingOverrides(input.body);

  const requestedRaw = (body.model || env.BOT_MODEL).trim();
  const resolvedRequest = resolveChatModel(requestedRaw);
  /** Internal catalog / alias id after consumer compatibility rewrite. */
  const requestedModel = resolvedRequest.canonicalId;

  const makeFailRouting = (opts?: {
    errorCode?: string | null;
    attemptedModels?: string[];
    resolvedModel?: string | null;
    fallbackAttempts?: number;
    fallbackReason?: string | null;
  }): TokfaiRoutingEvidence =>
    buildFailureRoutingEvidence({
      requestId,
      requestedRaw,
      canonicalId: requestedModel,
      isAlias: resolvedRequest.isAlias,
      resolvedModel: opts?.resolvedModel ?? null,
      attemptedModels:
        opts?.attemptedModels ??
        (resolvedRequest.attempts.length > 0
          ? resolvedRequest.attempts
          : [requestedModel]),
      fallbackAttempts: opts?.fallbackAttempts,
      latencyMs: Date.now() - startedAt,
      fallbackReason: opts?.fallbackReason ?? opts?.errorCode ?? null,
      errorCode: opts?.errorCode ?? null,
    });

  let timeoutPolicy = resolveUpstreamTimeoutPolicy({
    route,
    requestedModel: requestedRaw,
    resolvedModel: requestedModel,
    body,
    clientStream,
  });

  log.info("upstream_timeout_policy", {
    ...routingEvidenceToLogFields(
      makeFailRouting({ attemptedModels: resolvedRequest.attempts }),
      {
        route,
        status: null,
        providerId: null,
        providerLabel: null,
        upstreamStatus: null,
        upstreamErrorCode: null,
      }
    ),
    tier: timeoutPolicy.tier,
    isHeavy: timeoutPolicy.isHeavy,
    timeoutMs: timeoutPolicy.upstreamTimeoutMs,
    idleTimeoutMs: timeoutPolicy.idleTimeoutMs,
    totalTimeoutMs: timeoutPolicy.totalTimeoutMs,
    reason: timeoutPolicy.reason,
    clientStream,
    // Policy log is pre-attempt; not a billing event.
    billing_status: "not_billable",
    credits_charged: 0,
  });

  if (
    requestedRaw !== requestedModel ||
    resolvedRequest.normalized !== requestedModel
  ) {
    log.info("model_resolved", {
      route,
      requestId,
      requestedModel: requestedRaw,
      normalizedModel: resolvedRequest.normalized,
      resolvedModel: requestedModel,
      isAlias: resolvedRequest.isAlias,
      attempts: resolvedRequest.attempts,
    });
  }

  // Image/media models must use POST /v1/images/generations — never chat/responses.
  // No fallback into text providers; not_billable (failed usage log only, no debit).
  if (isImageModel(requestedRaw) || isImageModel(requestedModel)) {
    const suggestedModels = await listAvailableChatModelIds();
    const errorCode = IMAGE_MODEL_NOT_FOR_CHAT_CODE;
    const errorMessage =
      "Image models cannot be used on /v1/chat/completions. Use POST /v1/images/generations.";

    log.warn("image_model_not_for_chat", {
      code: IMAGE_MODEL_NOT_FOR_CHAT_CODE,
      route,
      requestId,
      requestedModel: requestedRaw,
      normalizedModel: resolvedRequest.normalized,
      resolvedModel: requestedModel,
      reason: "image_capability_isolation",
      billing_status: "not_billable",
      supportedModels: suggestedModels,
    });

    const routing = makeFailRouting({
      errorCode,
      fallbackReason: "image_capability_isolation",
    });

    await writeUsageLog(
      failedUsageLog({
        user_id: caller.userId,
        api_key_id: caller.apiKeyId,
        tenant_id: caller.tenantId,
        model: requestedRaw,
        status: "failed",
        request_id: requestId,
        error_code: errorCode,
        error_message: errorMessage,
        latency_ms: Date.now() - startedAt,
        billing_status: "not_billable",
        billable: false,
        credits_charged: 0,
      }),
      route,
      routingEvidenceSnapshot(routing)
    );

    return {
      ok: false,
      errorCode,
      errorMessage,
      requestId,
      httpStatus: 400,
      suggestedModels,
      routing,
    };
  }

  if (!(await isModelAllowedForChat(requestedRaw))) {
    const suggestedModels = await listAvailableChatModelIds();
    const errorCode = MODEL_NOT_AVAILABLE_CODE;
    const errorMessage = formatModelNotRegisteredMessage(requestedRaw);

    log.warn("model_not_available", {
      code: MODEL_NOT_AVAILABLE_CODE,
      route,
      requestId,
      requestedModel: requestedRaw,
      normalizedModel: resolvedRequest.normalized,
      resolvedModel: requestedModel,
      supportedModels: suggestedModels,
      billing_status: "not_billable",
      credits_charged: 0,
    });

    const routing = makeFailRouting({ errorCode });

    await writeUsageLog(
      failedUsageLog({
        user_id: caller.userId,
        api_key_id: caller.apiKeyId,
        tenant_id: caller.tenantId,
        model: requestedRaw,
        status: "failed",
        request_id: requestId,
        error_code: errorCode,
        error_message: errorMessage,
        latency_ms: Date.now() - startedAt,
        billing_status: "not_billable",
        billable: false,
        credits_charged: 0,
      }),
      route,
      routingEvidenceSnapshot(routing)
    );

    return {
      ok: false,
      errorCode,
      errorMessage,
      requestId,
      httpStatus: 400,
      suggestedModels,
      routing,
    };
  }

  if (!(await isModelEnabledForTenant(caller.tenantId, requestedModel))) {
    const errorCode = "model_disabled_for_tenant";
    const errorMessage = `Model is not available on this site: ${requestedRaw}`;
    const routing = makeFailRouting({ errorCode });

    await writeUsageLog(
      failedUsageLog({
        user_id: caller.userId,
        api_key_id: caller.apiKeyId,
        tenant_id: caller.tenantId,
        model: requestedRaw,
        status: "failed",
        request_id: requestId,
        error_code: errorCode,
        error_message: errorMessage,
        latency_ms: Date.now() - startedAt,
        billing_status: "not_billable",
        billable: false,
        credits_charged: 0,
      }),
      route,
      routingEvidenceSnapshot(routing)
    );

    return {
      ok: false,
      errorCode,
      errorMessage,
      requestId,
      httpStatus: 403,
      routing,
    };
  }

  const isAlias = resolvedRequest.isAlias;
  const rawAttempts = resolvedRequest.attempts;
  let attempts = isAlias
    ? await filterAttemptsByCircuitBreaker(rawAttempts)
    : rawAttempts;

  if (isAlias) {
    const listed: string[] = [];
    for (const attemptModel of attempts) {
      if (await isModelAllowedForChat(attemptModel)) {
        listed.push(attemptModel);
      }
    }
    attempts = listed;
  }

  if (isAlias && attempts.length === 0) {
    const err = allUpstreamsUnavailableError();
    const routing = await logChatFailure({
      caller,
      requestId,
      requestedModel,
      requestedRaw,
      isAlias,
      attemptedModels: [],
      startedAt,
      err,
      route,
    });
    return failureResult(err, requestId, requestedModel, routing);
  }

  // P974/P1019/P1027 — tools routing.
  // Alias (auto-pro / gpt-5-pro / …): capability is decided by concrete
  // attempts via resolveToolsCapableAttempts — never by alias id alone.
  // Direct models keep an explicit verifiedRequested gate.
  // P1027: non-empty tools ⇒ supportsToolsRequested=true; missing/null
  // tool_choice ≡ auto (not "tools not requested"); do not strip tools
  // solely because tool_choice is absent.
  const hasTools = requestHasTools(body);
  const supportsToolsRequested = requestHasNonEmptyTools(body);
  const strictToolCallRequest = isStrictToolCallRequest(body);
  const verifiedRequested =
    isVerifiedToolCapableModel(requestedRaw) ||
    isVerifiedToolCapableModel(requestedModel);
  let toolsFallbackApplied = false;
  let toolsDegradedToChat = false;
  let upstreamBodySource: ChatCompletionRequestBody = body;

  if (hasTools) {
    const attemptChain =
      attempts.length > 0 ? attempts : [requestedModel];

    // Alias → resolve concrete tool-capable attempts (no global fallback inject).
    // Direct → keep verifiedRequested as the primary gate; when verified,
    // still reorder/filter via resolveToolsCapableAttempts.
    const toolsResolved = isAlias
      ? resolveToolsCapableAttempts({
          requestedModel: requestedRaw,
          attempts: attemptChain,
          allowGlobalFallback: false,
        })
      : verifiedRequested
        ? resolveToolsCapableAttempts({
            requestedModel: requestedRaw,
            attempts: attemptChain,
          })
        : null;

    const concreteToolAttemptsAvailable =
      toolsResolved != null && toolsResolved.attempts.length > 0;

    if (strictToolCallRequest && !concreteToolAttemptsAvailable) {
      const errorCode = MODEL_NOT_TOOL_CAPABLE_CODE;
      const errorMessage = MODEL_NOT_TOOL_CAPABLE_MESSAGE;
      const suggestedModels = toolsCapableSuggestions().filter((id) =>
        isVerifiedToolCapableModel(id)
      );
      log.warn("model_not_tool_capable", {
        code: errorCode,
        ...routingEvidenceToLogFields(
          makeFailRouting({
            errorCode,
            attemptedModels: attemptChain,
            fallbackReason: "model_not_tool_capable",
          }),
          {
            route,
            status: 400,
            attemptedModel: attemptChain[0] ?? requestedModel,
            providerId: null,
            providerLabel: null,
            upstreamStatus: null,
            upstreamErrorCode: null,
          }
        ),
        supportsTools: false,
        hasTools: true,
        supportsToolsRequested,
        toolChoice: toolChoiceSummary(body),
        requireToolCall: clientRequiresToolCall(body),
        strictToolCall: true,
        isAlias,
        verifiedRequested,
        bodyKeys: chatBodyKeysForLog(body),
      });
      const routing = makeFailRouting({
        errorCode,
        attemptedModels: attemptChain,
        fallbackReason: "model_not_tool_capable",
      });
      await writeUsageLog(
        failedUsageLog({
          user_id: caller.userId,
          api_key_id: caller.apiKeyId,
          tenant_id: caller.tenantId,
          model: requestedRaw,
          status: "failed",
          request_id: requestId,
          error_code: errorCode,
          error_message: errorMessage,
          latency_ms: Date.now() - startedAt,
          billing_status: "not_billable",
          billable: false,
          credits_charged: 0,
        }),
        route,
        routingEvidenceSnapshot(routing)
      );
      return {
        ok: false,
        errorCode,
        errorMessage,
        requestId,
        httpStatus: 400,
        ...(suggestedModels.length ? { suggestedModels } : {}),
        routing,
      };
    }

    if (!strictToolCallRequest && !concreteToolAttemptsAvailable) {
      // tool_choice:auto (incl. missing/null) with no concrete capable
      // attempt → ordinary chat. Unsupported/image keep this degrade path.
      toolsDegradedToChat = true;
      upstreamBodySource = stripToolsFromChatBody(
        body as Record<string, unknown>
      ) as ChatCompletionRequestBody;
      log.info("chat_tools_degraded_to_chat", {
        requestId,
        route,
        requestedModel: requestedRaw,
        resolvedModel: requestedModel,
        hasTools: true,
        supportsToolsRequested,
        toolChoice: toolChoiceSummary(body),
        autoNoToolCall: true,
        supportsTools: false,
        isAlias,
        verifiedRequested,
      });
    } else if (concreteToolAttemptsAvailable && toolsResolved) {
      toolsFallbackApplied = toolsResolved.fallbackApplied;
      attempts = toolsResolved.attempts;
      log.info("chat_tools_capability", {
        requestId,
        route,
        requestedModel: requestedRaw,
        resolvedModel: requestedModel,
        attemptedModel: attempts[0] ?? null,
        supportsTools: toolsResolved.supportsTools,
        supportsToolsRequested,
        hasTools: true,
        toolChoice: toolChoiceSummary(body),
        bodyKeys: chatBodyKeysForLog(body),
        toolsFallbackApplied,
        isAlias,
        attempts,
      });
    }
  } else {
    log.info("chat_request_capability", {
      requestId,
      route,
      requestedModel: requestedRaw,
      resolvedModel: requestedModel,
      supportsTools: verifiedRequested,
      supportsToolsRequested: false,
      hasTools: false,
      toolChoice: toolChoiceSummary(body),
      bodyKeys: chatBodyKeysForLog(body),
    });
  }

  // P1031/P1033/P1046 — Cursor protocol telemetry + role=tool transcript
  // validation. Historical toolMessageCount ≠ resumeToolRound; only a trailing
  // contiguous role=tool block mapped to the nearest assistant.tool_calls
  // sets resumeToolRound (waiting for assistant continuation).
  const toolTranscript = validateCursorToolTranscript(
    (body as { messages?: unknown }).messages
  );
  const roundTrip = toolTranscript.analysis;
  const resumeToolRound =
    toolTranscript.ok && toolTranscript.resumeToolRound === true;
  const trailingToolMessageCount = toolTranscript.trailingToolMessageCount;

  if (supportsToolsRequested || roundTrip.toolMessageCount > 0) {
    const parallelRaw = (body as { parallel_tool_calls?: unknown })
      .parallel_tool_calls;
    log.info("cursor_tool_request_received", {
      requestId,
      route,
      requestedModel: requestedRaw,
      resolvedModel: requestedModel,
      stream: clientStream,
      toolsCount: countTools((body as { tools?: unknown }).tools),
      toolChoiceKind: toolChoiceKind(
        (body as { tool_choice?: unknown }).tool_choice
      ),
      parallelToolCalls:
        typeof parallelRaw === "boolean" ? parallelRaw : null,
      messageCount: roundTrip.messageCount,
      roleCounts: summarizeRoleCounts(
        (body as { messages?: unknown }).messages
      ),
      incomingToolMessageCount: roundTrip.toolMessageCount,
      trailingToolMessageCount,
      incomingToolCallIdMaxLength: roundTrip.incomingToolCallIdMaxLength,
      hasTools,
      supportsToolsRequested,
      resumeToolRound,
    });
  }
  if (roundTrip.toolMessageCount > 0) {
    log.info("cursor_tool_round2_received", {
      requestId,
      route,
      toolMessageCount: roundTrip.toolMessageCount,
      trailingToolMessageCount,
      toolCallIds: roundTrip.toolCallIds.slice(0, 32),
      mappedToolCallIds: roundTrip.mappedToolCallIds.slice(0, 32),
      unmatchedToolCallIdCount: roundTrip.unmatchedToolCallIdCount,
      messageCount: roundTrip.messageCount,
      resumeToolRound,
      duplicateToolResultCount: toolTranscript.duplicateToolResultCount,
      orderViolationCount: toolTranscript.orderViolationCount,
    });
  }

  // P1033 — reject illegal tool transcripts before any provider fetch.
  if (!toolTranscript.ok) {
    const err = ApiError.badRequest(toolTranscript.message, toolTranscript.code);
    const routing = makeFailRouting({
      errorCode: toolTranscript.code,
      attemptedModels: attempts,
      fallbackReason: toolTranscript.code,
    });
    log.warn("cursor_tool_transcript_rejected", {
      requestId,
      route,
      code: toolTranscript.code,
      unmatchedToolCallIdCount: roundTrip.unmatchedToolCallIdCount,
      toolMessageCount: roundTrip.toolMessageCount,
      duplicateToolResultCount: toolTranscript.duplicateToolResultCount,
      orderViolationCount: toolTranscript.orderViolationCount,
      knownAssistantToolCallIdCount: roundTrip.knownAssistantToolCallIdCount,
      billing_status: "not_billable",
      credits_charged: 0,
    });
    await writeUsageLog(
      failedUsageLog({
        user_id: caller.userId,
        api_key_id: caller.apiKeyId,
        tenant_id: caller.tenantId,
        model: requestedRaw,
        status: "failed",
        request_id: requestId,
        error_code: toolTranscript.code,
        error_message: err.publicMessage,
        latency_ms: Date.now() - startedAt,
        billing_status: "not_billable",
        billable: false,
        credits_charged: 0,
      }),
      route,
      routingEvidenceSnapshot(routing)
    );
    return failureResult(err, requestId, requestedModel, routing);
  }

  // P1033 / P1053 — resume routes to:
  //   - native OpenAI tool-transcript models (GPT Golden Path, unchanged), OR
  //   - registered Gemini adapter resume models (P1051 conversion required)
  // Unsupported models still get tool_round_resume_unavailable (gate kept).
  // Raw role=tool must never be forwarded to emulated Gemini without conversion.
  if (resumeToolRound) {
    const resumeAttempts = resolveToolResumeAttempts({
      attempts: attempts.length > 0 ? attempts : [requestedModel],
    });
    if (resumeAttempts.length === 0) {
      const err = new ApiError({
        status: 400,
        message: TOOL_ROUND_RESUME_UNAVAILABLE_MESSAGE,
        publicMessage: TOOL_ROUND_RESUME_UNAVAILABLE_MESSAGE,
        code: TOOL_ROUND_RESUME_UNAVAILABLE_CODE,
        type: "invalid_request_error",
      });
      const routing = makeFailRouting({
        errorCode: TOOL_ROUND_RESUME_UNAVAILABLE_CODE,
        attemptedModels: attempts,
        fallbackReason: TOOL_ROUND_RESUME_UNAVAILABLE_CODE,
      });
      log.warn("cursor_tool_round_resume_unavailable", {
        requestId,
        route,
        requestedModel: requestedRaw,
        resolvedModel: requestedModel,
        attemptedModels: attempts,
        toolMessageCount: roundTrip.toolMessageCount,
        resumeToolRound: true,
        billing_status: "not_billable",
        credits_charged: 0,
      });
      await writeUsageLog(
        failedUsageLog({
          user_id: caller.userId,
          api_key_id: caller.apiKeyId,
          tenant_id: caller.tenantId,
          model: requestedRaw,
          status: "failed",
          request_id: requestId,
          error_code: TOOL_ROUND_RESUME_UNAVAILABLE_CODE,
          error_message: err.publicMessage,
          latency_ms: Date.now() - startedAt,
          billing_status: "not_billable",
          billable: false,
          credits_charged: 0,
        }),
        route,
        routingEvidenceSnapshot(routing)
      );
      return failureResult(err, requestId, requestedModel, routing);
    }
    if (
      resumeAttempts.length !== attempts.length ||
      resumeAttempts[0] !== attempts[0]
    ) {
      log.info("cursor_tool_resume_native_routing", {
        requestId,
        route,
        requestedModel: requestedRaw,
        priorAttempts: attempts,
        nativeResumeAttempts: resolveNativeToolResumeAttempts({
          attempts: attempts.length > 0 ? attempts : [requestedModel],
        }),
        resumeAttempts,
        resumeToolRound: true,
      });
    }
    attempts = resumeAttempts;
    // Resume must keep tools + role=tool transcript (never degrade-to-chat).
    // Gemini adapter path converts the transcript before upstream fetch.
    if (toolsDegradedToChat) {
      toolsDegradedToChat = false;
      upstreamBodySource = body;
      log.info("cursor_tool_resume_undegrade", {
        requestId,
        route,
        resumeToolRound: true,
      });
    }
  }

  if (toolsDegradedToChat) {
    timeoutPolicy = resolveUpstreamTimeoutPolicy({
      route,
      requestedModel: requestedRaw,
      resolvedModel: requestedModel,
      body: upstreamBodySource,
      clientStream,
    });
  }

  // P1024 — validate object tool_choice before any provider call.
  let forcedToolName: string | null = null;
  if (hasTools && !toolsDegradedToChat) {
    const forced = resolveForcedToolChoice({
      toolChoice: body.tool_choice,
      tools: body.tools,
    });
    if (forced.kind === "invalid") {
      const err = forcedToolChoiceClientError(forced.reason);
      const errorCode = err.code ?? TOOL_NAME_NOT_ALLOWED_CODE;
      const errorMessage = err.publicMessage;
      const routing = makeFailRouting({
        errorCode,
        attemptedModels: attempts,
        fallbackReason: "invalid_tool_choice",
      });
      log.warn("forced_tool_choice_invalid", {
        requestId,
        route,
        reason: forced.reason,
        code: errorCode,
        billing_status: "not_billable",
        credits_charged: 0,
      });
      await writeUsageLog(
        failedUsageLog({
          user_id: caller.userId,
          api_key_id: caller.apiKeyId,
          tenant_id: caller.tenantId,
          model: requestedRaw,
          status: "failed",
          request_id: requestId,
          error_code: errorCode,
          error_message: errorMessage,
          latency_ms: Date.now() - startedAt,
          billing_status: "not_billable",
          billable: false,
          credits_charged: 0,
        }),
        route,
        routingEvidenceSnapshot(routing)
      );
      return {
        ok: false,
        errorCode,
        errorMessage,
        requestId,
        httpStatus: err.status,
        routing,
      };
    }
    if (forced.kind === "forced") {
      forcedToolName = forced.name;
    }
  }

  if (input.idempotencyKey && caller.apiKeyId) {
    const replay = await lookupBillingIdempotency({
      apiKeyId: caller.apiKeyId,
      idempotencyKey: input.idempotencyKey,
      endpoint: route,
    });

    if (replay?.responseSnapshot) {
      log.info("chat_completion_idempotent_replay", {
        requestId: replay.requestId,
        route,
        idempotencyKey: input.idempotencyKey,
      });

      const snapshot = normalizeOpenAiFinishReasonOnChatCompletion(
        replay.responseSnapshot,
        { route }
      );
      const resolvedModel =
        typeof snapshot.model === "string"
          ? snapshot.model
          : requestedModel;

      return {
        ok: true,
        response: snapshot,
        creditsCharged: replay.creditsCharged,
        resolvedModel,
        requestedModel,
        requestId: replay.requestId || requestId,
      };
    }
  }

  try {
    const unlimited = isUnlimitedBillingUser(caller.userId);
    if (unlimited) {
      logUnlimitedBillingGranted(
        caller.userId,
        "TOKFAI_UNLIMITED_BILLING allowlist (admin/internal test only)",
        requestId
      );
    } else {
      await assertHasCredits(caller.userId);
      await assertCreditPeriodLimits(caller.userId, {
        apiKeyId: caller.apiKeyId,
        keyId: caller.keyId,
        tenantId: caller.tenantId,
      });
      // P982 — per-key trial model allowlist + trial/daily/monthly caps (before upstream).
      await assertTrialQuotaGuards({
        userId: caller.userId,
        apiKeyId: caller.apiKeyId,
        keyId: caller.keyId,
        tenantId: caller.tenantId,
        model: requestedModel,
        requestedRaw,
        requestId,
        route,
      });
    }

    const rawMaxOut =
      body.max_tokens ??
      (typeof body.max_completion_tokens === "number"
        ? body.max_completion_tokens
        : undefined);
    const maxOut = resolveMaxOutputTokens(rawMaxOut);
    // Conservative TPM reservation: prompt estimate + capped completion.
    const estimatedTokens = 1_024 + maxOut;
    await assertTokenBudget(limitKey, estimatedTokens);

    let heavyPermit: HeavyQueueAcquireResult | null = null;
    if (timeoutPolicy.isHeavy) {
      try {
        heavyPermit = await acquireHeavyResponsesPermit({
          limitKey,
          concurrencyLimit: env.TOKFAI_HEAVY_RESPONSES_MAX_CONCURRENCY,
          queueEnabled: env.TOKFAI_HEAVY_QUEUE_ENABLED,
          maxWaitersPerKey: env.TOKFAI_HEAVY_QUEUE_MAX_WAITERS_PER_KEY,
          maxWaitersGlobal: env.TOKFAI_HEAVY_QUEUE_MAX_WAITERS_GLOBAL,
          waitTimeoutMs: env.TOKFAI_HEAVY_QUEUE_WAIT_TIMEOUT_MS,
          signal: input.abortSignal,
          requestId,
          route,
          model: requestedModel,
        });
      } catch (acquireErr) {
        if (acquireErr instanceof ApiError) {
          const routing = await logChatFailure({
            caller,
            requestId,
            requestedModel,
            requestedRaw,
            isAlias,
            attemptedModels: attempts,
            startedAt,
            err: acquireErr,
            route,
            timeoutMs: timeoutPolicy.upstreamTimeoutMs,
          });
          return failureResult(acquireErr, requestId, requestedModel, routing);
        }
        throw acquireErr;
      }
    }

    try {
      // After a queue wait, re-check dynamic limits before SSE / Provider.
      if (heavyPermit?.queued && !unlimited) {
        await assertHasCredits(caller.userId);
        await assertCreditPeriodLimits(caller.userId, {
          apiKeyId: caller.apiKeyId,
          keyId: caller.keyId,
          tenantId: caller.tenantId,
        });
        await assertTrialQuotaGuards({
          userId: caller.userId,
          apiKeyId: caller.apiKeyId,
          keyId: caller.keyId,
          tenantId: caller.tenantId,
          model: requestedModel,
          requestedRaw,
          requestId,
          route,
        });
        // TPM is already reserved before Heavy queue admission.
        // Re-reserving after wait would double-count the same request.
      }

      if (input.onAfterPrecheck) {
        await input.onAfterPrecheck();
      }
      return await runProviderAttempts({
        caller,
        requestId,
        route,
        limitKey,
        body: upstreamBodySource,
        clientBody: body,
        toolsDegradedToChat,
        toolsFallbackApplied,
        supportsToolsRequested,
        resumeToolRound,
        unmatchedToolCallIdCount: roundTrip.unmatchedToolCallIdCount,
        duplicateToolResultCount: toolTranscript.duplicateToolResultCount,
        orderViolationCount: toolTranscript.orderViolationCount,
        forcedToolName,
        requestedRaw,
        requestedModel,
        isAlias,
        attempts,
        startedAt,
        unlimited,
        idempotencyKey: input.idempotencyKey ?? null,
        timeoutPolicy,
        clientStream,
      });
    } finally {
      heavyPermit?.release();
    }
  } catch (err) {
    if (err instanceof ApiError) {
      // P982 / period caps: precheck throws without usage_log — write not_billable row.
      if (
        TRIAL_QUOTA_ERROR_CODES.has(err.code ?? "") ||
        err.code === "daily_limit_exceeded" ||
        err.code === "quota_exceeded" ||
        err.code === "insufficient_credits" ||
        err.code === "daily_credit_limit_exceeded" ||
        err.code === "monthly_credit_limit_exceeded"
      ) {
        await logChatFailure({
          caller,
          requestId,
          requestedModel,
          requestedRaw,
          isAlias,
          attemptedModels: attempts,
          startedAt,
          err,
          route,
        });
        logCommercialRequestTrace({
          phase: "guard",
          requestId,
          route,
          userId: caller.userId,
          apiKeyId: caller.apiKeyId,
          model: requestedModel,
          status: "failed",
          creditsCharged: 0,
          errorCode: err.code ?? null,
        });
      }
      return failureResult(
        err,
        requestId,
        requestedModel,
        makeFailRouting({
          errorCode: err.code,
          attemptedModels: attempts,
        })
      );
    }

    const serverRouting = makeFailRouting({
      errorCode: "server_error",
      attemptedModels: attempts,
    });
    await writeUsageLog(
      failedUsageLog({
        user_id: caller.userId,
        api_key_id: caller.apiKeyId,
        tenant_id: caller.tenantId,
        model: requestedModel,
        status: "failed",
        request_id: requestId,
        error_code: "server_error",
        error_message: "Internal error.",
        latency_ms: Date.now() - startedAt,
        billing_status: "not_billable",
        billable: false,
        credits_charged: 0,
      }),
      route,
      routingEvidenceSnapshot(serverRouting)
    );

    log.error("chat_completion_failed", {
      ...routingEvidenceToLogFields(serverRouting, {
        route,
        status: 500,
        attemptedModel: attempts[0] ?? requestedModel,
        providerId: null,
        providerLabel: null,
        upstreamStatus: null,
        upstreamErrorCode: null,
      }),
      code: "server_error",
      message: "Internal error.",
    });

    return {
      ok: false,
      errorCode: "server_error",
      errorMessage: "Internal error.",
      requestId,
      httpStatus: 500,
      routing: serverRouting,
    };
  }
}

async function runProviderAttempts(args: {
  caller: ChatCaller;
  requestId: string;
  route: string;
  limitKey: string;
  /** Body forwarded upstream (tools may be stripped for P974 auto degrade). */
  body: ChatCompletionRequestBody;
  /** Original client body (for tools / guard logging). */
  clientBody: ChatCompletionRequestBody;
  toolsDegradedToChat: boolean;
  /** P1027 — true only when the capable attempt chain was reordered/injected. */
  toolsFallbackApplied: boolean;
  /** P1027 — true when client sent a non-empty tools array. */
  supportsToolsRequested: boolean;
  /**
   * P1033 — legal role=tool resume transcript. Prefer native providers;
   * skip first-turn AUTO arbitration; never forward raw tool transcript to
   * emulated_json without a compiler.
   * P1036 — may still run ONE Round-N continuation arbitration.
   */
  resumeToolRound: boolean;
  /** P1036 — transcript anti-replay counters (0 on legal resume). */
  unmatchedToolCallIdCount: number;
  duplicateToolResultCount: number;
  orderViolationCount: number;
  /** Client object tool_choice forced function name (P1024), or null. */
  forcedToolName: string | null;
  requestedRaw: string;
  requestedModel: string;
  isAlias: boolean;
  attempts: string[];
  startedAt: number;
  unlimited: boolean;
  idempotencyKey: string | null;
  timeoutPolicy: ReturnType<typeof resolveUpstreamTimeoutPolicy>;
  clientStream: boolean;
}): Promise<ExecuteChatCompletionResult> {
  const {
    caller,
    requestId,
    route,
    limitKey,
    body,
    clientBody,
    toolsDegradedToChat,
    toolsFallbackApplied,
    supportsToolsRequested,
    resumeToolRound,
    unmatchedToolCallIdCount,
    duplicateToolResultCount,
    orderViolationCount,
    forcedToolName,
    requestedRaw,
    requestedModel,
    isAlias,
    attempts,
    startedAt,
    unlimited,
    idempotencyKey,
    timeoutPolicy,
    clientStream,
  } = args;

  let lastError: ApiError | null = null;

  for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex++) {
    const attemptModel = attempts[attemptIndex]!;
    const resolvedProviders = resolveProviderAttempts(attemptModel);
    const {
      providers: providerAttempts,
      skippedDegraded,
      allDegraded,
    } = await filterProvidersByTimeoutCircuit(resolvedProviders, attemptModel);

    if (skippedDegraded.length > 0) {
      log.warn("chat_provider_circuit_skip_degraded", {
        requestId,
        route,
        requestedModel,
        resolvedModel: requestedModel,
        attemptModel,
        skippedProviderIds: skippedDegraded.map((p) => p.id),
        remainingProviderIds: providerAttempts.map((p) => p.id),
        allDegraded,
      });
    }

    if (providerAttempts.length === 0) {
      lastError = allUpstreamsUnavailableError();
      if (isAlias && attemptIndex < attempts.length - 1) {
        continue;
      }
      break;
    }

    // Sole provider already degraded: fail fast with model suggestions —
    // do not wait another ~45s, and do not invent a costlier model switch.
    // Exception: gemini-2.5-flash /v1/chat/completions may still recover via
    // upstream stream=true assemble (same model) — do not fail-fast that path.
    const gemini25FlashStreamFallbackPath =
      isGemini25FlashNonStreamStreamFallbackPath({
        clientStream,
        attemptModel,
        requestedModel,
        route,
      });
    if (
      allDegraded &&
      providerAttempts.length === 1 &&
      !isAlias &&
      !gemini25FlashStreamFallbackPath
    ) {
      const degradedProvider = providerAttempts[0]!;
      const timeoutErr = ApiError.requestTimeout(
        "Upstream provider degraded after consecutive timeouts.",
        "上游模型连续超时，当前供应暂时不可用，请稍后重试或切换其他模型。"
      );
      logProviderTimeoutStats({
        requestId,
        route,
        requestedModel,
        resolvedModel: requestedModel,
        providerId: degradedProvider.id,
        upstreamStatus: 504,
        upstreamErrorCode: "upstream_timeout",
        latencyMs: 0,
        timeoutMs: timeoutPolicy.upstreamTimeoutMs,
        billing_status: "not_billable",
        fallbackSkippedReason: "provider_model_degraded",
      });
      const routing = await logChatFailure({
        caller,
        requestId,
        requestedModel,
      requestedRaw,
      isAlias,
      attemptedModels: attempts,
        startedAt,
        err: timeoutErr,
        route,
        providerId: degradedProvider.id,
        timeoutMs: timeoutPolicy.upstreamTimeoutMs,
      });
      return failureResultWithSuggestions(timeoutErr, requestId, requestedModel, {
            routing,
        suggestSwitchModel: true,
      });
    }

    let modelAttemptFailed = false;

    for (
      let providerIndex = 0;
      providerIndex < providerAttempts.length;
      providerIndex++
    ) {
      const provider = providerAttempts[providerIndex]!;
      const attemptStartedAt = Date.now();

      const remainingTotalMs =
        timeoutPolicy.totalTimeoutMs - (Date.now() - startedAt);
      if (remainingTotalMs <= 0) {
        const timeoutErr = ApiError.requestTimeout();
        if (isAlias && attemptIndex > 0) {
          const exhausted = allUpstreamsUnavailableError();
          const routing = await logChatFailure({
            caller,
            requestId,
            requestedModel,
      requestedRaw,
      isAlias,
      attemptedModels: attempts,
            startedAt,
            err: exhausted,
            lastAttempt: timeoutErr,
            route,
            providerId: provider.id,
            timeoutMs: timeoutPolicy.upstreamTimeoutMs,
          });
          return failureResultWithSuggestions(exhausted, requestId, requestedModel, {
            routing,
            suggestSwitchModel: true,
          });
        }
        const routing = await logChatFailure({
          caller,
          requestId,
          requestedModel,
      requestedRaw,
      isAlias,
      attemptedModels: attempts,
          startedAt,
          err: timeoutErr,
          route,
          providerId: provider.id,
          timeoutMs: timeoutPolicy.upstreamTimeoutMs,
        });
        return failureResultWithSuggestions(timeoutErr, requestId, requestedModel, {
            routing,
            suggestSwitchModel: true,
          });
      }

      if (!(await tryAcquireGlobalUpstream())) {
        const err = ApiError.gatewayOverloaded();
        await logGatewayOverloaded({
          caller,
          requestId,
          err,
          limitKey,
          keyInflight: 0,
          globalInflight: 0,
          requestedModel,
          startedAt,
        });
        const overloadedRouting = buildFailureRoutingEvidence({
          requestId,
          requestedRaw,
          canonicalId: requestedModel,
          isAlias,
          attemptedModels: attempts,
          latencyMs: Date.now() - startedAt,
          errorCode: err.code ?? "gateway_overloaded",
          fallbackReason: "gateway_overloaded",
        });
        return failureResult(err, requestId, requestedModel, overloadedRouting);
      }

      try {
        const hasToolsClient = requestHasTools(clientBody);
        const toolMode: ToolCallingMode =
          hasToolsClient && !toolsDegradedToChat
            ? resolveToolCallingMode(provider.id, attemptModel)
            : "unsupported";

        if (
          hasToolsClient &&
          !toolsDegradedToChat &&
          toolMode === "unsupported"
        ) {
          throw toolIntentApiError(TOOL_EMULATION_UNAVAILABLE_CODE);
        }

        // P1033 — never start a request already in emulated_json with a raw
        // role=tool transcript. P1040 continuation may switch native→emulated
        // only after compileEmulatedResumeTranscript sanitizes history.
        // P1053 — registered Gemini adapter models may resume after P1051
        // conversion (applied at upstream body build below).
        if (
          resumeToolRound &&
          toolMode === "emulated_json" &&
          !isRegisteredGeminiAdapterToolResumeModel(attemptModel)
        ) {
          throw new ApiError({
            status: 400,
            message: TOOL_ROUND_RESUME_UNAVAILABLE_MESSAGE,
            publicMessage: TOOL_ROUND_RESUME_UNAVAILABLE_MESSAGE,
            code: TOOL_ROUND_RESUME_UNAVAILABLE_CODE,
            type: "invalid_request_error",
          });
        }

        // P1020 — active mode may switch native → emulated_json once for
        // controlled repair; reported tool_calling_mode follows the mode that
        // produced the final success (or the last attempt on failure).
        // P1047 — under tool_choice=auto/missing, valid native text or
        // tool_calls is final unless P1048 explicit tool execution intent.
        // Strict/required/named still use ONE controlled emulated_json repair.
        let activeToolMode: ToolCallingMode = toolMode;
        let repairAttempted = false;
        let autoIntentArbitrationAttempted = false;
        let continuationArbitrationAttempted = false;
        let autoIntentArbitrationInFlight = false;
        let continuationArbitrationInFlight = false;
        let savedNativeForArbitration: Record<string, unknown> | null = null;
        // P1055 — at most one native tool_choice repair before emulated_json.
        let nativeToolRepairAttempted = false;
        let nativeToolRepairInFlight = false;
        let nativeToolRepairSucceeded = false;
        let nativeRepairSelection: NativeRepairToolSelection | null = null;
        // P1048 — real toolIntentCompiler result (not hasTools alone).
        const toolIntentDetection = detectExplicitToolExecutionIntent({
          messages: (clientBody as { messages?: unknown }).messages,
          tools: (clientBody as { tools?: unknown }).tools,
        });
        const toolIntentDetected = toolIntentDetection.detected;
        // P1030 — request-scoped billable usage components for this
        // provider/model attempt only (discarded on provider fallback throw).
        const billableUsageComponents: BillableUsageComponent[] = [];
        // Definite assignment: loop always assigns before success path, but
        // closure-based arbitration restore is opaque to tsc control flow.
        let data = null as unknown as ChatCompletionResponse;
        let upstreamId: string | null = null;
        let viaStreamFallback = false;
        let normalizedData: Record<string, unknown> = {};
        let upstreamReturnedToolCalls = false;
        let upstreamBody: Record<string, unknown> = {};

        const pushBillableUsageComponent = (
          stage: BillableUsageStage,
          args: {
            dataUsage: ChatCompletionUsage | undefined;
            requestBody: Record<string, unknown>;
            responseBody: Record<string, unknown>;
          }
        ) => {
          if (hasBillableUsageStage(billableUsageComponents, stage)) return;
          const resolved = resolveChatAttemptUsage({
            providerId: provider.id,
            dataUsage: args.dataUsage,
            requestBody: args.requestBody,
            responseBody: args.responseBody,
          });
          billableUsageComponents.push({
            stage,
            providerId: provider.id,
            attemptedModel: attemptModel,
            billableModel: attemptModel,
            usage: cloneNormalizedUsage(resolved.usage),
          });
        };

        const anyArbitrationInFlight = () =>
          autoIntentArbitrationInFlight || continuationArbitrationInFlight;

        const logAutoArbitration = (fields: {
          arbitrationResult:
            | "tool_calls"
            | "assistant_text"
            | "invalid"
            | "timeout"
            | "transport_failure"
            | "duplicate_replay";
          toolCallCount: number;
          fallbackToOriginalText: boolean;
          kind?: "first_turn" | "continuation";
        }) => {
          const kind =
            fields.kind ??
            (continuationArbitrationAttempted ? "continuation" : "first_turn");
          log.info(
            kind === "continuation"
              ? "cursor_tool_continuation_arbitration"
              : "native_auto_no_tool_intent_arbitration",
            {
              requestId,
              route,
              providerId: provider.id,
              attemptedModel: attemptModel,
              activeToolMode,
              hasTools: hasToolsClient,
              toolChoice: toolChoiceSummary(clientBody),
              arbitrationAttempted: true,
              arbitrationResult: fields.arbitrationResult,
              toolCallCount: fields.toolCallCount,
              fallbackToOriginalText: fields.fallbackToOriginalText,
              resumeToolRound,
              billing_status: "not_billable",
              credits_charged: 0,
              freshRemainingTotalMs: Math.max(
                0,
                timeoutPolicy.totalTimeoutMs - (Date.now() - startedAt)
              ),
            }
          );
        };

        const restoreNativeAfterArbitrationFailure = (result:
          | "invalid"
          | "timeout"
          | "transport_failure"
          | "duplicate_replay") => {
          if (!savedNativeForArbitration) {
            throw new Error(
              "P1028/P1036: missing saved native response for arbitration fallback"
            );
          }
          normalizedData = savedNativeForArbitration;
          upstreamReturnedToolCalls = responseHasToolCalls(normalizedData);
          activeToolMode = "native";
          autoIntentArbitrationInFlight = false;
          continuationArbitrationInFlight = false;
          logAutoArbitration({
            arbitrationResult: result,
            toolCallCount: 0,
            fallbackToOriginalText: true,
          });
        };

        // Emulated path may do one same-provider repair retry (no debit yet).
        // Native strict may do one controlled emulated_json repair (P1020).
        // Native auto may do one intent arbitration (P1028).
        // P1019 — recompute remaining budget every loop iteration (including repair).
        let lastFreshRemainingTotalMs = remainingTotalMs;
        for (;;) {
          const freshRemainingTotalMs =
            timeoutPolicy.totalTimeoutMs - (Date.now() - startedAt);
          lastFreshRemainingTotalMs = freshRemainingTotalMs;
          if (freshRemainingTotalMs <= 0) {
            throw ApiError.requestTimeout();
          }

          upstreamBody = buildUpstreamChatBody(body, attemptModel);
          if (activeToolMode === "emulated_json") {
            // P1040 — continuation arbitration only: sanitize Cursor tool
            // transcript to plain-text context before emulated_json compile.
            // First-turn P1028 / P1020 repair keep compileEmulatedUpstreamBody.
            // P1048 — explicit tool-intent repair forces required tool_choice
            // so the second provider pass must emit legal tool_calls.
            // P1049 — incomplete multi-step continuation also forces required
            // for exactly one resume repair (still capped at one per HTTP).
            // P1053 — Gemini adapter resume: convert OpenAI tool transcript via
            // P1051 before emulated compile (never send raw role=tool).
            const forceRequiredToolIntent =
              (autoIntentArbitrationInFlight && toolIntentDetected) ||
              continuationArbitrationInFlight;
            const compileClientBody = forceRequiredToolIntent
              ? {
                  ...(clientBody as Record<string, unknown>),
                  tool_choice: "required",
                }
              : (clientBody as Record<string, unknown>);
            if (
              resumeToolRound &&
              isRegisteredGeminiAdapterToolResumeModel(attemptModel)
            ) {
              const adapted =
                applyGeminiAdapterToolResumeToUpstreamChatBody(upstreamBody);
              upstreamBody = adapted.body;
              if (adapted.converted) {
                log.info("gemini_adapter_tool_resume_converted", {
                  requestId,
                  route,
                  providerId: provider.id,
                  attemptModel,
                  resumeToolRound: true,
                  geminiAdapterResumeConverted: true,
                  billing_status: "not_billable",
                  credits_charged: 0,
                });
              }
              upstreamBody = compileEmulatedUpstreamBody(
                upstreamBody,
                compileClientBody,
                {
                  repair:
                    repairAttempted || forceRequiredToolIntent,
                }
              );
            } else if (
              resumeToolRound &&
              continuationArbitrationInFlight
            ) {
              upstreamBody = compileEmulatedResumeTranscript(
                upstreamBody,
                compileClientBody,
                {
                  repair:
                    repairAttempted || forceRequiredToolIntent,
                }
              );
            } else {
              upstreamBody = compileEmulatedUpstreamBody(
                upstreamBody,
                compileClientBody,
                {
                  repair:
                    repairAttempted || forceRequiredToolIntent,
                }
              );
            }
          } else if (
            nativeToolRepairInFlight &&
            nativeRepairSelection &&
            activeToolMode === "native"
          ) {
            // P1055 — request-scoped native repair clone only (never clientBody).
            const repaired = applyNativeToolRepairToUpstreamBody({
              upstreamBody,
              selection: nativeRepairSelection,
              providerId: provider.id,
            });
            upstreamBody = repaired.body;
          } else if (
            shouldAdaptGrsaiNativeObjectToolChoice({
              providerId: provider.id,
              toolCallingMode: activeToolMode,
              forcedToolName,
            })
          ) {
            // P1024 — GRSAI rejects object tool_choice; adapt a copy only.
            const adapted = adaptGrsaiNativeForcedToolChoiceBody(
              upstreamBody,
              forcedToolName!
            );
            upstreamBody = adapted.body;
            log.info("grsai_native_tool_choice_object_adapted", {
              requestId,
              route,
              providerId: provider.id,
              attemptModel,
              toolChoiceObjectAdapted: true,
              forcedToolName: adapted.forcedToolName,
              outboundToolCount: adapted.outboundToolCount,
            });
          }

          // P1043 — Native Resume Fast Path: request-scoped upstream copy only.
          // Does not mutate clientBody / original transcript; does not force tools.
          if (
            shouldApplyNativeResumeFastPath({
              resumeToolRound,
              activeToolMode,
              hasToolsClient,
              toolChoice: (clientBody as { tool_choice?: unknown }).tool_choice,
            })
          ) {
            const fastPath = applyNativeResumeFastPathInstruction(upstreamBody);
            upstreamBody = fastPath.body;
            log.info("native_resume_fastpath_instruction_applied", {
              requestId,
              route,
              providerId: provider.id,
              attemptModel,
              activeToolMode,
              resumeToolRound,
              nativeResumeFastPathApplied: true,
              billing_status: "not_billable",
              credits_charged: 0,
            });
          }

          if (
            attemptIndex === 0 &&
            !repairAttempted &&
            !autoIntentArbitrationAttempted
          ) {
            const droppedKeys = droppedUpstreamChatKeysForAudit(
              clientBody as Record<string, unknown>
            );
            if (droppedKeys.length > 0) {
              log.info("upstream_chat_body_keys_dropped", {
                requestId,
                route,
                droppedKeys: droppedKeys.slice(0, 40),
                droppedKeyCount: droppedKeys.length,
              });
            }
          }

          const perAttemptTimeoutMs = Math.min(
            timeoutPolicy.upstreamTimeoutMs,
            freshRemainingTotalMs
          );

          const useGemini25FlashStreamFallback =
            isGemini25FlashNonStreamStreamFallbackPath({
              clientStream,
              attemptModel,
              requestedModel,
              route,
            });

          const idleTimeoutMs =
            clientStream && !useGemini25FlashStreamFallback
              ? Math.min(timeoutPolicy.idleTimeoutMs, freshRemainingTotalMs)
              : undefined;

          const logCtx = {
            requestId,
            route,
            model: attemptModel,
            requestedModel,
            resolvedModel: requestedModel,
            providerId: provider.id,
          };

          // P1043 / P1055 — stage timing for native / native-repair / arbitration.
          const resolveProviderFetchStage = ():
            | "native"
            | "native_repair"
            | "first_turn_arbitration"
            | "continuation_arbitration"
            | "repair" => {
            if (continuationArbitrationInFlight) {
              return "continuation_arbitration";
            }
            if (autoIntentArbitrationInFlight) {
              return "first_turn_arbitration";
            }
            if (nativeToolRepairInFlight && activeToolMode === "native") {
              return "native_repair";
            }
            if (repairAttempted && activeToolMode === "emulated_json") {
              return "repair";
            }
            return "native";
          };
          const logProviderFetchStageTiming = (
            stage:
              | "native"
              | "native_repair"
              | "first_turn_arbitration"
              | "continuation_arbitration"
              | "repair",
            stageStartedAt: number
          ) => {
            const elapsedMs = Date.now() - stageStartedAt;
            const fields: Record<string, unknown> = {
              requestId,
              route,
              providerId: provider.id,
              attemptModel,
              activeToolMode,
              resumeToolRound,
              stage,
              elapsedMs,
              freshRemainingTotalMs: Math.max(
                0,
                timeoutPolicy.totalTimeoutMs - (Date.now() - startedAt)
              ),
              billing_status: "not_billable",
              credits_charged: 0,
            };
            if (stage === "native") fields.native_elapsed_ms = elapsedMs;
            if (stage === "native_repair") {
              fields.native_repair_elapsed_ms = elapsedMs;
            }
            if (stage === "continuation_arbitration") {
              fields.continuation_arbitration_elapsed_ms = elapsedMs;
            }
            if (stage === "first_turn_arbitration") {
              fields.first_turn_arbitration_elapsed_ms = elapsedMs;
            }
            if (stage === "repair") fields.repair_elapsed_ms = elapsedMs;
            log.info("provider_fetch_stage_timing", fields);
          };

          const fetchStage = resolveProviderFetchStage();
          const stageStartedAt = Date.now();
          try {
            if (useGemini25FlashStreamFallback) {
              // Never invent budget above the fresh remaining total.
              if (freshRemainingTotalMs <= 0) {
                throw ApiError.requestTimeout(
                  "Upstream provider timed out.",
                  "上游模型响应超时，请稍后重试或切换模型。"
                );
              }
              if (freshRemainingTotalMs <= 5_000 && allDegraded && clientStream) {
                throw ApiError.requestTimeout(
                  "Upstream provider timed out.",
                  "上游模型响应超时，请稍后重试或切换模型。"
                );
              }
              const streamWallMs = Math.min(
                freshRemainingTotalMs,
                Math.max(1, freshRemainingTotalMs)
              );
              const streamIdleMs = Math.min(
                timeoutPolicy.idleTimeoutMs,
                streamWallMs,
                freshRemainingTotalMs
              );
              const nativeTimeoutMs = Math.min(
                freshRemainingTotalMs,
                clientStream
                  ? Math.min(20_000, perAttemptTimeoutMs)
                  : perAttemptTimeoutMs
              );
              const nativeNonStreamAvailable = !(allDegraded && clientStream);

              log.info("chat_gemini25_flash_prefer_native_nonstream", {
                requestId,
                route,
                requestedModel,
                attemptModel,
                providerId: provider.id,
                clientStream,
                nativeNonStreamAvailable,
                nativeTimeoutMs,
                streamWallMs,
                streamIdleMs,
                freshRemainingTotalMs,
                repairAttempted,
                billing_status: "not_billable",
              });

              const fetched =
                await providerFetchChatPreferNativeNonStream<ChatCompletionResponse>(
                  provider,
                  provider.chatPath,
                  {
                    method: "POST",
                    json: upstreamBody,
                    timeoutMs: nativeTimeoutMs,
                    nativeNonStreamAvailable,
                    allowStreamAssembleFallback: true,
                    isStreamAssembleEligible:
                      isGemini25FlashStreamFallbackEligible,
                    streamAssembleTimeoutMs: streamWallMs,
                    streamAssembleIdleTimeoutMs: streamIdleMs,
                  },
                  logCtx
                );
              if (fetched.viaStreamAssemble) {
                log.warn("chat_gemini25_flash_nonstream_stream_fallback", {
                  requestId,
                  route,
                  requestedModel,
                  attemptModel,
                  providerId: provider.id,
                  reason: nativeNonStreamAvailable
                    ? "native_nonstream_failed"
                    : "native_nonstream_unavailable",
                  clientStream,
                  billing_status: "not_billable",
                  remainingMs: freshRemainingTotalMs,
                  streamWallMs,
                  streamIdleMs,
                });
              }
              data = fetched.data;
              upstreamId = fetched.upstreamId;
              viaStreamFallback = fetched.viaStreamAssemble;
            } else {
              log.info("chat_provider_attempt_budget", {
                requestId,
                route,
                providerId: provider.id,
                attemptModel,
                repairAttempted,
                freshRemainingTotalMs,
                perAttemptTimeoutMs,
                idleTimeoutMs: idleTimeoutMs ?? null,
                billing_status: "not_billable",
              });
              const fetched = await providerFetch<ChatCompletionResponse>(
                provider,
                provider.chatPath,
                {
                  method: "POST",
                  json: upstreamBody,
                  timeoutMs: perAttemptTimeoutMs,
                  ...(idleTimeoutMs != null ? { idleTimeoutMs } : {}),
                },
                logCtx
              );
              data = fetched.data;
              upstreamId = fetched.upstreamId;
            }
          } catch (fetchErr) {
            logProviderFetchStageTiming(fetchStage, stageStartedAt);
            // P1055 — native repair transport/timeout: one shot only, then
            // fall through to existing emulated repair when budget remains.
            if (
              nativeToolRepairInFlight &&
              savedNativeForArbitration &&
              fetchErr instanceof ApiError
            ) {
              nativeToolRepairInFlight = false;
              const remainingAfterFetch =
                timeoutPolicy.totalTimeoutMs - (Date.now() - startedAt);
              const isTotalTimeout =
                remainingAfterFetch <= 0 ||
                fetchErr.upstreamErrorSnippet === "total_request_timeout";
              log.info("auto_tool_native_repair_failed", {
                requestId,
                providerId: provider.id,
                attemptedModel: attemptModel,
                reason: isTotalTimeout
                  ? "total_timeout"
                  : fetchErr.code === "upstream_timeout"
                    ? "upstream_timeout"
                    : "transport_failure",
                freshRemainingTotalMs: Math.max(0, remainingAfterFetch),
                billing_status: "not_billable",
                credits_charged: 0,
              });
              if (isTotalTimeout) {
                throw fetchErr instanceof ApiError &&
                  fetchErr.code === "upstream_timeout"
                  ? fetchErr
                  : ApiError.requestTimeout();
              }
              if (
                canNativeEmulatedRepair(provider.id, attemptModel) &&
                remainingAfterFetch > 0
              ) {
                autoIntentArbitrationAttempted = true;
                autoIntentArbitrationInFlight = true;
                activeToolMode = "emulated_json";
                log.info("auto_tool_intent_repair_triggered", {
                  requestId,
                  route,
                  requestedModel: requestedRaw,
                  attemptedModel: attemptModel,
                  resumeToolRound,
                  toolChoiceKind: toolChoiceKind(
                    (clientBody as { tool_choice?: unknown }).tool_choice
                  ),
                  toolIntentDetected: true,
                  nativeFinishReason: "stop",
                  reason: "native_repair_transport_fallback",
                  billing_status: "not_billable",
                  credits_charged: 0,
                });
                continue;
              }
              restoreNativeAfterArbitrationFailure(
                fetchErr.code === "upstream_timeout"
                  ? "timeout"
                  : "transport_failure"
              );
              break;
            }
            // P1028/P1036 — arbitration transport/timeout must not upgrade a prior
            // native auto text success into provider fallback / 5xx.
            if (
              anyArbitrationInFlight() &&
              savedNativeForArbitration &&
              fetchErr instanceof ApiError
            ) {
              const remainingAfterFetch =
                timeoutPolicy.totalTimeoutMs - (Date.now() - startedAt);
              const isTotalTimeout =
                remainingAfterFetch <= 0 ||
                fetchErr.upstreamErrorSnippet === "total_request_timeout";
              if (isTotalTimeout) {
                throw fetchErr instanceof ApiError &&
                  fetchErr.code === "upstream_timeout"
                  ? fetchErr
                  : ApiError.requestTimeout();
              }
              const isTimeout = fetchErr.code === "upstream_timeout";
              restoreNativeAfterArbitrationFailure(
                isTimeout ? "timeout" : "transport_failure"
              );
              break;
            }
            throw fetchErr;
          }
          logProviderFetchStageTiming(fetchStage, stageStartedAt);

          normalizedData = normalizeToolCallsOnChatCompletion(
            data as unknown as Record<string, unknown>
          );
          upstreamReturnedToolCalls = responseHasToolCalls(normalizedData);

          // P1055 — native repair HTTP 200: accept tool_calls, else one emulated
          // fallback. Do not open a second native repair.
          if (nativeToolRepairInFlight) {
            nativeToolRepairInFlight = false;
            const finishAfterNativeRepair =
              extractResponseFinishReason(normalizedData) ??
              extractFinishReason(
                normalizedData as unknown as ChatCompletionResponse
              );
            if (upstreamReturnedToolCalls) {
              let nameMismatch = false;
              if (nativeRepairSelection) {
                try {
                  assertNativeForcedToolCallsMatch({
                    data: normalizedData,
                    forcedToolName: nativeRepairSelection.selectedToolName,
                    parallelToolCalls: (
                      clientBody as { parallel_tool_calls?: unknown }
                    ).parallel_tool_calls,
                  });
                } catch {
                  nameMismatch = true;
                }
              }
              if (!nameMismatch) {
                pushBillableUsageComponent("auto_arbitration", {
                  dataUsage: data.usage,
                  requestBody: upstreamBody,
                  responseBody: normalizedData,
                });
                nativeToolRepairSucceeded = true;
                const toolCallCount =
                  ((
                    (
                      (normalizedData.choices as unknown[])?.[0] as
                        | Record<string, unknown>
                        | undefined
                    )?.message as Record<string, unknown> | undefined
                  )?.tool_calls as unknown[] | undefined)?.length ?? 0;
                log.info("auto_tool_native_repair_succeeded", {
                  requestId,
                  selectedToolName: nativeRepairSelection?.selectedToolName,
                  toolCallCount,
                  finishReason: finishAfterNativeRepair,
                  billing_status: "not_billable",
                  credits_charged: 0,
                });
                // Fall through to native tool_calls accept path below.
              } else {
                // Merge repair tokens into native cost; free auto_arbitration slot.
                const repairUsage = resolveChatAttemptUsage({
                  providerId: provider.id,
                  dataUsage: data.usage,
                  requestBody: upstreamBody,
                  responseBody: normalizedData,
                }).usage;
                const nativeComp = billableUsageComponents.find(
                  (c) => c.stage === "native"
                );
                if (nativeComp) {
                  nativeComp.usage = mergeNormalizedUsages([
                    nativeComp.usage,
                    repairUsage,
                  ]);
                }
                log.info("auto_tool_native_repair_failed", {
                  requestId,
                  providerId: provider.id,
                  attemptedModel: attemptModel,
                  reason: "forced_tool_name_mismatch",
                  selectedToolName: nativeRepairSelection?.selectedToolName,
                  freshRemainingTotalMs: Math.max(
                    0,
                    timeoutPolicy.totalTimeoutMs - (Date.now() - startedAt)
                  ),
                  billing_status: "not_billable",
                  credits_charged: 0,
                });
                if (
                  canNativeEmulatedRepair(provider.id, attemptModel) &&
                  timeoutPolicy.totalTimeoutMs - (Date.now() - startedAt) > 0
                ) {
                  autoIntentArbitrationAttempted = true;
                  autoIntentArbitrationInFlight = true;
                  activeToolMode = "emulated_json";
                  log.info("auto_tool_intent_repair_triggered", {
                    requestId,
                    route,
                    requestedModel: requestedRaw,
                    attemptedModel: attemptModel,
                    resumeToolRound,
                    toolChoiceKind: toolChoiceKind(
                      (clientBody as { tool_choice?: unknown }).tool_choice
                    ),
                    toolIntentDetected: true,
                    nativeFinishReason: finishAfterNativeRepair,
                    reason: "native_repair_name_mismatch_fallback",
                    billing_status: "not_billable",
                    credits_charged: 0,
                  });
                  continue;
                }
                if (savedNativeForArbitration) {
                  normalizedData = savedNativeForArbitration;
                  upstreamReturnedToolCalls =
                    responseHasToolCalls(normalizedData);
                }
              }
            } else {
              const repairUsage = resolveChatAttemptUsage({
                providerId: provider.id,
                dataUsage: data.usage,
                requestBody: upstreamBody,
                responseBody: normalizedData,
              }).usage;
              const nativeComp = billableUsageComponents.find(
                (c) => c.stage === "native"
              );
              if (nativeComp) {
                nativeComp.usage = mergeNormalizedUsages([
                  nativeComp.usage,
                  repairUsage,
                ]);
              }
              log.info("auto_tool_native_repair_failed", {
                requestId,
                providerId: provider.id,
                attemptedModel: attemptModel,
                reason: "no_tool_calls",
                selectedToolName: nativeRepairSelection?.selectedToolName,
                finishReason: finishAfterNativeRepair,
                freshRemainingTotalMs: Math.max(
                  0,
                  timeoutPolicy.totalTimeoutMs - (Date.now() - startedAt)
                ),
                billing_status: "not_billable",
                credits_charged: 0,
              });
              if (
                canNativeEmulatedRepair(provider.id, attemptModel) &&
                timeoutPolicy.totalTimeoutMs - (Date.now() - startedAt) > 0
              ) {
                autoIntentArbitrationAttempted = true;
                autoIntentArbitrationInFlight = true;
                activeToolMode = "emulated_json";
                log.info("auto_tool_intent_repair_triggered", {
                  requestId,
                  route,
                  requestedModel: requestedRaw,
                  attemptedModel: attemptModel,
                  resumeToolRound,
                  toolChoiceKind: toolChoiceKind(
                    (clientBody as { tool_choice?: unknown }).tool_choice
                  ),
                  toolIntentDetected: true,
                  nativeFinishReason: finishAfterNativeRepair,
                  reason: "native_repair_no_tool_calls_fallback",
                  billing_status: "not_billable",
                  credits_charged: 0,
                });
                continue;
              }
              if (savedNativeForArbitration) {
                normalizedData = savedNativeForArbitration;
                upstreamReturnedToolCalls =
                  responseHasToolCalls(normalizedData);
              }
            }
          }

          // P1030 — capture arbitration HTTP 200 usage before parse/mutation.
          // Transport/timeout failures never reach here (no forged component).
          if (anyArbitrationInFlight()) {
            pushBillableUsageComponent("auto_arbitration", {
              dataUsage: data.usage,
              requestBody: upstreamBody,
              responseBody: normalizedData,
            });
          }

          const strictToolCallPending =
            !toolsDegradedToChat && isStrictToolCallRequest(clientBody);

          // P1017 — emulated_json: map content → OpenAI tool_calls (or text).
          if (activeToolMode === "emulated_json") {
            if (!upstreamReturnedToolCalls) {
              try {
                const intent = parseToolIntentFromContent({
                  content: extractAssistantContentFromCompletion(normalizedData),
                  clientTools: (clientBody as { tools?: unknown }).tools,
                  toolChoice:
                    (autoIntentArbitrationInFlight && toolIntentDetected) ||
                    continuationArbitrationInFlight
                      ? "required"
                      : (clientBody as { tool_choice?: unknown })
                          .tool_choice,
                  parallelToolCalls: (clientBody as {
                    parallel_tool_calls?: unknown;
                  }).parallel_tool_calls,
                  // P1026 — safe structured parse observability (no raw content).
                  diag: {
                    requestId,
                    providerId: provider.id,
                    attemptModel,
                    log,
                  },
                });
                normalizedData = applyToolIntentToChatCompletion(
                  normalizedData,
                  intent
                );
                normalizedData =
                  normalizeToolCallsOnChatCompletion(normalizedData);
                upstreamReturnedToolCalls = responseHasToolCalls(normalizedData);
                if (anyArbitrationInFlight()) {
                  if (
                    continuationArbitrationInFlight &&
                    upstreamReturnedToolCalls
                  ) {
                    const filtered = filterNovelToolCallsOnCompletion(
                      normalizedData,
                      {
                        completedSignatures: extractCompletedToolSignatures(
                          (clientBody as { messages?: unknown }).messages
                        ),
                        historicalIds: extractHistoricalToolCallIds(
                          (clientBody as { messages?: unknown }).messages
                        ),
                      }
                    );
                    if (!filtered) {
                      restoreNativeAfterArbitrationFailure("duplicate_replay");
                      break;
                    }
                    normalizedData = filtered.data;
                    upstreamReturnedToolCalls = true;
                    logAutoArbitration({
                      arbitrationResult: "tool_calls",
                      toolCallCount: filtered.novelCount,
                      fallbackToOriginalText: false,
                      kind: "continuation",
                    });
                    continuationArbitrationInFlight = false;
                  } else {
                    const toolCallCount = upstreamReturnedToolCalls
                      ? ((
                          (
                            (normalizedData.choices as unknown[])?.[0] as
                              | Record<string, unknown>
                              | undefined
                          )?.message as Record<string, unknown> | undefined
                        )?.tool_calls as unknown[] | undefined)?.length ?? 0
                      : 0;
                    logAutoArbitration({
                      arbitrationResult: upstreamReturnedToolCalls
                        ? "tool_calls"
                        : "assistant_text",
                      toolCallCount,
                      fallbackToOriginalText: false,
                    });
                    autoIntentArbitrationInFlight = false;
                    continuationArbitrationInFlight = false;
                  }
                }
              } catch (parseErr) {
                // P1028/P1036 — arbitration: never repair-retry or 5xx; restore
                // the original native plain-text success.
                if (anyArbitrationInFlight() && savedNativeForArbitration) {
                  restoreNativeAfterArbitrationFailure("invalid");
                  break;
                }
                if (
                  parseErr instanceof ApiError &&
                  !repairAttempted &&
                  isToolIntentRepairableCode(parseErr.code)
                ) {
                  repairAttempted = true;
                  log.warn("tool_intent_repair_retry", {
                    requestId,
                    route,
                    providerId: provider.id,
                    attemptModel,
                    code: parseErr.code,
                    activeToolMode,
                    freshRemainingTotalMs: Math.max(
                      0,
                      timeoutPolicy.totalTimeoutMs - (Date.now() - startedAt)
                    ),
                    billing_status: "not_billable",
                  });
                  continue;
                }
                throw parseErr;
              }
            } else if (anyArbitrationInFlight()) {
              // Emulated upstream already returned native-shaped tool_calls.
              if (continuationArbitrationInFlight) {
                const filtered = filterNovelToolCallsOnCompletion(
                  normalizedData,
                  {
                    completedSignatures: extractCompletedToolSignatures(
                      (clientBody as { messages?: unknown }).messages
                    ),
                    historicalIds: extractHistoricalToolCallIds(
                      (clientBody as { messages?: unknown }).messages
                    ),
                  }
                );
                if (!filtered) {
                  restoreNativeAfterArbitrationFailure("duplicate_replay");
                  break;
                }
                normalizedData = filtered.data;
                upstreamReturnedToolCalls = true;
                logAutoArbitration({
                  arbitrationResult: "tool_calls",
                  toolCallCount: filtered.novelCount,
                  fallbackToOriginalText: false,
                  kind: "continuation",
                });
                continuationArbitrationInFlight = false;
              } else {
                const toolCallCount =
                  ((
                    (
                      (normalizedData.choices as unknown[])?.[0] as
                        | Record<string, unknown>
                        | undefined
                    )?.message as Record<string, unknown> | undefined
                  )?.tool_calls as unknown[] | undefined)?.length ?? 0;
                logAutoArbitration({
                  arbitrationResult: "tool_calls",
                  toolCallCount,
                  fallbackToOriginalText: false,
                });
                autoIntentArbitrationInFlight = false;
              }
            }
            break;
          }

          // P1020 — native: accept message.tool_calls as-is when present.
          // Strict/required with no tool_calls may do ONE controlled
          // emulated_json repair — never fake plain text as success.
          // P1024 — when forcedToolName is set, all tool_call names must match.
          // P1047 — auto with no tool_calls: accept ordinary text (no arb).
          if (activeToolMode === "native") {
            if (upstreamReturnedToolCalls) {
              if (forcedToolName) {
                try {
                  assertNativeForcedToolCallsMatch({
                    data: normalizedData,
                    forcedToolName,
                    parallelToolCalls: (
                      clientBody as { parallel_tool_calls?: unknown }
                    ).parallel_tool_calls,
                  });
                } catch (matchErr) {
                  if (
                    matchErr instanceof ApiError &&
                    !repairAttempted &&
                    !resumeToolRound &&
                    canNativeEmulatedRepair(provider.id, attemptModel)
                  ) {
                    repairAttempted = true;
                    activeToolMode = "emulated_json";
                    log.warn("native_tool_call_emulated_repair", {
                      requestId,
                      route,
                      providerId: provider.id,
                      attemptModel,
                      reason: "forced_tool_name_mismatch",
                      forcedToolName,
                      freshRemainingTotalMs: Math.max(
                        0,
                        timeoutPolicy.totalTimeoutMs - (Date.now() - startedAt)
                      ),
                      billing_status: "not_billable",
                    });
                    continue;
                  }
                  throw matchErr;
                }
              }
              break;
            }
            if (
              strictToolCallPending &&
              !repairAttempted &&
              !resumeToolRound &&
              canNativeEmulatedRepair(provider.id, attemptModel)
            ) {
              repairAttempted = true;
              activeToolMode = "emulated_json";
              log.warn("native_tool_call_emulated_repair", {
                requestId,
                route,
                providerId: provider.id,
                attemptModel,
                reason: "native_no_tool_calls",
                freshRemainingTotalMs: Math.max(
                  0,
                  timeoutPolicy.totalTimeoutMs - (Date.now() - startedAt)
                ),
                billing_status: "not_billable",
              });
              continue;
            }
            if (strictToolCallPending) {
              const guardErr = new ApiError({
                status: 502,
                message:
                  "Upstream did not return tool_calls for a strict tools request.",
                code: TOOL_CALL_NOT_GENERATED_CODE,
                type: "upstream_error",
                publicMessage:
                  "模型未返回 tool_calls。请改用已验证支持 tool calling 的模型，或关闭 require_tool_call。",
                upstreamStatus: 200,
              });
              log.warn("fake_tool_call_guard_triggered", {
                requestId,
                route,
                requestedModel: requestedRaw,
                resolvedModel: requestedModel,
                attemptedModel: attemptModel,
                attemptModel,
                providerId: provider.id,
                hasTools: hasToolsClient,
                toolChoice: toolChoiceSummary(clientBody),
                requireToolCall: clientRequiresToolCall(clientBody),
                strictToolCall: true,
                upstreamReturnedToolCalls: false,
                finishReason:
                  extractResponseFinishReason(normalizedData) ??
                  extractFinishReason(
                    normalizedData as unknown as ChatCompletionResponse
                  ),
                fakeToolCallGuard: true,
                billing_status: "not_billable",
                credits_charged: 0,
                upstreamStatus: 200,
                upstreamErrorCode: TOOL_CALL_NOT_GENERATED_CODE,
              });
              throw guardErr;
            }

            // P1047 — auto/missing: accept valid native text (or tool_calls
            // above) unless P1048 explicit tool execution intent requires
            // exactly one tool-intent repair. Never second-fetch solely
            // because tools[] were present. Strict repair remains above.
            const finishForArbitration =
              extractResponseFinishReason(normalizedData) ??
              extractFinishReason(
                normalizedData as unknown as ChatCompletionResponse
              );
            const freshMsForArb = Math.max(
              0,
              timeoutPolicy.totalTimeoutMs - (Date.now() - startedAt)
            );
            if (
              !toolsDegradedToChat &&
              !resumeToolRound &&
              canNativeEmulatedRepair(provider.id, attemptModel) &&
              shouldAttemptAutoToolIntentArbitration({
                hasTools: hasToolsClient,
                supportsToolsRequested,
                effectiveToolChoice: effectiveToolChoice(clientBody),
                activeToolMode,
                upstreamReturnedToolCalls,
                finishReason: finishForArbitration,
                autoIntentArbitrationAttempted,
                freshRemainingTotalMs: freshMsForArb,
                resumeToolRound,
                toolIntentDetected,
              })
            ) {
              // P1030 — capture Native HTTP 200 usage before repair overwrites.
              pushBillableUsageComponent("native", {
                dataUsage: data.usage,
                requestBody: upstreamBody,
                responseBody: normalizedData,
              });
              savedNativeForArbitration = structuredClone(normalizedData);

              // P1055 — prefer one native tool_choice repair before emulated_json.
              const clientChoiceRaw = (clientBody as { tool_choice?: unknown })
                .tool_choice;
              const clientToolChoiceIsAutoOrMissing =
                clientChoiceRaw === undefined ||
                clientChoiceRaw === null ||
                clientChoiceRaw === "auto";
              if (
                shouldAttemptNativeToolRepair({
                  hasTools: hasToolsClient,
                  supportsToolsRequested,
                  effectiveToolChoice: effectiveToolChoice(clientBody),
                  activeToolMode,
                  providerSupportsNativeTools: true,
                  upstreamReturnedToolCalls,
                  finishReason: finishForArbitration,
                  explicitToolExecutionIntent: toolIntentDetected,
                  nativeToolRepairAttempted,
                  resumeToolRound,
                  freshRemainingTotalMs: freshMsForArb,
                  clientToolChoiceIsAutoOrMissing,
                })
              ) {
                const selection = selectNativeRepairTool({
                  messages: (clientBody as { messages?: unknown }).messages,
                  tools: (clientBody as { tools?: unknown }).tools,
                  matchedToolNames: toolIntentDetection.matchedToolNames,
                  providerId: provider.id,
                });
                if (selection) {
                  nativeToolRepairAttempted = true;
                  nativeToolRepairInFlight = true;
                  nativeRepairSelection = selection;
                  log.info("auto_tool_native_repair_attempted", {
                    requestId,
                    providerId: provider.id,
                    attemptedModel: attemptModel,
                    requiredCapabilities: selection.requiredCapabilities,
                    selectedCapability: selection.selectedCapability,
                    selectedToolName: selection.selectedToolName,
                    toolChoiceStrategy: selection.toolChoiceStrategy,
                    freshRemainingTotalMs: freshMsForArb,
                    billing_status: "not_billable",
                    credits_charged: 0,
                  });
                  continue;
                }
              }

              // Compatibility fallback: existing P1048 emulated_json repair.
              autoIntentArbitrationAttempted = true;
              autoIntentArbitrationInFlight = true;
              activeToolMode = "emulated_json";
              log.info("auto_tool_intent_repair_triggered", {
                requestId,
                route,
                requestedModel: requestedRaw,
                attemptedModel: attemptModel,
                resumeToolRound,
                toolChoiceKind: toolChoiceKind(
                  (clientBody as { tool_choice?: unknown }).tool_choice
                ),
                toolIntentDetected: true,
                nativeFinishReason: finishForArbitration,
                billing_status: "not_billable",
                credits_charged: 0,
              });
              continue;
            }

            // P1049 — resume incomplete multi-step tool task (capability gap).
            const nativeAssistantTextForGap = (() => {
              const choices = normalizedData.choices;
              if (!Array.isArray(choices) || !choices[0]) return null;
              const first = choices[0] as Record<string, unknown>;
              const message =
                first.message &&
                typeof first.message === "object" &&
                !Array.isArray(first.message)
                  ? (first.message as Record<string, unknown>)
                  : null;
              const content = message?.content;
              return typeof content === "string" ? content : null;
            })();
            const incompleteTask = shouldContinueIncompleteToolTask({
              resumeToolRound,
              explicitExecutionIntent: toolIntentDetected,
              upstreamReturnedToolCalls,
              finishReason: finishForArbitration,
              continuationAlreadyAttempted: continuationArbitrationAttempted,
              freshRemainingTotalMs: freshMsForArb,
              unmatchedToolCallIdCount,
              duplicateToolResultCount,
              orderViolationCount,
              upstreamHttpOk: true,
              messages: (clientBody as { messages?: unknown }).messages,
              tools: (clientBody as { tools?: unknown }).tools,
              nativeAssistantText: nativeAssistantTextForGap,
            });
            if (
              !toolsDegradedToChat &&
              resumeToolRound &&
              canNativeEmulatedRepair(provider.id, attemptModel) &&
              incompleteTask.shouldContinue &&
              shouldAttemptResumeToolContinuationArbitration({
                hasTools: hasToolsClient,
                supportsToolsRequested,
                effectiveToolChoice: effectiveToolChoice(clientBody),
                activeToolMode,
                upstreamReturnedToolCalls,
                finishReason: finishForArbitration,
                resumeToolRound,
                unmatchedToolCallIdCount,
                duplicateToolResultCount,
                orderViolationCount,
                continuationArbitrationAttempted,
                autoIntentArbitrationAttempted,
                freshRemainingTotalMs: freshMsForArb,
                upstreamHttpOk: true,
                incompleteToolTask: true,
              })
            ) {
              pushBillableUsageComponent("native", {
                dataUsage: data.usage,
                requestBody: upstreamBody,
                responseBody: normalizedData,
              });
              continuationArbitrationAttempted = true;
              continuationArbitrationInFlight = true;
              // Shared cap: first-turn AUTO also blocked for this request.
              autoIntentArbitrationAttempted = true;
              savedNativeForArbitration = structuredClone(normalizedData);
              activeToolMode = "emulated_json";
              log.info("incomplete_tool_task_continuation_triggered", {
                requestId,
                route,
                resumeToolRound: true,
                requiredCapabilities: incompleteTask.requiredCapabilities,
                completedCapabilities: incompleteTask.completedCapabilities,
                remainingCapabilities: incompleteTask.remainingCapabilities,
                attemptedModel: attemptModel,
                nativeFinishReason: finishForArbitration,
                billing_status: "not_billable",
                credits_charged: 0,
              });
              continue;
            }

            // tool_choice=auto: plain text is allowed; preserve user semantics.
            break;
          }

          break;
        }

        // Final reported mode is whatever produced the accepted response.
        const reportedToolMode = activeToolMode;

        await recordModelSuccess(attemptModel);
        await recordProviderModelSuccess(provider.id, attemptModel);

        const strictToolCall =
          !toolsDegradedToChat && isStrictToolCallRequest(clientBody);
        const requireToolCall = clientRequiresToolCall(clientBody);
        const finishReasonRaw =
          extractResponseFinishReason(normalizedData) ??
          extractFinishReason(normalizedData as unknown as ChatCompletionResponse);

        // P971 — safety net: never bill strict without tool_calls.
        // Emulated path already enforced required/forced via parser.
        if (
          reportedToolMode !== "emulated_json" &&
          strictToolCall &&
          !upstreamReturnedToolCalls
        ) {
          const guardErr = new ApiError({
            status: 502,
            message:
              "Upstream did not return tool_calls for a strict tools request.",
            code: TOOL_CALL_NOT_GENERATED_CODE,
            type: "upstream_error",
            publicMessage:
              "模型未返回 tool_calls。请改用已验证支持 tool calling 的模型，或关闭 require_tool_call。",
            upstreamStatus: 200,
          });
          log.warn("fake_tool_call_guard_triggered", {
            requestId,
            route,
            requestedModel: requestedRaw,
            resolvedModel: requestedModel,
            attemptedModel: attemptModel,
            attemptModel,
            providerId: provider.id,
            hasTools: hasToolsClient,
            toolChoice: toolChoiceSummary(clientBody),
            requireToolCall,
            strictToolCall: true,
            upstreamReturnedToolCalls: false,
            finishReason: finishReasonRaw,
            fakeToolCallGuard: true,
            billing_status: "not_billable",
            credits_charged: 0,
            upstreamStatus: 200,
            upstreamErrorCode: TOOL_CALL_NOT_GENERATED_CODE,
          });
          throw guardErr;
        }

        // Log-compat timeout snapshot (post-success); use last fresh budget.
        const perAttemptTimeoutMs = Math.min(
          timeoutPolicy.upstreamTimeoutMs,
          lastFreshRemainingTotalMs
        );

        // Consumer-facing resolved id = Tokfai catalog/alias (e.g. gpt-5-pro).
        // Bill by the concrete attempt that served the request (never alias floor price).
        const resolvedModel = requestedModel;
        const billableModel = attemptModel;

        // P1030 — single-component path keeps pre-change math; multi-component
        // (native + auto_arbitration) prices each stage then sums once.
        const finalUsageResolved = resolveChatAttemptUsage({
          providerId: provider.id,
          dataUsage: data.usage,
          requestBody: upstreamBody,
          responseBody: normalizedData,
        });

        let usage: NormalizedChatUsage;
        let clientFacingUsage: NormalizedChatUsage;
        let creditsCharged: number;

        if (billableUsageComponents.length === 0) {
          usage = finalUsageResolved.usage;
          clientFacingUsage = usage;
          if (finalUsageResolved.estimated) {
            log.warn("chat_usage_estimated", {
              requestId,
              route,
              providerId: provider.id,
              attemptedModel: attemptModel,
              usageSource: "estimated",
              estimationAlgorithm: CHAT_USAGE_ESTIMATION_ALGORITHM,
              upstreamPromptTokens: finalUsageResolved.upstreamUsage.promptTokens,
              upstreamCompletionTokens:
                finalUsageResolved.upstreamUsage.completionTokens,
              upstreamTotalTokens: finalUsageResolved.upstreamUsage.totalTokens,
              estimatedPromptTokens: usage.promptTokens,
              estimatedCompletionTokens: usage.completionTokens,
              estimatedTotalTokens: usage.totalTokens,
            });
          }
          creditsCharged = unlimited
            ? 0
            : await calculateCreditsCharged(
                billableModel,
                usage,
                caller.tenantId
              );
        } else {
          usage = mergeNormalizedUsages(
            billableUsageComponents.map((c) => c.usage)
          );
          // Public usage follows the accepted response body (native on restore,
          // arbitration / P1055 native-repair on accepted second pass) — not
          // the internal cost sum.
          if (nativeToolRepairSucceeded) {
            const repairComp = billableUsageComponents.find(
              (c) => c.stage === "auto_arbitration"
            );
            clientFacingUsage = repairComp
              ? cloneNormalizedUsage(repairComp.usage)
              : finalUsageResolved.usage;
          } else if (activeToolMode === "native") {
            const nativeComp = billableUsageComponents.find(
              (c) => c.stage === "native"
            );
            clientFacingUsage = nativeComp
              ? cloneNormalizedUsage(nativeComp.usage)
              : finalUsageResolved.usage;
          } else {
            const arbComp = billableUsageComponents.find(
              (c) => c.stage === "auto_arbitration"
            );
            clientFacingUsage = arbComp
              ? cloneNormalizedUsage(arbComp.usage)
              : finalUsageResolved.usage;
          }
          if (unlimited) {
            creditsCharged = 0;
          } else {
            let creditsSum = 0;
            for (const component of billableUsageComponents) {
              creditsSum += await calculateCreditsCharged(
                component.billableModel,
                component.usage,
                caller.tenantId
              );
            }
            creditsCharged = roundCreditAmount(creditsSum);
          }
        }

        const autoNoToolCall =
          toolsDegradedToChat ||
          (hasToolsClient && !strictToolCall && !upstreamReturnedToolCalls);

        // P974 — never forge tool_calls after auto degrade to ordinary chat.
        let responseData = normalizedData;
        if (toolsDegradedToChat && upstreamReturnedToolCalls) {
          responseData = {
            ...normalizedData,
            choices: (Array.isArray(normalizedData.choices)
              ? normalizedData.choices
              : []
            ).map((choice, index) => {
              if (!choice || typeof choice !== "object" || Array.isArray(choice)) {
                return choice;
              }
              const row = { ...(choice as Record<string, unknown>) };
              const message =
                row.message &&
                typeof row.message === "object" &&
                !Array.isArray(row.message)
                  ? { ...(row.message as Record<string, unknown>) }
                  : null;
              if (message) {
                delete message.tool_calls;
                row.message = message;
              }
              if (index === 0 && row.finish_reason === "tool_calls") {
                row.finish_reason = "stop";
              }
              return row;
            }),
          };
        }

        // P1031 — clamp client-visible tool_call ids to ASCII <=64 before wire.
        responseData = ensureClientSafeToolCallIdsOnCompletion(responseData);
        if (hasToolsClient) {
          const toolMeta = extractResponseToolCallMeta(responseData);
          log.info("cursor_tool_response_generated", {
            requestId,
            route,
            mode: reportedToolMode,
            stream: clientStream,
            toolCallCount: toolMeta.toolCallCount,
            toolNames: toolMeta.toolNames.slice(0, 32),
            toolCallIdLengths: toolMeta.toolCallIdLengths.slice(0, 32),
            argumentsLengths: toolMeta.argumentsLengths.slice(0, 32),
            contentIsNull: toolMeta.contentIsNull,
            finishReason: toolMeta.finishReason,
            billing_status:
              unlimited || creditsCharged <= 0 ? "not_billable" : "charged",
            credits_charged: creditsCharged,
          });
        }

        const latencyMs = Date.now() - startedAt;
        const triedModels = attempts.slice(0, attemptIndex + 1);
        const routing = buildSuccessRoutingEvidence({
          requestId,
          requestedRaw,
          canonicalId: requestedModel,
          isAlias,
          resolvedModel,
          attemptedModels: triedModels.length > 0 ? triedModels : [attemptModel],
          fallbackAttempts: attemptIndex + 1,
          latencyMs,
          creditsCharged,
          billingStatus: unlimited || creditsCharged <= 0 ? "not_billable" : "charged",
        });

        // Wire-facing normalize only (other/unknown → stop). Usage below
        // still records the upstream finish_reason from responseData.
        const response = normalizeOpenAiFinishReasonOnChatCompletion(
          {
          ...responseData,
          // Upstream may omit or send empty object; OpenAI clients require this.
          object: "chat.completion",
          model: resolvedModel,
          credits_charged: creditsCharged,
          request_id: requestId,
          // Always present for Agent/OpenAI clients (does not change debit math).
          // P1030 — public usage follows accepted completion; debit/log use
          // aggregated `usage` when native + arbitration both succeeded.
          usage: {
            prompt_tokens: clientFacingUsage.promptTokens ?? 0,
            completion_tokens: clientFacingUsage.completionTokens ?? 0,
            total_tokens:
              clientFacingUsage.totalTokens ??
              (clientFacingUsage.promptTokens ?? 0) +
                (clientFacingUsage.completionTokens ?? 0),
          },
          tokfai: mergeTokfaiRouting(
            {
              ...(upstreamId ? { upstream_request_id: upstreamId } : {}),
              ...(viaStreamFallback
                ? { upstream_stream_fallback: true }
                : {}),
              ...(autoNoToolCall ? { auto_no_tool_call: true } : {}),
              ...(hasToolsClient
                ? {
                    has_tools: true,
                    supports_tools_requested: supportsToolsRequested,
                    tools_fallback_applied: toolsFallbackApplied,
                    strict_tool_call: strictToolCall,
                    tool_calling_mode: reportedToolMode,
                    upstream_returned_tool_calls: toolsDegradedToChat
                      ? false
                      : upstreamReturnedToolCalls,
                    ...(toolsDegradedToChat
                      ? { tools_degraded_to_chat: true }
                      : {}),
                  }
                : {}),
            },
            routing
          ),
        },
          { route }
        );

        await recordSuccessfulUsageAndDebit(
          {
            user_id: caller.userId,
            api_key_id: caller.apiKeyId,
            tenant_id: caller.tenantId,
            model: billableModel,
            status: "succeeded",
            prompt_tokens: usage.promptTokens,
            completion_tokens: usage.completionTokens,
            total_tokens: usage.totalTokens,
            credits_charged: creditsCharged,
            request_id: requestId,
            upstream_id: upstreamId,
            error_code: null,
            error_message: null,
            latency_ms: Date.now() - startedAt,
            billable: true,
            finish_reason: extractFinishReason(
              responseData as unknown as ChatCompletionResponse
            ),
            upstream_status: null,
            upstream_error_code: null,
            safety_reason: isAlias ? requestedModel : null,
          },
          {
            idempotencyKey,
            endpoint: route,
            responseSnapshot: response,
          }
        );

        const finishReason = extractFinishReason(
          responseData as unknown as ChatCompletionResponse
        );
        log.info("chat_completion_succeeded", {
          ...routingEvidenceToLogFields(routing, {
            route,
            status: 200,
            attemptedModel: attemptModel,
            providerId: provider.id,
            providerLabel: provider.id,
            upstreamStatus: 200,
            upstreamErrorCode: null,
          }),
          code: "succeeded",
          message: "Chat completion succeeded.",
          attemptModel,
          attemptIndex,
          providerIndex,
          supportsTools: modelSupportsTools(attemptModel),
          hasTools: hasToolsClient,
          toolChoice: toolChoiceSummary(clientBody),
          requireToolCall,
          strictToolCall,
          upstreamReturnedToolCalls: toolsDegradedToChat
            ? false
            : upstreamReturnedToolCalls,
          finishReason,
          finish_reason: finishReason,
          fakeToolCallGuard: false,
          autoNoToolCall,
          bodyKeys: chatBodyKeysForLog(clientBody),
          timeoutMs: perAttemptTimeoutMs,
          viaStreamFallback,
          userId: caller.userId,
          apiKeyIdMasked: caller.apiKeyId
            ? `${String(caller.apiKeyId).slice(0, 8)}…`
            : null,
        });

        logCommercialRequestTrace({
          phase: "success",
          requestId,
          route,
          userId: caller.userId,
          apiKeyId: caller.apiKeyId,
          model: resolvedModel,
          status: "succeeded",
          creditsCharged,
        });

        return {
          ok: true,
          response,
          creditsCharged,
          resolvedModel,
          requestedModel,
          requestId,
        };
      } catch (err) {
        if (!(err instanceof ApiError)) {
          throw err;
        }

        lastError = err;
        const attemptLatencyMs = Date.now() - attemptStartedAt;
        const isTimeout = err.code === "upstream_timeout";
        const attemptTimeoutMs = clientStream
          ? Math.min(timeoutPolicy.idleTimeoutMs, remainingTotalMs)
          : Math.min(timeoutPolicy.upstreamTimeoutMs, remainingTotalMs);

        if (isTimeout) {
          await recordProviderModelTimeout(provider.id, attemptModel);
        }

        const hasNextProvider =
          providerIndex < providerAttempts.length - 1 &&
          isChatFallbackEligible(err);

        if (hasNextProvider) {
          const nextProvider = providerAttempts[providerIndex + 1]!;
          if (isTimeout) {
            logProviderTimeoutStats({
              requestId,
              route,
              requestedModel,
              resolvedModel: requestedModel,
              providerId: provider.id,
              upstreamStatus: err.upstreamStatus ?? 504,
              upstreamErrorCode: err.code ?? "upstream_timeout",
              latencyMs: attemptLatencyMs,
              timeoutMs: attemptTimeoutMs,
              billing_status: "not_billable",
              fallbackSkippedReason: null,
              nextProviderId: nextProvider.id,
            });
          }
          log.warn("chat_provider_fallback_attempt", {
            requestId,
            route,
            requestedModel,
            resolvedModel: requestedModel,
            attemptModel,
            attemptIndex,
            providerId: provider.id,
            providerIndex,
            nextProviderId: nextProvider.id,
            status: err.status,
            code: err.code ?? "failed",
            upstreamStatus: err.upstreamStatus,
            upstreamErrorCode: err.code ?? null,
            upstreamErrorMessage: err.upstreamErrorSnippet,
            latencyMs: attemptLatencyMs,
            timeoutMs: attemptTimeoutMs,
          });
          continue;
        }

        // No second provider (or error not eligible) — do not pretend fallback ran.
        const fallbackSkippedReason = !isChatFallbackEligible(err)
          ? "error_not_fallback_eligible"
          : providerAttempts.length <= 1
            ? "no_secondary_provider"
            : "providers_exhausted";

        if (isTimeout) {
          logProviderTimeoutStats({
            requestId,
            route,
            requestedModel,
            resolvedModel: requestedModel,
            providerId: provider.id,
            upstreamStatus: err.upstreamStatus ?? 504,
            upstreamErrorCode: err.code ?? "upstream_timeout",
            latencyMs: attemptLatencyMs,
            timeoutMs: attemptTimeoutMs,
            billing_status: "not_billable",
            fallbackSkippedReason,
          });
        }

        log.warn("chat_provider_fallback_unavailable", {
          requestId,
          route,
          requestedModel,
          resolvedModel: requestedModel,
          attemptModel,
          attemptIndex,
          providerId: provider.id,
          providerIndex,
          providerCount: providerAttempts.length,
          fallback_skipped_reason: fallbackSkippedReason,
          fallbackSkippedReason,
          status: err.status,
          code: err.code ?? "failed",
          upstreamStatus: err.upstreamStatus,
          upstreamErrorCode: err.code ?? null,
          upstreamErrorMessage: err.upstreamErrorSnippet,
          latencyMs: attemptLatencyMs,
          timeoutMs: attemptTimeoutMs,
          billing_status: "not_billable",
        });

        modelAttemptFailed = true;

        if (isAlias && isChatFallbackEligible(err)) {
          await recordModelFailure(attemptModel, err.code);
        }

        const hasNextModel =
          isAlias &&
          attemptIndex < attempts.length - 1 &&
          isChatFallbackEligible(err);

        if (hasNextModel) {
          break;
        }

        if (isAlias && isChatFallbackEligible(err)) {
          const exhausted = allUpstreamsUnavailableError();
          const routing = await logChatFailure({
            caller,
            requestId,
            requestedModel,
      requestedRaw,
      isAlias,
      attemptedModels: attempts,
            startedAt,
            err: exhausted,
            lastAttempt: err,
            route,
            providerId: provider.id,
            timeoutMs: attemptTimeoutMs,
          });
          return failureResultWithSuggestions(exhausted, requestId, requestedModel, {
            routing,
            suggestSwitchModel: true,
          });
        }

        const routing = await logChatFailure({
          caller,
          requestId,
          requestedModel,
      requestedRaw,
      isAlias,
      attemptedModels: attempts,
          startedAt,
          err,
          route,
          providerId: provider.id,
          timeoutMs: attemptTimeoutMs,
        });
        return failureResultWithSuggestions(err, requestId, requestedModel, {
            routing,
          suggestSwitchModel: isTimeout,
        });
      } finally {
        await releaseGlobalUpstream();
      }
    }

    if (modelAttemptFailed && isAlias && attemptIndex < attempts.length - 1) {
      continue;
    }
  }

  const fallbackErr = requestHasTools(clientBody)
    ? allToolUpstreamsUnavailableError(lastError)
    : (lastError ?? allUpstreamsUnavailableError());
  const routing = await logChatFailure({
    caller,
    requestId,
    requestedModel,
    requestedRaw,
    isAlias,
    attemptedModels: attempts,
    startedAt,
    err: fallbackErr,
    route,
    timeoutMs: timeoutPolicy.upstreamTimeoutMs,
  });
  return failureResultWithSuggestions(fallbackErr, requestId, requestedModel, {
    suggestSwitchModel: true,
    routing,
  });
}

function failureResult(
  err: ApiError,
  requestId: string,
  requestedModel?: string,
  routing?: TokfaiRoutingEvidence
): Extract<ExecuteChatCompletionResult, { ok: false }> {
  let errorMessage = err.publicMessage;
  const errorCode = err.code ?? "failed";

  if (
    requestedModel &&
    isSlowExperimentalChatModel(requestedModel) &&
    errorCode === "upstream_timeout"
  ) {
    errorMessage =
      "gemini-3.1-pro 响应较慢或当前超时，请切换其他推荐模型。";
  }

  return {
    ok: false,
    errorCode,
    errorMessage,
    requestId,
    httpStatus: err.status,
    ...(typeof err.retryAfterSeconds === "number"
      ? { retryAfterSeconds: err.retryAfterSeconds }
      : {}),
    ...(routing ? { routing } : {}),
  };
}

async function failureResultWithSuggestions(
  err: ApiError,
  requestId: string,
  requestedModel: string,
  opts?: {
    suggestSwitchModel?: boolean;
    routing?: TokfaiRoutingEvidence;
  }
): Promise<Extract<ExecuteChatCompletionResult, { ok: false }>> {
  const base = failureResult(err, requestId, requestedModel, opts?.routing);
  if (!opts?.suggestSwitchModel) return base;

  let errorMessage = base.errorMessage;
  if (
    base.errorCode === "upstream_timeout" &&
    !errorMessage.includes("切换")
  ) {
    errorMessage = "上游模型响应超时，请稍后重试或切换模型。";
  }

  const available = await listAvailableChatModelIds();
  const suggestedModels = available
    .filter((id) => id !== requestedModel)
    .slice(0, 8);

  return {
    ...base,
    errorMessage,
    ...(suggestedModels.length > 0 ? { suggestedModels } : {}),
  };
}

function logProviderTimeoutStats(fields: {
  requestId: string;
  route: string;
  requestedModel: string;
  resolvedModel: string;
  providerId: string;
  upstreamStatus: number;
  upstreamErrorCode: string;
  latencyMs: number;
  timeoutMs: number;
  billing_status: "not_billable";
  fallbackSkippedReason: string | null;
  nextProviderId?: string;
}): void {
  log.warn("chat_provider_timeout_stats", {
    requestId: fields.requestId,
    route: fields.route,
    requestedModel: fields.requestedModel,
    resolvedModel: fields.resolvedModel,
    providerId: fields.providerId,
    upstreamStatus: fields.upstreamStatus,
    upstreamErrorCode: fields.upstreamErrorCode,
    latencyMs: fields.latencyMs,
    timeoutMs: fields.timeoutMs,
    billing_status: fields.billing_status,
    fallbackSkippedReason: fields.fallbackSkippedReason,
    ...(fields.nextProviderId ? { nextProviderId: fields.nextProviderId } : {}),
  });
}

function normalizeUsage(usage: ChatCompletionUsage | undefined): {
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
} {
  return {
    promptTokens: toTokenCount(usage?.prompt_tokens),
    completionTokens: toTokenCount(usage?.completion_tokens),
    totalTokens: toTokenCount(usage?.total_tokens),
  };
}

/**
 * Resolve billable usage for one upstream HTTP 200 completion.
 * P998 — GRSAI all-zero usage + billable output → local UTF-8 estimate.
 */
function resolveChatAttemptUsage(args: {
  providerId: string;
  dataUsage: ChatCompletionUsage | undefined;
  requestBody: Record<string, unknown>;
  responseBody: Record<string, unknown>;
}): {
  usage: NormalizedChatUsage;
  upstreamUsage: NormalizedChatUsage;
  estimated: boolean;
} {
  const upstreamUsage = normalizeUsage(args.dataUsage);
  const estimated = shouldEstimateChatUsage({
    providerId: args.providerId,
    usage: upstreamUsage,
    responseBody: args.responseBody,
  });
  const usage = estimated
    ? estimateChatUsageFromPayload({
        requestBody: args.requestBody,
        responseBody: args.responseBody,
      })
    : coalesceUpstreamUsageTotal(upstreamUsage);
  return { usage, upstreamUsage, estimated };
}

function toTokenCount(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : null;
}

async function assertHasCredits(userId: string): Promise<void> {
  const { data, error } = await supabase()
    .from("profiles")
    .select("credits_balance")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw ApiError.internal(
      `Credit precheck failed: ${error.message}`,
      "credit_precheck_failed"
    );
  }

  if (!data || toNumber(data.credits_balance) <= 0) {
    throw insufficientCreditsError();
  }
}

async function calculateCreditsCharged(
  model: string,
  usage: ReturnType<typeof normalizeUsage>,
  tenantId?: string | null
): Promise<number> {
  const raw = await priceCreditsFor(
    model,
    usage.promptTokens ?? 0,
    usage.completionTokens ?? 0,
    tenantId
  );
  return roundCreditAmount(raw);
}

function roundCreditAmount(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return Math.ceil(amount * 1_000_000) / 1_000_000;
}

function toNumber(value: string | number | null | undefined): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

function extractFinishReason(data: ChatCompletionResponse): string | null {
  const reason = data.choices?.[0]?.finish_reason;
  return typeof reason === "string" ? reason : null;
}

type FailedUsageLogFields = Pick<
  UsageLogInsert,
  | "user_id"
  | "api_key_id"
  | "tenant_id"
  | "model"
  | "status"
  | "request_id"
  | "error_code"
  | "error_message"
  | "latency_ms"
> &
  Partial<
    Pick<
      UsageLogInsert,
      | "upstream_status"
      | "upstream_error_code"
      | "safety_reason"
      | "billing_status"
      | "billable"
      | "credits_charged"
    >
  >;

function failedUsageLog(fields: FailedUsageLogFields): UsageLogInsert {
  return {
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    credits_charged: null,
    upstream_id: null,
    billable: false,
    finish_reason: null,
    upstream_status: null,
    upstream_error_code: null,
    safety_reason: null,
    ...fields,
  };
}

function upstreamFailureFields(
  err: ApiError
): Pick<UsageLogInsert, "upstream_status" | "upstream_error_code"> {
  const code = err.code;
  if (!code || !UPSTREAM_ERROR_CODES.has(code)) {
    return { upstream_status: null, upstream_error_code: null };
  }

  const upstreamStatus =
    err.upstreamStatus ??
    (code === "upstream_rate_limited"
      ? 429
      : code === "upstream_model_busy" ||
          code === "upstream_model_unavailable" ||
          code === "all_upstreams_unavailable"
        ? 503
        : code === "upstream_auth_error"
          ? 403
          : code === "upstream_timeout"
            ? 504
            : 502);

  return {
    upstream_status: upstreamStatus,
    upstream_error_code: code,
  };
}

async function recordSuccessfulUsageAndDebit(
  entry: UsageLogInsert,
  args: {
    idempotencyKey?: string | null;
    endpoint: string;
    responseSnapshot?: Record<string, unknown> | null;
  }
): Promise<void> {
  try {
    await persistSuccessfulUsageAndDebit(entry, args);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code =
      err && typeof err === "object" && "code" in err
        ? String((err as { code?: string }).code ?? "")
        : "";

    if (code === "P0001" || message.toLowerCase().includes("insufficient_credits")) {
      throw insufficientCreditsError();
    }

    throw ApiError.internal(
      `Usage billing failed: ${message}`,
      "usage_billing_failed"
    );
  }
}

function allUpstreamsUnavailableError(): ApiError {
  return new ApiError({
    status: 503,
    message: "All fallback upstream models unavailable.",
    code: "all_upstreams_unavailable",
    type: "upstream_error",
    publicMessage: "当前可用模型繁忙，请稍后重试。",
  });
}

function allToolUpstreamsUnavailableError(lastError: ApiError | null): ApiError {
  if (
    lastError &&
    (lastError.code === "upstream_timeout" ||
      lastError.code === "all_upstreams_unavailable" ||
      lastError.code === ALL_TOOL_UPSTREAMS_UNAVAILABLE_CODE)
  ) {
    return new ApiError({
      status: 503,
      message: "All tools-capable upstream models unavailable.",
      code: ALL_TOOL_UPSTREAMS_UNAVAILABLE_CODE,
      type: "upstream_error",
      publicMessage:
        "当前支持 tool calling 的模型暂时不可用，请稍后重试或切换 auto-pro / gpt-5.5。",
      upstreamStatus: lastError.upstreamStatus,
      upstreamErrorSnippet: lastError.upstreamErrorSnippet,
    });
  }
  if (lastError) return lastError;
  return new ApiError({
    status: 503,
    message: "All tools-capable upstream models unavailable.",
    code: ALL_TOOL_UPSTREAMS_UNAVAILABLE_CODE,
    type: "upstream_error",
    publicMessage:
      "当前支持 tool calling 的模型暂时不可用，请稍后重试或切换 auto-pro / gpt-5.5。",
  });
}

async function logChatFailure(args: {
  caller: ChatCaller;
  requestId: string;
  requestedModel: string;
  /** Client-facing requested id when different from canonical. */
  requestedRaw?: string;
  isAlias?: boolean;
  attemptedModels?: string[];
  startedAt: number;
  err: ApiError;
  lastAttempt?: ApiError;
  route: string;
  providerId?: string;
  timeoutMs?: number;
  routing?: TokfaiRoutingEvidence;
}): Promise<TokfaiRoutingEvidence> {
  const {
    caller,
    requestId,
    requestedModel,
    requestedRaw = requestedModel,
    isAlias = false,
    attemptedModels,
    startedAt,
    err,
    lastAttempt,
    route,
    providerId,
    timeoutMs,
  } = args;

  const usageStatus =
    err.code === "upstream_rate_limited" ||
    err.code === "upstream_model_busy" ||
    err.code === "upstream_model_unavailable" ||
    err.code === "all_upstreams_unavailable" ||
    err.code === ALL_TOOL_UPSTREAMS_UNAVAILABLE_CODE ||
    err.code === "rate_limited" ||
    err.code === "heavy_queue_full" ||
    err.code === "heavy_queue_timeout" ||
    err.code === "heavy_queue_aborted" ||
    err.code === "too_many_requests" ||
    err.code === "too_many_concurrent_requests"
      ? "rate_limited"
      : "failed";

  const routing =
    args.routing ??
    buildFailureRoutingEvidence({
      requestId,
      requestedRaw,
      canonicalId: requestedModel,
      isAlias,
      resolvedModel: null,
      attemptedModels:
        attemptedModels && attemptedModels.length > 0
          ? attemptedModels
          : [requestedModel],
      fallbackAttempts: attemptedModels?.length ?? 1,
      latencyMs: Date.now() - startedAt,
      fallbackReason: err.code ?? "failed",
      errorCode: err.code ?? "failed",
    });

  await writeUsageLog(
    failedUsageLog({
      user_id: caller.userId,
      api_key_id: caller.apiKeyId,
      tenant_id: caller.tenantId,
      model: requestedModel,
      status: usageStatus,
      request_id: requestId,
      error_code: err.code ?? null,
      error_message: err.publicMessage,
      latency_ms: Date.now() - startedAt,
      billing_status: "not_billable",
      billable: false,
      credits_charged: 0,
      // Ops-only breadcrumb for timeout reports (not billing). Format: provider=<id>
      safety_reason: providerId ? `provider=${providerId}` : null,
      ...upstreamFailureFields(lastAttempt ?? err),
    }),
    route,
    routingEvidenceSnapshot(routing)
  );

  const fakeToolCallGuard =
    err.code === TOOL_CALL_NOT_GENERATED_CODE ||
    err.code === "provider_tool_call_not_supported";

  log.warn("chat_completion_failed", {
    ...routingEvidenceToLogFields(routing, {
      route,
      status: err.status,
      attemptedModel:
        attemptedModels?.[attemptedModels.length - 1] ?? requestedModel,
      providerId: providerId ?? null,
      providerLabel: providerId ?? null,
      upstreamStatus: (lastAttempt ?? err).upstreamStatus ?? null,
      upstreamErrorCode: (lastAttempt ?? err).code ?? null,
    }),
    code: err.code ?? "failed",
    message: err.publicMessage,
    upstreamErrorMessage: (lastAttempt ?? err).upstreamErrorSnippet,
    ...(typeof timeoutMs === "number" ? { timeoutMs } : {}),
    fakeToolCallGuard,
    ...(fakeToolCallGuard
      ? {
          hasTools: true,
          strictToolCall: true,
          upstreamReturnedToolCalls: false,
        }
      : {}),
    supportsTools: modelSupportsTools(requestedModel),
    fallbackSkippedReason:
      err.code === "upstream_timeout" ? "request_failed" : null,
  });

  return routing;
}

function insufficientCreditsError(): ApiError {
  return new ApiError({
    status: 402,
    message: "Insufficient credits.",
    // Stable API code (dashboard). Client docs also accept alias insufficient_balance.
    code: "insufficient_credits",
    type: "billing_error",
    publicMessage:
      "Insufficient balance. Please top up credits in the Tokfai dashboard.",
  });
}

/** Drop client-supplied billing/tenant fields; never read them for auth or pricing. */
function stripClientBillingOverrides(
  body: ChatCompletionRequestBody
): ChatCompletionRequestBody {
  const copy = { ...body } as Record<string, unknown>;
  for (const key of FORBIDDEN_CLIENT_BILLING_KEYS) {
    delete copy[key];
  }
  return copy as ChatCompletionRequestBody;
}

async function writeUsageLog(
  entry: UsageLogInsert,
  endpoint: string,
  responseSnapshot?: Record<string, unknown> | null
): Promise<void> {
  const { error } = await supabase().from("usage_logs").insert({
    ...entry,
    endpoint,
    billing_status: entry.billing_status ?? "not_billable",
    idempotency_key: entry.idempotency_key ?? null,
    billing_error: entry.billing_error ?? null,
    ...(responseSnapshot ? { response_snapshot: responseSnapshot } : {}),
  });
  if (error) {
    log.warn("usage_log_insert_failed", {
      requestId: entry.request_id,
      route: "/v1/chat/completions",
      status: 500,
      code: "usage_log_insert_failed",
      message: "Failed to write usage log.",
    });
  }
}
