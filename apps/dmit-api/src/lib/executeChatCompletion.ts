import { z } from "zod";

import { ApiError } from "../errors.js";
import { env } from "../env.js";
import { log } from "../logger.js";
import type { ChatCaller } from "../middleware/chatAuth.js";
import { supabase } from "../supabase.js";
import type { UsageLogInsert } from "../types.js";
import {
  isModelAllowedForChat,
  priceCreditsFor,
} from "../catalog/modelCatalog.js";
import { grsaiFetch, isChatFallbackEligible } from "../upstream/grsai.js";
import { resolveModelAttempts } from "../upstream/modelAliases.js";
import {
  filterAttemptsByCircuitBreaker,
  recordModelFailure,
  recordModelSuccess,
} from "../upstream/modelCircuitBreaker.js";
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
    };

export async function executeChatCompletion(
  input: ExecuteChatCompletionInput
): Promise<ExecuteChatCompletionResult> {
  const startedAt = Date.now();
  const { caller, requestId } = input;
  const route = input.route ?? "/v1/chat/completions";
  const limitKey = input.limitKey ?? caller.apiKeyId ?? `user:${caller.userId}`;

  const requestedModel = input.body.model || env.BOT_MODEL;
  const stream = input.body.stream ?? false;

  if (!(await isModelAllowedForChat(requestedModel))) {
    await writeUsageLog(
      failedUsageLog({
        user_id: caller.userId,
        api_key_id: caller.apiKeyId,
        model: requestedModel,
        status: "failed",
        request_id: requestId,
        error_code: "model_not_found",
        error_message: `The model \`${requestedModel}\` does not exist.`,
        latency_ms: Date.now() - startedAt,
      }),
      route
    );

    return {
      ok: false,
      errorCode: "model_not_found",
      errorMessage: `The model \`${requestedModel}\` does not exist.`,
      requestId,
      httpStatus: 404,
    };
  }

  if (stream) {
    await writeUsageLog(
      failedUsageLog({
        user_id: caller.userId,
        api_key_id: caller.apiKeyId,
        model: requestedModel,
        status: "failed",
        request_id: requestId,
        error_code: "stream_not_supported",
        error_message: "Streaming is not supported yet.",
        latency_ms: Date.now() - startedAt,
      }),
      route
    );

    return {
      ok: false,
      errorCode: "stream_not_supported",
      errorMessage: "Streaming is not supported yet.",
      requestId,
      httpStatus: 400,
    };
  }

  const { isAlias, attempts: rawAttempts } = resolveModelAttempts(requestedModel);
  const attempts = isAlias
    ? await filterAttemptsByCircuitBreaker(rawAttempts)
    : rawAttempts;

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
    return failureResult(err, requestId);
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
          return failureResult(exhausted, requestId);
        }
        await logChatFailure({
          caller,
          requestId,
          requestedModel,
          startedAt,
          err: timeoutErr,
          route,
        });
        return failureResult(timeoutErr, requestId);
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
        return failureResult(err, requestId);
      }

      try {
        const upstreamBody = {
          ...input.body,
          model: attemptModel,
          stream: false,
        };

        const perAttemptTimeoutMs = Math.min(
          env.TOKFAI_UPSTREAM_TIMEOUT_MS,
          remainingTotalMs
        );

        const { data, upstreamId } = await grsaiFetch<ChatCompletionResponse>(
          env.GRSAI_CHAT_COMPLETIONS_PATH,
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
          }
        );

        await recordModelSuccess(attemptModel);

        const usage = normalizeUsage(data.usage);
        const resolvedModel = data.model ?? attemptModel;
        const creditsCharged = await calculateCreditsCharged(resolvedModel, usage);

        const response: Record<string, unknown> = {
          ...data,
          model: resolvedModel,
          credits_charged: creditsCharged,
          request_id: requestId,
          tokfai: {
            credits_charged: creditsCharged,
            request_id: requestId,
            requested_model: requestedModel,
            resolved_model: resolvedModel,
            ...(isAlias ? { fallback_attempts: attemptIndex + 1 } : {}),
          },
        };

        await recordSuccessfulUsageAndDebit(
          {
            user_id: caller.userId,
            api_key_id: caller.apiKeyId,
            model: resolvedModel,
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

        log.warn("chat_model_fallback_attempt", {
          requestId,
          route,
          requestedModel,
          attemptModel,
          attemptIndex,
          status: err.status,
          code: err.code ?? "failed",
          upstreamStatus: err.upstreamStatus,
          upstreamErrorMessage: err.upstreamErrorSnippet,
          latencyMs: Date.now() - attemptStartedAt,
        });

        if (isAlias && isChatFallbackEligible(err)) {
          await recordModelFailure(attemptModel, err.code);
        }

        const hasNextAttempt = isAlias && attemptIndex < attempts.length - 1;
        if (hasNextAttempt && isChatFallbackEligible(err)) {
          continue;
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
          return failureResult(exhausted, requestId);
        }

        await logChatFailure({
          caller,
          requestId,
          requestedModel,
          startedAt,
          err,
          route,
        });
        return failureResult(err, requestId);
      } finally {
        await releaseGlobalUpstream();
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
    return failureResult(fallbackErr, requestId);
  } catch (err) {
    if (err instanceof ApiError) {
      return failureResult(err, requestId);
    }

    await writeUsageLog(
      failedUsageLog({
        user_id: caller.userId,
        api_key_id: caller.apiKeyId,
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
  requestId: string
): Extract<ExecuteChatCompletionResult, { ok: false }> {
  return {
    ok: false,
    errorCode: err.code ?? "failed",
    errorMessage: err.publicMessage,
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
  usage: ReturnType<typeof normalizeUsage>
): Promise<number> {
  const raw = await priceCreditsFor(
    model,
    usage.promptTokens ?? 0,
    usage.completionTokens ?? 0
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
