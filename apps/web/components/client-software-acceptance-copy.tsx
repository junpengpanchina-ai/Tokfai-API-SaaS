"use client";

import { CopyableSnippetField, CopyConfigAction } from "@/components/copyable-snippet-field";
import {
  batchCreateCurlOneLine,
  batchPollCurlOneLine,
  chatCurlOneLine,
  chatCurlPowerShellOneLine,
  imageCurlOneLine,
} from "@/lib/customer-curl-oneline";
import { buildCursorConfigSnippet } from "@/lib/customer-cursor-chapter";
import { buildCherryConfigSnippet } from "@/lib/customer-cherry-chapter";
import {
  buildNodeChatSdkRunnableFile,
  buildNodeSdkConfigSnippet,
  buildNodeSdkRunCommand,
  buildPythonChatSdkRunnableFile,
  buildPythonSdkConfigSnippet,
  buildPythonSdkRunCommand,
  NODE_SDK_INSTALL_COMMAND,
  PYTHON_SDK_INSTALL_COMMAND,
} from "@/lib/customer-openai-sdk-chapter";
import { isQuickStartKeyPlaceholder } from "@/lib/customer-quick-start-snippets";
import { useI18n } from "@/lib/i18n/i18n-provider";

type ClientSoftwareAcceptanceCopyPanelProps = {
  apiKey: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  idPrefix?: string;
};

export function ClientSoftwareAcceptanceCopyPanel({
  apiKey,
  copiedId,
  onCopy,
  idPrefix = "client-software",
}: ClientSoftwareAcceptanceCopyPanelProps) {
  const { t } = useI18n();
  const bashCurl = chatCurlOneLine(apiKey);
  const psCurl = chatCurlPowerShellOneLine(apiKey);
  const nodeFile = buildNodeChatSdkRunnableFile(apiKey);
  const pythonFile = buildPythonChatSdkRunnableFile(apiKey);
  const nodeConfig = buildNodeSdkConfigSnippet(apiKey);
  const pythonConfig = buildPythonSdkConfigSnippet(apiKey);
  const nodeRun = buildNodeSdkRunCommand(apiKey);
  const pythonRun = buildPythonSdkRunCommand(apiKey);
  const cursorConfig = buildCursorConfigSnippet(apiKey);
  const cherryConfig = buildCherryConfigSnippet(apiKey);
  const imageCurl = imageCurlOneLine(apiKey);
  const batchCreate = batchCreateCurlOneLine(apiKey);
  const batchPoll = batchPollCurlOneLine(apiKey);
  const keyIsPlaceholder = isQuickStartKeyPlaceholder(apiKey);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-semibold text-foreground">
        {t("integration.clientSoftwareCopyTitle")}
      </p>
      <CopyableSnippetField
        label={t("integration.clientSoftwareBashCurlLabel")}
        value={bashCurl}
        copyId={`${idPrefix}-bash-curl`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyOneLineCurl")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      <CopyableSnippetField
        label={t("integration.clientSoftwarePowerShellCurlLabel")}
        value={psCurl}
        copyId={`${idPrefix}-ps-curl`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyPowerShellCurl")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-32 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      <CopyableSnippetField
        label={t("integration.clientSoftwareNodeFileLabel")}
        value={nodeFile}
        copyId={`${idPrefix}-node-file`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyCode")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-48 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      <div className="flex flex-wrap gap-2">
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
          value={nodeRun}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.clientSoftwareNodeRunAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-node-config`}
          value={nodeConfig}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.clientSoftwareNodeConfigAction")}
          copiedLabel={t("integration.copied")}
        />
      </div>
      <CopyableSnippetField
        label={t("integration.clientSoftwarePythonFileLabel")}
        value={pythonFile}
        copyId={`${idPrefix}-python-file`}
        copiedId={copiedId}
        onCopy={onCopy}
        copyLabel={t("integration.copyCode")}
        copiedLabel={t("integration.copied")}
        className="[&_code]:max-h-48 [&_code]:whitespace-pre-wrap [&_code]:break-all"
      />
      <div className="flex flex-wrap gap-2">
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
          value={pythonRun}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.clientSoftwarePythonRunAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-python-config`}
          value={pythonConfig}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.clientSoftwarePythonConfigAction")}
          copiedLabel={t("integration.copied")}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <CopyConfigAction
          id={`${idPrefix}-cursor`}
          value={cursorConfig}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.cursorCopyCursorConfigAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-cherry`}
          value={cherryConfig}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.cherryCopyCherryConfigAction")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-bash-curl-action`}
          value={bashCurl}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.copyOneLineChatCurl")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-image-curl`}
          value={imageCurl}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.copyOneLineImageCurl")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-batch-create`}
          value={batchCreate}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.copyOneLineBatchCreateCurl")}
          copiedLabel={t("integration.copied")}
        />
        <CopyConfigAction
          id={`${idPrefix}-batch-poll`}
          value={batchPoll}
          copiedId={copiedId}
          onCopy={onCopy}
          label={t("integration.copyOneLineBatchPollCurl")}
          copiedLabel={t("integration.copied")}
        />
      </div>
      {keyIsPlaceholder ? (
        <p className="text-xs text-muted-foreground">{t("integration.placeholderKeyNote")}</p>
      ) : (
        <p className="text-xs text-muted-foreground">{t("integration.clientSoftwareLiveKeyNote")}</p>
      )}
    </div>
  );
}
