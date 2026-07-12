"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Loader2, RotateCw, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  chatCompletions,
  DmitApiError,
  extractChatAssistantText,
  extractChatCreditsCharged,
  extractChatRequestId,
  type ChatCompletionResponse,
} from "@/lib/dashboard-safe/chat-api";
import {
  buildEcommerceVisionPrompt,
  defaultUseCaseForMode,
  ecommerceUseCaseLabel,
  pickEcommerceVisionModel,
  useCasesForMode,
} from "@/lib/dashboard-safe/ecommerce-image-analysis";
import {
  ensurePlaygroundApiKey,
} from "@/lib/dashboard-safe/playground-default-key";
import { isFullTokfaiApiKey } from "@/lib/dashboard-safe/constants";
import {
  PlaygroundImageUploadError,
  validatePlaygroundImageFile,
} from "@/lib/dashboard-safe/upload-validation";
import { dashboardFormatCreditsWithSuffix } from "@/lib/dashboard-safe/display-helpers";
import { uploadPlaygroundImageAction } from "./upload-playground-image-action";
import { useImagePlaygroundLabels } from "./use-image-playground-labels";
import type { ImagePlaygroundApiKeyOption } from "./image-playground-client";
import {
  distillCopyToImagePrompt,
  summarizeRecognitionForCopy,
  WorkbenchProgressPanel,
} from "./workbench-progress";

type VisionMode = "ecommerce_image_analysis" | "product_copy";

type UploadItem = {
  id: string;
  url: string;
  label: string;
  status: "uploading" | "ready" | "error";
  error?: string;
};

function toKeyOption(key: ImagePlaygroundApiKeyOption) {
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    can_reveal: key.can_reveal !== false,
  };
}

function isTimeoutLikeError(err: unknown): boolean {
  if (err instanceof DmitApiError) {
    const code = (err.code ?? "").toLowerCase();
    const message = (err.message ?? "").toLowerCase();
    return (
      err.status === 504 ||
      err.status === 408 ||
      code.includes("timeout") ||
      code.includes("upstream_timeout") ||
      message.includes("timeout") ||
      message.includes("超时")
    );
  }
  if (err instanceof Error) {
    const message = err.message.toLowerCase();
    return message.includes("timeout") || message.includes("超时");
  }
  return false;
}

