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
  ImagePlaygroundGenerateActions,
  ImagePlaygroundResultArea,
  ImagePlaygroundRunSettingsPanel,
} from "./image-playground-toolbench-client";
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
  DmitApiError,
  imageGenerationsWithProgress,
  type ImageGenerationResponse,
} from "@/lib/dashboard-safe/image-api";
import {
  ensurePlaygroundApiKey,
} from "@/lib/dashboard-safe/playground-default-key";
import {
  getImageModelCapability,
  getImagePlaygroundMode,
  pickPreferredImageModel,
  promptImpliesReferenceEdit,
  resolveImagePromptForRequest,
} from "@/lib/dashboard-safe/image-edit-prompt";
import {
  fileToDataUrl,
  isBlobUrl,
  pickApiImageSource,
} from "@/lib/dashboard-safe/file-to-data-url";
import {
  imagePlaygroundErrorMessage,
  resolveImageCreatedAt,
} from "./image-playground-display-helpers";
import {
  getImageModelCreditsPerRequest,
  getImageModelOptionById,
  IMAGE_PLAYGROUND_DEFAULT_MODEL,
  IMAGE_PLAYGROUND_MODEL_IDS,
  isAvailableImageModel,
  type ImagePlaygroundModelId,
  type ImagePlaygroundSize,
} from "./image-playground-model-options";
import { buildImageGenerationCurlOneLine } from "./image-playground-safe-snippets";
import { formatImagePlaygroundLabel } from "./image-playground-labels";
import { useImagePlaygroundLabels } from "./use-image-playground-labels";
import {
  isFullTokfaiApiKey,
  IMAGE_PLAYGROUND_IMAGE_TO_IMAGE_PLACEHOLDER,
  IMAGE_PLAYGROUND_TEXT_TO_IMAGE_PLACEHOLDER,
} from "@/lib/dashboard-safe/constants";
import {
  isValidImageUrl,
  MAX_PLAYGROUND_INPUT_IMAGES,
  PlaygroundImageUploadError,
  validatePlaygroundImageFile,
} from "@/lib/dashboard-safe/upload-validation";
import { uploadPlaygroundImageAction } from "./upload-playground-image-action";

import {
  IMAGE_PLAYGROUND_DEFAULT_PROMPT,
  IMAGE_PLAYGROUND_PRESET_IDS,
  imagePlaygroundPresetLabelKey,
  imagePlaygroundPresetPromptKey,
  type ImagePlaygroundPresetId,
} from "./image-playground-presets";

const DEFAULT_MODEL: ImagePlaygroundModelId = IMAGE_PLAYGROUND_DEFAULT_MODEL;
const DEFAULT_SIZE: ImagePlaygroundSize = "1024x1024";

function resolveInitialModel(initialModel?: string): ImagePlaygroundModelId {
  if (initialModel && isAvailableImageModel(initialModel)) {
    return initialModel;
  }
  return DEFAULT_MODEL;
}

function toPlaygroundKeyOption(
  key: ImagePlaygroundApiKeyOption
): { id: string; name: string; prefix: string; can_reveal: boolean } {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    can_reveal: key.can_reveal !== false,
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
  model?: string;
  elapsedMs?: number;
  retryCount?: number;
}

type ImageInputSource = "upload" | "url";

type ImageInputStatus = "uploading" | "resolving" | "ready" | "error";

interface ImageInputItem {
  id: string;
  /** UI preview only — may be a blob: URL. Never send to DMIT. */
  previewUrl: string;
  /** Original file as data URL for API closed-loop reference edits. */
  sourceDataUrl?: string;
  /** Public http(s) URL (upload or pasted). Safe for API. */
  sourceUrl?: string;
  label: string;
  source: ImageInputSource;
  status: ImageInputStatus;
  mimeType?: string;
  sizeBytes?: number;
  error?: string;
  previewError?: string;
}

