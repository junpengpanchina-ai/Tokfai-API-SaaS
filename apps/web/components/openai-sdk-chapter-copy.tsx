"use client";

import { CopyableSnippetField, CopyConfigAction } from "@/components/copyable-snippet-field";
import {
  buildNodeBatchFetchExample,
  buildNodeChatFetchExample,
  buildNodeChatSdkRunnableFile,
  buildNodeSdkConfigSnippet,
  buildNodeSdkRunCommand,
  buildOpenAiSdkConfigSnippet,
  buildOpenAiSdkImageCurlExample,
  buildPythonBatchRequestsExample,
  buildPythonChatSdkRunnableFile,
  buildPythonSdkConfigSnippet,
  buildPythonSdkRunCommand,
  buildPythonChatSdkExample,
  buildNodeChatSdkExample,
  NODE_SDK_INIT_COMMAND,
  NODE_SDK_INSTALL_COMMAND,
  PYTHON_SDK_INSTALL_COMMAND,
  PYTHON_VENV_CREATE_COMMAND,
  PYTHON_VENV_ACTIVATE_BASH,
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
        label={t("integration.sdkCopyNodeFileLabel")}
        value={buildNodeChatSdkRunnableFile(apiKey)}
        copyId={`${idPrefix}-${OPENAI_SDK_NODE_CHAT_COPY_ID}-file`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyCode")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-48 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      <div className="flex flex-wrap gap-2">
        <CopyConfigAction
          id={`${idPrefix}-node-init`}
          value={NODE_SDK_INIT_COMMAND}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.clientSoftwareNodeInitAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-node-install`}
          value={NODE_SDK_INSTALL_COMMAND}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.clientSoftwareNodeInstallAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-node-run`}
          value={buildNodeSdkRunCommand()}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.clientSoftwareNodeRunAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-node-config`}
          value={buildNodeSdkConfigSnippet(apiKey)}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.clientSoftwareNodeConfigAction")}
          copiedLabel={t("integration.copied")}
        />
      </div>
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
        label={t("integration.sdkCopyPythonFileLabel")}
        value={buildPythonChatSdkRunnableFile(apiKey)}
        copyId={`${idPrefix}-${OPENAI_SDK_PYTHON_CHAT_COPY_ID}-file`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyCode")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-48 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      <div className="flex flex-wrap gap-2">
        <CopyConfigAction
          id={`${idPrefix}-python-venv`}
          value={PYTHON_VENV_CREATE_COMMAND}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.clientSoftwarePythonVenvAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-python-activate`}
          value={PYTHON_VENV_ACTIVATE_BASH}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.clientSoftwarePythonActivateAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-python-install`}
          value={PYTHON_SDK_INSTALL_COMMAND}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.clientSoftwarePythonInstallAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-python-run`}
          value={buildPythonSdkRunCommand()}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.clientSoftwarePythonRunAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-python-config`}
          value={buildPythonSdkConfigSnippet(apiKey)}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.clientSoftwarePythonConfigAction")}
          copiedLabel={t("integration.copied")}
        />
      </div>
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
