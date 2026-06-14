"use client";

import Link from "next/link";
import {
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  FileText,
  Gauge,
  ImageIcon,
  KeyRound,
  Loader2,
  RotateCw,
  Sparkles,
  Wallet,
} from "lucide-react";

import { CopyButton, useCopyToClipboard } from "@/components/copy-code-block";
import { PlaygroundErrorPanel } from "@/components/playground-error-panel";
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
import type { ImageGenerationResponse } from "@/lib/dmit/client";
import { isLowCreditsBalance } from "@/lib/dashboard-shell-credits";
import {
  hasGeneratedImageBase64,
  resolveGeneratedImageUrl,
} from "@/lib/image-playground-display";
import { formatCreditsPrecise, formatCreditBalanceDisplay } from "@/lib/format";
import {
  formatImageCreditsAmount,
  formatImageModelSelectLabel,
} from "@/lib/model-pricing-display";
import {
  IMAGE_PLAYGROUND_MODEL_IDS,
  IMAGE_PLAYGROUND_SIZES,
  type ImagePlaygroundModelId,
  type ImagePlaygroundSize,
} from "@/lib/model-catalog";
import { formatMessage, type Locale } from "@/lib/i18n/messages";
import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/tokfai-api";
import { cn } from "@/lib/utils";

/** Shared layout tokens for the Image Playground two-column toolbench. */
export const IMAGE_PLAYGROUND_TOOLBENCH = {
  grid:
    "grid min-w-0 grid-cols-1 gap-3 lg:grid-cols-[minmax(560px,1fr)_minmax(360px,400px)] lg:items-start lg:gap-4",
  card: "shadow-none overflow-hidden",
  cardHeader: "space-y-0.5 px-4 py-3",
  cardTitle: "text-sm font-medium leading-tight",
  cardDescription: "text-xs text-muted-foreground",
  cardContent: "px-4 pb-4 pt-0",
  control: "h-9",
  select:
    "flex h-8 w-full rounded-md border border-input bg-muted/30 px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
  stickyColumn:
    "min-w-0 shrink-0 lg:col-start-2 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-1.75rem)] lg:overflow-y-auto lg:overflow-x-hidden",
  resultCard: "min-h-[360px] border bg-card",
  resultBody:
    "flex min-h-[min(360px,42vh)] flex-1 flex-col rounded-lg border border-dashed bg-muted/25",
} as const;

