"use client";

import Link from "next/link";
import {
  Check,
  CheckCircle2,
  Copy,
  ImageIcon,
  KeyRound,
  Loader2,
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
  resolveImageCreatedAt,
} from "@/lib/image-playground-display";
import { formatCreditsPrecise, formatCreditBalanceNumber } from "@/lib/format";
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
    ? formatCreditBalanceNumber(creditsBalance ?? 0)
    : "—";
  const lowCredits = creditsLoaded && isLowCreditsBalance({
    balance: creditsBalance ?? 0,
    loaded: true,
  });
  const insufficientCredits =
    creditsLoaded &&
    estimatedCredits != null &&
    (creditsBalance ?? 0) < estimatedCredits;

  return (
    <Card className="shadow-none">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {t("dashboard.imagePlayground.toolbenchSettings")}
        </CardTitle>
        <CardDescription className="text-xs">
          {t("dashboard.imagePlayground.toolbenchSettingsDesc")}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        <div className="rounded-lg border bg-muted/30 p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-muted-foreground">
              {t("dashboard.credits.currentBalance")}
            </span>
            {lowCredits ? (
              <Badge variant="warning" className="text-[10px]">
                {t("dashboard.shell.lowCredits")}
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 font-mono text-lg font-semibold tabular-nums">
            {balanceDisplay}
          </p>
          {estimatedCredits != null ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {formatMessage(t("dashboard.imagePlayground.estimatedCost"), {
                credits: formatImageCreditsAmount(estimatedCredits, locale),
              })}
            </p>
          ) : null}
          {insufficientCredits ? (
            <p className="mt-2 text-xs font-medium text-destructive">
              {t("dashboard.imagePlayground.toolbenchInsufficientCredits")}
            </p>
          ) : null}
          <Button asChild size="sm" className="mt-3 w-full">
            <Link href="/dashboard/credits">
              <Wallet className="h-4 w-4" />
              {t("dashboard.imagePlayground.topUp")}
            </Link>
          </Button>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="toolbench-model" className="text-xs text-muted-foreground">
            {t("dashboard.imagePlayground.toolbenchModelLabel")}
          </Label>
          <select
            id="toolbench-model"
            value={model}
            onChange={(e) => onModelChange(e.target.value as ImagePlaygroundModelId)}
            disabled={loading}
            className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {IMAGE_PLAYGROUND_MODEL_IDS.map((m) => (
              <option key={m} value={m}>
                {formatImageModelSelectLabel(m, locale)}
              </option>
            ))}
          </select>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {t("dashboard.imagePlayground.toolbenchModelHint")}
          </p>
          {isModelComingSoon ? (
            <p className="text-xs font-medium text-destructive">
              {t("dashboard.imagePlayground.modelComingSoon")}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="toolbench-size" className="text-xs text-muted-foreground">
            {t("dashboard.imagePlayground.size")}
          </Label>
          <select
            id="toolbench-size"
            value={size}
            onChange={(e) => onSizeChange(e.target.value as ImagePlaygroundSize)}
            disabled={loading}
            className="flex h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
          >
            {IMAGE_PLAYGROUND_SIZES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <p className="text-xs text-muted-foreground">
          {t("dashboard.imagePlayground.toolbenchBillingNote")}
        </p>
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
  isImageToImage,
  t,
}: {
  loading: boolean;
  error: PlaygroundErrorState | null;
  result: ImageGenerationResponse | null;
  completedAt: string | null;
  inputImagesCount: number | null | undefined;
  isImageToImage: boolean;
  t: (key: string) => string;
}) {
  const { copiedId, copyText } = useCopyToClipboard();
  const resultCardClass = "shadow-none w-full";

  if (loading) {
    return (
      <Card className={resultCardClass}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("dashboard.imagePlayground.resultTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t("dashboard.imagePlayground.generatingImage")}
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={resultCardClass}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("dashboard.imagePlayground.resultTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <PlaygroundErrorPanel scope="imagePlayground" error={error} t={t} />
          <p className="text-xs text-muted-foreground">
            {t("dashboard.imagePlayground.errors.billingNotChargedHint")}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!result) {
    return (
      <Card className={resultCardClass}>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t("dashboard.imagePlayground.resultTitle")}</CardTitle>
          <CardDescription className="text-xs">
            {t("dashboard.imagePlayground.toolbenchResultEmptyDesc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex min-h-[min(360px,52vh)] flex-col items-center justify-center gap-3 rounded-lg border border-dashed bg-muted/20 px-4 py-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/60">
              <ImageIcon className="h-8 w-8 text-muted-foreground/70" />
            </div>
            <p className="text-sm font-medium text-foreground">
              {t("dashboard.imagePlayground.toolbenchResultPlaceholder")}
            </p>
            <p className="max-w-sm text-xs text-muted-foreground">
              {isImageToImage
                ? t("dashboard.imagePlayground.imageToImageHint")
                : t("dashboard.imagePlayground.toolbenchResultSampleHint")}
            </p>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              <Badge variant="secondary">{t("dashboard.imagePlayground.textToImage")}</Badge>
              <Badge variant="outline">{t("dashboard.imagePlayground.imageToImage")}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const imageUrl = resolveGeneratedImageUrl(result);
  const base64Only = !imageUrl && hasGeneratedImageBase64(result);
  const creditsCharged = resolveResultCredits(result);
  const requestId = result.request_id ?? null;
  const requestCopyId = "image-result-request-id";

  return (
    <Card className={`${resultCardClass} border-emerald-500/20`}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          {t("dashboard.imagePlayground.resultTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {imageUrl ? (
          <div className="overflow-hidden rounded-lg border bg-muted/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Generated image"
              className="mx-auto max-h-[min(420px,60vh)] w-full object-contain"
            />
          </div>
        ) : base64Only ? (
          <p className="text-sm text-muted-foreground">
            {t("dashboard.imagePlayground.base64OnlyHint")}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 text-sm">
          {creditsCharged != null ? (
            <Badge variant="secondary">
              {formatMessage(t("dashboard.imagePlayground.successCreditsCharged"), {
                credits: formatCreditsPrecise(creditsCharged),
              })}
            </Badge>
          ) : null}
          {requestId ? (
            <code className="max-w-full truncate rounded bg-muted px-2 py-0.5 font-mono text-xs">
              {requestId}
            </code>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          {requestId ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => copyText(requestCopyId, requestId)}
            >
              {copiedId === requestCopyId ? (
                <>
                  <Check className="h-4 w-4" />
                  {t("dashboard.imagePlayground.copiedRequestId")}
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  {t("dashboard.imagePlayground.copyRequestId")}
                </>
              )}
            </Button>
          ) : null}
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/usage">{t("dashboard.imagePlayground.viewUsage")}</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/credits">{t("dashboard.imagePlayground.viewCredits")}</Link>
          </Button>
        </div>

        {completedAt ? (
          <p className="text-xs text-muted-foreground">
            {t("dashboard.imagePlayground.metaCreatedAt")}: {completedAt}
            {inputImagesCount != null ? ` · ${inputImagesCount} input(s)` : ""}
          </p>
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
