/**
 * Dashboard chat completions — sk-tokfai API key auth, no Supabase client.
 * Supports OpenAI-compatible multimodal content (text + image_url).
 */

import { DashboardDmitApiError, dashboardDmitFetchWithHeaders } from "./dmit-fetch";

export type ChatRole = "system" | "user" | "assistant";

export type ChatTextPart = {
  type: "text";
  text: string;
};

export type ChatImageUrlPart = {
  type: "image_url";
  image_url: {
    url: string;
  };
};

export type ChatContentPart = ChatTextPart | ChatImageUrlPart;

export type ChatMessageContent = string | ChatContentPart[];

export interface ChatMessage {
  role: ChatRole;
  content: ChatMessageContent;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  stream?: false;
  max_tokens?: number;
}

export interface ChatCompletionUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface ChatCompletionChoice {
  index: number;
  message: {
    role: ChatRole;
    content: string | null;
  };
  finish_reason?: string | null;
}

export interface TokfaiCompletionExtension {
  credits_charged?: number;
  request_id?: string;
  requested_model?: string;
  resolved_model?: string;
  fallback_attempts?: number;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: ChatCompletionUsage;
  credits_charged?: number;
  request_id?: string;
  tokfai?: TokfaiCompletionExtension;
}

export { DashboardDmitApiError as DmitApiError };

export async function chatCompletions(
  apiKey: string,
  body: ChatCompletionRequest
): Promise<ChatCompletionResponse> {
  if (!apiKey) {
    throw new DashboardDmitApiError({
      status: 400,
      message: "Missing API key.",
      code: "no_api_key",
    });
  }
  const res = await dashboardDmitFetchWithHeaders<ChatCompletionResponse>(
    "/v1/chat/completions",
    {
      method: "POST",
      json: body,
      accessToken: apiKey,
    }
  );
  const requestId = res.headers.get("x-request-id");
  if (!requestId) return res.data;
  return {
    ...res.data,
    tokfai: {
      ...res.data.tokfai,
      request_id: res.data.tokfai?.request_id ?? requestId,
    },
  };
}

export function extractChatAssistantText(
  result: ChatCompletionResponse | null | undefined
): string {
  const content = result?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  return "";
}

export function extractChatCreditsCharged(
  result: ChatCompletionResponse | null | undefined
): number | null {
  const raw = result?.credits_charged ?? result?.tokfai?.credits_charged;
  if (raw == null) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function extractChatRequestId(
  result: ChatCompletionResponse | null | undefined
): string | null {
  const id = result?.request_id ?? result?.tokfai?.request_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}
