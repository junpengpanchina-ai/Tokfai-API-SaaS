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
  resolveChatModel,
} from "../upstream/modelAliases.js";
import { resolveProviderAttempts } from "../upstream/providers.js";
import {
  filterAttemptsByCircuitBreaker,
  recordModelFailure,
  recordModelSuccess,
} from "../upstream/modelCircuitBreaker.js";
import { buildUpstreamChatBody } from "./upstreamChatBody.js";
import {
  releaseGlobalUpstream,
  tryAcquireGlobalUpstream,
} from "../gateway/concurrency.js";
import { logGatewayOverloaded } from "../routes/chatGatewayLogs.js";
import {
  lookupBillingIdempotency,
  recordSuccessfulUsageAndDebit as persistSuccessfulUsageAndDebit,
} from "./usageBilling.js";

export const ChatMessageSchema = z
  .object({
    role: z.string().min(1),
    content: z.unknown(),
  })
  .passthrough();

export const ChatCompletionRequestSchema = z
  .object({
    model: z.string().min(1).optional(),
    messages: z.array(ChatMessageSchema).min(1),
    temperature: z.number().optional(),
    top_p: z.number().optional(),
    max_tokens: z.number().int().positive().optional(),
    stream: z.boolean().optional(),
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

  const requestedRaw = (input.body.model || env.BOT_MODEL).trim();
  const resolvedRequest = resolveChatModel(requestedRaw);
  /** Internal catalog / alias id after consumer compatibility rewrite. */
  const requestedModel = resolvedRequest.canonicalId;

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
    const errorCode = "model_not_supported";
    const errorMessage = formatModelNotRegisteredMessage(requestedRaw);

    log.warn("model_not_supported", {
      code: "model_not_supported",
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
    await assertHasCredits(caller.userId);

    let lastError: ApiError | null = null;

    for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex++) {
      const attemptModel = attempts[attemptIndex]!;
      const providerAttempts = resolveProviderAttempts(attemptModel);

      if (providerAttempts.length === 0) {
        lastError = allUpstreamsUnavailableError();
        if (isAlias && attemptIndex < attempts.length - 1) {
          continue;
        }
        break;
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
          env.TOKFAI_TOTAL_REQUEST_TIMEOUT_MS - (Date.now() - startedAt);
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
            });
            return failureResult(exhausted, requestId, requestedModel);
          }
          await logChatFailure({
            caller,
            requestId,
            requestedModel,
            startedAt,
            err: timeoutErr,
            route,
          });
          return failureResult(timeoutErr, requestId, requestedModel);
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
          const upstreamBody = buildUpstreamChatBody(input.body, attemptModel);

          const perAttemptTimeoutMs = Math.min(
            env.TOKFAI_UPSTREAM_TIMEOUT_MS,
            remainingTotalMs
          );

          const { data, upstreamId } = await providerFetch<ChatCompletionResponse>(
            provider,
            provider.chatPath,
            {
              method: "POST",
              json: upstreamBody,
              timeoutMs: perAttemptTimeoutMs,
            },
            {
              requestId,
              route,
              model: attemptModel,
              requestedModel,
              providerId: provider.id,
            }
          );

          await recordModelSuccess(attemptModel);

          const usage = normalizeUsage(data.usage);
          // Consumer-facing resolved id = Tokfai catalog/alias (e.g. gpt-5-pro).
          // Bill by the concrete attempt that served the request (existing pricing path).
          const resolvedModel = requestedModel;
          const billableModel = attemptModel;
          const creditsCharged = await calculateCreditsCharged(
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
              idempotencyKey: input.idempotencyKey ?? null,
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

          log.warn("chat_provider_fallback_attempt", {
            requestId,
            route,
            requestedModel,
            attemptModel,
            attemptIndex,
            providerId: provider.id,
            providerIndex,
            status: err.status,
            code: err.code ?? "failed",
            upstreamStatus: err.upstreamStatus,
            upstreamErrorMessage: err.upstreamErrorSnippet,
            latencyMs: Date.now() - attemptStartedAt,
          });

          const hasNextProvider =
            providerIndex < providerAttempts.length - 1 &&
            isChatFallbackEligible(err);

          if (hasNextProvider) {
            continue;
          }

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
            });
            return failureResult(exhausted, requestId, requestedModel);
          }

          await logChatFailure({
            caller,
            requestId,
            requestedModel,
            startedAt,
            err,
            route,
          });
          return failureResult(err, requestId, requestedModel);
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
    });
    return failureResult(fallbackErr, requestId, requestedModel);
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
  Partial<Pick<UsageLogInsert, "upstream_status" | "upstream_error_code">>;

function failedUsageLog(fields: FailedUsageLogFields): UsageLogInsert {
  return {
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
    credits_charged: null,
    upstream_id: null,
    billable: false,
    finish_reason: null,
    upstream_status: fields.upstream_status ?? null,
    upstream_error_code: fields.upstream_error_code ?? null,
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
}): Promise<void> {
  const { caller, requestId, requestedModel, startedAt, err, lastAttempt, route } =
    args;

  await writeUsageLog(
    failedUsageLog({
      user_id: caller.userId,
      api_key_id: caller.apiKeyId,
      tenant_id: caller.tenantId,
      model: requestedModel,
      status:
        err.code === "upstream_rate_limited" ||
        err.code === "upstream_model_busy" ||
        err.code === "all_upstreams_unavailable"
          ? "rate_limited"
          : "failed",
      request_id: requestId,
      error_code: err.code ?? null,
      error_message: err.publicMessage,
      latency_ms: Date.now() - startedAt,
      ...upstreamFailureFields(lastAttempt ?? err),
    }),
    route
  );

  log.warn("chat_completion_failed", {
    requestId,
    route,
    requestedModel,
    status: err.status,
    code: err.code ?? "failed",
    message: err.publicMessage,
    upstreamStatus: (lastAttempt ?? err).upstreamStatus,
    upstreamErrorMessage: (lastAttempt ?? err).upstreamErrorSnippet,
    latencyMs: Date.now() - startedAt,
  });
}

function insufficientCreditsError(): ApiError {
  return new ApiError({
    status: 402,
    message: "Insufficient credits.",
    code: "insufficient_credits",
    type: "billing_error",
  });
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
