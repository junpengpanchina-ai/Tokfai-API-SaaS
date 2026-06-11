"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  ImageIcon,
  Info,
  KeyRound,
  Loader2,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

import { CopyButton, useCopyToClipboard } from "@/components/copy-code-block";
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
  hasGeneratedImageBase64,
  imagePlaygroundErrorMessage,
  resolveGeneratedImageUrl,
  resolveImageCreatedAt,
} from "@/lib/image-playground-display";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";
import {
  formatImageCreditsAmount,
  formatImageModelPriceForModelId,
  formatImageModelSelectLabel,
  formatImageReferenceYuanForModelId,
} from "@/lib/model-pricing-display";
import {
  getImageModelById,
  getImageModelCreditsPerRequest,
  IMAGE_PLAYGROUND_DEFAULT_MODEL,
  IMAGE_PLAYGROUND_MODEL_IDS,
  IMAGE_PLAYGROUND_SIZES,
  isAvailableImageModel,
  type ImagePlaygroundModelId,
  type ImagePlaygroundSize,
} from "@/lib/model-catalog";
import { formatCreditsPrecise, formatDateTime } from "@/lib/format";
import {
  isFullTokfaiApiKey,
  IMAGE_PLAYGROUND_IMAGE_TO_IMAGE_PLACEHOLDER,
  IMAGE_PLAYGROUND_TEXT_TO_IMAGE_PLACEHOLDER,
  TOKFAI_API_KEY_PLACEHOLDER,
  TOKFAI_IMAGES_GENERATIONS_FULL_PATH,
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
}: {
  accessToken: string;
  activeKeys: ImagePlaygroundApiKeyOption[];
  initialModel?: string;
}) {
  const { t, locale } = useI18n();
  const router = useRouter();
  const promptRef = useRef<HTMLTextAreaElement>(null);

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readyImageUrls = getReadyImageUrls(imageInputs);

  useEffect(() => {
    setLocalKeys(activeKeys);
    if (activeKeys.length > 0 && keyPanelView === "empty") {
      setKeyPanelView("select");
    }
  }, [activeKeys, keyPanelView]);

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

  const inputImageCount = readyImageUrls.length;
  const hasInputImages = imageInputs.some((item) => item.status !== "error");
  const isImageToImage = hasInputImages;
  const promptPlaceholder = isImageToImage
    ? IMAGE_PLAYGROUND_IMAGE_TO_IMAGE_PLACEHOLDER
    : IMAGE_PLAYGROUND_TEXT_TO_IMAGE_PLACEHOLDER;

  const selectedModelCredits = getImageModelCreditsPerRequest(model);
  const selectedModelPrice = formatImageModelPriceForModelId(model, locale);
  const selectedModelReferencePrice = formatImageReferenceYuanForModelId(model, locale);

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

  function focusPrompt() {
    promptRef.current?.focus();
    promptRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
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
      return;
    }

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError({
        status: 0,
        code: "missing_prompt",
        message: t("dashboard.imagePlayground.errors.missingPrompt"),
      });
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
      return;
    }

    const imageUrlsForRequest = getReadyImageUrls(currentInputs);

    let resolvedKey: string;
    try {
      resolvedKey = await resolveApiKey();
    } catch (err) {
      setError(toPlaygroundError(err, t));
      return;
    }

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
      onSubmit={handleGenerate}
      onDragOver={(event) => {
        event.preventDefault();
      }}
      onDrop={(event) => {
        event.preventDefault();
      }}
      className="flex min-w-0 flex-col gap-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            {t("dashboard.imagePlayground.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {formatMessage(t("dashboard.imagePlayground.subtitle"), {
              endpoint: TOKFAI_IMAGES_GENERATIONS_FULL_PATH,
            })}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("dashboard.imagePlayground.usesOwnKey")}
          </p>
        </div>
        <Badge
          variant="secondary"
          className="max-w-full shrink-0 self-start break-all font-mono text-xs sm:max-w-none"
        >
          {TOKFAI_IMAGES_GENERATIONS_ENDPOINT}
        </Badge>
      </div>

      <div className="flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/5 px-4 py-3 text-sm text-muted-foreground">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        <span>{t("dashboard.imagePlayground.billingHint")}</span>
      </div>

      <div className="grid min-w-0 grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t("dashboard.imagePlayground.request")}</CardTitle>
            <CardDescription>{t("dashboard.imagePlayground.requestDesc")}</CardDescription>
            <div className="mt-3 flex flex-col gap-1">
              <Badge variant={isImageToImage ? "default" : "secondary"}>
                {isImageToImage
                  ? t("dashboard.imagePlayground.imageToImage")
                  : t("dashboard.imagePlayground.textToImage")}
              </Badge>
              {isImageToImage ? (
                <p className="text-xs text-muted-foreground">
                  {t("dashboard.imagePlayground.inputImagesReference")}
                </p>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ApiKeySection
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
              onFocusPrompt={focusPrompt}
              t={t}
            />

            <ImageInputsPanel
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
            />

            <div className="flex flex-col gap-2">
              <Label htmlFor="prompt">Prompt</Label>
              {isImageToImage ? (
                <p className="text-xs text-muted-foreground">
                  {t("dashboard.imagePlayground.imageToImageHint")}
                </p>
              ) : null}
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
                rows={6}
                required
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={loading}
                placeholder={promptPlaceholder}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>

            <div className="flex w-full min-w-0 flex-col items-stretch gap-2 sm:items-end">
              {hasUploadingImages ? (
                <p className="text-xs text-muted-foreground">
                  {t("dashboard.imagePlayground.waitingForImages")}
                </p>
              ) : null}
              <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                <Button
                  type="button"
                  variant="outline"
                  disabled={loading || hasUploadingImages}
                  onClick={() => void handleCopyApiRequest()}
                  className="w-full sm:w-auto"
                >
                  {copyRequestStatus === "copied" ? (
                    <>
                      <Check className="h-4 w-4" />
                      {t("dashboard.apiKeys.copied")}
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      {t("dashboard.imagePlayground.copyApiRequest")}
                    </>
                  )}
                </Button>
                <Button
                  type="submit"
                  disabled={loading || hasUploadingImages || isModelComingSoon}
                  className="w-full sm:w-auto"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("dashboard.imagePlayground.generating")}
                    </>
                  ) : hasUploadingImages ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("dashboard.imagePlayground.preparingImages")}
                    </>
                  ) : (
                    <>
                      <ImageIcon className="h-4 w-4" />
                      {t("dashboard.imagePlayground.generate")}
                    </>
                  )}
                </Button>
              </div>
              {selectedModelCredits != null ? (
                <p className="text-xs font-medium text-foreground">
                  {formatMessage(t("dashboard.imagePlayground.estimatedCost"), {
                    credits: formatImageCreditsAmount(selectedModelCredits, locale),
                  })}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("dashboard.imagePlayground.priceFallback")}
                </p>
              )}
              {copyRequestStatus === "copied" ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400">
                  {formatMessage(t("dashboard.imagePlayground.curlCopied"), {
                    placeholder: TOKFAI_API_KEY_PLACEHOLDER,
                  })}
                </p>
              ) : null}
              <div className="flex w-full flex-col items-end gap-1 text-right">
                <p className="text-xs text-muted-foreground">
                  {formatMessage(t("dashboard.imagePlayground.inputImagesCount"), {
                    count: inputImageCount,
                  })}
                </p>
                {inputImageCount > 0 ? (
                  <p className="max-w-md text-xs text-muted-foreground">
                    {t("dashboard.imagePlayground.visualReferenceNote")}
                  </p>
                ) : null}
              </div>
            </div>

            <ResponsePanel
              loading={loading}
              error={error}
              result={result}
              completedAt={completedAt}
              inputImagesCount={
                result?.input_images_count ?? lastRequestInputCount
              }
              t={t}
            />
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:row-span-1">
          <CardHeader>
            <CardTitle>{t("dashboard.imagePlayground.settings")}</CardTitle>
            <CardDescription>{t("dashboard.imagePlayground.settingsDesc")}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="model">Model</Label>
              <select
                id="model"
                value={model}
                onChange={(e) => setModel(e.target.value as ImagePlaygroundModelId)}
                disabled={loading}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {IMAGE_PLAYGROUND_MODEL_IDS.map((m) => (
                  <option key={m} value={m}>
                    {formatImageModelSelectLabel(m, locale)}
                  </option>
                ))}
              </select>
              {selectedModelPrice ? (
                <p className="text-xs text-muted-foreground">
                  {formatMessage(t("dashboard.imagePlayground.currentModelPrice"), {
                    price: selectedModelPrice,
                  })}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {t("dashboard.imagePlayground.priceFallback")}
                </p>
              )}
              {selectedModelReferencePrice ? (
                <p className="text-xs text-muted-foreground">
                  {formatMessage(t("dashboard.imagePlayground.currentReferencePrice"), {
                    price: selectedModelReferencePrice,
                  })}
                </p>
              ) : null}
              {selectedModelEntry?.description ? (
                <p className="text-xs text-muted-foreground">
                  {selectedModelEntry.description}
                </p>
              ) : null}
              {isModelComingSoon ? (
                <p className="text-xs font-medium text-destructive">
                  {t("dashboard.imagePlayground.modelComingSoon")}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="size">{t("dashboard.imagePlayground.size")}</Label>
              <select
                id="size"
                value={size}
                onChange={(e) => setSize(e.target.value as ImagePlaygroundSize)}
                disabled={loading}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              >
                {IMAGE_PLAYGROUND_SIZES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <p className="text-xs text-muted-foreground">
              {t("dashboard.imagePlayground.needKey")}{" "}
              <Link
                href="/dashboard/api-keys"
                className="underline underline-offset-4"
              >
                {t("dashboard.imagePlayground.createApiKey")}
              </Link>
              . {t("dashboard.imagePlayground.needCredits")}{" "}
              <Link
                href="/dashboard/credits"
                className="underline underline-offset-4"
              >
                {t("dashboard.imagePlayground.topUp")}
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>

      <ImagePlaygroundFooter t={t} />
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
    <div className="flex flex-wrap gap-2">
      {IMAGE_PLAYGROUND_PRESET_IDS.map((presetId) => (
        <Button
          key={presetId}
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
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
        `Up to ${MAX_PLAYGROUND_INPUT_IMAGES} input images are allowed.`,
        "too_many_images"
      );
      return;
    }

    const files = getDroppedFiles(event.dataTransfer);
    if (files.length === 0) {
      onDropInvalid(
        "Drop PNG, JPG, or WEBP image files.",
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

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Upload className="h-4 w-4 text-muted-foreground" />
        Input images
      </div>

      <p className="text-xs text-muted-foreground">
        Drag images or paste an image URL. Up to {MAX_PLAYGROUND_INPUT_IMAGES}{" "}
        images. Supported: PNG, JPG, WEBP. Leave empty for text-to-image.
      </p>

      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-8 text-center transition-colors ${
          isDragging
            ? "border-primary bg-primary/10 ring-2 ring-primary/30"
            : "border-muted-foreground/30 bg-background"
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
        <div className="pointer-events-none flex flex-col items-center gap-2">
          <Upload className="h-5 w-5 text-muted-foreground" />
          <p className="text-sm font-medium">Drag images here or click to upload</p>
          <p className="text-xs text-muted-foreground">
            PNG, JPG, WEBP · max 10 MB each
          </p>
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

      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          type="url"
          placeholder="Paste an image URL or a webpage URL. Tokfai will try to extract the image automatically."
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
          className="shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add URL
        </Button>
      </div>

      {imageInputs.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
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

function ApiKeySection({
  keyPanelView,
  localKeys,
  selectedKey,
  selectedKeyId,
  apiKey,
  showApiKey,
  creatingKey,
  createKeyError,
  createdSecret,
  createdBannerKeyId,
  loading,
  onCreateTestKey,
  onKeyPanelViewChange,
  onSelectedKeyChange,
  onApiKeyChange,
  onShowApiKeyChange,
  onFocusPrompt,
  t,
}: {
  keyPanelView: KeyPanelView;
  localKeys: ImagePlaygroundApiKeyOption[];
  selectedKey: ImagePlaygroundApiKeyOption | null;
  selectedKeyId: string;
  apiKey: string;
  showApiKey: boolean;
  creatingKey: boolean;
  createKeyError: string | null;
  createdSecret: string | null;
  createdBannerKeyId: string | null;
  loading: boolean;
  onCreateTestKey: () => void;
  onKeyPanelViewChange: (view: KeyPanelView) => void;
  onSelectedKeyChange: (id: string) => void;
  onApiKeyChange: (value: string) => void;
  onShowApiKeyChange: (show: boolean) => void;
  onFocusPrompt: () => void;
  t: (key: string) => string;
}) {
  const { copiedId, copyText } = useCopyToClipboard();
  const secretCopied = copiedId === "image-playground-created-secret";

  if (keyPanelView === "paste") {
    return (
      <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <KeyRound className="h-4 w-4 text-muted-foreground" />
          {t("dashboard.playground.pasteKey")}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="api-key">{t("dashboard.playground.fullApiKey")}</Label>
          <div className="flex gap-2">
            <Input
              id="api-key"
              type={showApiKey ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder={TOKFAI_API_KEY_PLACEHOLDER}
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              disabled={loading}
              className="font-mono"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              disabled={loading}
              aria-label={
                showApiKey
                  ? t("dashboard.playground.hideKey")
                  : t("dashboard.playground.showKey")
              }
              onClick={() => onShowApiKeyChange(!showApiKey)}
            >
              {showApiKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("dashboard.playground.pasteKeySecurityHint")}
          </p>
        </div>
        {localKeys.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={loading}
            className="w-fit"
            onClick={() => onKeyPanelViewChange("select")}
          >
            {t("dashboard.playground.selectKey")}
          </Button>
        ) : null}
      </div>
    );
  }

  if (keyPanelView === "empty" || localKeys.length === 0) {
    return (
      <div className="flex flex-col gap-4 rounded-md border border-dashed bg-muted/20 p-4">
        <div className="flex items-start gap-2">
          <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div className="flex flex-col gap-1">
            <p className="text-sm font-medium">
              {t("dashboard.imagePlayground.noKeyTitle")}
            </p>
            <p className="text-sm text-muted-foreground">
              {t("dashboard.imagePlayground.noKeyBody")}
            </p>
          </div>
        </div>
        {createKeyError ? (
          <p className="text-sm text-destructive">{createKeyError}</p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={loading || creatingKey}
            onClick={onCreateTestKey}
          >
            {creatingKey ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {t("dashboard.imagePlayground.creatingTestKey")}
              </>
            ) : (
              t("dashboard.imagePlayground.createTestKey")
            )}
          </Button>
          <Button asChild type="button" size="sm" variant="outline">
            <Link href="/dashboard/api-keys">
              {t("dashboard.imagePlayground.goToApiKeys")}
            </Link>
          </Button>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-auto w-fit px-0 text-xs text-muted-foreground"
          disabled={loading}
          onClick={() => onKeyPanelViewChange("paste")}
        >
          {t("dashboard.playground.pasteOtherKey")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        {t("dashboard.playground.apiKey")}
      </div>

      {createdSecret && createdBannerKeyId === selectedKeyId ? (
        <CreatedKeyBanner
          secret={createdSecret}
          secretCopied={secretCopied}
          onCopy={() =>
            copyText("image-playground-created-secret", createdSecret)
          }
          onTestNow={onFocusPrompt}
          t={t}
        />
      ) : null}

      {selectedKey ? (
        <p className="text-sm text-muted-foreground">
          {formatMessage(t("dashboard.playground.currentKeySelection"), {
            name: selectedKey.name,
            prefix: selectedKey.prefix || "sk-tokfai",
          })}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="api-key-select">{t("dashboard.playground.selectKey")}</Label>
        <select
          id="api-key-select"
          value={selectedKeyId}
          onChange={(e) => onSelectedKeyChange(e.target.value)}
          disabled={loading}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          {localKeys.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name} ({row.prefix || "no prefix"})
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          {t("dashboard.playground.secretNotStored")}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={loading}
          onClick={() => onKeyPanelViewChange("paste")}
        >
          {t("dashboard.playground.pasteOtherKey")}
        </Button>
        <Button asChild type="button" size="sm" variant="outline">
          <Link href="/dashboard/api-keys">
            {t("dashboard.playground.manageApiKeys")}
          </Link>
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("dashboard.playground.manageApiKeysHint")}
      </p>
    </div>
  );
}

function CreatedKeyBanner({
  secret,
  secretCopied,
  onCopy,
  onTestNow,
  t,
}: {
  secret: string;
  secretCopied: boolean;
  onCopy: () => void;
  onTestNow: () => void;
  t: (key: string) => string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4">
      <div className="flex items-start gap-2 text-sm text-emerald-800 dark:text-emerald-200">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{t("dashboard.playground.testKeyCreated")}</span>
      </div>
      <code className="break-all rounded-md border bg-background px-3 py-2 font-mono text-sm">
        {secret}
      </code>
      <p className="text-xs text-muted-foreground">
        {t("dashboard.playground.secretOnceHint")}
      </p>
      <div className="flex flex-wrap gap-2">
        <CopyButton
          copied={secretCopied}
          onCopy={onCopy}
          copyLabel={t("dashboard.playground.copySecret")}
          copiedLabel={t("dashboard.playground.copied")}
        />
        <Button type="button" size="sm" variant="outline" onClick={onTestNow}>
          {t("dashboard.playground.testNow")}
        </Button>
      </div>
    </div>
  );
}

function ResponsePanel({
  loading,
  error,
  result,
  completedAt,
  inputImagesCount,
  t,
}: {
  loading: boolean;
  error: PlaygroundError | null;
  result: ImageGenerationResponse | null;
  completedAt: string | null;
  inputImagesCount: number | null | undefined;
  t: (key: string) => string;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        {t("dashboard.imagePlayground.generatingImage")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertTriangle className="h-4 w-4" />
          {t("dashboard.playground.requestFailed")}
          {error.status > 0 ? (
            <Badge variant="outline" className="ml-1">
              HTTP {error.status}
            </Badge>
          ) : null}
        </div>
        <dl className="grid gap-1 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">{t("dashboard.playground.errorCode")}</dt>
            <dd className="font-mono">{error.code ?? "n/a"}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">{t("dashboard.playground.errorMessage")}</dt>
            <dd>{error.message}</dd>
          </div>
        </dl>
        {error.status === 402 || error.code === "insufficient_credits" ? (
          <Button asChild size="sm" variant="outline" className="w-fit">
            <Link href="/dashboard/credits">{t("dashboard.playground.addCredits")}</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4" />
        {t("dashboard.imagePlayground.generatedImagePlaceholder")}
      </div>
    );
  }

  const imageUrl = resolveGeneratedImageUrl(result);
  const base64Only = !imageUrl && hasGeneratedImageBase64(result);
  const creditsCharged = resolveImageCreditsCharged(result);
  const createdAt =
    completedAt ?? resolveImageCreatedAt(result) ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <div className="flex flex-col gap-1">
            {creditsCharged != null ? (
              <p>
                {formatMessage(t("dashboard.imagePlayground.successCreditsCharged"), {
                  credits: formatCreditsPrecise(creditsCharged),
                })}
              </p>
            ) : (
              <p>{t("dashboard.imagePlayground.successNoCreditsHint")}</p>
            )}
            <p className="text-muted-foreground">
              {t("dashboard.imagePlayground.successBalanceHint")}{" "}
              <Link
                href="/dashboard/usage"
                className="underline underline-offset-4"
              >
                {t("dashboard.imagePlayground.viewUsage")}
              </Link>{" "}
              /{" "}
              <Link
                href="/dashboard/credits"
                className="underline underline-offset-4"
              >
                {t("dashboard.imagePlayground.viewCredits")}
              </Link>
            </p>
          </div>
        </div>
      </div>

      {imageUrl ? (
        <div className="overflow-hidden rounded-md border bg-muted/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Generated image"
            className="mx-auto max-h-[min(480px,70vh)] w-full max-w-full object-contain"
          />
        </div>
      ) : base64Only ? (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-muted-foreground">
          {t("dashboard.imagePlayground.base64OnlyHint")}
        </div>
      ) : (
        <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
          {t("dashboard.imagePlayground.generatedImagePlaceholder")}
        </div>
      )}

      <MetadataPanel
        result={result}
        imageUrl={imageUrl}
        createdAt={createdAt}
        inputImagesCount={inputImagesCount ?? result.input_images_count ?? 0}
        t={t}
      />
    </div>
  );
}

function resolveImageCreditsCharged(
  result: ImageGenerationResponse
): number | null {
  const raw = result.credits_charged;
  if (raw == null) return null;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}

function MetadataPanel({
  result,
  imageUrl,
  createdAt,
  inputImagesCount,
  t,
}: {
  result: ImageGenerationResponse;
  imageUrl: string | null;
  createdAt: string | null;
  inputImagesCount: number;
  t: (key: string) => string;
}) {
  const { copiedId, copyText } = useCopyToClipboard();
  const urlCopyId = "image-playground-url";
  const requestCopyId = "image-playground-request-id";

  const creditsCharged = resolveImageCreditsCharged(result);

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-card p-4">
      {imageUrl ? (
        <div className="flex flex-col gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            {t("dashboard.imagePlayground.metaImageUrl")}
          </Label>
          <code className="block overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs break-all">
            {imageUrl}
          </code>
          <div className="flex flex-wrap gap-2">
            <Button asChild type="button" size="sm" variant="outline" className="w-fit">
              <a href={imageUrl} download target="_blank" rel="noopener noreferrer">
                {t("dashboard.imagePlayground.downloadImage")}
              </a>
            </Button>
            <CopyButton
              copied={copiedId === urlCopyId}
              onCopy={() => copyText(urlCopyId, imageUrl)}
              copyLabel={t("dashboard.imagePlayground.copyImageUrl")}
              copiedLabel={t("dashboard.imagePlayground.copiedImageUrl")}
            />
          </div>
        </div>
      ) : null}

      <dl className="grid gap-2 text-sm">
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">
            {t("dashboard.imagePlayground.metaModel")}
          </dt>
          <dd className="font-mono">{result.model}</dd>
        </div>
        {createdAt ? (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">
              {t("dashboard.imagePlayground.metaCreatedAt")}
            </dt>
            <dd className="font-mono">{formatDateTime(createdAt)}</dd>
          </div>
        ) : null}
        {creditsCharged != null ? (
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">
              {t("dashboard.imagePlayground.metaCreditsCharged")}
            </dt>
            <dd className="font-mono">{formatCreditsPrecise(creditsCharged)}</dd>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-x-2">
          <dt className="text-muted-foreground">
            {t("dashboard.imagePlayground.metaInputImages")}
          </dt>
          <dd className="font-mono">{inputImagesCount}</dd>
        </div>
        {result.request_id ? (
          <div className="flex flex-wrap items-center gap-2">
            <dt className="text-muted-foreground">
              {t("dashboard.imagePlayground.metaRequestId")}
            </dt>
            <dd className="font-mono break-all">{result.request_id}</dd>
            <CopyButton
              copied={copiedId === requestCopyId}
              onCopy={() => copyText(requestCopyId, result.request_id!)}
              copyLabel={t("dashboard.imagePlayground.copyRequestId")}
              copiedLabel={t("dashboard.imagePlayground.copiedRequestId")}
              size="icon"
            />
          </div>
        ) : null}
      </dl>
    </div>
  );
}

function ImagePlaygroundFooter({ t }: { t: (key: string) => string }) {
  const links = [
    { href: "/dashboard/usage", label: t("dashboard.imagePlayground.viewUsage") },
    {
      href: "/dashboard/credits",
      label: t("dashboard.imagePlayground.viewCredits"),
    },
    {
      href: "/dashboard/models",
      label: t("dashboard.imagePlayground.viewModels"),
    },
    {
      href: "/dashboard/api-keys",
      label: t("dashboard.playground.manageApiKeys"),
    },
  ] as const;

  return (
    <div className="flex flex-wrap gap-2 border-t pt-4">
      {links.map((link) => (
        <Button key={link.href} asChild variant="outline" size="sm">
          <Link href={link.href}>{link.label}</Link>
        </Button>
      ))}
    </div>
  );
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
      message: imagePlaygroundErrorMessage(err.status, err.code, t),
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

function playgroundErrorMessage(
  status: number,
  code: string | undefined,
  t: (key: string) => string
): string {
  return imagePlaygroundErrorMessage(status, code, t);
}
