import { modelsCurlMultiline, modelsCurlOneLine } from "@/lib/customer-curl-oneline";
import { authorizationHeader } from "@/lib/customer-integration-snippets";
import { quickStartChatCurlOneLine } from "@/lib/customer-quick-start-snippets";
import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

export type ApiKeyChapterSnippets = {
  authHeader: string;
  keyFormat: string;
  modelsVerifyCurl: string;
  chatVerifyCurl: string;
};

/** Shared copy snippets for Docs API Key chapter and API Keys success card. */
export function buildApiKeyChapterSnippets(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): ApiKeyChapterSnippets {
  return {
    authHeader: authorizationHeader(apiKey),
    keyFormat: apiKey,
    modelsVerifyCurl: modelsCurlOneLine(apiKey),
    chatVerifyCurl: quickStartChatCurlOneLine(apiKey),
  };
}

export function modelsVerifyCurlMultiline(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return modelsCurlMultiline(apiKey);
}

export const API_KEY_CHAPTER_COPY_IDS = {
  authHeader: "auth-header",
  keyFormat: "key-format",
  modelsVerify: "models-verify-curl",
  chatVerify: "chat-verify-curl",
} as const;
