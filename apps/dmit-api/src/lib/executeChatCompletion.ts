import { z } from "zod";

import { isSlowExperimentalChatModel } from "../catalog/modelRegistry.js";

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
import { buildUpstreamChatBody } from "./upstreamChatBody.js";
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
import { logGatewayOverloaded } from "../routes/chatGatewayLogs.js";
import {
  lookupBillingIdempotency,
  recordSuccessfulUsageAndDebit as persistSuccessfulUsageAndDebit,
} from "./usageBilling.js";
import { resolveUpstreamTimeoutPolicy } from "./upstreamTimeoutPolicy.js";

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

  const timeoutPolicy = resolveUpstreamTimeoutPolicy({
    route,
    requestedModel: requestedRaw,
    resolvedModel: requestedModel,
    body,
    clientStream,
  });

  log.info("upstream_timeout_policy", {
    requestId,
    route,
    requestedModel: requestedRaw,
    resolvedModel: requestedModel,
    tier: timeoutPolicy.tier,
    isHeavy: timeoutPolicy.isHeavy,
    timeoutMs: timeoutPolicy.upstreamTimeoutMs,
    idleTimeoutMs: timeoutPolicy.idleTimeoutMs,
    totalTimeoutMs: timeoutPolicy.totalTimeoutMs,
    reason: timeoutPolicy.reason,
    clientStream,
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
      }),
      route
    );

    return {
      ok: false,
      errorCode,
      errorMessage,
      requestId,
      httpStatus: 400,
      suggestedModels,
    };
  }

  if (!(await isModelEnabledForTenant(caller.tenantId, requestedModel))) {
    const errorCode = "model_disabled_for_tenant";
    const errorMessage = `Model is not available on this site: ${requestedRaw}`;

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
      }),
      route
    );

    return {
      ok: false,
      errorCode,
      errorMessage,
      requestId,
      httpStatus: 403,
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
    await logChatFailure({
      caller,
      requestId,
      requestedModel,
      startedAt,
      err,
      route,
    });
    return failureResult(err, requestId, requestedModel);
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

      const snapshot = replay.responseSnapshot;
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
      await assertCreditPeriodLimits(caller.userId);
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
        await logChatFailure({
          caller,
          requestId,
          requestedModel,
          startedAt,
          err,
          route,
          timeoutMs: timeoutPolicy.upstreamTimeoutMs,
        });
        return failureResult(err, requestId, requestedModel);
      }
      heavySlotHeld = true;
    }

    try {
      return await runProviderAttempts({
        caller,
        requestId,
        route,
        limitKey,
        body,
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
      return failureResult(err, requestId, requestedModel);
    }

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
      }),
      route
    );

    log.error("chat_completion_failed", {
      requestId,
      route,
      status: 500,
      code: "server_error",
      message: "Internal error.",
      requestedModel,
    });

    return {
      ok: false,
      errorCode: "server_error",
      errorMessage: "Internal error.",
      requestId,
      httpStatus: 500,
    };
  }
}