export function EcommerceVisionTab({
  mode,
  accessToken,
  activeKeys,
  initialCreditsBalance = null,
  creditsLoaded = false,
  handoffKey = 0,
  initialImageUrl,
  initialImageLabel,
  initialExtraNeed,
  onGoToCopy,
  onGoToGenerate,
}: {
  mode: VisionMode;
  accessToken: string;
  activeKeys: ImagePlaygroundApiKeyOption[];
  initialCreditsBalance?: number | null;
  creditsLoaded?: boolean;
  handoffKey?: number;
  initialImageUrl?: string;
  initialImageLabel?: string;
  initialExtraNeed?: string;
  onGoToCopy?: (payload: {
    imageUrl: string;
    imageLabel?: string;
    copyBrief: string;
  }) => void;
  onGoToGenerate?: (payload: {
    imageUrl: string;
    imageLabel?: string;
    promptHint?: string;
  }) => void;
}) {
  const { t, locale } = useImagePlaygroundLabels();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isCopyMode = mode === "product_copy";

  const [localKeys, setLocalKeys] = useState(activeKeys);
  const [resolvedSecret, setResolvedSecret] = useState<string | null>(null);
  const [preferredKeyId, setPreferredKeyId] = useState<string | null>(
    activeKeys[0]?.id ?? null
  );
  const [preparingKey, setPreparingKey] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [needsCreate, setNeedsCreate] = useState(() => activeKeys.length === 0);

  const [useCase, setUseCase] = useState(() => defaultUseCaseForMode(mode));
  const [extraNeed, setExtraNeed] = useState(initialExtraNeed ?? "");
  const [images, setImages] = useState<UploadItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [technicalError, setTechnicalError] = useState<string | null>(null);
  const [result, setResult] = useState<ChatCompletionResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const useCaseOptions = useCasesForMode(mode);
  const readyUrls = images
    .filter((item) => item.status === "ready" && item.url)
    .map((item) => item.url);
  const visionModel = pickEcommerceVisionModel();

  useEffect(() => {
    setUseCase(defaultUseCaseForMode(mode));
    setResult(null);
    setError(null);
    setTechnicalError(null);
  }, [mode]);

  useEffect(() => {
    if (!handoffKey) return;
    if (initialImageUrl) {
      setImages([
        {
          id: `handoff-${handoffKey}`,
          url: initialImageUrl,
          label: initialImageLabel || "reference",
          status: "ready",
        },
      ]);
    }
    if (initialExtraNeed) {
      setExtraNeed(initialExtraNeed);
    }
  }, [handoffKey, initialImageUrl, initialImageLabel, initialExtraNeed]);

  useEffect(() => {
    setLocalKeys(activeKeys);
    if (activeKeys.length > 0) {
      setNeedsCreate(false);
      setPreferredKeyId((prev) => prev ?? activeKeys[0].id);
    }
  }, [activeKeys]);

  async function prepareKey(forceCreate = false) {
    if (!accessToken || preparingKey) return;
    setPreparingKey(true);
    setKeyError(null);
    try {
      const ensured = await ensurePlaygroundApiKey({
        accessToken,
        activeKeys: forceCreate ? [] : localKeys.map(toKeyOption),
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
        return [next, ...prev.filter((row) => row.id !== next.id)];
      });
      setNeedsCreate(false);
      if (ensured.created) router.refresh();
    } catch {
      setNeedsCreate(true);
      setKeyError(t("dashboard.imageWorkbench.keyPrepareFailed"));
    } finally {
      setPreparingKey(false);
    }
  }

  useEffect(() => {
    if (!accessToken || resolvedSecret) return;
    void prepareKey(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  async function resolveKey(): Promise<string> {
    if (resolvedSecret && isFullTokfaiApiKey(resolvedSecret)) {
      return resolvedSecret;
    }
    if (!accessToken) {
      throw new Error(t("dashboard.imageWorkbench.keyPrepareFailed"));
    }
    const ensured = await ensurePlaygroundApiKey({
      accessToken,
      activeKeys: localKeys.map(toKeyOption),
      preferredKeyId,
    });
    setResolvedSecret(ensured.secret);
    setPreferredKeyId(ensured.keyId);
    setNeedsCreate(false);
    if (ensured.created) router.refresh();
    return ensured.secret;
  }

  const uploadFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setError(null);
      setTechnicalError(null);
      const file = files[0];
      try {
        validatePlaygroundImageFile(file);
      } catch (err) {
        setError(
          err instanceof PlaygroundImageUploadError
            ? err.message
            : t("dashboard.imageWorkbench.uploadFailed")
        );
        return;
      }

      const id = `img-${Date.now()}`;
      setImages([{ id, url: "", label: file.name, status: "uploading" }]);

      try {
        const formData = new FormData();
        formData.append("file", file);
        const uploaded = await uploadPlaygroundImageAction(formData);
        if (!uploaded.ok || !uploaded.publicUrl) {
          throw new Error(
            !uploaded.ok
              ? uploaded.message
              : t("dashboard.imageWorkbench.uploadFailed")
          );
        }
        setImages([
          {
            id,
            url: uploaded.publicUrl,
            label: file.name,
            status: "ready",
          },
        ]);
      } catch (err) {
        setImages([
          {
            id,
            url: "",
            label: file.name,
            status: "error",
            error:
              err instanceof Error
                ? err.message
                : t("dashboard.imageWorkbench.uploadFailed"),
          },
        ]);
      }
    },
    [t]
  );

  async function handleRun() {
    if (loading) return;
    setError(null);
    setTechnicalError(null);
    setResult(null);

    if (readyUrls.length === 0) {
      setError(t("dashboard.imageWorkbench.needImage"));
      return;
    }

    setLoading(true);
    try {
      const apiKey = await resolveKey();
      const prompt = buildEcommerceVisionPrompt({
        mode,
        useCase,
        extraNeed,
      });

      const res = await chatCompletions(apiKey, {
        model: visionModel,
        stream: false,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              ...readyUrls.map((url) => ({
                type: "image_url" as const,
                image_url: { url },
              })),
            ],
          },
        ],
      });
      setResult(res);
      router.refresh();
    } catch (err) {
      const technical =
        err instanceof DmitApiError
          ? `${err.code ?? "error"} · ${err.message}`
          : err instanceof Error
            ? err.message
            : t("dashboard.imageWorkbench.analyzeFailed");
      setTechnicalError(technical);
      if (isTimeoutLikeError(err)) {
        setError(t("dashboard.imageWorkbench.timeoutFriendly"));
      } else {
        setError(
          isCopyMode
            ? t("dashboard.imageWorkbench.copyFailed")
            : t("dashboard.imageWorkbench.analyzeFailed")
        );
      }
    } finally {
      setLoading(false);
    }
  }

  const resultText = extractChatAssistantText(result);
  const creditsCharged = extractChatCreditsCharged(result);
  const requestId = extractChatRequestId(result);

  async function copyResult() {
    if (!resultText) return;
    try {
      await navigator.clipboard.writeText(resultText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  function handleGoToCopy() {
    if (!readyUrls[0] || !resultText || !onGoToCopy) return;
    const brief = summarizeRecognitionForCopy(
      resultText,
      ecommerceUseCaseLabel(useCase, locale, mode)
    );
    onGoToCopy({
      imageUrl: readyUrls[0],
      imageLabel: images[0]?.label,
      copyBrief: brief,
    });
  }

  function handleGoToGenerate(fromCopy = false) {
    if (!readyUrls[0] || !onGoToGenerate) return;
    onGoToGenerate({
      imageUrl: readyUrls[0],
      imageLabel: images[0]?.label,
      promptHint:
        fromCopy && resultText
          ? distillCopyToImagePrompt(resultText)
          : undefined,
    });
  }

  const titleKey = isCopyMode
    ? "dashboard.imageWorkbench.copyTitle"
    : "dashboard.imageWorkbench.analysisTitle";
  const descKey = isCopyMode
    ? "dashboard.imageWorkbench.copyDesc"
    : "dashboard.imageWorkbench.analysisDesc";
  const ctaKey = isCopyMode
    ? "dashboard.imageWorkbench.startCopy"
    : "dashboard.imageWorkbench.startAnalyze";
  const useCaseLabelKey = isCopyMode
    ? "dashboard.imageWorkbench.copyUseCaseLabel"
    : "dashboard.imageWorkbench.useCaseLabel";
  const extraPlaceholderKey = isCopyMode
    ? "dashboard.imageWorkbench.copyExtraPlaceholder"
    : "dashboard.imageWorkbench.extraNeedPlaceholder";
  const resultTitleKey = isCopyMode
    ? "dashboard.imageWorkbench.copyResultTitle"
    : "dashboard.imageWorkbench.analysisResultTitle";
  const resultDescKey = isCopyMode
    ? "dashboard.imageWorkbench.copyResultDesc"
    : "dashboard.imageWorkbench.analysisResultDesc";
  const resultEmptyKey = isCopyMode
    ? "dashboard.imageWorkbench.copyResultEmpty"
    : "dashboard.imageWorkbench.analysisResultEmpty";
  const copyBtnKey = isCopyMode
    ? "dashboard.imageWorkbench.copyAllCopy"
    : "dashboard.imageWorkbench.copyResult";

  return (
    <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t(titleKey)}</CardTitle>
          <CardDescription>{t(descKey)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {(needsCreate || keyError || preparingKey) && !resolvedSecret ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-3">
              <p className="text-sm text-muted-foreground">
                {keyError ?? t("dashboard.imageWorkbench.noKeyBody")}
              </p>
              <Button
                type="button"
                size="sm"
                className="mt-2"
                disabled={preparingKey || !accessToken}
                onClick={() => void prepareKey(true)}
              >
                {preparingKey
                  ? t("dashboard.imageWorkbench.creatingKey")
                  : t("dashboard.imageWorkbench.createKey")}
              </Button>
            </div>
          ) : null}

          <div className="flex flex-col gap-2">
            <Label>{t("dashboard.imageWorkbench.uploadLabel")}</Label>
            <div
              className="flex min-h-[160px] cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/20 px-4 py-6 text-center"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void uploadFiles(Array.from(e.dataTransfer.files ?? []));
              }}
            >
              {images[0]?.status === "ready" && images[0].url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={images[0].url}
                  alt={images[0].label}
                  className="max-h-40 rounded-md object-contain"
                />
              ) : images[0]?.status === "uploading" ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <>
                  <Upload className="h-6 w-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {t("dashboard.imageWorkbench.uploadHint")}
                  </p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = "";
                void uploadFiles(files);
              }}
            />
            {images[0] ? (
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="truncate">{images[0].label}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2"
                  onClick={() => setImages([])}
                >
                  <X className="h-3.5 w-3.5" />
                  {t("dashboard.imageWorkbench.removeImage")}
                </Button>
              </div>
            ) : null}
            {images[0]?.status === "error" ? (
              <p className="text-sm text-destructive">{images[0].error}</p>
            ) : null}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ecommerce-use-case">{t(useCaseLabelKey)}</Label>
            <select
              id="ecommerce-use-case"
              value={useCase}
              disabled={loading}
              onChange={(e) => setUseCase(e.target.value)}
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              {useCaseOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {ecommerceUseCaseLabel(item.id, locale, mode)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="ecommerce-extra">
              {t("dashboard.imageWorkbench.extraNeedLabel")}
            </Label>
            <textarea
              id="ecommerce-extra"
              rows={3}
              value={extraNeed}
              disabled={loading}
              onChange={(e) => setExtraNeed(e.target.value)}
              placeholder={t(extraPlaceholderKey)}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-muted/20 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {t("dashboard.imageWorkbench.balanceLabel")}
            </span>
            <span className="font-mono font-semibold tabular-nums">
              {creditsLoaded
                ? dashboardFormatCreditsWithSuffix(initialCreditsBalance ?? 0)
                : "—"}
            </span>
          </div>

          <Button
            type="button"
            disabled={loading || readyUrls.length === 0}
            onClick={() => void handleRun()}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                {isCopyMode
                  ? t("dashboard.imageWorkbench.copying")
                  : t("dashboard.imageWorkbench.analyzing")}
              </>
            ) : (
              t(ctaKey)
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t(resultTitleKey)}</CardTitle>
          <CardDescription>{t(resultDescKey)}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {error ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {error}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void handleRun()}
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  {t("dashboard.imageWorkbench.regenerate")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setExtraNeed((prev) => prev.slice(0, 40));
                    setError(null);
                  }}
                >
                  {t("dashboard.imageWorkbench.simplifyRetry")}
                </Button>
                <Button asChild type="button" size="sm" variant="outline">
                  <a href="/dashboard/usage">
                    {t("dashboard.imageWorkbench.viewUsage")}
                  </a>
                </Button>
              </div>
            </div>
          ) : null}

          {loading ? (
            <WorkbenchProgressPanel
              kind="vision"
              locale={locale}
              title={t("dashboard.imageWorkbench.progressTitle")}
              patienceHint={t("dashboard.imageWorkbench.progressPatienceVision")}
            />
          ) : null}

          {!loading && !resultText && !error ? (
            <div className="flex min-h-[240px] items-center justify-center rounded-md border border-dashed bg-muted/20 px-4 text-center text-sm text-muted-foreground">
              {t(resultEmptyKey)}
            </div>
          ) : null}

          {resultText ? (
            <>
              <div className="max-h-[min(640px,70vh)] overflow-y-auto whitespace-pre-wrap rounded-md border bg-background px-4 py-3 text-sm leading-relaxed">
                {resultText}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={() => void copyResult()}>
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      {t("dashboard.imageWorkbench.copied")}
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      {t(copyBtnKey)}
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={loading}
                  onClick={() => void handleRun()}
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  {t("dashboard.imageWorkbench.regenerate")}
                </Button>
                {!isCopyMode && onGoToCopy ? (
                  <Button type="button" size="sm" onClick={handleGoToCopy}>
                    {t("dashboard.imageWorkbench.goToCopy")}
                  </Button>
                ) : null}
                {onGoToGenerate ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => handleGoToGenerate(isCopyMode)}
                  >
                    {isCopyMode
                      ? t("dashboard.imageWorkbench.goToGenerateFromCopy")
                      : t("dashboard.imageWorkbench.goToGenerate")}
                  </Button>
                ) : null}
                <Button asChild type="button" size="sm" variant="outline">
                  <a href="/dashboard/usage">
                    {t("dashboard.imageWorkbench.viewUsage")}
                  </a>
                </Button>
              </div>
            </>
          ) : null}

          {(resultText || technicalError) && (
            <details className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none font-medium text-foreground">
                {t("dashboard.imageWorkbench.advancedInfo")}
              </summary>
              <div className="mt-2 space-y-1 font-mono">
                {creditsCharged != null ? (
                  <p>
                    {t("dashboard.imageWorkbench.chargedLabel")}:{" "}
                    {dashboardFormatCreditsWithSuffix(creditsCharged)}
                  </p>
                ) : null}
                {requestId ? <p>request_id: {requestId}</p> : null}
                {technicalError ? <p>error: {technicalError}</p> : null}
              </div>
            </details>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
