import { Hono } from "hono";
import { z } from "zod";

import { ApiError } from "../errors.js";
import { env } from "../env.js";
import { log } from "../logger.js";
import {
  getChatCaller,
  requireApiKeyOrSupabaseJwt,
} from "../middleware/chatAuth.js";
import { chatGatewayMiddleware } from "../middleware/chatGateway.js";
import { supabase } from "../supabase.js";
import type { UsageLogInsert } from "../types.js";
import {
  isModelAllowedForChat,
  priceCreditsFor,
} from "../catalog/modelCatalog.js";
import { grsaiFetch, isChatFallbackEligible } from "../upstream/grsai.js";
import {
  resolveModelAttempts,
} from "../upstream/modelAliases.js";
import {
  filterAttemptsByCircuitBreaker,
  recordModelFailure,
  recordModelSuccess,
} from "../upstream/modelCircuitBreaker.js";
import {
  gatewayLimitKey,
  getGlobalUpstreamInflight,
  getKeyInflight,
  releaseGlobalUpstream,
  tryAcquireGlobalUpstream,
} from "../gateway/concurrency.js";
import {
  logGatewayOverloaded,
  logGatewayRejection,
} from "./chatGatewayLogs.js";

const ChatMessageSchema = z
  .object({
    role: z.string().min(1),
    content: z.unknown(),
  })
  .passthrough();

const ChatCompletionRequestSchema = z
  .object({
    model: z.string().min(1).optional(),
    messages: z.array(ChatMessageSchema).min(1),
    temperature: z.number().optional(),
    max_tokens: z.number().int().positive().optional(),
    stream: z.boolean().optional(),
  })
  .passthrough();

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

/**
 * /v1/chat/completions — OpenAI-compatible chat completions, customer-facing.
 *
 * Auth is handled by requireApiKeyOrSupabaseJwt (sk-tokfai_ or Supabase JWT).
 * The route proxies non-streaming
 * OpenAI-compatible requests to GRSAI and records usage after completion.
 */
export const chatRoutes = new Hono();

chatRoutes.use("/v1/chat/completions", requireApiKeyOrSupabaseJwt);
chatRoutes.use("/v1/chat/completions", chatGatewayMiddleware);

chatRoutes.post("/v1/chat/completions", async (c) => {
  const startedAt = Date.now();
  const caller = getChatCaller(c);
  const requestId = c.get("requestId" as never) as string;
  const limitKey = gatewayLimitKey(caller.apiKeyId, caller.userId);

  let body: unknown;
  try {
    body = await readJsonBodyWithLimit(c);
  } catch (err) {
    if (err instanceof ApiError && err.code === "request_body_too_large") {
      await logGatewayRejection({
        caller,
        requestId,
        err,
        limitKey,
        keyInflight: getKeyInflight(limitKey),
        globalInflight: getGlobalUpstreamInflight(),
      });
    }
    throw err;
  }
  const parsed = ChatCompletionRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Invalid chat completion request.",
      "invalid_request_error"
    );
  }

  const requestedModel = parsed.data.model || env.BOT_MODEL;
  const stream = parsed.data.stream ?? false;

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
      })
    );

    log.warn("chat_completion_rejected", {
      requestId,
      route: "/v1/chat/completions",
      status: 404,
      code: "model_not_found",
      message: `The model \`${requestedModel}\` does not exist.`,
      requestedModel,
    });

    throw ApiError.notFound(
      `The model \`${requestedModel}\` does not exist.`,
      "model_not_found"
    );
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
      })
    );

    log.warn("chat_completion_rejected", {
      requestId,
      route: "/v1/chat/completions",
      status: 400,
      code: "stream_not_supported",
      message: "Streaming is not supported yet.",
      requestedModel,
    });

    return c.json(
      {
        error: {
          message: "Streaming is not supported yet.",
          code: "stream_not_supported",
          type: "invalid_request_error",
        },
      },
      400
    );
  }

  const { isAlias, attempts: rawAttempts } = resolveModelAttempts(requestedModel);
  const attempts = isAlias
    ? filterAttemptsByCircuitBreaker(rawAttempts)
    : rawAttempts;

  if (isAlias && attempts.length === 0) {
    const err = allUpstreamsUnavailableError();
    await logChatFailure({
      caller,
      requestId,
      requestedModel,
      startedAt,
      err,
    });
    throw err;
  }

  try {
    await assertHasCredits(caller.userId);

    let lastError: ApiError | null = null;

    for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex++) {
      const attemptModel = attempts[attemptIndex]!;
      const attemptStartedAt = Date.now();

      const remainingTotalMs = env.TOKFAI_TOTAL_REQUEST_TIMEOUT_MS - (Date.now() - startedAt);
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
          });
          throw exhausted;
        }
        await logChatFailure({
          caller,
          requestId,
          requestedModel,
          startedAt,
          err: timeoutErr,
        });
        throw timeoutErr;
      }

      if (!tryAcquireGlobalUpstream()) {
        const err = ApiError.gatewayOverloaded();
        await logGatewayOverloaded({
          caller,
          requestId,
          err,
          limitKey,
          keyInflight: getKeyInflight(limitKey),
          globalInflight: getGlobalUpstreamInflight(),
          requestedModel,
          startedAt,
        });
        throw err;
      }

      try {
        const upstreamBody = {
          ...parsed.data,
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
            route: "/v1/chat/completions",
            model: attemptModel,
            requestedModel,
          }
        );

        recordModelSuccess(attemptModel);

        const usage = normalizeUsage(data.usage);
        const resolvedModel = data.model ?? attemptModel;
        const creditsCharged = await calculateCreditsCharged(resolvedModel, usage);

        await recordSuccessfulUsageAndDebit({
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
        });

        log.info("chat_completion_succeeded", {
          requestId,
          route: "/v1/chat/completions",
          status: 200,
          code: "succeeded",
          message: "Chat completion succeeded.",
          requestedModel,
          resolvedModel,
          attemptModel,
          attemptIndex,
          latencyMs: Date.now() - startedAt,
        });

        return c.json({
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
        });
      } catch (err) {
        if (!(err instanceof ApiError)) {
          throw err;
        }

        lastError = err;

        log.warn("chat_model_fallback_attempt", {
          requestId,
          route: "/v1/chat/completions",
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
          recordModelFailure(attemptModel, err.code);
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
          });
          throw exhausted;
        }

        await logChatFailure({
          caller,
          requestId,
          requestedModel,
          startedAt,
          err,
        });
        throw err;
      } finally {
        releaseGlobalUpstream();
      }
    }

    const fallbackErr =
      lastError ?? allUpstreamsUnavailableError();
    await logChatFailure({
      caller,
      requestId,
      requestedModel,
      startedAt,
      err: fallbackErr,
    });
    throw fallbackErr;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
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
      })
    );

    log.error("chat_completion_failed", {
      requestId,
      route: "/v1/chat/completions",
      status: 500,
      code: "server_error",
      message: "Internal error.",
      requestedModel,
    });

    throw ApiError.internal(
      err instanceof Error ? err.message : "Chat completion failed.",
      "server_error"
    );
  }
});

