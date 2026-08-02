import { z } from "zod";

import { isImageModel } from "../capabilities/modelCapabilityPolicy.js";
import { IMAGE_MODEL_NOT_FOR_CHAT_CODE } from "./imageProviderIsolation.js";
import { isSlowExperimentalChatModel } from "../catalog/modelRegistry.js";
import {
  ALL_TOOL_UPSTREAMS_UNAVAILABLE_CODE,
  MODEL_NOT_TOOL_CAPABLE_CODE,
  MODEL_NOT_TOOL_CAPABLE_MESSAGE,
  TOOL_CALL_NOT_GENERATED_CODE,
  TOOLS_CAPABLE_FALLBACK_MODELS,
  clientRequiresToolCall,
  extractResponseFinishReason,
  isStrictToolCallRequest,
  isVerifiedToolCapableModel,
  modelSupportsTools,
  normalizeToolCallsOnChatCompletion,
  requestHasTools,
  resolveToolsCapableAttempts,
  responseHasToolCalls,
  stripToolsFromChatBody,
  toolChoiceSummary,
} from "./toolCallCapability.js";
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
} from "./chatUsageFallback.js";
import {
  isGemini25FlashNonStreamStreamFallbackPath,
  isGemini25FlashStreamFallbackEligible,
} from "./gemini25FlashNonStreamStreamFallback.js";
import {
  releaseGlobalUpstream,
  releaseHeavyResponses,
  tryAcquireGlobalUpstream,
  tryAcquireHeavyResponses,
} from "../gateway/concurrency.js";
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
   * idempotent replay.
   */
  onAfterPrecheck?: () => void | Promise<void>;
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

  // P974 — tools routing: verified whitelist only; auto may degrade to chat.
  const hasTools = requestHasTools(body);
  const strictToolCallRequest = isStrictToolCallRequest(body);
  const verifiedRequested =
    isVerifiedToolCapableModel(requestedRaw) ||
    isVerifiedToolCapableModel(requestedModel);
  let toolsFallbackApplied = false;
  let toolsDegradedToChat = false;
  let upstreamBodySource: ChatCompletionRequestBody = body;

  if (hasTools && strictToolCallRequest && !verifiedRequested) {
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
          attemptedModels: attempts.length > 0 ? attempts : [requestedModel],
          fallbackReason: "model_not_tool_capable",
        }),
        {
          route,
          status: 400,
          attemptedModel: attempts[0] ?? requestedModel,
          providerId: null,
          providerLabel: null,
          upstreamStatus: null,
          upstreamErrorCode: null,
        }
      ),
      supportsTools: false,
      hasTools: true,
      toolChoice: toolChoiceSummary(body),
      requireToolCall: clientRequiresToolCall(body),
      strictToolCall: true,
      bodyKeys: chatBodyKeysForLog(body),
    });
    const routing = makeFailRouting({
      errorCode,
      attemptedModels: attempts.length > 0 ? attempts : [requestedModel],
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

  if (hasTools && !strictToolCallRequest && !verifiedRequested) {
    // tool_choice:auto on unverified model → ordinary chat (no forged tool_calls).
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
      toolChoice: toolChoiceSummary(body),
      autoNoToolCall: true,
      supportsTools: false,
    });
  } else if (hasTools && verifiedRequested) {
    const toolsResolved = resolveToolsCapableAttempts({
      requestedModel: requestedRaw,
      attempts: attempts.length > 0 ? attempts : [requestedModel],
    });
    if (!toolsResolved) {
      const errorCode = MODEL_NOT_TOOL_CAPABLE_CODE;
      const errorMessage = MODEL_NOT_TOOL_CAPABLE_MESSAGE;
      const routing = makeFailRouting({
        errorCode,
        attemptedModels: attempts.length > 0 ? attempts : [requestedModel],
        fallbackReason: "model_not_tool_capable",
      });
      log.warn("model_not_tool_capable", {
        code: errorCode,
        ...routingEvidenceToLogFields(routing, {
          route,
          status: 400,
          attemptedModel: attempts[0] ?? requestedModel,
          providerId: null,
          providerLabel: null,
          upstreamStatus: null,
          upstreamErrorCode: null,
        }),
        supportsTools: false,
        hasTools: true,
        toolChoice: toolChoiceSummary(body),
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
        routing,
      };
    }
    toolsFallbackApplied = toolsResolved.fallbackApplied;
    attempts = toolsResolved.attempts;
    log.info("chat_tools_capability", {
      requestId,
      route,
      requestedModel: requestedRaw,
      resolvedModel: requestedModel,
      attemptedModel: attempts[0] ?? null,
      supportsTools: toolsResolved.supportsTools,
      supportsToolsRequested: verifiedRequested,
      hasTools: true,
      toolChoice: toolChoiceSummary(body),
      bodyKeys: chatBodyKeysForLog(body),
      toolsFallbackApplied,
      attempts,
    });
  } else {
    log.info("chat_request_capability", {
      requestId,
      route,
      requestedModel: requestedRaw,
      resolvedModel: requestedModel,
      supportsTools: verifiedRequested,
      hasTools: false,
      toolChoice: toolChoiceSummary(body),
      bodyKeys: chatBodyKeysForLog(body),
    });
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

    let heavySlotHeld = false;
    if (timeoutPolicy.isHeavy) {
      if (!(await tryAcquireHeavyResponses(limitKey))) {
        const err = ApiError.heavyResponsesRateLimited();
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
          timeoutMs: timeoutPolicy.upstreamTimeoutMs,
        });
        return failureResult(err, requestId, requestedModel, routing);
      }
      heavySlotHeld = true;
    }

    try {
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
      if (heavySlotHeld) {
        await releaseHeavyResponses(limitKey);
      }
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
        const upstreamBody = buildUpstreamChatBody(body, attemptModel);
        if (attemptIndex === 0) {
          const droppedKeys = droppedUpstreamChatKeysForAudit(
            clientBody as Record<string, unknown>
          );
          if (droppedKeys.length > 0) {
            log.info("upstream_chat_body_keys_dropped", {
              requestId,
              route,
              // Names only — never log client field values.
              droppedKeys: droppedKeys.slice(0, 40),
              droppedKeyCount: droppedKeys.length,
            });
          }
        }

        const perAttemptTimeoutMs = Math.min(
          timeoutPolicy.upstreamTimeoutMs,
          remainingTotalMs
        );

        const useGemini25FlashStreamFallback =
          isGemini25FlashNonStreamStreamFallbackPath({
            clientStream,
            attemptModel,
            requestedModel,
            route,
          });

        // Idle timeout applies only to real client-stream SSE paths that do
        // not use the gemini-2.5-flash native-first helper below.
        const idleTimeoutMs =
          clientStream && !useGemini25FlashStreamFallback
            ? Math.min(timeoutPolicy.idleTimeoutMs, remainingTotalMs)
            : undefined;

        const logCtx = {
          requestId,
          route,
          model: attemptModel,
          requestedModel,
          resolvedModel: requestedModel,
          providerId: provider.id,
        };

        let data: ChatCompletionResponse;
        let upstreamId: string | null;
        let viaStreamFallback = false;

        if (useGemini25FlashStreamFallback) {
          // Non-stream client requests: ALWAYS prefer native non-stream with
          // the full attempt budget. Never default to stream assemble.
          // Client stream=true: short native probe; if non-stream circuit is
          // already open, treat native as unavailable → assemble fallback.
          const remainingMs =
            timeoutPolicy.totalTimeoutMs - (Date.now() - startedAt);
          if (remainingMs <= 5_000 && allDegraded && clientStream) {
            throw ApiError.requestTimeout(
              "Upstream provider timed out.",
              "上游模型响应超时，请稍后重试或切换模型。"
            );
          }
          const streamWallMs = Math.max(5_000, remainingMs);
          const streamIdleMs = Math.min(
            timeoutPolicy.idleTimeoutMs,
            streamWallMs
          );
          const nativeTimeoutMs = clientStream
            ? Math.min(20_000, perAttemptTimeoutMs)
            : perAttemptTimeoutMs;
          // Client stream=false must never skip native due to circuit alone.
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
                isStreamAssembleEligible: isGemini25FlashStreamFallbackEligible,
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
              remainingMs,
              streamWallMs,
              streamIdleMs,
            });
          }
          data = fetched.data;
          upstreamId = fetched.upstreamId;
          viaStreamFallback = fetched.viaStreamAssemble;
        } else {
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

        await recordModelSuccess(attemptModel);
        await recordProviderModelSuccess(provider.id, attemptModel);

        const normalizedData = normalizeToolCallsOnChatCompletion(
          data as unknown as Record<string, unknown>
        );

        const hasToolsClient = requestHasTools(clientBody);
        const strictToolCall =
          !toolsDegradedToChat && isStrictToolCallRequest(clientBody);
        const requireToolCall = clientRequiresToolCall(clientBody);
        const upstreamReturnedToolCalls = responseHasToolCalls(normalizedData);
        const finishReasonRaw =
          extractResponseFinishReason(normalizedData) ??
          extractFinishReason(normalizedData as unknown as ChatCompletionResponse);

        // P971 — fake tool-call guard: strict request without tool_calls must not bill.
        if (strictToolCall && !upstreamReturnedToolCalls) {
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
          // Do not debit; treat as attempt failure so alias chains can retry.
          throw guardErr;
        }

        const upstreamUsage = normalizeUsage(data.usage);
        const shouldEstimateUsage = shouldEstimateChatUsage({
          providerId: provider.id,
          usage: upstreamUsage,
          responseBody: normalizedData,
        });
        // P998 — GRSAI all-zero usage + billable output → local UTF-8 estimate.
        // Any positive upstream usage is trusted as-is (total may be coalesced).
        const usage = shouldEstimateUsage
          ? estimateChatUsageFromPayload({
              requestBody: upstreamBody,
              responseBody: normalizedData,
            })
          : coalesceUpstreamUsageTotal(upstreamUsage);

        if (shouldEstimateUsage) {
          log.warn("chat_usage_estimated", {
            requestId,
            route,
            providerId: provider.id,
            attemptedModel: attemptModel,
            usageSource: "estimated",
            estimationAlgorithm: CHAT_USAGE_ESTIMATION_ALGORITHM,
            upstreamPromptTokens: upstreamUsage.promptTokens,
            upstreamCompletionTokens: upstreamUsage.completionTokens,
            upstreamTotalTokens: upstreamUsage.totalTokens,
            estimatedPromptTokens: usage.promptTokens,
            estimatedCompletionTokens: usage.completionTokens,
            estimatedTotalTokens: usage.totalTokens,
          });
        }

        // Consumer-facing resolved id = Tokfai catalog/alias (e.g. gpt-5-pro).
        // Bill by the concrete attempt that served the request (never alias floor price).
        const resolvedModel = requestedModel;
        const billableModel = attemptModel;
        const creditsCharged = unlimited
          ? 0
          : await calculateCreditsCharged(
              billableModel,
              usage,
              caller.tenantId
            );

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
          usage: {
            prompt_tokens: usage.promptTokens ?? 0,
            completion_tokens: usage.completionTokens ?? 0,
            total_tokens:
              usage.totalTokens ??
              (usage.promptTokens ?? 0) + (usage.completionTokens ?? 0),
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
                    strict_tool_call: strictToolCall,
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
