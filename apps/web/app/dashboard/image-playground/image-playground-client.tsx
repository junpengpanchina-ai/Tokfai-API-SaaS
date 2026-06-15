"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  Upload,
  X,
} from "lucide-react";

import {
  IMAGE_PLAYGROUND_TOOLBENCH,
  focusImagePlaygroundResultPanel,
  ImagePlaygroundApiKeyCard,
  ImagePlaygroundGenerateActions,
  ImagePlaygroundResultArea,
  ImagePlaygroundServiceDocsPanel,
  ImagePlaygroundSettingsSidebar,
} from "@/components/image-playground-toolbench";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createApiKey,
  DmitApiError,
  imageGenerations,
  revealMeApiKey,
  type ImageGenerationResponse,
} from "@/lib/dmit/client";
import {
  imagePlaygroundErrorMessage,
  resolveImageCreatedAt,
} from "@/lib/image-playground-display";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";
import {
  getImageModelById,
  getImageModelCreditsPerRequest,
  IMAGE_PLAYGROUND_DEFAULT_MODEL,
  isAvailableImageModel,
  type ImagePlaygroundModelId,
  type ImagePlaygroundSize,
} from "@/lib/model-catalog";
import {
  isFullTokfaiApiKey,
  IMAGE_PLAYGROUND_IMAGE_TO_IMAGE_PLACEHOLDER,
  IMAGE_PLAYGROUND_TEXT_TO_IMAGE_PLACEHOLDER,
  TOKFAI_API_KEY_PLACEHOLDER,
  TOKFAI_IMAGES_GENERATIONS_ENDPOINT,
} from "@/lib/tokfai-api";
import { buildImageGenerationCurl } from "@/lib/image-api-curl";
import {
  isValidImageUrl,
  MAX_PLAYGROUND_INPUT_IMAGES,
  PlaygroundImageUploadError,
  uploadPlaygroundImage,
  validatePlaygroundImageFile,
} from "@/lib/storage/upload-image";

import {
  IMAGE_PLAYGROUND_DEFAULT_PROMPT,
  IMAGE_PLAYGROUND_PRESET_IDS,
  imagePlaygroundPresetLabelKey,
  imagePlaygroundPresetPromptKey,
  type ImagePlaygroundPresetId,
} from "./image-playground-presets";

const DEFAULT_MODEL: ImagePlaygroundModelId = IMAGE_PLAYGROUND_DEFAULT_MODEL;
const DEFAULT_SIZE: ImagePlaygroundSize = "1024x1024";
const REVEAL_KEY_TIMEOUT_MS = 30_000;
const PLAYGROUND_TEST_KEY_NAME = "playground-test";

function resolveInitialModel(initialModel?: string): ImagePlaygroundModelId {
  if (initialModel && isAvailableImageModel(initialModel)) {
    return initialModel;
  }
  return DEFAULT_MODEL;
}

function firstActiveKeyId(keys: ImagePlaygroundApiKeyOption[]): string {
  return keys[0]?.id ?? "";
}