async function readJsonBodyWithLimit(c: {
  req: {
    text: () => Promise<string>;
    header: (name: string) => string | undefined;
  };
}): Promise<unknown> {
  const raw = await c.req.text().catch(() => {
    throw ApiError.badRequest("Invalid JSON body.", "invalid_request_error");
  });

  if (raw.length > env.TOKFAI_CHAT_BODY_MAX_BYTES) {
    throw ApiError.payloadTooLarge();
  }

  if (!raw.trim()) {
    throw ApiError.badRequest("Invalid JSON body.", "invalid_request_error");
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw ApiError.badRequest("Invalid JSON body.", "invalid_request_error");
  }
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
  Partial<
    Pick<UsageLogInsert, "upstream_status" | "upstream_error_code">
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
  entry: UsageLogInsert
): Promise<void> {
  const { error } = await supabase().rpc("record_usage_and_debit", {
    p_user_id: entry.user_id,
    p_api_key_id: entry.api_key_id,
    p_model: entry.model,
    p_prompt_tokens: entry.prompt_tokens,
    p_completion_tokens: entry.completion_tokens,
    p_total_tokens: entry.total_tokens,
    p_credits_charged: entry.credits_charged ?? 0,
    p_request_id: entry.request_id,
    p_upstream_id: entry.upstream_id,
    p_latency_ms: entry.latency_ms,
    p_billable: entry.billable,
    p_finish_reason: entry.finish_reason,
    p_upstream_status: entry.upstream_status,
    p_upstream_error_code: entry.upstream_error_code,
    p_safety_reason: entry.safety_reason,
  });

  if (!error) return;

  if (
    error.code === "P0001" ||
    error.message.toLowerCase().includes("insufficient_credits")
  ) {
    throw insufficientCreditsError();
  }

  throw ApiError.internal(
    `Usage billing failed: ${error.message}`,
    "usage_billing_failed"
  );
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
  caller: ReturnType<typeof getChatCaller>;
  requestId: string;
  requestedModel: string;
  startedAt: number;
  err: ApiError;
  lastAttempt?: ApiError;
}): Promise<void> {
  const { caller, requestId, requestedModel, startedAt, err, lastAttempt } = args;

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
    })
  );

  log.warn("chat_completion_failed", {
    requestId,
    route: "/v1/chat/completions",
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

async function writeUsageLog(entry: UsageLogInsert): Promise<void> {
  const { error } = await supabase().from("usage_logs").insert(entry);
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