/** Scroll result panel into view on mobile, or when off-screen on desktop. */
export function focusImagePlaygroundResultPanel(
  element: HTMLElement | null,
  phase: "onStart" | "onComplete"
): void {
  if (!element || typeof window === "undefined") return;

  const isMobile = window.matchMedia("(max-width: 1023px)").matches;

  if (phase === "onStart" && isMobile) {
    element.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }

  if (phase === "onComplete") {
    if (isMobile) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const rect = element.getBoundingClientRect();
    const topVisible = rect.top >= -4 && rect.top < window.innerHeight * 0.75;
    if (!topVisible) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
}

const IMAGE_API_DOCS_HREF = "/docs#image-generations";
const INTEGRATION_DOCS_HREF = "/dashboard/docs";

type ImagePlaygroundKeyOption = {
  id: string;
  name: string;
  prefix: string;
  status: string;
  can_reveal?: boolean;
};

type KeyPanelView = "select" | "paste" | "empty";

export interface ImagePlaygroundCompactKeyRowProps {
  keyPanelView: KeyPanelView;
  localKeys: ImagePlaygroundKeyOption[];
  selectedKey: ImagePlaygroundKeyOption | null;
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
  t: (key: string) => string;
}

export function ImagePlaygroundCompactKeyRow({
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
  t,
}: ImagePlaygroundCompactKeyRowProps) {
  const { copiedId, copyText } = useCopyToClipboard();
  const secretCopied = copiedId === "image-playground-created-secret";

  if (keyPanelView === "paste") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <KeyRound className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="text-sm font-medium">{t("dashboard.playground.pasteKey")}</span>
          {localKeys.length > 0 ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              disabled={loading}
              onClick={() => onKeyPanelViewChange("select")}
            >
              {t("dashboard.playground.selectKey")}
            </Button>
          ) : null}
        </div>
        <Input
          type={showApiKey ? "text" : "password"}
          autoComplete="off"
          spellCheck={false}
          placeholder={TOKFAI_API_KEY_PLACEHOLDER}
          value={apiKey}
          onChange={(e) => onApiKeyChange(e.target.value)}
          disabled={loading}
          className="h-9 font-mono text-xs"
        />
      </div>
    );
  }

  if (keyPanelView === "empty" || localKeys.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-dashed bg-muted/30 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          {t("dashboard.imagePlayground.toolbenchNoKey")}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={loading || creatingKey}
            onClick={onCreateTestKey}
          >
            {creatingKey ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              t("dashboard.imagePlayground.createTestKey")
            )}
          </Button>
          <Button asChild type="button" size="sm" variant="outline">
            <Link href="/dashboard/api-keys">
              {t("dashboard.imagePlayground.createApiKey")}
            </Link>
          </Button>
        </div>
        {createKeyError ? (
          <p className="text-xs text-destructive sm:col-span-2">{createKeyError}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 px-3 py-2.5">
      {createdSecret && createdBannerKeyId === selectedKeyId ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-2 py-1.5 text-xs text-emerald-800 dark:text-emerald-200">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{t("dashboard.playground.testKeyCreated")}</span>
          <CopyButton
            copied={secretCopied}
            onCopy={() => copyText("image-playground-created-secret", createdSecret)}
            copyLabel={t("dashboard.playground.copySecret")}
            copiedLabel={t("dashboard.playground.copied")}
          />
        </div>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Label
          htmlFor="image-api-key-select"
          className="shrink-0 text-xs font-medium text-muted-foreground sm:w-28"
        >
          {t("dashboard.imagePlayground.toolbenchCurrentKey")}
        </Label>
        <select
          id="image-api-key-select"
          value={selectedKeyId}
          onChange={(e) => onSelectedKeyChange(e.target.value)}
          disabled={loading}
          className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {localKeys.map((row) => (
            <option key={row.id} value={row.id}>
              {row.name} ({row.prefix || "sk-tokfai"})
            </option>
          ))}
        </select>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-9"
            disabled={loading}
            onClick={() => onKeyPanelViewChange("paste")}
          >
            {t("dashboard.playground.pasteOtherKey")}
          </Button>
          <Button asChild type="button" size="sm" variant="outline" className="h-9">
            <Link href="/dashboard/api-keys">
              {t("dashboard.playground.manageApiKeys")}
            </Link>
          </Button>
        </div>
      </div>
      {selectedKey ? (
        <p className="text-xs text-muted-foreground">
          {formatMessage(t("dashboard.playground.currentKeySelection"), {
            name: selectedKey.name,
            prefix: selectedKey.prefix || "sk-tokfai",
          })}
        </p>
      ) : null}
    </div>
  );
}

export interface ImagePlaygroundSettingsSidebarProps {
  model: ImagePlaygroundModelId;
  size: ImagePlaygroundSize;
  loading: boolean;
  creditsBalance: number | null;
  creditsLoaded: boolean;
  estimatedCredits: number | null;
  isModelComingSoon: boolean;
  locale: Locale;
  onModelChange: (model: ImagePlaygroundModelId) => void;
  onSizeChange: (size: ImagePlaygroundSize) => void;
  t: (key: string) => string;
}

export function ImagePlaygroundSettingsSidebar({
  model,
  size,
  loading,
  creditsBalance,
  creditsLoaded,
  estimatedCredits,
  isModelComingSoon,
  locale,
  onModelChange,
  onSizeChange,
  t,
}: ImagePlaygroundSettingsSidebarProps) {
  const balanceDisplay = creditsLoaded
    ? formatCreditBalanceDisplay(creditsBalance ?? 0)
    : "—";
  const lowCredits = creditsLoaded && isLowCreditsBalance({
    balance: creditsBalance ?? 0,
    loaded: true,
  });
  const insufficientCredits =
    creditsLoaded &&
    estimatedCredits != null &&
    (creditsBalance ?? 0) < estimatedCredits;
  const showTopUp = lowCredits || insufficientCredits;

  return (
    <Card className={`${IMAGE_PLAYGROUND_TOOLBENCH.card} border-muted/60`}>
      <CardHeader className={`${IMAGE_PLAYGROUND_TOOLBENCH.cardHeader} pb-2`}>
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {t("dashboard.imagePlayground.settings")}
        </CardTitle>
      </CardHeader>
      <CardContent
        className={`${IMAGE_PLAYGROUND_TOOLBENCH.cardContent} flex flex-col gap-2.5`}
      >
        <div className="flex items-baseline justify-between gap-2 text-xs">
          <span className="text-muted-foreground">
            {t("dashboard.credits.currentBalance")}
          </span>
          <span className="font-mono tabular-nums text-foreground">{balanceDisplay}</span>
        </div>
        {estimatedCredits != null ? (
          <p className="text-[11px] text-muted-foreground">
            {formatMessage(t("dashboard.imagePlayground.estimatedCost"), {
              credits: formatImageCreditsAmount(estimatedCredits, locale),
            })}
          </p>
        ) : null}
        {insufficientCredits ? (
          <p className="text-[11px] font-medium text-destructive">
            {t("dashboard.imagePlayground.toolbenchInsufficientCredits")}
          </p>
        ) : null}
        {lowCredits ? (
          <Badge variant="warning" className="text-[10px]">
            {t("dashboard.shell.lowCredits")}
          </Badge>
        ) : null}
        {showTopUp ? (
          <Button asChild size="sm" variant="outline" className="h-8 w-full text-xs">
            <Link href="/dashboard/credits">
              <Wallet className="h-3.5 w-3.5" />
              {t("dashboard.imagePlayground.topUp")}
            </Link>
          </Button>
        ) : null}

        <div className="grid grid-cols-1 gap-2 border-t pt-2.5 sm:grid-cols-2 lg:grid-cols-1">
          <div className="flex flex-col gap-1">
            <Label htmlFor="toolbench-model" className="text-[11px] text-muted-foreground">
              {t("dashboard.imagePlayground.toolbenchModelLabel")}
            </Label>
            <select
              id="toolbench-model"
              value={model}
              onChange={(e) => onModelChange(e.target.value as ImagePlaygroundModelId)}
              disabled={loading}
              className={IMAGE_PLAYGROUND_TOOLBENCH.select}
            >
              {IMAGE_PLAYGROUND_MODEL_IDS.map((m) => (
                <option key={m} value={m}>
                  {formatImageModelSelectLabel(m, locale)}
                </option>
              ))}
            </select>
            {isModelComingSoon ? (
              <p className="text-[11px] font-medium text-destructive">
                {t("dashboard.imagePlayground.modelComingSoon")}
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="toolbench-size" className="text-[11px] text-muted-foreground">
              {t("dashboard.imagePlayground.size")}
            </Label>
            <select
              id="toolbench-size"
              value={size}
              onChange={(e) => onSizeChange(e.target.value as ImagePlaygroundSize)}
              disabled={loading}
              className={IMAGE_PLAYGROUND_TOOLBENCH.select}
            >
              {IMAGE_PLAYGROUND_SIZES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export interface ImagePlaygroundGenerateActionsProps {
  loading: boolean;
  hasUploadingImages: boolean;
  isModelComingSoon: boolean;
  copyRequestStatus: "idle" | "copied";
  layout?: "row" | "stack";
  onCopyApiRequest: () => void;
  t: (key: string) => string;
}

export function ImagePlaygroundGenerateActions({
  loading,
  hasUploadingImages,
  isModelComingSoon,
  copyRequestStatus,
  layout = "row",
  onCopyApiRequest,
  t,
}: ImagePlaygroundGenerateActionsProps) {
  const layoutClass =
    layout === "stack"
      ? "flex flex-col gap-2"
      : "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center";

  return (
    <div className={layoutClass}>
      <Button
        type="submit"
        disabled={loading || hasUploadingImages || isModelComingSoon}
        className={`w-full font-medium shadow-sm sm:w-auto ${layout === "stack" ? "h-10" : IMAGE_PLAYGROUND_TOOLBENCH.control}`}
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
            <Sparkles className="h-4 w-4" />
            {t("dashboard.imagePlayground.generate")}
          </>
        )}
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={loading || hasUploadingImages}
        onClick={onCopyApiRequest}
        className={`w-full sm:w-auto ${layout === "stack" ? "h-9" : IMAGE_PLAYGROUND_TOOLBENCH.control}`}
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
    </div>
  );
}

export interface ImagePlaygroundServiceDocsPanelProps {
  t: (key: string) => string;
}

export function ImagePlaygroundServiceDocsPanel({
  t,
}: ImagePlaygroundServiceDocsPanelProps) {
  const shortcuts = [
    {
      id: "image-docs",
      label: t("dashboard.imagePlayground.toolbenchViewImageApiDocs"),
      icon: BookOpen,
      href: IMAGE_API_DOCS_HREF,
    },
    {
      id: "usage",
      label: t("dashboard.imagePlayground.viewUsage"),
      icon: Gauge,
      href: "/dashboard/usage",
    },
    {
      id: "credits",
      label: t("dashboard.imagePlayground.viewCredits"),
      icon: Wallet,
      href: "/dashboard/credits",
    },
    {
      id: "integration",
      label: t("dashboard.imagePlayground.toolbenchOpenIntegrationDocs"),
      icon: FileText,
      href: INTEGRATION_DOCS_HREF,
    },
  ];

  return (
    <Card className={`${IMAGE_PLAYGROUND_TOOLBENCH.card} border-muted/60`}>
      <CardHeader className={`${IMAGE_PLAYGROUND_TOOLBENCH.cardHeader} pb-2`}>
        <CardTitle className="text-xs font-medium text-muted-foreground">
          {t("dashboard.imagePlayground.toolbenchServiceDocs")}
        </CardTitle>
      </CardHeader>
      <CardContent className={IMAGE_PLAYGROUND_TOOLBENCH.cardContent}>
        <div className="flex flex-col gap-0.5">
          {shortcuts.map((item) => {
            const Icon = item.icon;
            return (
              <Button
                key={item.id}
                asChild
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 justify-start gap-2 px-2 text-xs font-normal text-muted-foreground hover:text-foreground"
              >
                <Link href={item.href}>
                  <Icon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </Button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

interface PlaygroundErrorState {
  status: number;
  code?: string;
  message: string;
  requestId?: string;
}

export function ImagePlaygroundResultArea({
  loading,
  error,
  result,
  completedAt,
  inputImagesCount,
  attention = false,
  onRetry,
  t,
}: {
  loading: boolean;
  error: PlaygroundErrorState | null;
  result: ImageGenerationResponse | null;
  completedAt: string | null;
  inputImagesCount: number | null | undefined;
  attention?: boolean;
  onRetry?: () => void;
  t: (key: string) => string;
}) {
  const { copiedId, copyText } = useCopyToClipboard();

  const state: "loading" | "error" | "success" | "empty" = loading
    ? "loading"
    : error
      ? "error"
      : result
        ? "success"
        : "empty";

  const title =
    state === "loading"
      ? t("dashboard.imagePlayground.toolbenchResultLoadingTitle")
      : t("dashboard.imagePlayground.toolbenchGenerationResult");

  const cardClass = cn(
    IMAGE_PLAYGROUND_TOOLBENCH.card,
    IMAGE_PLAYGROUND_TOOLBENCH.resultCard,
    attention && "ring-2 ring-emerald-200/90 border-emerald-300/70",
    state === "success" && "border-emerald-500/35",
    state === "error" && attention && "ring-destructive/15 border-destructive/40",
    state === "loading" && !attention && "border-primary/25"
  );

  return (
    <Card className={cardClass}>
      <CardHeader className={IMAGE_PLAYGROUND_TOOLBENCH.cardHeader}>
        <CardTitle
          className={cn(
            IMAGE_PLAYGROUND_TOOLBENCH.cardTitle,
            state === "loading" && "flex items-center gap-2"
          )}
        >
          {state === "loading" ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          ) : state === "success" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          ) : null}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent
        className={`${IMAGE_PLAYGROUND_TOOLBENCH.cardContent} flex flex-col`}
      >
        {state === "loading" ? (
          <div
            className={`${IMAGE_PLAYGROUND_TOOLBENCH.resultBody} items-center justify-center gap-3 px-4 py-6 text-center`}
          >
            <div className="h-28 w-full max-w-xs animate-pulse rounded-md bg-muted/50" />
            <p className="text-sm font-medium text-foreground">
              {t("dashboard.imagePlayground.toolbenchResultLoadingTitle")}
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              {t("dashboard.imagePlayground.toolbenchResultLoadingHint")}
            </p>
          </div>
        ) : null}

        {state === "error" ? (
          <div
            className={`${IMAGE_PLAYGROUND_TOOLBENCH.resultBody} gap-3 p-4`}
          >
            <PlaygroundErrorPanel scope="imagePlayground" error={error!} t={t} />
            <p className="text-xs text-muted-foreground">
              {t("dashboard.imagePlayground.errors.billingNotChargedHint")}
            </p>
            {onRetry ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className={IMAGE_PLAYGROUND_TOOLBENCH.control}
                onClick={onRetry}
              >
                <RotateCw className="h-4 w-4" />
                {t("dashboard.imagePlayground.toolbenchRetry")}
              </Button>
            ) : null}
          </div>
        ) : null}

        {state === "empty" ? (
          <div
            className={`${IMAGE_PLAYGROUND_TOOLBENCH.resultBody} items-center justify-center gap-3 px-4 py-8 text-center`}
          >
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-muted-foreground/20 bg-muted/40">
              <ImageIcon className="h-7 w-7 text-muted-foreground/70" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {t("dashboard.imagePlayground.toolbenchResultPlaceholder")}
            </p>
          </div>
        ) : null}

        {state === "success" ? (
          <div className="flex flex-col gap-3">
            {(() => {
              const imageUrl = resolveGeneratedImageUrl(result!);
              const base64Only = !imageUrl && hasGeneratedImageBase64(result!);
              const creditsCharged = resolveResultCredits(result!);
              const requestId = result!.request_id ?? null;
              const resolvedModel = result!.model ?? null;
              const requestCopyId = "image-result-request-id";

              return (
                <>
                  {imageUrl ? (
                    <div className="overflow-hidden rounded-lg border bg-muted/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imageUrl}
                        alt="Generated image"
                        className="mx-auto max-h-[min(480px,55vh)] w-full object-contain"
                      />
                    </div>
                  ) : base64Only ? (
                    <div
                      className={`${IMAGE_PLAYGROUND_TOOLBENCH.resultBody} items-center justify-center px-4 py-6`}
                    >
                      <p className="text-sm text-muted-foreground">
                        {t("dashboard.imagePlayground.base64OnlyHint")}
                      </p>
                    </div>
                  ) : null}

                  <div className="flex flex-col gap-2 text-sm">
                    {requestId ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <code className="max-w-full truncate rounded bg-muted px-2 py-0.5 font-mono text-xs">
                          {requestId}
                        </code>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className={`h-8 ${IMAGE_PLAYGROUND_TOOLBENCH.control}`}
                          onClick={() => copyText(requestCopyId, requestId)}
                        >
                          {copiedId === requestCopyId ? (
                            <>
                              <Check className="h-3.5 w-3.5" />
                              {t("dashboard.imagePlayground.copiedRequestId")}
                            </>
                          ) : (
                            <>
                              <Copy className="h-3.5 w-3.5" />
                              {t("dashboard.imagePlayground.copyRequestId")}
                            </>
                          )}
                        </Button>
                      </div>
                    ) : null}
                    {creditsCharged != null ? (
                      <p className="text-xs text-muted-foreground">
                        {formatMessage(
                          t("dashboard.imagePlayground.successCreditsCharged"),
                          { credits: formatCreditsPrecise(creditsCharged) }
                        )}
                      </p>
                    ) : null}
                    {resolvedModel ? (
                      <p className="text-xs text-muted-foreground">
                        {t("dashboard.imagePlayground.metaModel")}:{" "}
                        <span className="font-mono text-foreground">
                          {resolvedModel}
                        </span>
                      </p>
                    ) : null}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className={IMAGE_PLAYGROUND_TOOLBENCH.control}
                    >
                      <Link href="/dashboard/usage">
                        {t("dashboard.imagePlayground.viewUsage")}
                      </Link>
                    </Button>
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className={IMAGE_PLAYGROUND_TOOLBENCH.control}
                    >
                      <Link href="/dashboard/credits">
                        {t("dashboard.imagePlayground.viewCredits")}
                      </Link>
                    </Button>
                  </div>

                  {completedAt ? (
                    <p className="text-xs text-muted-foreground">
                      {t("dashboard.imagePlayground.metaCreatedAt")}: {completedAt}
                      {inputImagesCount != null
                        ? ` · ${inputImagesCount} input(s)`
                        : ""}
                    </p>
                  ) : null}
                </>
              );
            })()}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function resolveResultCredits(result: ImageGenerationResponse): number | null {
  const raw = result.credits_charged;
  if (raw == null) return null;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value) || value <= 0) return null;
  return value;
}
