import {
  batchCreateCurlOneLine,
  batchPollCurlOneLine,
  chatCurlMultiline,
  chatCurlOneLine,
  imageCurlOneLine,
  modelsCurlOneLine,
} from "@/lib/customer-curl-oneline";
import {
  buildNodeBatchFetchExample,
  buildNodeChatSdkExample,
  buildOpenAiSdkConfigSnippet,
  buildPythonBatchRequestsExample,
  buildPythonChatSdkExample,
} from "@/lib/customer-openai-sdk-chapter";
import { buildCursorConfigSnippet } from "@/lib/customer-cursor-chapter";
import { buildCherryConfigSnippet } from "@/lib/customer-cherry-chapter";
import {
  buildBatchCreateCurlMultiline,
  buildBatchPollCurlMultiline,
} from "@/lib/customer-batch-api-chapter";
import {
  buildImageApiCurlMultiline,
  buildImageApiReferenceCurlMultiline,
  buildImageApiReferenceCurlOneLine,
} from "@/lib/customer-image-api-chapter";
import {
  CUSTOMER_DOC_SNIPPET_COPY,
  type CustomerDocSnippetKey,
} from "@/lib/docs/customer-docs-content";
import { readQuickStartApiKeySecret } from "@/lib/customer-quick-start-key-session";
import { isFullTokfaiApiKey, TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";

/** Resolve API key for Quick Start curls: explicit secret → session → placeholder. */
export function resolveQuickStartApiKey(explicit?: string | null): string {
  if (explicit && isFullTokfaiApiKey(explicit)) return explicit;
  const fromSession = readQuickStartApiKeySecret();
  if (fromSession && isFullTokfaiApiKey(fromSession)) return fromSession;
  return TOKFAI_API_KEY_PLACEHOLDER;
}

export function quickStartChatCurlOneLine(explicitKey?: string | null): string {
  return chatCurlOneLine(resolveQuickStartApiKey(explicitKey));
}

export function quickStartChatCurlMultiline(explicitKey?: string | null): string {
  return chatCurlMultiline(resolveQuickStartApiKey(explicitKey));
}

export function isQuickStartKeyPlaceholder(key: string): boolean {
  return key === TOKFAI_API_KEY_PLACEHOLDER;
}

export function resolveDocCurlSnippetCopy(
  snippetKey: CustomerDocSnippetKey,
  explicitKey?: string | null
): string {
  const key = resolveQuickStartApiKey(explicitKey);
  switch (snippetKey) {
    case "chat-curl":
      return chatCurlOneLine(key);
    case "models-curl":
      return modelsCurlOneLine(key);
    case "image-curl":
      return imageCurlOneLine(key);
    case "image-curl-reference":
      return buildImageApiReferenceCurlOneLine(key);
    case "batch-create-curl":
      return batchCreateCurlOneLine(key);
    case "batch-poll-curl":
      return batchPollCurlOneLine(key);
    case "openai-sdk-config":
      return buildOpenAiSdkConfigSnippet(key);
    case "openai-js":
      return buildNodeChatSdkExample(key);
    case "openai-python":
      return buildPythonChatSdkExample(key);
    case "openai-node-batch":
      return buildNodeBatchFetchExample(key);
    case "openai-python-batch":
      return buildPythonBatchRequestsExample(key);
    case "cursor-config":
      return buildCursorConfigSnippet(key);
    case "cherry-config":
      return buildCherryConfigSnippet(key);
    default:
      return CUSTOMER_DOC_SNIPPET_COPY[snippetKey];
  }
}

export function resolveDocChatCurlDisplay(explicitKey?: string | null): string {
  return chatCurlMultiline(resolveQuickStartApiKey(explicitKey));
}

export function resolveDocImageCurlDisplay(explicitKey?: string | null): string {
  return buildImageApiCurlMultiline(resolveQuickStartApiKey(explicitKey));
}

export function resolveDocImageReferenceCurlDisplay(
  explicitKey?: string | null
): string {
  return buildImageApiReferenceCurlMultiline(resolveQuickStartApiKey(explicitKey));
}

export function resolveDocBatchCreateCurlDisplay(explicitKey?: string | null): string {
  return buildBatchCreateCurlMultiline(resolveQuickStartApiKey(explicitKey));
}

export function resolveDocBatchPollCurlDisplay(explicitKey?: string | null): string {
  return buildBatchPollCurlMultiline(resolveQuickStartApiKey(explicitKey));
}

export function resolveDocOpenAiJsDisplay(explicitKey?: string | null): string {
  return buildNodeChatSdkExample(resolveQuickStartApiKey(explicitKey));
}

export function resolveDocOpenAiPythonDisplay(explicitKey?: string | null): string {
  return buildPythonChatSdkExample(resolveQuickStartApiKey(explicitKey));
}

export function resolveDocOpenAiNodeBatchDisplay(explicitKey?: string | null): string {
  return buildNodeBatchFetchExample(resolveQuickStartApiKey(explicitKey));
}

export function resolveDocOpenAiPythonBatchDisplay(explicitKey?: string | null): string {
  return buildPythonBatchRequestsExample(resolveQuickStartApiKey(explicitKey));
}

export function resolveDocCursorConfigDisplay(explicitKey?: string | null): string {
  return buildCursorConfigSnippet(resolveQuickStartApiKey(explicitKey));
}

export function resolveDocCherryConfigDisplay(explicitKey?: string | null): string {
  return buildCherryConfigSnippet(resolveQuickStartApiKey(explicitKey));
}