function resolveUploadedImageInput(
  entry: { id: string; item: ImageInputItem },
  uploadStatus: "ready" | "error",
  publicUrl: string,
  errorMessage: string,
  sourceDataUrl?: string
): ImageInputItem {
  const nextDataUrl = sourceDataUrl || entry.item.sourceDataUrl;
  if (uploadStatus === "ready" && publicUrl) {
    return {
      ...entry.item,
      previewUrl: entry.item.previewUrl || publicUrl,
      sourceUrl: publicUrl,
      sourceDataUrl: nextDataUrl,
      status: nextDataUrl || publicUrl ? "ready" : "error",
      error: undefined,
    };
  }

  if (nextDataUrl) {
    return {
      ...entry.item,
      sourceDataUrl: nextDataUrl,
      previewUrl: entry.item.previewUrl || nextDataUrl,
      status: "ready",
      error: undefined,
    };
  }

  return {
    ...entry.item,
    previewUrl: entry.item.previewUrl,
    sourceUrl: undefined,
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
    .map((item) =>
      item.status === "ready"
        ? pickApiImageSource({
            sourceDataUrl: item.sourceDataUrl,
            sourceUrl: item.sourceUrl,
            previewUrl: item.previewUrl,
          })
        : null
    )
    .filter((url): url is string => Boolean(url) && !isBlobUrl(url));
}

function getDisplayUrl(item: ImageInputItem): string {
  return item.previewUrl || item.sourceDataUrl || item.sourceUrl || "";
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

export function ImageGeneratePanel({
  accessToken,
  activeKeys,
  initialModel,
  initialCreditsBalance = null,
  creditsLoaded = false,
  handoffKey = 0,
  initialReferenceImageUrl,
  initialReferenceImageLabel,
  initialPromptHint,
}: {
  accessToken: string;
  activeKeys: ImagePlaygroundApiKeyOption[];
  initialModel?: string;
  initialCreditsBalance?: number | null;
  creditsLoaded?: boolean;
  handoffKey?: number;
  initialReferenceImageUrl?: string;
  initialReferenceImageLabel?: string;
  initialPromptHint?: string;
}) {
  const { t, locale } = useImagePlaygroundLabels();
  const router = useRouter();
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const resultPanelRef = useRef<HTMLDivElement>(null);
  const resultAttentionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const [localKeys, setLocalKeys] =
    useState<ImagePlaygroundApiKeyOption[]>(activeKeys);
  const [resolvedSecret, setResolvedSecret] = useState<string | null>(null);
  const [preferredKeyId, setPreferredKeyId] = useState<string | null>(
    activeKeys[0]?.id ?? null
  );
  const [preparingKey, setPreparingKey] = useState(false);
  const [createKeyError, setCreateKeyError] = useState<string | null>(null);
  const [needsManualCreate, setNeedsManualCreate] = useState(
    () => activeKeys.length === 0
  );
  const [warnFastForEdit, setWarnFastForEdit] = useState(false);

  const [model, setModel] = useState(() => resolveInitialModel(initialModel));
  const [size, setSize] = useState<ImagePlaygroundSize>(DEFAULT_SIZE);
  const [prompt, setPrompt] = useState(IMAGE_PLAYGROUND_DEFAULT_PROMPT);
  const [loading, setLoading] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string | null>(null);
  const [progressPercent, setProgressPercent] = useState<number | null>(null);
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
  const [lastRequestMode, setLastRequestMode] = useState<
    "text_to_image" | "reference_edit" | null
  >(null);
  const [lastUserPrompt, setLastUserPrompt] = useState<string>("");
  const [strengthenNext, setStrengthenNext] = useState(false);
  const [copyRequestStatus, setCopyRequestStatus] = useState<"idle" | "copied">(
    "idle"
  );
  const [resultAttention, setResultAttention] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!handoffKey) return;
    if (initialReferenceImageUrl) {
      const item: ImageInputItem = {
        id: `handoff-${handoffKey}`,
        previewUrl: initialReferenceImageUrl,
        sourceUrl: initialReferenceImageUrl.startsWith("http")
          ? initialReferenceImageUrl
          : undefined,
        sourceDataUrl: initialReferenceImageUrl.startsWith("data:image/")
          ? initialReferenceImageUrl
          : undefined,
        label: initialReferenceImageLabel || "reference",
        source: "url",
        status: "ready",
      };
      setImageInputs([item]);
      imageInputsRef.current = [item];
    }
    if (initialPromptHint?.trim()) {
      setPrompt(initialPromptHint.trim());
    }
  }, [
    handoffKey,
    initialReferenceImageUrl,
    initialReferenceImageLabel,
    initialPromptHint,
  ]);

  const readyImageUrls = getReadyImageUrls(imageInputs);
  const imageMode = getImagePlaygroundMode(readyImageUrls.length > 0);
  const selectedCapability = getImageModelCapability(model);
  const wantsSubjectPreserve = promptImpliesReferenceEdit(prompt);
  const showSubjectPreserveExpectation =
    readyImageUrls.length > 0 && wantsSubjectPreserve;
  const subjectPreserveHonesty =
    imageMode === "reference_edit" && !selectedCapability.supportsSubjectPreserve;

  useEffect(() => {
    setLocalKeys(activeKeys);
    if (activeKeys.length > 0) {
      setNeedsManualCreate(false);
      setPreferredKeyId((prev) => prev ?? activeKeys[0].id);
    }
  }, [activeKeys]);

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

  const prevHadReferenceRef = useRef(false);

  useEffect(() => {
    const hasReference = readyImageUrls.length > 0;
    const enteredReference = hasReference && !prevHadReferenceRef.current;
    prevHadReferenceRef.current = hasReference;
    const wantsPreserve = promptImpliesReferenceEdit(prompt);

    const picked = pickPreferredImageModel({
      hasReferenceImages: hasReference,
      availableModelIds: IMAGE_PLAYGROUND_MODEL_IDS,
      currentModel: model,
      wantsSubjectPreserve: wantsPreserve,
    });

    if (enteredReference && picked.switched && picked.model !== model) {
      setModel(picked.model);
      setWarnFastForEdit(false);
      return;
    }

    if (wantsPreserve && picked.blockSubjectPreserve && picked.switched) {
      setModel(picked.model);
    }

    setWarnFastForEdit(
      hasReference &&
        (picked.warnFastForEdit ||
          !getImageModelCapability(model).supportsSubjectPreserve)
    );
  }, [readyImageUrls.length, model, prompt]);

  const selectedModelEntry = getImageModelOptionById(model);
  const isModelComingSoon = selectedModelEntry?.status === "coming_soon";

  const hasInputImages = imageInputs.some((item) => item.status !== "error");
  const isImageToImage = hasInputImages;
  const promptPlaceholder =
    imageMode === "reference_edit"
      ? t("dashboard.imagePlayground.modeReferenceHint")
      : t("dashboard.imagePlayground.modeTextHint");

  const selectedModelCredits = getImageModelCreditsPerRequest(model);

  async function prepareDefaultKey(forceCreate = false) {
    if (!accessToken || preparingKey) return;
    setPreparingKey(true);
    setCreateKeyError(null);
    try {
      const ensured = await ensurePlaygroundApiKey({
        accessToken,
        activeKeys: forceCreate ? [] : localKeys.map(toPlaygroundKeyOption),
        preferredKeyId,
        sessionSecrets:
          resolvedSecret && preferredKeyId
            ? { [preferredKeyId]: resolvedSecret }
            : {},
      });
      setResolvedSecret(ensured.secret);
      setPreferredKeyId(ensured.keyId);
      setLocalKeys((prev) => {
        const next: ImagePlaygroundApiKeyOption = {
          id: ensured.key.id,
          name: ensured.key.name,
          prefix: ensured.key.prefix,
          status: "active",
          can_reveal: ensured.key.can_reveal,
        };
        const without = prev.filter((row) => row.id !== next.id);
        return [next, ...without];
      });
      setNeedsManualCreate(false);
      if (ensured.created) router.refresh();
    } catch {
      setNeedsManualCreate(true);
      setCreateKeyError(t("dashboard.imagePlayground.noKeyBody"));
    } finally {
      setPreparingKey(false);
    }
  }

  useEffect(() => {
    if (!accessToken || resolvedSecret) return;
    void prepareDefaultKey(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / token only
  }, [accessToken]);

  async function resolveApiKey(): Promise<string> {
    if (resolvedSecret && isFullTokfaiApiKey(resolvedSecret)) {
      return resolvedSecret;
    }
    if (!accessToken) {
      throw new PlaygroundValidationError(
        t("dashboard.imagePlayground.errors.unknown"),
        "missing_access_token"
      );
    }
    const ensured = await ensurePlaygroundApiKey({
      accessToken,
      activeKeys: localKeys.map(toPlaygroundKeyOption),
      preferredKeyId,
    });
    setResolvedSecret(ensured.secret);
    setPreferredKeyId(ensured.keyId);
    setNeedsManualCreate(false);
    if (ensured.created) router.refresh();
    return ensured.secret;
  }

  const hasUploadingImages = imageInputs.some(
    (item) => item.status === "uploading" || item.status === "resolving"
  );

  const addImageUrl = useCallback(
    (rawUrl: string) => {
      const trimmed = rawUrl.trim();
      if (!trimmed) return;

      if (isBlobUrl(trimmed)) {
        setError({
          status: 0,
          code: "blob_url_blocked",
          message: t("dashboard.imagePlayground.errors.blobUrlBlocked"),
        });
        return;
      }

      if (!isValidImageUrl(trimmed) && !trimmed.startsWith("data:image/")) {
        setError({
          status: 0,
          code: "invalid_image_url",
          message: t("dashboard.imagePlayground.errors.invalidImageUrl"),
        });
        return;
      }

      setImageInputs((current) => {
        if (current.length >= MAX_PLAYGROUND_INPUT_IMAGES) {
          setError({
            status: 0,
            code: "too_many_images",
            message: formatImagePlaygroundLabel(
              t("dashboard.imagePlayground.errors.tooManyImages"),
              { max: MAX_PLAYGROUND_INPUT_IMAGES }
            ),
          });
          return current;
        }
        if (
          current.some(
            (item) =>
              item.sourceUrl === trimmed ||
              item.sourceDataUrl === trimmed ||
              item.previewUrl === trimmed
          )
        ) {
          return current;
        }

        setError(null);
        const isData = trimmed.startsWith("data:image/");
        return [
          ...current,
          {
            id: crypto.randomUUID(),
            previewUrl: trimmed,
            sourceUrl: isData ? undefined : trimmed,
            sourceDataUrl: isData ? trimmed : undefined,
            label: formatUrlLabel(trimmed),
            source: "url",
            status: isData ? "ready" : "resolving",
          },
        ];
      });
      setImageUrlDraft("");
    },
    [t]
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
      const previewUrl = URL.createObjectURL(file);
      return {
        id,
        file,
        item: {
          id,
          previewUrl,
          label: file.name,
          source: "upload" as const,
          status: "uploading" as const,
          mimeType: file.type,
          sizeBytes: file.size,
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
        let errorMessage = t("dashboard.imagePlayground.errors.uploadFailed");
        let sourceDataUrl = "";

        try {
          validatePlaygroundImageFile(entry.file);
          sourceDataUrl = await fileToDataUrl(entry.file);

          // Prefer dataURL readiness for API closed-loop; public URL is optional backup.
          setImageInputs((currentItems) => {
            const next = currentItems.map((item) =>
              item.id === entry.id
                ? {
                    ...item,
                    sourceDataUrl,
                    status: "ready" as const,
                    error: undefined,
                  }
                : item
            );
            imageInputsRef.current = next;
            return next;
          });

          const formData = new FormData();
          formData.set("file", entry.file);
          const uploadResult = await uploadPlaygroundImageAction(formData);
          if (uploadResult.ok) {
            publicUrl = uploadResult.publicUrl;
            uploadStatus = "ready";
          } else {
            // Data URL is enough for generation; keep ready if we have it.
            uploadStatus = sourceDataUrl ? "ready" : "error";
            errorMessage = t("dashboard.imagePlayground.errors.uploadFailed");
            if (!sourceDataUrl) {
              throw new PlaygroundImageUploadError(
                t("dashboard.imagePlayground.errors.uploadFailed"),
                uploadResult.code
              );
            }
          }
        } catch (err) {
          errorMessage = t("dashboard.imagePlayground.errors.uploadFailed");
          console.error("[image-upload] failed", err);
          if (!sourceDataUrl) {
            setError({
              status: 0,
              code:
                err instanceof PlaygroundImageUploadError
                  ? err.code
                  : "upload_failed",
              message: errorMessage,
            });
          }
        } finally {
          const resolved = resolveUploadedImageInput(
            entry,
            uploadStatus,
            publicUrl,
            errorMessage,
            sourceDataUrl || undefined
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
  }, [t]);

  const removeImageInput = useCallback((id: string) => {
    setImageInputs((current) => {
      const target = current.find((item) => item.id === id);
      if (target?.previewUrl && isBlobUrl(target.previewUrl)) {
        URL.revokeObjectURL(target.previewUrl);
      }
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

  function resolveApiKeyForCopy(): string | undefined {
    if (resolvedSecret && isFullTokfaiApiKey(resolvedSecret)) {
      return resolvedSecret;
    }
    return undefined;
  }

  async function handleCopyApiRequest() {
    const trimmedPrompt = prompt.trim() || IMAGE_PLAYGROUND_DEFAULT_PROMPT;
    const curl = buildImageGenerationCurlOneLine(
      {
        model,
        prompt: trimmedPrompt,
        size,
        n: 1,
        response_format: "url",
        mode: readyImageUrls.length > 0 ? "reference_edit" : "text_to_image",
        images: readyImageUrls.length > 0 ? readyImageUrls : undefined,
      },
      resolveApiKeyForCopy()
    );

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
    setProgressStatus(null);
    setProgressPercent(null);

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
        message: t("dashboard.imagePlayground.errors.waitingForImages"),
      });
      pulseResultAttention();
      focusResultPanel("onComplete");
      return;
    }

    const imageUrlsForRequest = getReadyImageUrls(currentInputs);
    const hasReferenceImages = imageUrlsForRequest.length > 0;
    const wantsReferenceEdit = promptImpliesReferenceEdit(trimmedPrompt);

    if (wantsReferenceEdit && !hasReferenceImages) {
      setError({
        status: 0,
        code: "reference_image_required",
        message: t("dashboard.imagePlayground.referenceImageRequired"),
      });
      pulseResultAttention();
      focusResultPanel("onComplete");
      return;
    }

    if (
      (wantsReferenceEdit || hasReferenceImages) &&
      currentInputs.some((item) => item.status === "ready") &&
      imageUrlsForRequest.length === 0
    ) {
      setError({
        status: 0,
        code: "reference_image_unreadable",
        message: t("dashboard.imagePlayground.errors.referenceImageUnreadable"),
      });
      pulseResultAttention();
      focusResultPanel("onComplete");
      return;
    }

    const capability = getImageModelCapability(model);
    if (
      wantsReferenceEdit &&
      hasReferenceImages &&
      !capability.supportsSubjectPreserve
    ) {
      setError({
        status: 0,
        code: "model_not_for_subject_preserve",
        message: t("dashboard.imagePlayground.errors.modelNotForSubjectPreserve"),
      });
      pulseResultAttention();
      focusResultPanel("onComplete");
      return;
    }

    let resolvedKey: string;
    try {
      resolvedKey = await resolveApiKey();
    } catch (err) {
      setError(toPlaygroundError(err, t));
      pulseResultAttention();
      focusResultPanel("onComplete");
      return;
    }

    const useStrengthen = strengthenNext;
    setStrengthenNext(false);
    setLastUserPrompt(trimmedPrompt);

    pulseResultAttention();
    focusResultPanel("onStart");
    setLoading(true);
    const generateStartedAt = Date.now();
    try {
      const finalPrompt = resolveImagePromptForRequest({
        prompt: trimmedPrompt,
        hasReferenceImages,
        strengthen: useStrengthen,
      });
      const requestMode = getImagePlaygroundMode(hasReferenceImages);
      const httpsOnly = imageUrlsForRequest.filter((url) =>
        /^https?:\/\//i.test(url)
      );
      const payload: Parameters<typeof imageGenerationsWithProgress>[1] = {
        model,
        prompt: finalPrompt,
        size,
        n: 1,
        response_format: "url",
        mode: requestMode,
        images: hasReferenceImages ? imageUrlsForRequest : undefined,
        image_urls:
          hasReferenceImages && httpsOnly.length > 0 ? httpsOnly : undefined,
      };

      setLastRequestInputCount(imageUrlsForRequest.length);
      setLastRequestMode(requestMode);
      const res = await imageGenerationsWithProgress(resolvedKey, payload, {
        onProgress: (state) => {
          if (state.status) setProgressStatus(state.status);
          if (typeof state.progress === "number") {
            const capped =
              state.status === "completed" || state.status === "succeeded"
                ? state.progress
                : Math.min(state.progress, 95);
            setProgressPercent(capped);
          }
        },
      });

      const resolvedMode =
        res.mode ??
        (res.tokfai?.mode === "reference_edit" ||
        res.tokfai?.mode === "text_to_image"
          ? res.tokfai.mode
          : requestMode);

      if (
        requestMode === "reference_edit" &&
        res.reference_image_included === false
      ) {
        setError({
          status: 0,
          code: "reference_image_missing",
          message: t("dashboard.imagePlayground.errors.referenceImageMissing"),
          requestId: res.request_id,
          model,
          elapsedMs: Date.now() - generateStartedAt,
          retryCount: 0,
        });
        setResult(null);
        return;
      }

      const normalized: ImageGenerationResponse = {
        ...res,
        created: res.created ?? Math.floor(Date.now() / 1000),
        credits_charged:
          res.credits_charged ?? res.usage?.credits_charged ?? undefined,
        mode: resolvedMode,
        prompt_mode:
          res.prompt_mode ??
          (res.tokfai?.prompt_mode === "subject_preserve" ||
          res.tokfai?.prompt_mode === "normal"
            ? res.tokfai.prompt_mode
            : undefined),
        reference_image_included:
          res.reference_image_included ?? resolvedMode === "reference_edit",
      };

      setResult(normalized);
      setProgressPercent(100);
      setProgressStatus("completed");
      setCompletedAt(
        resolveImageCreatedAt(normalized) ?? new Date().toISOString()
      );
      router.refresh();
    } catch (err) {
      setCompletedAt(new Date().toISOString());
      const base = toPlaygroundError(err, t);
      const isTimeout =
        base.code === "retryable_timeout" ||
        base.code === "image_generation_timeout" ||
        base.code === "upstream_timeout";
      // Never show 100% / success chrome on timeout or failure.
      if (isTimeout) {
        setProgressStatus("retryable_timeout");
        setProgressPercent((prev) =>
          typeof prev === "number" ? Math.min(prev, 95) : 95
        );
      }
      setResult(null);
      setError({
        ...base,
        model,
        elapsedMs: Date.now() - generateStartedAt,
        // Gateway may retry timeout/busy once server-side; client cannot observe count.
        retryCount:
          isTimeout || base.code === "upstream_model_busy" ? 1 : 0,
      });
    } finally {
      setLoading(false);
      pulseResultAttention();
      focusResultPanel("onComplete");
    }
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
      <div className="flex flex-col gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("dashboard.imageWorkbench.tabGenerate")}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("dashboard.imageWorkbench.generateSubtitle")}
          </p>
        </div>
      </div>

      <div className={IMAGE_PLAYGROUND_TOOLBENCH.shell}>
        <div className={IMAGE_PLAYGROUND_TOOLBENCH.grid}>
          <div className="order-1 min-w-0 lg:col-start-2 lg:row-start-1">
            {(needsManualCreate || createKeyError || preparingKey) && !resolvedSecret ? (
              <div className="mb-3 flex flex-col gap-3 rounded-md border border-amber-500/30 bg-amber-500/5 px-4 py-3">
                <p className="text-sm text-muted-foreground">
                  {createKeyError ?? t("dashboard.imagePlayground.noKeyBody")}
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={preparingKey || loading || !accessToken}
                  onClick={() => void prepareDefaultKey(true)}
                >
                  {preparingKey
                    ? t("dashboard.imagePlayground.creatingKey")
                    : t("dashboard.imagePlayground.createExperienceKey")}
                </Button>
              </div>
            ) : null}
            <ImagePlaygroundRunSettingsPanel
              hideApiKeyUi
              keyPanelView="select"
              localKeys={localKeys}
              selectedKey={localKeys[0] ?? null}
              selectedKeyId={preferredKeyId ?? ""}
              apiKey=""
              showApiKey={false}
              creatingKey={preparingKey}
              createKeyError={createKeyError}
              createdSecret={null}
              createdBannerKeyId={null}
              loading={loading}
              onCreateTestKey={() => void prepareDefaultKey(true)}
              onKeyPanelViewChange={() => {}}
              onSelectedKeyChange={() => {}}
              onApiKeyChange={() => {}}
              onShowApiKeyChange={() => {}}
              model={model}
              size={size}
              creditsBalance={initialCreditsBalance}
              creditsLoaded={creditsLoaded}
              estimatedCredits={selectedModelCredits}
              isModelComingSoon={isModelComingSoon}
              locale={locale}
              onModelChange={setModel}
              onSizeChange={setSize}
              warnFastForEdit={warnFastForEdit}
              t={t}
            />
          </div>

          <div className="order-2 min-w-0 lg:col-start-1 lg:row-start-1">
            <Card className={IMAGE_PLAYGROUND_TOOLBENCH.inputCard}>
              <CardHeader className={IMAGE_PLAYGROUND_TOOLBENCH.cardHeader}>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle className={IMAGE_PLAYGROUND_TOOLBENCH.cardTitle}>
                    {t("dashboard.imagePlayground.toolbenchInputTitle")}
                  </CardTitle>
                  <Badge variant={imageMode === "reference_edit" ? "default" : "secondary"} className="text-[10px]">
                    {imageMode === "reference_edit"
                      ? t("dashboard.imagePlayground.modeReference")
                      : t("dashboard.imagePlayground.modeText")}
                  </Badge>
                </div>
                {showSubjectPreserveExpectation ||
                subjectPreserveHonesty ||
                warnFastForEdit ? (
                  <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
                    {t(
                      showSubjectPreserveExpectation || subjectPreserveHonesty
                        ? "dashboard.imagePlayground.subjectPreserveExpectation"
                        : "dashboard.imagePlayground.fastModelEditHint"
                    )}
                  </p>
                ) : null}
              </CardHeader>
              <CardContent
                className={`${IMAGE_PLAYGROUND_TOOLBENCH.cardContent} flex flex-col gap-2.5`}
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
                  rows={3}
                  required
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={loading}
                  placeholder={promptPlaceholder}
                  className="flex h-28 min-h-[7rem] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                />

                <p className="text-xs text-muted-foreground">
                  {imageMode === "reference_edit"
                    ? t("dashboard.imagePlayground.modeReferenceHint")
                    : t("dashboard.imagePlayground.modeTextHint")}
                </p>

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
                    generateLabel={
                      imageMode === "reference_edit"
                        ? t("dashboard.imagePlayground.generateFromReference")
                        : t("dashboard.imagePlayground.generate")
                    }
                    onCopyApiRequest={() => void handleCopyApiRequest()}
                    t={t}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="order-4 min-w-0 lg:hidden">
            <ImagePlaygroundGenerateActions
              loading={loading}
              hasUploadingImages={hasUploadingImages}
              isModelComingSoon={isModelComingSoon}
              copyRequestStatus={copyRequestStatus}
              layout="stack"
              generateLabel={
                imageMode === "reference_edit"
                  ? t("dashboard.imagePlayground.generateFromReference")
                  : t("dashboard.imagePlayground.generate")
              }
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
              progressStatus={progressStatus}
              progressPercent={progressPercent}
              inputImagesCount={
                result?.images_count ??
                result?.input_images_count ??
                lastRequestInputCount
              }
              requestMode={result?.mode ?? lastRequestMode}
              referenceImageIncluded={
                result?.reference_image_included === true ||
                lastRequestMode === "reference_edit" ||
                (lastRequestInputCount != null && lastRequestInputCount > 0)
              }
              attention={resultAttention || loading}
              onRetry={() => formRef.current?.requestSubmit()}
              onSimplifyRetry={() => {
                setPrompt((prev) => prev.trim().slice(0, 80));
                setError(null);
              }}
              onStrengthenSubjectRetry={() => {
                if (lastUserPrompt.trim()) {
                  setPrompt(lastUserPrompt);
                }
                setStrengthenNext(true);
                window.setTimeout(() => {
                  formRef.current?.requestSubmit();
                }, 0);
              }}
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
        formatImagePlaygroundLabel(
          t("dashboard.imagePlayground.errors.tooManyImages"),
          {
            max: MAX_PLAYGROUND_INPUT_IMAGES,
          }
        ),
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
            {formatImagePlaygroundLabel(
              t("dashboard.imagePlayground.inputImagesDesc"),
              {
                max: MAX_PLAYGROUND_INPUT_IMAGES,
              }
            )}
          </p>
        </>
      ) : null}

      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-0.5 rounded-md border border-dashed px-3 text-center transition-colors ${
          toolbench ? "py-6" : "py-5 sm:py-6"
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
              t={t}
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
  t,
}: {
  item: ImageInputItem;
  loading: boolean;
  onRemove: () => void;
  onPreviewError: (message: string) => void;
  onPreviewReady: () => void;
  t: (key: string) => string;
}) {
  const displayUrl = getDisplayUrl(item);
  const showPreview =
    (item.status === "ready" || item.status === "uploading") &&
    Boolean(displayUrl) &&
    !item.previewError &&
    item.status === "ready";

  const referenceMessage = getInputReferenceMessage(item, t);

  return (
    <div className="relative overflow-hidden rounded-md border bg-background">
      <div className="aspect-square bg-muted/30">
        {showPreview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={displayUrl}
            alt={item.label}
            className="h-full w-full object-cover"
            onError={() =>
              onPreviewError(t("dashboard.imagePlayground.errors.previewFailed"))
            }
          />
        ) : item.status === "uploading" ? (
          <div className="relative h-full">
            {displayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayUrl}
                alt={item.label}
                className="h-full w-full object-cover opacity-60"
              />
            ) : null}
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-background/50 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-[10px]">
                {t("dashboard.imagePlayground.preparingShort")}
              </span>
            </div>
          </div>
        ) : item.status === "resolving" ? (
          <>
            <div className="flex h-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-[10px]">
                {t("dashboard.imagePlayground.resolvingShort")}
              </span>
            </div>
            {displayUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={displayUrl}
                alt=""
                className="hidden"
                onLoad={() => onPreviewReady()}
                onError={() =>
                  onPreviewError(
                    t("dashboard.imagePlayground.errors.previewUrlFailed")
                  )
                }
              />
            ) : null}
          </>
        ) : item.previewError || item.error ? (
          <div className="flex h-full items-center justify-center px-2 text-center text-xs text-destructive">
            {item.previewError ??
              item.error ??
              t("dashboard.imagePlayground.errors.uploadFailed")}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-xs text-destructive">
            {t("dashboard.imagePlayground.errors.uploadFailed")}
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

function getInputReferenceMessage(
  item: ImageInputItem,
  t: (key: string) => string
): string | null {
  if (item.status === "error") {
    return (
      item.error ??
      item.previewError ??
      t("dashboard.imagePlayground.errors.inputUnusable")
    );
  }
  return null;
}

function formatUrlLabel(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.hostname;
  } catch {
    return url.slice(0, 24);
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
    if (
      code === "retryable_timeout" ||
      code === "image_generation_timeout" ||
      code === "upstream_timeout"
    ) {
      return {
        status: err.status,
        code: "retryable_timeout",
        message: t("dashboard.imageWorkbench.imageTimeoutFriendly"),
        requestId: extractDmitRequestId(err.body),
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
