import {
  chatCurlOneLine,
  chatCurlPowerShellOneLine,
} from "@/lib/customer-curl-oneline";
import { buildOpenAiSdkConfigSnippet } from "@/lib/customer-openai-sdk-chapter";
import { readQuickStartApiKeySecret } from "@/lib/customer-quick-start-key-session";
import {
  isFullTokfaiApiKey,
  TOKFAI_API_BASE_URL,
  TOKFAI_API_KEY_PLACEHOLDER,
} from "@/lib/tokfai-api";

import type { TroubleshootingCopySnippetId } from "./troubleshooting-cases";

export function resolveTroubleshootingApiKey(explicit?: string | null): string {
  if (explicit && isFullTokfaiApiKey(explicit)) return explicit;
  const fromSession = readQuickStartApiKeySecret();
  if (fromSession && isFullTokfaiApiKey(fromSession)) return fromSession;
  return TOKFAI_API_KEY_PLACEHOLDER;
}

function authorizationHeader(apiKey: string): string {
  return `Authorization: Bearer ${apiKey}`;
}

function buildCursorConfigSnippet(apiKey: string): string {
  return `Provider type: OpenAI compatible / Custom OpenAI
Base URL: ${TOKFAI_API_BASE_URL}
API Key: ${apiKey}
Model: auto-fast
Authorization: Bearer ${apiKey}`;
}

function buildCherryConfigSnippet(apiKey: string): string {
  return `Provider name: Tokfai
Provider type: OpenAI compatible / Custom OpenAI
Base URL: ${TOKFAI_API_BASE_URL}
API Key: ${apiKey}
Model: auto-fast
Authorization: Bearer ${apiKey}
Stream: Client default; disable stream if the test fails`;
}

export function getTroubleshootingCopySnippet(
  snippetId: TroubleshootingCopySnippetId,
  apiKey: string
): string {
  switch (snippetId) {
    case "chat-curl-oneline":
      return chatCurlOneLine(apiKey);
    case "powershell-curl-oneline":
      return chatCurlPowerShellOneLine(apiKey);
    case "cursor-config":
      return buildCursorConfigSnippet(apiKey);
    case "cherry-config":
      return buildCherryConfigSnippet(apiKey);
    case "openai-sdk-node":
      return buildOpenAiSdkConfigSnippet(apiKey);
    case "authorization-header":
      return authorizationHeader(apiKey);
    case "base-url":
      return TOKFAI_API_BASE_URL;
    default:
      return "";
  }
}