function playgroundTestKeyNameWithDate(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${PLAYGROUND_TEST_KEY_NAME}-${y}${m}${day}`;
}

function meKeyToPlaygroundOption(
  apiKey: {
    id: string;
    name: string;
    prefix: string;
    status: string;
    can_reveal?: boolean;
  }
): ImagePlaygroundApiKeyOption {
  return {
    id: apiKey.id,
    name: apiKey.name,
    prefix: apiKey.prefix,
    status: apiKey.status,
    can_reveal: apiKey.can_reveal,
  };
}

export interface ImagePlaygroundApiKeyOption {
  id: string;
  name: string;
  prefix: string;
  status: "active" | "revoked" | string;
  can_reveal?: boolean;
}

interface PlaygroundError {
  status: number;
  code?: string;
  message: string;
  requestId?: string;
}

type KeyPanelView = "select" | "paste" | "empty";

type ImageInputSource = "upload" | "url";

type ImageInputStatus = "uploading" | "resolving" | "ready" | "error";

interface ImageInputItem {
  id: string;
  url: string;
  label: string;
  source: ImageInputSource;
  status: ImageInputStatus;
  error?: string;
  previewError?: string;
}

function resolveUploadedImageInput(
  entry: { id: string; item: ImageInputItem },
  uploadStatus: "ready" | "error",
  publicUrl: string,
  errorMessage: string
): ImageInputItem {
  if (uploadStatus === "ready" && publicUrl) {
    return {
      ...entry.item,
      url: publicUrl,
      status: "ready",
      error: undefined,
    };
  }

  return {
    ...entry.item,
    url: "",
    status: "error",
    error: errorMessage,
  };
}

function mergeImageInputUploadResult(
  currentItems: ImageInputItem[],
  entryId: string,
  resolved: ImageInputItem
): ImageInputItem[] {
  const index = currentItems.findIndex((item) => item.id === entryId);
  if (index === -1) {
    return [...currentItems, resolved];
  }

  return currentItems.map((item) => (item.id === entryId ? resolved : item));
}

function getReadyImageUrls(items: ImageInputItem[]): string[] {
  return items
    .filter((item) => item.status === "ready" && item.url)
    .map((item) => item.url);
}

function isFileDragEvent(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes("Files");
}

function getDroppedFiles(dataTransfer: DataTransfer): File[] {
  const fromFileList = Array.from(dataTransfer.files ?? []);
  if (fromFileList.length > 0) {
    return fromFileList;
  }

  const fromItems: File[] = [];
  for (const item of Array.from(dataTransfer.items ?? [])) {
    if (item.kind !== "file") continue;
    const file = item.getAsFile();
    if (file) fromItems.push(file);
  }
  return fromItems;
}

export function ImagePlaygroundClient({
  accessToken,
  activeKeys,
  initialModel,
  initialCreditsBalance = null,
  creditsLoaded = false,
}: {
  accessToken: string;
  activeKeys: ImagePlaygroundApiKeyOption[];
  initialModel?: string;
  initialCreditsBalance?: number | null;
  creditsLoaded?: boolean;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const resultPanelRef = useRef<HTMLDivElement>(null);
  const resultAttentionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const [localKeys, setLocalKeys] =
    useState<ImagePlaygroundApiKeyOption[]>(activeKeys);
  const [sessionSecrets, setSessionSecrets] = useState<Record<string, string>>(
    {}
  );
  const [keyPanelView, setKeyPanelView] = useState<KeyPanelView>(() =>
    activeKeys.length > 0 ? "select" : "empty"
  );
  const [createdBannerKeyId, setCreatedBannerKeyId] = useState<string | null>(
    null
  );
  const [creatingKey, setCreatingKey] = useState(false);
  const [createKeyError, setCreateKeyError] = useState<string | null>(null);

  const [model, setModel] = useState(() => resolveInitialModel(initialModel));
  const [size, setSize] = useState<ImagePlaygroundSize>(DEFAULT_SIZE);
  const [prompt, setPrompt] = useState(IMAGE_PLAYGROUND_DEFAULT_PROMPT);
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState(() =>
    firstActiveKeyId(activeKeys)
  );
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImageGenerationResponse | null>(null);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [error, setError] = useState<PlaygroundError | null>(null);
  const [imageInputs, setImageInputs] = useState<ImageInputItem[]>([]);
  const imageInputsRef = useRef(imageInputs);
  imageInputsRef.current = imageInputs;
  const [imageUrlDraft, setImageUrlDraft] = useState("");
  const [lastRequestInputCount, setLastRequestInputCount] = useState<
    number | null
  >(null);
  const [copyRequestStatus, setCopyRequestStatus] = useState<"idle" | "copied">(
    "idle"
  );
  const [resultAttention, setResultAttention] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readyImageUrls = getReadyImageUrls(imageInputs);

  useEffect(() => {
    setLocalKeys(activeKeys);
    if (activeKeys.length > 0 && keyPanelView === "empty") {
      setKeyPanelView("select");
    }
  }, [activeKeys, keyPanelView]);

  useEffect(() => {
    return () => {
      if (resultAttentionTimeoutRef.current) {
        clearTimeout(resultAttentionTimeoutRef.current);
      }
    };
  }, []);

  function pulseResultAttention() {
    setResultAttention(true);
    if (resultAttentionTimeoutRef.current) {
      clearTimeout(resultAttentionTimeoutRef.current);
    }
    resultAttentionTimeoutRef.current = setTimeout(() => {
      setResultAttention(false);
    }, 4000);
  }

  function focusResultPanel(phase: "onStart" | "onComplete") {
    requestAnimationFrame(() => {
      focusImagePlaygroundResultPanel(resultPanelRef.current, phase);
    });
  }

  useEffect(() => {
    if (
      localKeys.length > 0 &&
      !localKeys.some((row) => row.id === selectedKeyId)
    ) {
      setSelectedKeyId(localKeys[0].id);
    }
  }, [localKeys, selectedKeyId]);

  const selectedKey = useMemo(
    () => localKeys.find((row) => row.id === selectedKeyId) ?? null,
    [localKeys, selectedKeyId]
  );

  const selectedModelEntry = getImageModelById(model);
  const isModelComingSoon = selectedModelEntry?.status === "coming_soon";

  const createdSecret =
    createdBannerKeyId != null
      ? (sessionSecrets[createdBannerKeyId] ?? null)
      : null;

  const hasInputImages = imageInputs.some((item) => item.status !== "error");
  const isImageToImage = hasInputImages;
  const promptPlaceholder = isImageToImage
    ? IMAGE_PLAYGROUND_IMAGE_TO_IMAGE_PLACEHOLDER
    : IMAGE_PLAYGROUND_TEXT_TO_IMAGE_PLACEHOLDER;

  const selectedModelCredits = getImageModelCreditsPerRequest(model);

  const hasUploadingImages = imageInputs.some(
    (item) => item.status === "uploading" || item.status === "resolving"
  );

  const addImageUrl = useCallback(
    (rawUrl: string) => {
      const trimmed = rawUrl.trim();
      if (!trimmed) return;

      if (!isValidImageUrl(trimmed)) {
        setError({
          status: 0,
          code: "invalid_image_url",
          message: "Enter a valid http or https URL.",
        });
        return;
      }

      setImageInputs((current) => {
        if (current.length >= MAX_PLAYGROUND_INPUT_IMAGES) {
          setError({
            status: 0,
            code: "too_many_images",
            message: `Up to ${MAX_PLAYGROUND_INPUT_IMAGES} input images are allowed.`,
          });
          return current;
        }
        if (current.some((item) => item.url === trimmed)) {
          return current;
        }

        setError(null);
        return [
          ...current,
          {
            id: crypto.randomUUID(),
            url: trimmed,
            label: formatUrlLabel(trimmed),
            source: "url",
            status: "resolving",
          },
        ];
      });
      setImageUrlDraft("");
    },
    []
  );

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setError(null);

    const current = imageInputsRef.current;
    const remaining = MAX_PLAYGROUND_INPUT_IMAGES - current.length;
    const slice = fileArray.slice(0, remaining);

    if (slice.length < fileArray.length) {
      setError({
        status: 0,
        code: "too_many_images",
        message: `Up to ${MAX_PLAYGROUND_INPUT_IMAGES} input images are allowed.`,
      });
    }

    const entries = slice.map((file) => {
      const id = crypto.randomUUID();
      return {
        id,
        file,
        item: {
          id,
          url: "",
          label: file.name,
          source: "upload" as const,
          status: "uploading" as const,
        },
      };
    });

    if (entries.length === 0) return;

    flushSync(() => {
      setImageInputs((prev) => {
        const next = [...prev, ...entries.map((entry) => entry.item)];
        imageInputsRef.current = next;
        return next;
      });
    });

    await Promise.all(
      entries.map(async (entry) => {
        let uploadStatus: "ready" | "error" = "error";
        let publicUrl = "";
        let errorMessage = "Upload failed.";

        try {
          validatePlaygroundImageFile(entry.file);
          publicUrl = await uploadPlaygroundImage(entry.file);
          uploadStatus = "ready";
        } catch (err) {
          errorMessage =
            err instanceof PlaygroundImageUploadError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Upload failed.";
          console.error("[image-upload] failed", err);
          setError({
            status: 0,
            code:
              err instanceof PlaygroundImageUploadError
                ? err.code
                : "upload_failed",
            message: errorMessage,
          });
        } finally {
          const resolved = resolveUploadedImageInput(
            entry,
            uploadStatus,
            publicUrl,
            errorMessage
          );

          setImageInputs((currentItems) => {
            const next = mergeImageInputUploadResult(
              currentItems,
              entry.id,
              resolved
            );
            imageInputsRef.current = next;
            return next;
          });
        }
      })
    );
  }, []);

  const removeImageInput = useCallback((id: string) => {
    setImageInputs((current) => {
      const next = current.filter((item) => item.id !== id);
      imageInputsRef.current = next;
      return next;
    });
  }, []);

  const markPreviewError = useCallback((id: string, message: string) => {
    setImageInputs((current) =>
      current.map((item) =>
        item.id === id
          ? { ...item, status: "error", previewError: message, error: message }
          : item
      )
    );
  }, []);

  const markPreviewReady = useCallback((id: string) => {
    setImageInputs((current) =>
      current.map((item) =>
        item.id === id && item.status === "resolving"
          ? { ...item, status: "ready", previewError: undefined, error: undefined }
          : item
      )
    );
  }, []);

  const reportDropError = useCallback((message: string, code: string) => {
    setError({
      status: 0,
      code,
      message,
    });
  }, []);

  async function handleCreateTestKey() {
    if (creatingKey) return;
    if (!accessToken) {
      setCreateKeyError(t("dashboard.imagePlayground.errors.unknown"));
      return;
    }

    setCreatingKey(true);
    setCreateKeyError(null);

    try {
      let keyResult;
      try {
        keyResult = await createApiKey(
          { name: PLAYGROUND_TEST_KEY_NAME },
          { accessToken }
        );
      } catch (err) {
        if (err instanceof DmitApiError && err.status === 409) {
          keyResult = await createApiKey(
            { name: playgroundTestKeyNameWithDate() },
            { accessToken }
          );
        } else {
          throw err;
        }
      }

      const listItem = meKeyToPlaygroundOption(keyResult.api_key);
      setSessionSecrets((prev) => ({
        ...prev,
        [listItem.id]: keyResult.secret,
      }));
      setLocalKeys((prev) => {
        const without = prev.filter((row) => row.id !== listItem.id);
        return [listItem, ...without];
      });
      setSelectedKeyId(listItem.id);
      setCreatedBannerKeyId(listItem.id);
      setKeyPanelView("select");
      router.refresh();
    } catch (err) {
      setCreateKeyError(
        err instanceof DmitApiError
          ? imagePlaygroundErrorMessage(err.status, err.code, t)
          : t("dashboard.imagePlayground.errors.unknown")
      );
    } finally {
      setCreatingKey(false);
    }
  }

  async function handleCopyApiRequest() {
    const trimmedPrompt = prompt.trim() || IMAGE_PLAYGROUND_DEFAULT_PROMPT;
    const curl = buildImageGenerationCurl({
      model,
      prompt: trimmedPrompt,
      size,
      n: 1,
      response_format: "url",
      image_urls: readyImageUrls.length > 0 ? readyImageUrls : undefined,
    });

    try {
      await navigator.clipboard.writeText(curl);
      setCopyRequestStatus("copied");
      window.setTimeout(() => setCopyRequestStatus("idle"), 2000);
    } catch {
      setCopyRequestStatus("idle");
    }
  }

  async function handleGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError(null);
    setResult(null);
    setCompletedAt(null);

    if (isModelComingSoon) {
      setError({
        status: 0,
        code: "model_coming_soon",
        message: t("dashboard.imagePlayground.modelComingSoon"),
      });
      pulseResultAttention();
      focusResultPanel("onComplete");
      return;
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError({
        status: 0,
        code: "missing_prompt",
        message: t("dashboard.imagePlayground.errors.missingPrompt"),
      });
      pulseResultAttention();
      focusResultPanel("onComplete");
      return;
    }

    const currentInputs = imageInputsRef.current;
    const uploadingNow = currentInputs.some(
      (item) => item.status === "uploading" || item.status === "resolving"
    );
    if (uploadingNow) {
      setError({
        status: 0,
        code: "upload_in_progress",
        message: "Wait for input images to finish uploading or resolving.",
      });
      pulseResultAttention();
      focusResultPanel("onComplete");
      return;
    }

    const imageUrlsForRequest = getReadyImageUrls(currentInputs);

    let resolvedKey: string;
    try {
      resolvedKey = await resolveApiKey();
    } catch (err) {
      setError(toPlaygroundError(err, t));
      pulseResultAttention();
      focusResultPanel("onComplete");
      return;
    }

    pulseResultAttention();
    focusResultPanel("onStart");
    setLoading(true);
    try {
      const payload: Parameters<typeof imageGenerations>[1] = {
        model,
        prompt: trimmedPrompt,
        size,
        n: 1,
        response_format: "url",
        image_urls: imageUrlsForRequest,
      };

      setLastRequestInputCount(imageUrlsForRequest.length);
      const res = await imageGenerations(resolvedKey, payload);
      setResult(res);
      setCompletedAt(
        resolveImageCreatedAt(res) ?? new Date().toISOString()
      );
      router.refresh();
    } catch (err) {
      setCompletedAt(new Date().toISOString());
      setError(toPlaygroundError(err, t));
    } finally {
      setLoading(false);
      pulseResultAttention();
      focusResultPanel("onComplete");
    }
  }

  async function revealApiKeyWithTimeout(
    keyId: string,
    token: string
  ): Promise<string> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        revealMeApiKey(keyId, { accessToken: token }),
        new Promise<string>((_, reject) => {
          timeoutId = setTimeout(() => {
            reject(
              new PlaygroundValidationError(
                t("dashboard.playground.apiKeyLoadTimedOut"),
                "key_reveal_timeout"
              )
            );
          }, REVEAL_KEY_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }
  }

  async function resolveApiKey(): Promise<string> {
    if (keyPanelView === "paste") {
      const trimmed = apiKey.trim();
      if (!trimmed) {
        throw new PlaygroundValidationError(
          t("dashboard.imagePlayground.errors.missingToken"),
          "missing_api_key"
        );
      }
      if (!isFullTokfaiApiKey(trimmed)) {
        throw new PlaygroundValidationError(
          t("dashboard.imagePlayground.errors.invalidToken"),
          "invalid_api_key"
        );
      }
      return trimmed;
    }

    if (keyPanelView === "empty" || !selectedKey) {
      throw new PlaygroundValidationError(
        t("dashboard.imagePlayground.errors.missingToken"),
        "missing_api_key"
      );
    }

    const sessionSecret = sessionSecrets[selectedKey.id];
    if (sessionSecret && isFullTokfaiApiKey(sessionSecret)) {
      return sessionSecret;
    }

    if (selectedKey.can_reveal === false) {
      throw new PlaygroundValidationError(
        t("dashboard.imagePlayground.errors.keyNotRetrievable"),
        "key_not_revealable"
      );
    }

    if (!accessToken) {
      throw new PlaygroundValidationError(
        t("dashboard.imagePlayground.errors.unknown"),
        "missing_access_token"
      );
    }

    const secret = await revealApiKeyWithTimeout(selectedKey.id, accessToken);
    if (!isFullTokfaiApiKey(secret)) {
      throw new PlaygroundValidationError(
        t("dashboard.imagePlayground.errors.keyNotRetrievable"),
        "key_not_revealable"
      );
    }
    return secret;
  }

  return (
    <form
      ref={formRef}
      onSubmit={handleGenerate}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
      }}
      className="flex min-w-0 flex-col gap-4 overflow-x-hidden"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("dashboard.imagePlayground.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("dashboard.imagePlayground.toolbenchSubtitle")}
          </p>
        </div>
        <Badge
          variant="secondary"
          className="max-w-full shrink-0 self-start break-all font-mono text-xs"
        >
          {TOKFAI_IMAGES_GENERATIONS_ENDPOINT}
        </Badge>
      </div>

      <div className={IMAGE_PLAYGROUND_TOOLBENCH.shell}>
        <div className={IMAGE_PLAYGROUND_TOOLBENCH.grid}>
          <div className="order-1 min-w-0 lg:col-start-2 lg:row-start-1">
            <ImagePlaygroundApiKeyCard
              keyPanelView={keyPanelView}
              localKeys={localKeys}
              selectedKey={selectedKey}
              selectedKeyId={selectedKeyId}
              apiKey={apiKey}
              showApiKey={showApiKey}
              creatingKey={creatingKey}
              createKeyError={createKeyError}
              createdSecret={createdSecret}
              createdBannerKeyId={createdBannerKeyId}
              loading={loading}
              onCreateTestKey={handleCreateTestKey}
              onKeyPanelViewChange={setKeyPanelView}
              onSelectedKeyChange={setSelectedKeyId}
              onApiKeyChange={setApiKey}
              onShowApiKeyChange={setShowApiKey}
              t={t}
            />
          </div>

          <div className="order-2 min-w-0 lg:col-start-1 lg:row-start-1">
            <Card className={IMAGE_PLAYGROUND_TOOLBENCH.card}>
              <CardHeader className={IMAGE_PLAYGROUND_TOOLBENCH.cardHeader}>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className={IMAGE_PLAYGROUND_TOOLBENCH.cardTitle}>
                    {t("dashboard.imagePlayground.toolbenchInputTitle")}
                  </CardTitle>
                  <Badge variant={isImageToImage ? "default" : "secondary"} className="text-[10px]">
                    {isImageToImage
                      ? t("dashboard.imagePlayground.imageToImage")
                      : t("dashboard.imagePlayground.textToImage")}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent
                className={`${IMAGE_PLAYGROUND_TOOLBENCH.cardContent} flex flex-col gap-3`}
              >
                <PromptPresets
                  loading={loading}
                  onSelect={(presetId) =>
                    setPrompt(t(imagePlaygroundPresetPromptKey(presetId)))
                  }
                  t={t}
                />
                <textarea
                  ref={promptRef}
                  id="prompt"
                  rows={4}
                  required
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={loading}
                  placeholder={promptPlaceholder}
                  className="flex min-h-[5.5rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />

                <ImageInputsPanel
                  embedded
                  toolbench
                  imageInputs={imageInputs}
                  imageUrlDraft={imageUrlDraft}
                  loading={loading}
                  fileInputRef={fileInputRef}
                  onImageUrlDraftChange={setImageUrlDraft}
                  onAddImageUrl={() => addImageUrl(imageUrlDraft)}
                  onRemoveImage={removeImageInput}
                  onPreviewError={markPreviewError}
                  onPreviewReady={markPreviewReady}
                  onUploadFiles={uploadFiles}
                  onDropInvalid={reportDropError}
                  onBrowseClick={() => fileInputRef.current?.click()}
                  onFileInputChange={(event) => {
                    if (event.target.files) {
                      void uploadFiles(event.target.files);
                      event.target.value = "";
                    }
                  }}
                  t={t}
                />

                {hasUploadingImages ? (
                  <p className="text-xs text-muted-foreground">
                    {t("dashboard.imagePlayground.waitingForImages")}
                  </p>
                ) : null}

                <div className="hidden border-t pt-3 lg:block">
                  <ImagePlaygroundGenerateActions
                    loading={loading}
                    hasUploadingImages={hasUploadingImages}
                    isModelComingSoon={isModelComingSoon}
                    copyRequestStatus={copyRequestStatus}
                    onCopyApiRequest={() => void handleCopyApiRequest()}
                    t={t}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="order-3 min-w-0 lg:col-start-2">
            <ImagePlaygroundSettingsSidebar
              model={model}
              size={size}
              loading={loading}
              creditsBalance={initialCreditsBalance}
              creditsLoaded={creditsLoaded}
              estimatedCredits={selectedModelCredits}
              isModelComingSoon={isModelComingSoon}
              locale={locale}
              onModelChange={setModel}
              onSizeChange={setSize}
              t={t}
            />
          </div>

          <div className="order-4 min-w-0 lg:hidden">
            <ImagePlaygroundGenerateActions
              loading={loading}
              hasUploadingImages={hasUploadingImages}
              isModelComingSoon={isModelComingSoon}
              copyRequestStatus={copyRequestStatus}
              layout="stack"
              onCopyApiRequest={() => void handleCopyApiRequest()}
              t={t}
            />
          </div>

          <div
            ref={resultPanelRef}
            className={`order-5 min-w-0 lg:col-start-3 lg:row-start-1 ${IMAGE_PLAYGROUND_TOOLBENCH.resultSticky}`}
          >
            <ImagePlaygroundResultArea
              loading={loading}
              error={error}
              result={result}
              completedAt={completedAt}
              inputImagesCount={
                result?.input_images_count ?? lastRequestInputCount
              }
              attention={resultAttention || loading}
              onRetry={() => formRef.current?.requestSubmit()}
              t={t}
            />
          </div>

          <div className="order-6 min-w-0 lg:col-start-2">
            <ImagePlaygroundServiceDocsPanel
              copyRequestStatus={copyRequestStatus}
              loading={loading}
              hasUploadingImages={hasUploadingImages}
              onCopyApiRequest={() => void handleCopyApiRequest()}
              t={t}
            />
          </div>
        </div>
      </div>
    </form>
  );
}

function PromptPresets({
  loading,
  onSelect,
  t,
}: {
  loading: boolean;
  onSelect: (presetId: ImagePlaygroundPresetId) => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {IMAGE_PLAYGROUND_PRESET_IDS.map((presetId) => (
        <Button
          key={presetId}
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          className="h-7 px-2.5 text-xs"
          onClick={() => onSelect(presetId)}
        >
          {t(imagePlaygroundPresetLabelKey(presetId))}
        </Button>
      ))}
    </div>
  );
}

function ImageInputsPanel({
  imageInputs,
  imageUrlDraft,
  loading,
  fileInputRef,
  onImageUrlDraftChange,
  onAddImageUrl,
  onRemoveImage,
  onPreviewError,
  onPreviewReady,
  onUploadFiles,
  onDropInvalid,
  onBrowseClick,
  onFileInputChange,
  embedded = false,
  toolbench = false,
  t,
}: {
  imageInputs: ImageInputItem[];
  imageUrlDraft: string;
  loading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onImageUrlDraftChange: (value: string) => void;
  onAddImageUrl: () => void;
  onRemoveImage: (id: string) => void;
  onPreviewError: (id: string, message: string) => void;
  onPreviewReady: (id: string) => void;
  onUploadFiles: (files: FileList | File[]) => Promise<void>;
  onDropInvalid: (message: string, code: string) => void;
  onBrowseClick: () => void;
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  embedded?: boolean;
  toolbench?: boolean;
  t: (key: string) => string;
}) {
  const atLimit = imageInputs.length >= MAX_PLAYGROUND_INPUT_IMAGES;
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const suppressClickRef = useRef(false);

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (loading || atLimit || !isFileDragEvent(event.dataTransfer)) return;

    dragDepthRef.current += 1;
    setIsDragging(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (loading || atLimit || !isFileDragEvent(event.dataTransfer)) return;

    event.dataTransfer.dropEffect = "copy";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    dragDepthRef.current = 0;
    setIsDragging(false);
    suppressClickRef.current = true;
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 0);

    if (loading) return;

    if (atLimit) {
      onDropInvalid(
        formatMessage(t("dashboard.imagePlayground.errors.tooManyImages"), {
          max: MAX_PLAYGROUND_INPUT_IMAGES,
        }),
        "too_many_images"
      );
      return;
    }

    const files = getDroppedFiles(event.dataTransfer);
    if (files.length === 0) {
      onDropInvalid(
        t("dashboard.imagePlayground.errors.invalidDrop"),
        "invalid_drop"
      );
      return;
    }

    void onUploadFiles(files);
  };

  const handleZoneClick = () => {
    if (suppressClickRef.current || loading || atLimit) return;
    onBrowseClick();
  };

  const shellClass = embedded
    ? toolbench
      ? "flex flex-col gap-2"
      : "flex flex-col gap-2"
    : "flex flex-col gap-3 rounded-md border bg-muted/20 p-4";

  return (
    <div className={shellClass}>
      {!embedded ? (
        <>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Upload className="h-4 w-4 text-muted-foreground" />
            {t("dashboard.imagePlayground.inputImagesTitle")}
          </div>
          <p className="text-xs text-muted-foreground">
            {formatMessage(t("dashboard.imagePlayground.inputImagesDesc"), {
              max: MAX_PLAYGROUND_INPUT_IMAGES,
            })}
          </p>
        </>
      ) : null}

      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-0.5 rounded-md border border-dashed px-3 text-center transition-colors ${
          toolbench ? "py-2" : "py-5 sm:py-6"
        } ${
          isDragging
            ? "border-primary bg-primary/10 ring-2 ring-primary/30"
            : "border-muted-foreground/30 bg-muted/20"
        } ${loading || atLimit ? "opacity-60" : "cursor-pointer"}`}
        onClick={handleZoneClick}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            handleZoneClick();
          }
        }}
      >
        <div className="pointer-events-none flex flex-col items-center gap-0.5">
          <Upload className={`text-muted-foreground ${toolbench ? "h-4 w-4" : "h-5 w-5"}`} />
          <p className={toolbench ? "text-xs font-medium" : "text-sm font-medium"}>
            {t("dashboard.imagePlayground.inputImagesDragTitle")}
          </p>
          {toolbench ? null : (
            <p className="text-xs text-muted-foreground">
              {t("dashboard.imagePlayground.inputImagesDragHint")}
            </p>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          disabled={loading || atLimit}
          onChange={onFileInputChange}
        />
      </div>

      <div className="flex flex-row items-center gap-2">
        <Input
          type="url"
          className={`min-w-0 flex-1 ${toolbench ? "h-8 text-xs" : ""}`}
          placeholder={t("dashboard.imagePlayground.inputImagesUrlPlaceholder")}
          value={imageUrlDraft}
          onChange={(event) => onImageUrlDraftChange(event.target.value)}
          disabled={loading || atLimit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onAddImageUrl();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={loading || atLimit || !imageUrlDraft.trim()}
          onClick={onAddImageUrl}
          className={`shrink-0 ${toolbench ? "h-8 px-2 text-xs" : ""}`}
        >
          <Plus className="h-4 w-4" />
          {t("dashboard.imagePlayground.addImageUrl")}
        </Button>
      </div>

      {imageInputs.length > 0 ? (
        <div
          className={
            toolbench
              ? "grid grid-cols-4 gap-1.5 sm:grid-cols-4"
              : "grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-2"
          }
        >
          {imageInputs.map((item) => (
            <ImageInputThumbnail
              key={item.id}
              item={item}
              loading={loading}
              onRemove={() => onRemoveImage(item.id)}
              onPreviewError={(message) => onPreviewError(item.id, message)}
              onPreviewReady={() => onPreviewReady(item.id)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ImageInputThumbnail({
  item,
  loading,
  onRemove,
  onPreviewError,
  onPreviewReady,
}: {
  item: ImageInputItem;
  loading: boolean;
  onRemove: () => void;
  onPreviewError: (message: string) => void;
  onPreviewReady: () => void;
}) {
  const showPreview =
    item.status === "ready" && item.url && !item.previewError;

  const referenceMessage = getInputReferenceMessage(item);

  return (
    <div className="relative overflow-hidden rounded-md border bg-background">
      <div className="aspect-square bg-muted/30">
        {showPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.url}
            alt={item.label}
            className="h-full w-full object-cover"
            onError={() =>
              onPreviewError("Could not load image preview.")
            }
          />
        ) : item.status === "uploading" ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-[10px]">Uploading…</span>
          </div>
        ) : item.status === "resolving" ? (
          <>
            <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-[10px]">Resolving…</span>
            </div>
            {item.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={item.url}
                alt=""
                className="hidden"
                onLoad={() => onPreviewReady()}
                onError={() =>
                  onPreviewError("Could not load image from this URL.")
                }
              />
            ) : null}
          </>
        ) : item.previewError || item.error ? (
          <div className="flex h-full items-center justify-center px-2 text-center text-xs text-destructive">
            {item.previewError ?? item.error ?? "Failed"}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-xs text-destructive">
            Upload failed
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 border-t px-2 py-1.5">
        {referenceMessage ? (
          <p className="text-[11px] leading-snug text-muted-foreground">
            {referenceMessage}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] font-medium">
            {item.label}
          </span>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-6 w-6 shrink-0"
            disabled={loading}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            aria-label={`Remove ${item.label}`}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function getInputReferenceMessage(item: ImageInputItem): string | null {
  if (item.status === "error") {
    return item.error ?? item.previewError ?? "This input image cannot be used.";
  }
  if (item.source === "upload" && item.status === "ready") {
    return "This image will be used as visual reference.";
  }
  if (item.source === "url" && item.status === "ready") {
    return "Resolved and will be used as visual reference.";
  }
  if (item.source === "url" && item.status === "resolving") {
    return "Checking whether this URL can be used as a visual reference.";
  }
  return null;
}

function formatUrlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return "Linked image";
  }
}

class PlaygroundValidationError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "PlaygroundValidationError";
    this.code = code;
  }
}

const IMAGE_PAGE_RESOLVE_ERROR_CODES = new Set([
  "no_image_found_on_page",
  "unsupported_image_content_type",
]);

function toPlaygroundError(
  err: unknown,
  t: (key: string) => string
): PlaygroundError {
  if (err instanceof PlaygroundValidationError) {
    return {
      status: 0,
      code: err.code,
      message: playgroundErrorMessage(0, err.code, t),
    };
  }
  if (err instanceof DmitApiError) {
    const code = err.code?.toLowerCase();
    if (code === "key_reveal_timeout") {
      return {
        status: err.status,
        code: err.code,
        message: err.message,
      };
    }
    if (code && IMAGE_PAGE_RESOLVE_ERROR_CODES.has(code)) {
      return {
        status: err.status,
        code: err.code,
        message: t("dashboard.imagePlayground.errors.pageImageNotFound"),
      };
    }
    return {
      status: err.status,
      code: err.code,
      message: imagePlaygroundErrorMessage(
        err.status,
        err.code,
        t,
        err.message
      ),
      requestId: extractDmitRequestId(err.body),
    };
  }
  if (err instanceof TypeError) {
    return {
      status: 0,
      code: "network_error",
      message: imagePlaygroundErrorMessage(503, "upstream_error", t),
    };
  }
  if (err instanceof Error) {
    return {
      status: 0,
      code: "unknown_error",
      message: imagePlaygroundErrorMessage(0, undefined, t),
    };
  }
  return {
    status: 0,
    code: "unknown_error",
    message: imagePlaygroundErrorMessage(503, undefined, t),
  };
}

function extractDmitRequestId(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const record = body as Record<string, unknown>;
  if (typeof record.request_id === "string") return record.request_id;
  const nested = record.error;
  if (
    nested &&
    typeof nested === "object" &&
    typeof (nested as { request_id?: string }).request_id === "string"
  ) {
    return (nested as { request_id: string }).request_id;
  }
  return undefined;
}

function playgroundErrorMessage(
  status: number,
  code: string | undefined,
  t: (key: string) => string
): string {
  return imagePlaygroundErrorMessage(status, code, t);
}
