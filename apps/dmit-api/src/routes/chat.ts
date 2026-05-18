import { Hono } from "hono";
import { z } from "zod";

import { ApiError } from "../errors.js";
import { type VerifiedApiKey } from "../auth/apiKey.js";
import { env } from "../env.js";
import { log } from "../logger.js";
import { requireApiKey } from "../middleware/apiKey.js";
import { supabase } from "../supabase.js";
import type { UsageLogInsert } from "../types.js";
import { grsaiFetch } from "../upstream/grsai.js";
import { priceFor } from "../upstream/pricing.js";

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

interface ChatCompletionResponse {
  id?: string;
  object?: string;
  created?: number;
  model?: string;
  choices?: unknown[];
  usage?: ChatCompletionUsage;
}

/**
 * /v1/chat/completions — OpenAI-compatible chat completions, customer-facing.
 *
 * Auth is handled by requireApiKey. The route proxies non-streaming
 * OpenAI-compatible requests to GRSAI and records usage after completion.
 */
export const chatRoutes = new Hono();

chatRoutes.use("/v1/chat/completions", requireApiKey);

chatRoutes.post("/v1/chat/completions", async (c) => {
  const startedAt = Date.now();
  const apiKey = c.get("apiKey" as never) as VerifiedApiKey;
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

  if (stream) {
    await writeUsageLog({
      user_id: apiKey.userId,
      api_key_id: apiKey.apiKeyId,
      model: resolvedModel,
      status: "failed",
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      credits_charged: null,
      request_id: requestId,
      upstream_id: null,
      error_code: "stream_not_supported",
      error_message: "Streaming is not supported yet.",
      latency_ms: Date.now() - startedAt,
    });

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
    await assertHasCredits(apiKey.userId);

    const { data, upstreamId } = await grsaiFetch<ChatCompletionResponse>(
      env.GRSAI_CHAT_COMPLETIONS_PATH,
      {
        method: "POST",
        json: upstreamBody,
      }
    );

    const usage = normalizeUsage(data.usage);
    const billedModel = data.model ?? resolvedModel;
    const creditsCharged = calculateCreditsCharged(billedModel, usage);

    await recordSuccessfulUsageAndDebit({
      user_id: apiKey.userId,
      api_key_id: apiKey.apiKeyId,
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
    });

    log.info("chat_completion_succeeded", {
      requestId,
      route: "/v1/chat/completions",
      status: 200,
      code: "succeeded",
      message: "Chat completion succeeded.",
    });

    return c.json(data);
  } catch (err) {
    if (err instanceof ApiError) {
      await writeUsageLog({
        user_id: apiKey.userId,
        api_key_id: apiKey.apiKeyId,
        model: resolvedModel,
        status: err.code === "upstream_rate_limited" ? "rate_limited" : "failed",
        prompt_tokens: null,
        completion_tokens: null,
        total_tokens: null,
        credits_charged: null,
        request_id: requestId,
        upstream_id: null,
        error_code: err.code ?? null,
        error_message: err.publicMessage,
        latency_ms: Date.now() - startedAt,
      });

      log.warn("chat_completion_failed", {
        requestId,
        route: "/v1/chat/completions",
        status: err.status,
        code: err.code ?? "failed",
        message: err.publicMessage,
      });

      throw err;
    }

    await writeUsageLog({
      user_id: apiKey.userId,
      api_key_id: apiKey.apiKeyId,
      model: resolvedModel,
      status: "failed",
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      credits_charged: null,
      request_id: requestId,
      upstream_id: null,
      error_code: "server_error",
      error_message: "Internal error.",
      latency_ms: Date.now() - startedAt,
    });

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

function calculateCreditsCharged(
  model: string,
  usage: ReturnType<typeof normalizeUsage>
): number {
  const raw = priceFor(
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
