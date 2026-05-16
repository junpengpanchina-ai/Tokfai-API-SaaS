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

  const model = parsed.data.model ?? env.BOT_MODEL;
  const stream = parsed.data.stream ?? false;

  if (stream) {
    await writeUsageLog({
      user_id: apiKey.userId,
      api_key_id: apiKey.apiKeyId,
      model,
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
      keyPrefix: apiKey.prefix,
      model,
      status: "stream_not_supported",
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
    model,
    messages: parsed.data.messages,
    temperature: parsed.data.temperature,
    max_tokens: parsed.data.max_tokens,
    stream,
  };

  try {
    const { data, upstreamId } = await grsaiFetch<ChatCompletionResponse>(
      env.GRSAI_CHAT_COMPLETIONS_PATH,
      {
        method: "POST",
        json: upstreamBody,
      }
    );

    const usage = normalizeUsage(data.usage);
    await writeUsageLog({
      user_id: apiKey.userId,
      api_key_id: apiKey.apiKeyId,
      model: data.model ?? model,
      status: "succeeded",
      prompt_tokens: usage.promptTokens,
      completion_tokens: usage.completionTokens,
      total_tokens: usage.totalTokens,
      credits_charged: null,
      request_id: requestId,
      upstream_id: upstreamId,
      error_code: null,
      error_message: null,
      latency_ms: Date.now() - startedAt,
    });

    log.info("chat_completion_succeeded", {
      requestId,
      keyPrefix: apiKey.prefix,
      model: data.model ?? model,
      status: "succeeded",
    });

    return c.json(data);
  } catch (err) {
    if (err instanceof ApiError) {
      await writeUsageLog({
        user_id: apiKey.userId,
        api_key_id: apiKey.apiKeyId,
        model,
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
        keyPrefix: apiKey.prefix,
        model,
        status: err.code ?? "failed",
      });

      throw err;
    }

    await writeUsageLog({
      user_id: apiKey.userId,
      api_key_id: apiKey.apiKeyId,
      model,
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
      keyPrefix: apiKey.prefix,
      model,
      status: "server_error",
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

async function writeUsageLog(entry: UsageLogInsert): Promise<void> {
  const { error } = await supabase().from("usage_logs").insert(entry);
  if (error) {
    log.warn("usage_log_insert_failed", {
      requestId: entry.request_id,
      model: entry.model,
      status: entry.status,
    });
  }
}
