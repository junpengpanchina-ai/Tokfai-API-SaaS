/**
 * Dashboard chat completions — sk-tokfai API key auth, no Supabase client.
 */

import { DashboardDmitApiError, dashboardDmitFetchWithHeaders } from "./dmit-fetch";

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
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
  message: ChatMessage;
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