async function runProviderAttempts(args: {
  caller: ChatCaller;
  requestId: string;
  route: string;
  limitKey: string;
  body: ChatCompletionRequestBody;
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
    if (allDegraded && providerAttempts.length === 1 && !isAlias) {
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
      await logChatFailure({
        caller,
        requestId,
        requestedModel,
        startedAt,
        err: timeoutErr,
        route,
        providerId: degradedProvider.id,
        timeoutMs: timeoutPolicy.upstreamTimeoutMs,
      });
      return failureResultWithSuggestions(timeoutErr, requestId, requestedModel, {
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
          await logChatFailure({
            caller,
            requestId,
            requestedModel,
            startedAt,
            err: exhausted,
            lastAttempt: timeoutErr,
            route,
            providerId: provider.id,
            timeoutMs: timeoutPolicy.upstreamTimeoutMs,
          });
          return failureResultWithSuggestions(
            exhausted,
            requestId,
            requestedModel,
            { suggestSwitchModel: true }
          );
        }
        await logChatFailure({
          caller,
          requestId,
          requestedModel,
          startedAt,
          err: timeoutErr,
          route,
          providerId: provider.id,
          timeoutMs: timeoutPolicy.upstreamTimeoutMs,
        });
        return failureResultWithSuggestions(
          timeoutErr,
          requestId,
          requestedModel,
          { suggestSwitchModel: true }
        );
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
        return failureResult(err, requestId, requestedModel);
      }

      try {
        const upstreamBody = buildUpstreamChatBody(body, attemptModel);

        const perAttemptTimeoutMs = Math.min(
          timeoutPolicy.upstreamTimeoutMs,
          remainingTotalMs
        );
        const idleTimeoutMs = clientStream
          ? Math.min(timeoutPolicy.idleTimeoutMs, remainingTotalMs)
          : undefined;

        const { data, upstreamId } = await providerFetch<ChatCompletionResponse>(
          provider,
          provider.chatPath,
          {
            method: "POST",
            json: upstreamBody,
            timeoutMs: perAttemptTimeoutMs,
            ...(idleTimeoutMs != null ? { idleTimeoutMs } : {}),
          },
          {
            requestId,
            route,
            model: attemptModel,
            requestedModel,
            resolvedModel: requestedModel,
            providerId: provider.id,
          }
        );

        await recordModelSuccess(attemptModel);
        await recordProviderModelSuccess(provider.id, attemptModel);

        const usage = normalizeUsage(data.usage);
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

        const response: Record<string, unknown> = {
          ...data,
          // Upstream may omit or send empty object; OpenAI clients require this.
          object: "chat.completion",
          model: resolvedModel,
          credits_charged: creditsCharged,
          request_id: requestId,
          tokfai: {
            credits_charged: creditsCharged,
            request_id: requestId,
            requested_model: requestedRaw,
            resolved_model: resolvedModel,
            ...(isAlias ? { fallback_attempts: attemptIndex + 1 } : {}),
          },
        };

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
            finish_reason: extractFinishReason(data),
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

        log.info("chat_completion_succeeded", {
          requestId,
          route,
          status: 200,
          code: "succeeded",
          message: "Chat completion succeeded.",
          requestedModel,
          resolvedModel,
          attemptModel,
          attemptIndex,
          providerId: provider.id,
          providerIndex,
          latencyMs: Date.now() - startedAt,
          timeoutMs: perAttemptTimeoutMs,
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
          await logChatFailure({
            caller,
            requestId,
            requestedModel,
            startedAt,
            err: exhausted,
            lastAttempt: err,
            route,
            providerId: provider.id,
            timeoutMs: attemptTimeoutMs,
          });
          return failureResultWithSuggestions(
            exhausted,
            requestId,
            requestedModel,
            { suggestSwitchModel: true }
          );
        }

        await logChatFailure({
          caller,
          requestId,
          requestedModel,
          startedAt,
          err,
          route,
          providerId: provider.id,
          timeoutMs: attemptTimeoutMs,
        });
        return failureResultWithSuggestions(err, requestId, requestedModel, {
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

  const fallbackErr = lastError ?? allUpstreamsUnavailableError();
  await logChatFailure({
    caller,
    requestId,
    requestedModel,
    startedAt,
    err: fallbackErr,
    route,
    timeoutMs: timeoutPolicy.upstreamTimeoutMs,
  });
  return failureResult(fallbackErr, requestId, requestedModel);
}

function failureResult(
  err: ApiError,
  requestId: string,
  requestedModel?: string
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
  };
}

async function failureResultWithSuggestions(
  err: ApiError,
  requestId: string,
  requestedModel: string,
  opts?: { suggestSwitchModel?: boolean }
): Promise<Extract<ExecuteChatCompletionResult, { ok: false }>> {
  const base = failureResult(err, requestId, requestedModel);
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
      "upstream_status" | "upstream_error_code" | "safety_reason"
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
      : code === "upstream_model_busy" || code === "all_upstreams_unavailable"
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

async function logChatFailure(args: {
  caller: ChatCaller;
  requestId: string;
  requestedModel: string;
  startedAt: number;
  err: ApiError;
  lastAttempt?: ApiError;
  route: string;
  providerId?: string;
  timeoutMs?: number;
}): Promise<void> {
  const {
    caller,
    requestId,
    requestedModel,
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
    err.code === "all_upstreams_unavailable" ||
    err.code === "rate_limited" ||
    err.code === "too_many_requests" ||
    err.code === "too_many_concurrent_requests"
      ? "rate_limited"
      : "failed";

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
      // Ops-only breadcrumb for timeout reports (not billing). Format: provider=<id>
      safety_reason: providerId ? `provider=${providerId}` : null,
      ...upstreamFailureFields(lastAttempt ?? err),
    }),
    route
  );

  log.warn("chat_completion_failed", {
    requestId,
    route,
    requestedModel,
    resolvedModel: requestedModel,
    providerId: providerId ?? null,
    status: err.status,
    code: err.code ?? "failed",
    message: err.publicMessage,
    upstreamStatus: (lastAttempt ?? err).upstreamStatus,
    upstreamErrorCode: (lastAttempt ?? err).code ?? null,
    upstreamErrorMessage: (lastAttempt ?? err).upstreamErrorSnippet,
    latencyMs: Date.now() - startedAt,
    ...(typeof timeoutMs === "number" ? { timeoutMs } : {}),
    billing_status: "not_billable",
    fallbackSkippedReason:
      err.code === "upstream_timeout" ? "request_failed" : null,
  });
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
  endpoint: string
): Promise<void> {
  const { error } = await supabase().from("usage_logs").insert({
    ...entry,
    endpoint,
    billing_status: entry.billing_status ?? "not_billable",
    idempotency_key: entry.idempotency_key ?? null,
    billing_error: entry.billing_error ?? null,
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
