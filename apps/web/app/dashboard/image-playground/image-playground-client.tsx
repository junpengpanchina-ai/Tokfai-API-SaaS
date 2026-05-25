"use client";

import { useCallback, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
  ImageIcon,
  KeyRound,
  Loader2,
  Plus,
  Sparkles,
  Upload,
  X,
} from "lucide-react";

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
  imageGenerations,
  revealMeApiKey,
  type ImageGenerationResponse,
} from "@/lib/dmit/client";
import { userMessageForDmitError } from "@/lib/dmit-messages";
import {
  IMAGE_PLAYGROUND_MODEL_IDS,
  IMAGE_PLAYGROUND_SIZES,
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
import {
  isValidImageUrl,
  MAX_PLAYGROUND_INPUT_IMAGES,
  PlaygroundImageUploadError,
  uploadPlaygroundImage,
  validatePlaygroundImageFile,
} from "@/lib/storage/upload-image";

import { IMAGE_PLAYGROUND_PRESETS } from "./image-playground-presets";

const DEFAULT_MODEL: ImagePlaygroundModelId = "nano-banana";
const DEFAULT_SIZE: ImagePlaygroundSize = "1024x1024";
const DEFAULT_PROMPT = "A serene mountain landscape at sunset, digital art.";

function resolveInitialModel(initialModel?: string): ImagePlaygroundModelId {
  if (initialModel && isAvailableImageModel(initialModel)) {
    return initialModel;
  }
  return DEFAULT_MODEL;
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

type ApiKeyMode = "paste" | "select";

type ImageInputSource = "upload" | "url";

type ImageInputStatus = "uploading" | "ready" | "error";

interface ImageInputItem {
  id: string;
  url: string;
  label: string;
  source: ImageInputSource;
  status: ImageInputStatus;
  error?: string;
  previewError?: string;
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
  const [model, setModel] = useState(() => resolveInitialModel(initialModel));
  const [size, setSize] = useState<ImagePlaygroundSize>(DEFAULT_SIZE);
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [apiKeyMode, setApiKeyMode] = useState<ApiKeyMode>(
    activeKeys.length > 0 ? "select" : "paste"
  );
  const [apiKey, setApiKey] = useState("");
  const [selectedKeyId, setSelectedKeyId] = useState(activeKeys[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ImageGenerationResponse | null>(null);
  const [error, setError] = useState<PlaygroundError | null>(null);
  const [imageInputs, setImageInputs] = useState<ImageInputItem[]>([]);
  const imageInputsRef = useRef(imageInputs);
  imageInputsRef.current = imageInputs;
  const [imageUrlDraft, setImageUrlDraft] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [lastRequestInputCount, setLastRequestInputCount] = useState<
    number | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const readyImageUrls = imageInputs
    .filter((item) => item.status === "ready" && item.url)
    .map((item) => item.url);

  const inputImageCount = readyImageUrls.length;
  const isImageToImage = inputImageCount > 0;
  const promptPlaceholder = isImageToImage
    ? IMAGE_PLAYGROUND_IMAGE_TO_IMAGE_PLACEHOLDER
    : IMAGE_PLAYGROUND_TEXT_TO_IMAGE_PLACEHOLDER;

  const hasUploadingImages = imageInputs.some(
    (item) => item.status === "uploading"
  );

  const addImageUrl = useCallback(
    (rawUrl: string) => {
      const trimmed = rawUrl.trim();
      if (!trimmed) return;

      if (!isValidImageUrl(trimmed)) {
        setError({
          status: 0,
          code: "invalid_image_url",
          message: "Enter a valid http or https image URL.",
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
            label: "Image URL",
            source: "url",
            status: "ready",
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

    setImageInputs((prev) => [...prev, ...entries.map((entry) => entry.item)]);

    for (const entry of entries) {
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
        setImageInputs((currentItems) =>
          currentItems.map((item) => {
            if (item.id !== entry.id || item.status !== "uploading") {
              return item;
            }
            if (uploadStatus === "ready" && publicUrl) {
              return {
                ...item,
                url: publicUrl,
                status: "ready",
                error: undefined,
              };
            }
            return {
              ...item,
              url: "",
              status: "error",
              error: errorMessage,
            };
          })
        );
      }
    }
  }, []);

  const removeImageInput = useCallback((id: string) => {
    setImageInputs((current) => current.filter((item) => item.id !== id));
  }, []);

  const markPreviewError = useCallback((id: string, message: string) => {
    setImageInputs((current) =>
      current.map((item) =>
        item.id === id ? { ...item, previewError: message } : item
      )
    );
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (loading) return;
      void uploadFiles(event.dataTransfer.files);
    },
    [loading, uploadFiles]
  );

  async function handleGenerate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;

    setError(null);
    setResult(null);

    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      setError({
        status: 0,
        code: "missing_prompt",
        message: "Prompt is required.",
      });
      return;
    }

    if (hasUploadingImages) {
      setError({
        status: 0,
        code: "upload_in_progress",
        message: "Wait for image uploads to finish before generating.",
      });
      return;
    }

    let resolvedKey: string;
    try {
      resolvedKey = await resolveApiKey();
    } catch (err) {
      setError(toPlaygroundError(err));
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
        image_urls: readyImageUrls,
      };

      setLastRequestInputCount(readyImageUrls.length);
      const res = await imageGenerations(resolvedKey, payload);
      setResult(res);
    } catch (err) {
      setError(toPlaygroundError(err));
    } finally {
      setLoading(false);
    }
  }

  async function resolveApiKey(): Promise<string> {
    if (apiKeyMode === "paste") {
      const trimmed = apiKey.trim();
      if (!trimmed) {
        throw new PlaygroundValidationError(
          "API key is required.",
          "missing_api_key"
        );
      }
      if (!isFullTokfaiApiKey(trimmed)) {
        throw new PlaygroundValidationError(
          `Enter a full key like ${TOKFAI_API_KEY_PLACEHOLDER}.`,
          "invalid_api_key"
        );
      }
      return trimmed;
    }

    const selected = activeKeys.find((row) => row.id === selectedKeyId);
    if (!selected) {
      throw new PlaygroundValidationError(
        "Select an active API key or paste one manually.",
        "missing_api_key"
      );
    }
    if (!selected.can_reveal) {
      throw new PlaygroundValidationError(
        "This key cannot be loaded automatically. Switch to “Paste key” and enter the full secret.",
        "key_not_revealable"
      );
    }
    if (!accessToken) {
      throw new PlaygroundValidationError(
        "Please sign in again.",
        "missing_access_token"
      );
    }
    const secret = await revealMeApiKey(selected.id, { accessToken });
    if (!isFullTokfaiApiKey(secret)) {
      throw new PlaygroundValidationError(
        "Could not load a valid API key. Paste the full secret instead.",
        "invalid_api_key"
      );
    }
    return secret;
  }

  return (
    <form onSubmit={handleGenerate} className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            Image Playground
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Drag images or paste an image URL for image-to-image. Up to 4
            images. Supported: PNG, JPG, WEBP. Successful generations debit
            credits. Failed calls are not charged.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Send a generation request through the Tokfai API using your own{" "}
            <code className="rounded bg-muted px-1 text-xs">sk-tokfai_</code>{" "}
            key — the same path external clients use.
          </p>
        </div>
        <Badge variant="secondary">{TOKFAI_IMAGES_GENERATIONS_ENDPOINT}</Badge>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr,280px]">
        <Card>
          <CardHeader>
            <CardTitle>Request</CardTitle>
            <CardDescription>
              Text-to-image works with prompt only. Add input images for
              image-to-image. Successful calls are recorded in Usage and debited
              from Credits.
            </CardDescription>
            <div className="mt-3 flex flex-col gap-1">
              <Badge variant={isImageToImage ? "default" : "secondary"}>
                {isImageToImage ? "Image to Image" : "Text to Image"}
              </Badge>
              {isImageToImage ? (
                <p className="text-xs text-muted-foreground">
                  Using {inputImageCount} input image
                  {inputImageCount === 1 ? "" : "s"} as reference.
                </p>
              ) : null}
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <ApiKeyField
              mode={apiKeyMode}
              activeKeys={activeKeys}
              apiKey={apiKey}
              selectedKeyId={selectedKeyId}
              loading={loading}
              onModeChange={setApiKeyMode}
              onApiKeyChange={setApiKey}
              onSelectedKeyChange={setSelectedKeyId}
            />

            <ImageInputsPanel
              imageInputs={imageInputs}
              imageUrlDraft={imageUrlDraft}
              isDragging={isDragging}
              loading={loading}
              fileInputRef={fileInputRef}
              onImageUrlDraftChange={setImageUrlDraft}
              onAddImageUrl={() => addImageUrl(imageUrlDraft)}
              onRemoveImage={removeImageInput}
              onPreviewError={markPreviewError}
              onDragEnter={() => {
                if (!loading) setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={handleDrop}
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
              <PromptPresets
                inputImageCount={inputImageCount}
                loading={loading}
                onSelect={(presetPrompt) => setPrompt(presetPrompt)}
              />
              <textarea
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

            <p className="text-xs text-muted-foreground">
              Input images: {inputImageCount}
            </p>

            <div className="flex flex-col items-end gap-1">
              {hasUploadingImages ? (
                <p className="text-xs text-muted-foreground">
                  Uploading input images…
                </p>
              ) : null}
              <Button
                type="submit"
                disabled={loading || hasUploadingImages}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating…
                  </>
                ) : hasUploadingImages ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Uploading input images…
                  </>
                ) : (
                  <>
                    <ImageIcon className="h-4 w-4" />
                    Generate
                  </>
                )}
              </Button>
            </div>

            <ResponsePanel
              loading={loading}
              error={error}
              result={result}
              inputImagesCount={
                result?.input_images_count ?? lastRequestInputCount
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Settings</CardTitle>
            <CardDescription>
              Image models only. Values are sent in the JSON body to{" "}
              <code className="rounded bg-muted px-1 text-xs">
                api.tokfai.com
              </code>
              .
            </CardDescription>
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
                    {m}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="size">Size</Label>
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
              Need a key?{" "}
              <Link
                href="/dashboard/api-keys"
                className="underline underline-offset-4"
              >
                Create an API key
              </Link>
              . Need more credits?{" "}
              <Link
                href="/dashboard/credits"
                className="underline underline-offset-4"
              >
                Top up
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function PromptPresets({
  inputImageCount,
  loading,
  onSelect,
}: {
  inputImageCount: number;
  loading: boolean;
  onSelect: (prompt: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted-foreground">Quick templates</p>
      <div className="flex flex-wrap gap-2">
        {IMAGE_PLAYGROUND_PRESETS.map((preset) => {
          const showInputHint =
            preset.worksBestWithInputImage === true && inputImageCount === 0;

          return (
            <div key={preset.id} className="flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={loading}
                onClick={() => onSelect(preset.prompt)}
              >
                {preset.label}
              </Button>
              {showInputHint ? (
                <span className="text-[10px] text-muted-foreground">
                  Works best with an input image.
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ImageInputsPanel({
  imageInputs,
  imageUrlDraft,
  isDragging,
  loading,
  fileInputRef,
  onImageUrlDraftChange,
  onAddImageUrl,
  onRemoveImage,
  onPreviewError,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onBrowseClick,
  onFileInputChange,
}: {
  imageInputs: ImageInputItem[];
  imageUrlDraft: string;
  isDragging: boolean;
  loading: boolean;
  fileInputRef: React.RefObject<HTMLInputElement>;
  onImageUrlDraftChange: (value: string) => void;
  onAddImageUrl: () => void;
  onRemoveImage: (id: string) => void;
  onPreviewError: (id: string, message: string) => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
  onDragOver: (event: React.DragEvent<HTMLDivElement>) => void;
  onDrop: (event: React.DragEvent<HTMLDivElement>) => void;
  onBrowseClick: () => void;
  onFileInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  const atLimit = imageInputs.length >= MAX_PLAYGROUND_INPUT_IMAGES;

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
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-2 rounded-md border border-dashed px-4 py-8 text-center transition-colors ${
          isDragging
            ? "border-primary bg-primary/10 ring-2 ring-primary/30"
            : "border-muted-foreground/30 bg-background"
        } ${loading || atLimit ? "opacity-60" : "cursor-pointer"}`}
        onClick={() => {
          if (!loading && !atLimit) onBrowseClick();
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!loading && !atLimit) onBrowseClick();
          }
        }}
      >
        <Upload className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm font-medium">Drag images here or click to upload</p>
        <p className="text-xs text-muted-foreground">
          PNG, JPG, WEBP · max 10 MB each
        </p>
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
          placeholder="https://example.com/image.png"
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
}: {
  item: ImageInputItem;
  loading: boolean;
  onRemove: () => void;
  onPreviewError: (message: string) => void;
}) {
  const showPreview =
    item.status === "ready" && item.url && !item.previewError;

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
        ) : item.previewError ? (
          <div className="flex h-full items-center justify-center px-2 text-center text-xs text-destructive">
            {item.previewError}
          </div>
        ) : (
          <div className="flex h-full items-center justify-center px-2 text-center text-xs text-destructive">
            {item.error ?? "Upload failed"}
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 border-t px-2 py-1.5">
        <span className="truncate text-[11px] text-muted-foreground">
          source: {item.source}
        </span>
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-[11px] text-muted-foreground">
            {item.source === "url" ? item.url : item.label}
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

function ApiKeyField({
  mode,
  activeKeys,
  apiKey,
  selectedKeyId,
  loading,
  onModeChange,
  onApiKeyChange,
  onSelectedKeyChange,
}: {
  mode: ApiKeyMode;
  activeKeys: ImagePlaygroundApiKeyOption[];
  apiKey: string;
  selectedKeyId: string;
  loading: boolean;
  onModeChange: (mode: ApiKeyMode) => void;
  onApiKeyChange: (value: string) => void;
  onSelectedKeyChange: (id: string) => void;
}) {
  const revealableKeys = activeKeys.filter((row) => row.can_reveal !== false);

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-4 w-4 text-muted-foreground" />
        API key
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          variant={mode === "select" ? "default" : "outline"}
          disabled={loading || revealableKeys.length === 0}
          onClick={() => onModeChange("select")}
        >
          Select key
        </Button>
        <Button
          type="button"
          size="sm"
          variant={mode === "paste" ? "default" : "outline"}
          disabled={loading}
          onClick={() => onModeChange("paste")}
        >
          Paste key
        </Button>
      </div>

      {mode === "select" ? (
        revealableKeys.length > 0 ? (
          <div className="flex flex-col gap-2">
            <Label htmlFor="api-key-select">Your active keys</Label>
            <select
              id="api-key-select"
              value={selectedKeyId}
              onChange={(e) => onSelectedKeyChange(e.target.value)}
              disabled={loading}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            >
              {revealableKeys.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name} ({row.prefix || "no prefix"})
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              The full secret is loaded only for this request and is not stored
              in the browser.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No revealable keys found.{" "}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => onModeChange("paste")}
            >
              Paste your key
            </button>{" "}
            or{" "}
            <Link
              href="/dashboard/api-keys"
              className="underline underline-offset-4"
            >
              create one
            </Link>
            .
          </p>
        )
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="api-key">Full API key</Label>
          <Input
            id="api-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            placeholder={TOKFAI_API_KEY_PLACEHOLDER}
            value={apiKey}
            onChange={(e) => onApiKeyChange(e.target.value)}
            disabled={loading}
          />
          <p className="text-xs text-muted-foreground">
            Sent as{" "}
            <code className="rounded bg-background px-1 text-[11px]">
              Authorization: Bearer sk-tokfai_…
            </code>
            . Never logged or persisted by this page.
          </p>
        </div>
      )}
    </div>
  );
}

function ResponsePanel({
  loading,
  error,
  result,
  inputImagesCount,
}: {
  loading: boolean;
  error: PlaygroundError | null;
  result: ImageGenerationResponse | null;
  inputImagesCount: number | null | undefined;
}) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Generating image…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-4">
        <div className="flex items-center gap-2 text-sm font-medium text-destructive">
          <AlertTriangle className="h-4 w-4" />
          Request failed
          {error.status > 0 ? (
            <Badge variant="outline" className="ml-1">
              HTTP {error.status}
            </Badge>
          ) : null}
        </div>
        <dl className="grid gap-1 text-sm">
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Error code:</dt>
            <dd className="font-mono">{error.code ?? "n/a"}</dd>
          </div>
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-muted-foreground">Error message:</dt>
            <dd>{error.message}</dd>
          </div>
        </dl>
        {error.status === 402 || error.code === "insufficient_credits" ? (
          <Button asChild size="sm" variant="outline" className="w-fit">
            <Link href="/dashboard/credits">Add credits</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
        <Sparkles className="h-4 w-4" />
        Generated image will appear here.
      </div>
    );
  }

  const imageUrl = result.data?.[0]?.url ?? null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 p-4 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        <p>
          This request has been recorded. View it in{" "}
          <Link
            href="/dashboard/usage"
            className="font-medium underline underline-offset-4"
          >
            Usage
          </Link>{" "}
          and{" "}
          <Link
            href="/dashboard/credits"
            className="font-medium underline underline-offset-4"
          >
            Credits
          </Link>
          .
        </p>
      </div>

      {imageUrl ? (
        <div className="overflow-hidden rounded-md border bg-muted/20">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt="Generated image"
            className="mx-auto max-h-[480px] w-full object-contain"
          />
        </div>
      ) : (
        <div className="rounded-md border border-dashed bg-muted/30 p-4 text-sm text-muted-foreground">
          No image URL returned.
        </div>
      )}

      <MetadataPanel
        result={result}
        imageUrl={imageUrl}
        inputImagesCount={inputImagesCount ?? result.input_images_count ?? 0}
      />
    </div>
  );
}

function MetadataPanel({
  result,
  imageUrl,
  inputImagesCount,
}: {
  result: ImageGenerationResponse;
  imageUrl: string | null;
  inputImagesCount: number;
}) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied">("idle");

  async function handleCopyUrl() {
    if (!imageUrl) return;
    try {
      await navigator.clipboard.writeText(imageUrl);
      setCopyStatus("copied");
      window.setTimeout(() => setCopyStatus("idle"), 2000);
    } catch {
      setCopyStatus("idle");
    }
  }

  const items: Array<{ label: string; value: string | number | null | undefined }> =
    [
      { label: "Input images", value: String(inputImagesCount) },
      { label: "model", value: result.model },
      { label: "request_id", value: result.request_id },
      { label: "upstream_id", value: result.upstream_id },
      {
        label: "credits_charged",
        value:
          result.credits_charged != null
            ? String(result.credits_charged)
            : null,
      },
    ];

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-card p-4">
      {imageUrl ? (
        <div className="flex flex-col gap-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Image URL
          </Label>
          <code className="block overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs break-all">
            {imageUrl}
          </code>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="w-fit"
            onClick={handleCopyUrl}
          >
            {copyStatus === "copied" ? (
              <>
                <Check className="h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy image URL
              </>
            )}
          </Button>
        </div>
      ) : null}

      <dl className="grid gap-2 text-sm">
        {items.map((item) =>
          item.value != null && item.value !== "" ? (
            <div key={item.label} className="flex flex-wrap gap-x-2">
              <dt className="text-muted-foreground">{item.label}:</dt>
              <dd className="font-mono">{item.value}</dd>
            </div>
          ) : null
        )}
      </dl>
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

function toPlaygroundError(err: unknown): PlaygroundError {
  if (err instanceof PlaygroundValidationError) {
    return {
      status: 0,
      code: err.code,
      message: err.message,
    };
  }
  if (err instanceof DmitApiError) {
    return {
      status: err.status,
      code: err.code,
      message: userMessageForDmitError(err.status, err.code, err.message),
    };
  }
  if (err instanceof TypeError) {
    return {
      status: 0,
      code: "network_error",
      message: userMessageForDmitError(503),
    };
  }
  if (err instanceof Error) {
    return {
      status: 0,
      code: "unknown_error",
      message: userMessageForDmitError(0, undefined, err.message),
    };
  }
  return {
    status: 0,
    code: "unknown_error",
    message: userMessageForDmitError(503),
  };
}
