import {
  TOKFAI_API_BASE_URL,
  TOKFAI_API_KEY_PLACEHOLDER,
  TOKFAI_CLIENT_TEST_PROMPT,
  TOKFAI_RECOMMENDED_MODEL,
} from "@/lib/tokfai-api";
import {
  batchCreateCurlMultiline,
  batchCreateCurlOneLine,
  batchPollCurlMultiline,
  batchPollCurlOneLine,
  chatCurlMultiline,
  chatCurlOneLine,
  imageCurlMultiline,
  imageCurlOneLine,
  modelsCurlMultiline,
  modelsCurlOneLine,
} from "@/lib/customer-curl-oneline";

export const INTEGRATION_BASE_URL = TOKFAI_API_BASE_URL;
export const INTEGRATION_KEY_PLACEHOLDER = TOKFAI_API_KEY_PLACEHOLDER;
export const INTEGRATION_DEFAULT_MODEL = TOKFAI_RECOMMENDED_MODEL;

import {
  buildNodeChatFetchExample,
  buildNodeChatSdkExample,
  buildOpenAiSdkConfigSnippet,
  buildPythonChatSdkExample,
} from "@/lib/customer-openai-sdk-chapter";
import { buildCursorConfigSnippet } from "@/lib/customer-cursor-chapter";
import { buildCherryConfigSnippet } from "@/lib/customer-cherry-chapter";
import {
  CUSTOMER_INTEGRATION_ERROR_CODES,
  type CustomerIntegrationErrorCode,
} from "@/lib/customer-error-codes-chapter";

export { CUSTOMER_INTEGRATION_ERROR_CODES, type CustomerIntegrationErrorCode };

export function chatCompletionsCurl(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model = TOKFAI_RECOMMENDED_MODEL
): string {
  return chatCurlMultiline(apiKey, model === TOKFAI_RECOMMENDED_MODEL ? "auto-fast" : model);
}

export function modelsListCurl(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return modelsCurlMultiline(apiKey);
}

export const OPENAI_JS_SNIPPET = buildNodeChatSdkExample();

export const OPENAI_NODE_FETCH_SNIPPET = buildNodeChatFetchExample();

export const OPENAI_PYTHON_SNIPPET = buildPythonChatSdkExample();

export function openaiSdkConfigSnippet(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model = "auto-fast"
): string {
  return buildOpenAiSdkConfigSnippet(apiKey, model);
}

export function cursorConfigSnippet(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  return buildCursorConfigSnippet(apiKey);
}

export function cherryStudioConfigSnippet(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER
): string {
  return buildCherryConfigSnippet(apiKey);
}

export const OPENAI_SDK_CONFIG_SNIPPET = openaiSdkConfigSnippet();
export const CURSOR_CONFIG_SNIPPET = cursorConfigSnippet();
export const CHERRY_STUDIO_CONFIG_SNIPPET = cherryStudioConfigSnippet();

export function authorizationHeader(apiKey = TOKFAI_API_KEY_PLACEHOLDER): string {
  return `Authorization: Bearer ${apiKey}`;
}

export function batchChatCurl(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  model = TOKFAI_RECOMMENDED_MODEL
): string {
  return batchCreateCurlMultiline(apiKey, model);
}

export function batchPollCurl(
  apiKey = TOKFAI_API_KEY_PLACEHOLDER,
  batchId = "batch_xxx"
): string {
  return batchPollCurlMultiline(apiKey, batchId);
}

export const BATCH_CHAT_CURL = batchCreateCurlMultiline();
export const BATCH_POLL_CURL = batchPollCurlMultiline();

export const IMAGE_GENERATION_CURL = imageCurlMultiline();

export {
  chatCurlOneLine,
  modelsCurlOneLine,
  imageCurlOneLine,
  batchCreateCurlOneLine,
  batchPollCurlOneLine,
  chatCurlMultiline,
  modelsCurlMultiline,
  imageCurlMultiline,
  batchCreateCurlMultiline,
  batchPollCurlMultiline,
};
