"use client";

import { CopyableSnippetField, CopyConfigAction } from "@/components/copyable-snippet-field";
import {
  buildNodeBatchFetchExample,
  buildNodeChatFetchExample,
  buildNodeChatSdkExample,
  buildOpenAiSdkConfigSnippet,
  buildOpenAiSdkImageCurlExample,
  buildPythonBatchRequestsExample,
  buildPythonChatSdkExample,
} from "@/lib/customer-openai-sdk-chapter";
import { chatCurlOneLine } from "@/lib/customer-curl-oneline";
import { isQuickStartKeyPlaceholder } from "@/lib/customer-quick-start-snippets";
import { useI18n } from "@/lib/i18n/i18n-provider";

export const OPENAI_SDK_CONFIG_COPY_ID = "openai-sdk-config";
export const OPENAI_SDK_NODE_FETCH_COPY_ID = "openai-sdk-node-fetch";
export const OPENAI_SDK_NODE_CHAT_COPY_ID = "openai-sdk-node-chat";
export const OPENAI_SDK_PYTHON_CHAT_COPY_ID = "openai-sdk-python-chat";
export const OPENAI_SDK_NODE_BATCH_COPY_ID = "openai-sdk-node-batch";
export const OPENAI_SDK_PYTHON_BATCH_COPY_ID = "openai-sdk-python-batch";
export const OPENAI_SDK_IMAGE_CURL_COPY_ID = "openai-sdk-image-curl";

type OpenAiSdkChapterCopyPanelProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
};

export function OpenAiSdkChapterCopyPanel({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "openai-sdk-chapter",
}: OpenAiSdkChapterCopyPanelProps) {
  const { t } = useI18n();
  const config = buildOpenAiSdkConfigSnippet(apiKey);
  const nodeFetch = buildNodeChatFetchExample(apiKey);
  const nodeChat = buildNodeChatSdkExample(apiKey);
  const pythonChat = buildPythonChatSdkExample(apiKey);
  const nodeBatch = buildNodeBatchFetchExample(apiKey);
  const pythonBatch = buildPythonBatchRequestsExample(apiKey);
  const imageCurl = buildOpenAiSdkImageCurlExample(apiKey);
  const chatCurl = chatCurlOneLine(apiKey);
  const keyIsPlaceholder = isQuickStartKeyPlaceholder(apiKey);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-foreground">
        {t("integration.sdkCopyNowTitle")}
      </p>
      <CopyableSnippetField
        label={t("integration.sdkCopyConfigLabel")}
        value={config}
        copyId={`${idPrefix}-${OPENAI_SDK_CONFIG_COPY_ID}`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyConfig")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-24 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      <CopyableSnippetField
        label={t("integration.sdkCopyNodeFetchLabel")}
        value={nodeFetch}
        copyId={`${idPrefix}-${OPENAI_SDK_NODE_FETCH_COPY_ID}`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyCode")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-48 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      <CopyableSnippetField
        label={t("integration.sdkCopyNodeChatLabel")}
        value={nodeChat}
        copyId={`${idPrefix}-${OPENAI_SDK_NODE_CHAT_COPY_ID}`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyCode")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-48 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      <CopyableSnippetField
        label={t("integration.sdkCopyPythonChatLabel")}
        value={pythonChat}
        copyId={`${idPrefix}-${OPENAI_SDK_PYTHON_CHAT_COPY_ID}`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyCode")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-48 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      <CopyableSnippetField
        label={t("integration.sdkCopyNodeBatchLabel")}
        value={nodeBatch}
        copyId={`${idPrefix}-${OPENAI_SDK_NODE_BATCH_COPY_ID}`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyCode")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-48 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      <CopyableSnippetField
        label={t("integration.sdkCopyPythonBatchLabel")}
        value={pythonBatch}
        copyId={`${idPrefix}-${OPENAI_SDK_PYTHON_BATCH_COPY_ID}`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyCode")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-48 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      <CopyableSnippetField
        label={t("integration.sdkCopyImageCurlLabel")}
        value={imageCurl}
        copyId={`${idPrefix}-${OPENAI_SDK_IMAGE_CURL_COPY_ID}`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyOneLineCurl")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      {keyIsPlaceholder ? (
        <p className="text-xs text-muted-foreground">{t("integration.placeholderKeyNote")}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("integration.sdkLiveKeyNote")}</p>
      )}
      <div className="flex flex-wrap gap-2">
        <CopyConfigAction
          id={`${idPrefix}-copy-node-fetch`}
          value={nodeFetch}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.sdkCopyNodeFetchAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-copy-node-chat`}
          value={nodeChat}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.sdkCopyNodeChatAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-copy-python-chat`}
          value={pythonChat}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.sdkCopyPythonChatAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-copy-node-batch`}
          value={nodeBatch}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.sdkCopyNodeBatchAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-copy-python-batch`}
          value={pythonBatch}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.sdkCopyPythonBatchAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-copy-chat-curl`}
          value={chatCurl}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.copyOneLineChatCurl")}
          copiedLabel={t("integration.copied")}
        />
      </div>
    </div>
  );
}
