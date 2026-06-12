import { Hono } from "hono";
import { z } from "zod";

import { ApiError } from "../errors.js";
import { env } from "../env.js";
import { log } from "../logger.js";
import {
  getChatCaller,
  requireApiKeyOrSupabaseJwt,
} from "../middleware/chatAuth.js";
import { supabase } from "../supabase.js";
import type { UsageLogInsert } from "../types.js";
import {
  isModelAllowedForChat,
  priceCreditsFor,
} from "../catalog/modelCatalog.js";
import { grsaiFetch } from "../upstream/grsai.js";

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
  "upstream_error",
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

chatRoutes.post("/v1/chat/completions", async (c) => {
  const startedAt = Date.now();
  const caller = getChatCaller(c);
  const requestId = c.get("requestId" as never) as string;

  const body = await readJsonBody(c.req.json());
  const parsed = ChatCompletionRequestSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Invalid chat completion request.",
      "invalid_request_error"
    );
  }

  const resolvedModel = parsed.data.model || env.BOT_MODEL;
  const stream = parsed.data.stream ?? false;

  if (!(await isModelAllowedForChat(resolvedModel))) {
    await writeUsageLog(
      failedUsageLog({
        user_id: caller.userId,
        api_key_id: caller.apiKeyId,
        model: resolvedModel,
        status: "failed",
        request_id: requestId,
        error_code: "model_not_found",
        error_message: `The model \`${resolvedModel}\` does not exist.`,
        latency_ms: Date.now() - startedAt,
      })
    );

    log.warn("chat_completion_rejected", {
      requestId,
      route: "/v1/chat/completions",
      status: 404,
      code: "model_not_found",
      message: `The model \`${resolvedModel}\` does not exist.`,
    });

    throw ApiError.notFound(
      `The model \`${resolvedModel}\` does not exist.`,
      "model_not_found"
    );
  }

  if (stream) {
    await writeUsageLog(
      failedUsageLog({
        user_id: caller.userId,
        api_key_id: caller.apiKeyId,
        model: resolvedModel,
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

  const upstreamBody = {
    ...parsed.data,
    model: resolvedModel,
    stream,
  };

  try {
    await assertHasCredits(caller.userId);

    const { data, upstreamId } = await grsaiFetch<ChatCompletionResponse>(
      env.GRSAI_CHAT_COMPLETIONS_PATH,
      {
        method: "POST",
        json: upstreamBody,
      },
      {
        requestId,
        route: "/v1/chat/completions",
        model: resolvedModel,
      }
    );

    const usage = normalizeUsage(data.usage);
    const billedModel = data.model ?? resolvedModel;
    const creditsCharged = await calculateCreditsCharged(billedModel, usage);

    await recordSuccessfulUsageAndDebit({
      user_id: caller.userId,
      api_key_id: caller.apiKeyId,
      model: billedModel,
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
      safety_reason: null,
    });

    log.info("chat_completion_succeeded", {
      requestId,
      route: "/v1/chat/completions",
      status: 200,
      code: "succeeded",
      message: "Chat completion succeeded.",
    });

    return c.json({
      ...data,
      credits_charged: creditsCharged,
      request_id: requestId,
      tokfai: {
        credits_charged: creditsCharged,
        request_id: requestId,
      },
    });
  } catch (err) {
    if (err instanceof ApiError) {
      await writeUsageLog(
        failedUsageLog({
          user_id: caller.userId,
          api_key_id: caller.apiKeyId,
          model: resolvedModel,
          status:
            err.code === "upstream_rate_limited" ||
            err.code === "upstream_model_busy"
              ? "rate_limited"
              : "failed",
          request_id: requestId,
          error_code: err.code ?? null,
          error_message: err.publicMessage,
          latency_ms: Date.now() - startedAt,
          ...upstreamFailureFields(err),
        })
      );

      log.warn("chat_completion_failed", {
        requestId,
        route: "/v1/chat/completions",
        model: resolvedModel,
        status: err.status,
        code: err.code ?? "failed",
        message: err.publicMessage,
        upstreamStatus: err.upstreamStatus,
        upstreamErrorMessage: err.upstreamErrorSnippet,
        latencyMs: Date.now() - startedAt,
      });

      throw err;
    }

    await writeUsageLog(
      failedUsageLog({
        user_id: caller.userId,
        api_key_id: caller.apiKeyId,
        model: resolvedModel,
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
    });

    throw ApiError.internal(
      err instanceof Error ? err.message : "Chat completion failed.",
      "server_error"
    );
  }
});

async function readJsonBody(bodyPromise: Promise<unknown>): Promise<unknown> {
  try {
    return await bodyPromise;
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
      : code === "upstream_auth_error"
        ? 403
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
