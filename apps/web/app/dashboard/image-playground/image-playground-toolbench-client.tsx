"use client";

import Link from "next/link";
import {
  Check,
  CheckCircle2,
  Copy,
  ImageIcon,
  Loader2,
  RotateCw,
  Sparkles,
  Wallet,
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
import type { ImageGenerationResponse } from "@/lib/dashboard-safe/image-api";
import { isLowCreditsBalance } from "@/lib/dashboard-safe/shell-credits";
import { TOKFAI_API_KEY_PLACEHOLDER } from "@/lib/dashboard-safe/constants";
import { cn } from "@/lib/dashboard-safe/classnames";
import { WorkbenchProgressPanel } from "./workbench-progress";
import { useImagePlaygroundLabels } from "./use-image-playground-labels";

import {
  ImagePlaygroundCopyButton,
  useImagePlaygroundCopyToClipboard,
} from "./image-playground-copy-block";
import {
  formatCreditsSafe,
  formatCreditBalanceDisplaySafe,
  hasGeneratedImageBase64,
  resolveGeneratedImageUrl,
} from "./image-playground-display-helpers";
import {
  formatImageCreditsAmount,
  formatImageModelSelectLabel,
  IMAGE_PLAYGROUND_MODEL_IDS,
  IMAGE_PLAYGROUND_SIZES,
  type ImagePlaygroundModelId,
  type ImagePlaygroundSize,
} from "./image-playground-model-options";
import {
  formatImagePlaygroundLabel,
  type ImagePlaygroundLocale,
} from "./image-playground-labels";

/** Shared layout tokens for the Image Playground three-column toolbench. */
export const IMAGE_PLAYGROUND_TOOLBENCH = {
  shell: "mx-auto w-full min-w-0 max-w-[1680px] px-6",
  grid:
    "grid min-w-0 grid-cols-1 gap-5 lg:grid-cols-[minmax(460px,1fr)_360px_minmax(460px,1fr)] lg:items-start xl:grid-cols-[1.05fr_360px_1.05fr]",
  card: "shadow-none overflow-hidden border bg-card",
  cardHeader: "space-y-0.5 px-4 py-3",
  cardTitle: "text-sm font-medium leading-tight",
  cardDescription: "text-xs text-muted-foreground",
  cardContent: "px-4 pb-4 pt-0",
  inputCard: "min-h-[520px] shadow-none overflow-hidden border bg-card",
  control: "h-9",
  select:
    "flex h-9 w-full rounded-md border border-input bg-muted/30 px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
  resultSticky: "lg:sticky lg:top-6 lg:self-start",
  resultCard: "min-h-[560px] border bg-card",
  resultBody:
    "flex min-h-[min(480px,52vh)] flex-1 flex-col rounded-lg border border-dashed bg-muted/25",
  settingsStack: "shadow-none overflow-hidden border bg-card",
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

const IMAGE_API_DOCS_HREF = "/dashboard/docs#image-api";
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

export interface ImagePlaygroundSettingsSidebarProps {
  model: ImagePlaygroundModelId;
  size: ImagePlaygroundSize;
  loading: boolean;
  creditsBalance: number | null;
  creditsLoaded: boolean;
  estimatedCredits: number | null;
  isModelComingSoon: boolean;
  locale: ImagePlaygroundLocale;
  onModelChange: (model: ImagePlaygroundModelId) => void;
  onSizeChange: (size: ImagePlaygroundSize) => void;
  t: (key: string) => string;
}

function ImagePlaygroundSettingsKeySection({
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
  const { copiedId, copyText } = useImagePlaygroundCopyToClipboard();
  const secretCopied = copiedId === "image-playground-created-secret";

  if (keyPanelView === "paste") {
    return (
      <div className="max-h-[110px] space-y-1.5 overflow-hidden">
        <Label className="text-xs text-muted-foreground">
          {t("dashboard.imagePlayground.toolbenchApiKeyLabel")}
        </Label>
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
        <div className="flex gap-1">
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
      </div>
    );
  }

  if (keyPanelView === "empty" || localKeys.length === 0) {
    return (
      <div className="max-h-[110px] space-y-2 overflow-hidden">
        <Label className="text-xs text-muted-foreground">
          {t("dashboard.imagePlayground.toolbenchApiKeyLabel")}
        </Label>
        <p className="text-xs text-muted-foreground">
          {t("dashboard.imagePlayground.toolbenchNoKey")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            size="sm"
            className="h-7 text-xs"
            disabled={loading || creatingKey}
            onClick={onCreateTestKey}
          >
            {creatingKey ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              t("dashboard.imagePlayground.createTestKey")
            )}
          </Button>
          <Button asChild type="button" size="sm" variant="outline" className="h-7 text-xs">
            <Link href="/dashboard/api-keys">
              {t("dashboard.imagePlayground.createApiKey")}
            </Link>
          </Button>
        </div>
        {createKeyError ? (
          <p className="text-[11px] text-destructive">{createKeyError}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="max-h-[110px] space-y-1.5 overflow-hidden">
      {createdSecret && createdBannerKeyId === selectedKeyId ? (
        <div className="flex items-center gap-1.5 rounded border border-emerald-500/30 bg-emerald-500/5 px-2 py-1 text-[11px] text-emerald-800 dark:text-emerald-200">
          <CheckCircle2 className="h-3 w-3 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {t("dashboard.playground.testKeyCreated")}
          </span>
          <ImagePlaygroundCopyButton
            copied={secretCopied}
            onCopy={() => copyText("image-playground-created-secret", createdSecret)}
            copyLabel={t("dashboard.playground.copySecret")}
            copiedLabel={t("dashboard.playground.copied")}
          />
        </div>
      ) : null}
      <Label htmlFor="image-api-key-select" className="text-xs text-muted-foreground">
        {t("dashboard.imagePlayground.toolbenchApiKeyLabel")}
      </Label>
      <select
        id="image-api-key-select"
        value={selectedKeyId}
        onChange={(e) => onSelectedKeyChange(e.target.value)}
        disabled={loading}
        className={IMAGE_PLAYGROUND_TOOLBENCH.select}
      >
        {localKeys.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name} ({row.prefix || "sk-tokfai"})
          </option>
        ))}
      </select>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs"
          disabled={loading}
          onClick={() => onKeyPanelViewChange("paste")}
        >
          {t("dashboard.imagePlayground.toolbenchPasteKeyShort")}
        </Button>
        <Button asChild type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs">
          <Link href="/dashboard/api-keys">
            {t("dashboard.imagePlayground.toolbenchManageKeysShort")}
          </Link>
        </Button>
      </div>
      {selectedKey ? (
        <p className="truncate text-[11px] text-muted-foreground">
          {formatImagePlaygroundLabel(
            t("dashboard.imagePlayground.toolbenchCurrentKeyLine"),
            {
              name: selectedKey.name,
              prefix: selectedKey.prefix || "sk-tokfai",
            }
          )}
        </p>
      ) : null}
    </div>
  );
}

export interface ImagePlaygroundRunSettingsPanelProps
  extends ImagePlaygroundCompactKeyRowProps,
    ImagePlaygroundSettingsSidebarProps {
  hideApiKeyUi?: boolean;
  warnFastForEdit?: boolean;
}

export function ImagePlaygroundRunSettingsPanel({
  hideApiKeyUi = false,
  warnFastForEdit = false,
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
  model,
  size,
  creditsBalance,
  creditsLoaded,
  estimatedCredits,
  isModelComingSoon,
  locale,
  onModelChange,
  onSizeChange,
  t,
}: ImagePlaygroundRunSettingsPanelProps) {
  const balanceDisplay = creditsLoaded
    ? formatCreditBalanceDisplaySafe(creditsBalance ?? 0)
    : "—";
  const lowCredits = creditsLoaded && isLowCreditsBalance({
    balance: creditsBalance ?? 0,
    loaded: true,
  });
  const insufficientCredits =
    creditsLoaded &&
    estimatedCredits != null &&
    (creditsBalance ?? 0) < estimatedCredits;

  const docLinks = [
    {
      id: "image-docs",
      label: t("dashboard.imagePlayground.toolbenchViewImageApiDocs"),
      href: IMAGE_API_DOCS_HREF,
    },
    {
      id: "usage",
      label: t("dashboard.imagePlayground.viewUsage"),
      href: "/dashboard/usage",
    },
    {
      id: "credits",
      label: t("dashboard.imagePlayground.viewCredits"),
      href: "/dashboard/credits",
    },
    {
      id: "integration",
      label: t("dashboard.imagePlayground.toolbenchOpenIntegrationDocs"),
      href: INTEGRATION_DOCS_HREF,
    },
  ];

  return (
    <Card className={IMAGE_PLAYGROUND_TOOLBENCH.settingsStack}>
      <CardHeader className={IMAGE_PLAYGROUND_TOOLBENCH.cardHeader}>
        <CardTitle className={IMAGE_PLAYGROUND_TOOLBENCH.cardTitle}>
          {t("dashboard.imagePlayground.toolbenchRunSettings")}
        </CardTitle>
      </CardHeader>
      <CardContent className={`${IMAGE_PLAYGROUND_TOOLBENCH.cardContent} flex flex-col gap-3`}>
        {hideApiKeyUi ? null : (
          <ImagePlaygroundSettingsKeySection
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
            onCreateTestKey={onCreateTestKey}
            onKeyPanelViewChange={onKeyPanelViewChange}
            onSelectedKeyChange={onSelectedKeyChange}
            onApiKeyChange={onApiKeyChange}
            onShowApiKeyChange={onShowApiKeyChange}
            t={t}
          />
        )}

        <div className="flex items-start justify-between gap-3 border-t pt-3">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-muted-foreground">
              {t("dashboard.imagePlayground.toolbenchBalanceLabel")}
            </p>
            <p className="font-mono text-base font-semibold tabular-nums leading-tight">
              {balanceDisplay}
            </p>
            {estimatedCredits != null ? (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatImagePlaygroundLabel(
                  t("dashboard.imagePlayground.estimatedCost"),
                  {
                    credits: formatImageCreditsAmount(estimatedCredits, locale),
                  }
                )}
              </p>
            ) : null}
            {insufficientCredits ? (
              <p className="mt-1 text-[11px] font-medium text-destructive">
                {t("dashboard.imagePlayground.toolbenchInsufficientCredits")}
              </p>
            ) : null}
            {lowCredits ? (
              <Badge variant="warning" className="mt-1 text-[10px]">
                {t("dashboard.shell.lowCredits")}
              </Badge>
            ) : null}
          </div>
          <Button
            asChild
            size="sm"
            variant="outline"
            className="h-8 shrink-0 text-xs"
          >
            <Link href="/dashboard/credits">
              <Wallet className="h-3.5 w-3.5" />
              {t("dashboard.imagePlayground.topUp")}
            </Link>
          </Button>
        </div>

        <div className="flex flex-col gap-2 border-t pt-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="toolbench-model" className="text-xs text-muted-foreground">
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
            {warnFastForEdit ? (
              <p className="text-[11px] leading-snug text-amber-700 dark:text-amber-400">
                {t("dashboard.imagePlayground.fastModelEditHint")}
              </p>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="toolbench-size" className="text-xs text-muted-foreground">
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
          <p className="text-[11px] leading-snug text-muted-foreground">
            {t("dashboard.imagePlayground.toolbenchBillingNoteShort")}
          </p>
        </div>

        <div className="space-y-1 border-t pt-3">
          <p className="text-xs font-medium text-muted-foreground">
            {t("dashboard.imagePlayground.toolbenchServiceDocs")}
          </p>
          <div className="flex flex-col">
            {docLinks.map((item) => (
              <Button
                key={item.id}
                asChild
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 justify-start px-1 text-xs font-normal text-muted-foreground hover:text-foreground"
              >
                <Link href={item.href}>{item.label}</Link>
              </Button>
            ))}
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
  /** Session/balance gate — true when login missing, checking, or no credits. */
  accountBlocked?: boolean;
  copyRequestStatus: "idle" | "copied";
  layout?: "row" | "stack";
  generateLabel?: string;
  /** Integrator-only; hidden in the default consumer flow. */
  showApiRequestCopy?: boolean;
  onCopyApiRequest: () => void;
  t: (key: string) => string;
}

export function ImagePlaygroundGenerateActions({
  loading,
  hasUploadingImages,
  isModelComingSoon,
  accountBlocked = false,
  copyRequestStatus,
  layout = "row",
  generateLabel,
  showApiRequestCopy = false,
  onCopyApiRequest,
  t,
}: ImagePlaygroundGenerateActionsProps) {
  const layoutClass =
    layout === "stack"
      ? "flex flex-col gap-2"
      : "flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center";

  const submitLabel =
    generateLabel ?? t("dashboard.imagePlayground.generate");

  return (
    <div className={layoutClass}>
      <Button
        type="submit"
        disabled={
          loading || hasUploadingImages || isModelComingSoon || accountBlocked
        }
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
            {submitLabel}
          </>
        )}
      </Button>
      {showApiRequestCopy ? (
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
      ) : null}
    </div>
  );
}

interface PlaygroundErrorState {
  status: number;
  code?: string;
  message: string;
  requestId?: string;
  model?: string;
  elapsedMs?: number;
  retryCount?: number;
}

export function ImagePlaygroundResultArea({
  loading,
  error,
  result,
  completedAt,
  inputImagesCount,
  requestMode = null,
  referenceImageIncluded = false,
  attention = false,
  progressStatus = null,
  progressPercent = null,
  onRetry,
  onSimplifyRetry,
  onStrengthenSubjectRetry,
  t,
}: {
  loading: boolean;
  error: PlaygroundErrorState | null;
  result: ImageGenerationResponse | null;
  completedAt: string | null;
  inputImagesCount: number | null | undefined;
  requestMode?: "text_to_image" | "reference_edit" | null;
  referenceImageIncluded?: boolean;
  attention?: boolean;
  progressStatus?: string | null;
  progressPercent?: number | null;
  onRetry?: () => void;
  onSimplifyRetry?: () => void;
  onStrengthenSubjectRetry?: () => void;
  t: (key: string) => string;
}) {
  const { copiedId, copyText } = useImagePlaygroundCopyToClipboard();
  const { locale } = useImagePlaygroundLabels();

  const state: "loading" | "error" | "success" | "empty" = loading
    ? "loading"
    : error
      ? "error"
      : result
        ? "success"
        : "empty";

  const isReferenceEdit =
    requestMode === "reference_edit" || referenceImageIncluded;

  const title =
    state === "loading"
      ? t("dashboard.imageWorkbench.imageProgressTitle")
      : state === "success"
        ? isReferenceEdit
          ? t("dashboard.imagePlayground.referenceEditResultTitle")
          : t("dashboard.imagePlayground.successComplete")
        : t("dashboard.imagePlayground.toolbenchResultPanelTitle");

  const cardClass = cn(
    IMAGE_PLAYGROUND_TOOLBENCH.card,
    IMAGE_PLAYGROUND_TOOLBENCH.resultCard,
    attention && "ring-2 ring-emerald-200/90 border-emerald-300/70",
    state === "success" && "border-emerald-500/35",
    state === "error" && attention && "ring-destructive/15 border-destructive/40",
    state === "loading" && !attention && "border-primary/25"
  );

  // Client-side validation (status 0) already has localized friendly copy —
  // show that as the primary message. Upstream/API failures stay generic;
  // raw upstream text only appears inside collapsed Details.
  const isClientValidation = error?.status === 0;
  const isRetryableTimeout =
    error?.code === "retryable_timeout" ||
    error?.code === "image_generation_timeout" ||
    error?.code === "upstream_timeout" ||
    Boolean(error?.code?.toLowerCase().includes("timeout")) ||
    Boolean(error?.message?.toLowerCase().includes("timeout")) ||
    Boolean(error?.message?.includes("超时")) ||
    Boolean(error?.message?.includes("未扣费"));

  const friendlyError = isClientValidation && error?.message
    ? error.message
    : isRetryableTimeout
      ? t("dashboard.imageWorkbench.imageTimeoutFriendly")
      : t("dashboard.imageWorkbench.imageFailFriendly");

  const billingHint = isClientValidation
    ? null
    : isRetryableTimeout ||
        error?.code === "no_charge" ||
        error?.code === "not_charged"
      ? t("dashboard.imageWorkbench.noChargeHint")
      : t("dashboard.imageWorkbench.billingUnknownHint");

  const focusModelSelect = () => {
    const el = document.getElementById("toolbench-model");
    if (el instanceof HTMLElement) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
    }
  };

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
          <WorkbenchProgressPanel
            kind="image_generate"
            locale={locale}
            title={t("dashboard.imageWorkbench.imageProgressTitle")}
            patienceHint={t("dashboard.imageWorkbench.progressPatienceImage")}
            serverStatus={progressStatus}
            serverProgress={progressPercent}
          />
        ) : null}

        {state === "error" ? (
          <div
            className={`${IMAGE_PLAYGROUND_TOOLBENCH.resultBody} gap-3 p-4`}
          >
            <div className="rounded-md border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {friendlyError}
            </div>
            {billingHint ? (
              <p className="text-xs text-muted-foreground">{billingHint}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {onRetry ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={IMAGE_PLAYGROUND_TOOLBENCH.control}
                  onClick={onRetry}
                >
                  <RotateCw className="h-4 w-4" />
                  {isRetryableTimeout
                    ? t("dashboard.imageWorkbench.regenerate")
                    : t("dashboard.imagePlayground.toolbenchRetry")}
                </Button>
              ) : null}
              {isRetryableTimeout ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={IMAGE_PLAYGROUND_TOOLBENCH.control}
                  onClick={focusModelSelect}
                >
                  {t("dashboard.imageWorkbench.switchModel")}
                </Button>
              ) : null}
              {onSimplifyRetry && !isRetryableTimeout ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className={IMAGE_PLAYGROUND_TOOLBENCH.control}
                  onClick={onSimplifyRetry}
                >
                  {t("dashboard.imageWorkbench.simplifyRetry")}
                </Button>
              ) : null}
              <Button
                asChild
                size="sm"
                variant="outline"
                className={IMAGE_PLAYGROUND_TOOLBENCH.control}
              >
                <Link href="/dashboard/usage">
                  {t("dashboard.imageWorkbench.viewUsage")}
                </Link>
              </Button>
            </div>
            <details className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none font-medium text-foreground">
                {t("dashboard.imageWorkbench.advancedInfo")}
              </summary>
              <div className="mt-2 space-y-2">
                <div className="space-y-1 font-mono">
                  {error?.requestId ? (
                    <p>request_id: {error.requestId}</p>
                  ) : null}
                  {error?.model ? <p>model: {error.model}</p> : null}
                  {typeof error?.elapsedMs === "number" ? (
                    <p>elapsedMs: {error.elapsedMs}</p>
                  ) : null}
                  {typeof error?.retryCount === "number" ? (
                    <p>retryCount: {error.retryCount}</p>
                  ) : null}
                </div>
                {error?.requestId ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className={IMAGE_PLAYGROUND_TOOLBENCH.control}
                    onClick={() =>
                      copyText("image-error-request-id", error.requestId!)
                    }
                  >
                    {copiedId === "image-error-request-id" ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        {t("dashboard.imagePlayground.copiedRequestId")}
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        {t("dashboard.imageWorkbench.copyRequestId")}
                      </>
                    )}
                  </Button>
                ) : null}
              </div>
            </details>
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

                  {creditsCharged != null ? (
                    <p className="text-sm font-medium">
                      {formatImagePlaygroundLabel(
                        t("dashboard.imagePlayground.successCreditsCharged"),
                        { credits: formatCreditsSafe(creditsCharged) }
                      )}
                    </p>
                  ) : null}

                  {isReferenceEdit ? (
                    <p className="text-sm text-muted-foreground">
                      {t("dashboard.imagePlayground.referenceEditResultHint")}
                    </p>
                  ) : null}

                  {isReferenceEdit && onStrengthenSubjectRetry ? (
                    <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm">
                      <p className="text-muted-foreground">
                        {t("dashboard.imagePlayground.subjectDriftHint")}
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className={`mt-2 ${IMAGE_PLAYGROUND_TOOLBENCH.control}`}
                        onClick={onStrengthenSubjectRetry}
                      >
                        {t("dashboard.imagePlayground.strengthenSubjectRetry")}
                      </Button>
                    </div>
                  ) : null}

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
                    {onRetry ? (
                      <Button
                        type="button"
                        size="sm"
                        className={IMAGE_PLAYGROUND_TOOLBENCH.control}
                        onClick={onRetry}
                      >
                        <RotateCw className="h-4 w-4" />
                        {t("dashboard.imagePlayground.continueGenerate")}
                      </Button>
                    ) : null}
                  </div>

                  <details className="rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                    <summary className="cursor-pointer select-none font-medium text-foreground">
                      {t("dashboard.imagePlayground.technicalDetails")}
                    </summary>
                    <div className="mt-2 space-y-1 font-mono">
                      <p>
                        mode:{" "}
                        {result?.mode ??
                          requestMode ??
                          (referenceImageIncluded
                            ? "reference_edit"
                            : "text_to_image")}
                      </p>
                      <p>
                        reference_image_included:{" "}
                        {result?.reference_image_included === true ||
                        referenceImageIncluded ||
                        (typeof inputImagesCount === "number" &&
                          inputImagesCount > 0)
                          ? "true"
                          : "false"}
                      </p>
                      <p>
                        images_count:{" "}
                        {result?.images_count ??
                          (inputImagesCount != null ? inputImagesCount : 0)}
                      </p>
                      <p>
                        image_source_type:{" "}
                        {result?.image_source_type ?? "unknown"}
                      </p>
                      <p>
                        upstream_images_count:{" "}
                        {result?.upstream_images_count ??
                          result?.resolved_images_count ??
                          0}
                      </p>
                      <p>
                        prompt_mode: {result?.prompt_mode ?? "unknown"}
                      </p>
                      {resolvedModel ? (
                        <p>
                          {t("dashboard.imagePlayground.metaModel")}:{" "}
                          {resolvedModel}
                        </p>
                      ) : null}
                      {creditsCharged != null ? (
                        <p>
                          {formatImagePlaygroundLabel(
                            t("dashboard.imagePlayground.successCreditsCharged"),
                            { credits: formatCreditsSafe(creditsCharged) }
                          )}
                        </p>
                      ) : null}
                      {completedAt ? (
                        <p>
                          {t("dashboard.imagePlayground.metaCreatedAt")}:{" "}
                          {completedAt}
                        </p>
                      ) : null}
                      {requestId ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <p>request_id: {requestId}</p>
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
                                {t("dashboard.imageWorkbench.copyRequestId")}
                              </>
                            )}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  </details>
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
