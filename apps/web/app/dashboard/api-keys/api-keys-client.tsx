"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  BookOpen,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  Plus,
  ShieldAlert,
} from "lucide-react";

import { ResponsiveTableScroll } from "@/components/responsive-table-scroll";
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
  getDmitBaseUrl,
  ME_API_KEYS_PATH,
  ME_API_KEYS_REVEAL_PATH,
  ME_API_KEYS_REVOKE_PATH,
  revealMeApiKey,
  revokeApiKey,
  type CreateApiKeyResponse,
  type MeApiKeyMetadata,
} from "@/lib/dmit/client";
import { isFullTokfaiApiKey } from "@/lib/tokfai-api";
import {
  userMessageForDashboardError,
  userMessageForDmitError,
} from "@/lib/dmit-messages";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { formatMessage } from "@/lib/i18n/messages";
import { DashboardFirstRunOnboardingCard } from "@/components/dashboard-first-run-onboarding";
import { CopyableSnippetField } from "@/components/copyable-snippet-field";
import {
  authorizationHeader,
  chatCompletionsCurl,
} from "@/lib/customer-integration-snippets";
import {
  TOKFAI_API_BASE_URL,
  TOKFAI_API_KEY_PLACEHOLDER,
  TOKFAI_RECOMMENDED_MODEL,
} from "@/lib/tokfai-api";

export interface ApiKeyListItem {
  id: string;
  name: string;
  prefix: string;
  status: "active" | "revoked" | string;
  created_at: string;
  last_used_at: string | null;
  revoked_at?: string | null;
  can_reveal?: boolean;
}

interface ActionErrorState {
  message: string;
  status: number;
  code?: string;
  method?: string;
  url?: string;
}

const LEGACY_KEY_MESSAGE_KEY = "dashboard.apiKeys.fullKeyUnavailable";

export function ApiKeysClient({
  accessToken,
  initialKeys,
  listLoadFailed = false,
  listLoadError,
}: {
  accessToken: string;
  initialKeys: ApiKeyListItem[];
  listLoadFailed?: boolean;
  listLoadError?: {
    message?: string;
    code?: string;
    httpStatus?: number;
  };
}) {
  const { t } = useI18n();
  const [keys, setKeys] = useState<ApiKeyListItem[]>(initialKeys);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<ActionErrorState | null>(null);
  const [revokeError, setRevokeError] = useState<ActionErrorState | null>(null);
  /** Full secret — React state only; never persisted. */
  const [oneTimeSecret, setOneTimeSecret] = useState<string | null>(null);
  const [createdKey, setCreatedKey] = useState<MeApiKeyMetadata | null>(null);
  const [copyFullKeyStatus, setCopyFullKeyStatus] = useState<"idle" | "copied">(
    "idle"
  );
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;

    setCreating(true);
    setCreateError(null);
    setRevokeError(null);

    try {
      const trimmed = newName.trim();
      const result = await createApiKey(
        trimmed ? { name: trimmed } : {},
        { accessToken }
      );
      setOneTimeSecret(result.secret);
      setCreatedKey(result.api_key);
      setCopyFullKeyStatus("idle");
      applyCreateResult(result);
      setNewName("");
    } catch (err) {
      setCreateError(
        toActionError(err, {
          method: "POST",
          url: dmitUrl(ME_API_KEYS_PATH),
        })
      );
    } finally {
      setCreating(false);
    }
  }

  function applyCreateResult(result: CreateApiKeyResponse) {
    const listItem = meKeyToListItem(result.api_key);
    setKeys((prev) => {
      const without = prev.filter((k) => k.id !== listItem.id);
      return [listItem, ...without];
    });
  }

  async function handleRevoke(key: ApiKeyListItem) {
    if (key.status === "revoked" || revokingId) return;
    if (!window.confirm(t("dashboard.apiKeys.revokeConfirm"))) return;

    setRevokingId(key.id);
    setRevokeError(null);

    try {
      const res = await revokeApiKey(key.id, { accessToken });
      const revokedAt = res.data.revoked_at || new Date().toISOString();
      const updated: ApiKeyListItem = {
        ...key,
        status: "revoked",
        revoked_at: revokedAt,
        can_reveal: false,
      };
      setKeys((prev) =>
        prev.map((row) => (row.id === key.id ? updated : row))
      );
    } catch (err) {
      setRevokeError(toRevokeActionError(err));
    } finally {
      setRevokingId(null);
    }
  }

  async function handleCopyFullKey() {
    if (!oneTimeSecret) return;
    try {
      await navigator.clipboard.writeText(oneTimeSecret);
      setCopyFullKeyStatus("copied");
      window.setTimeout(() => setCopyFullKeyStatus("idle"), 2000);
    } catch {
      setCopyFullKeyStatus("idle");
    }
  }

  function dismissOneTimeSecret() {
    setOneTimeSecret(null);
    setCreatedKey(null);
    setCopyFullKeyStatus("idle");
  }

  const hasActiveApiKey = keys.some((k) => k.status === "active");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          {t("dashboard.apiKeys.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {formatMessage(t("dashboard.apiKeys.subtitleCreate"), {
            baseUrl: TOKFAI_API_BASE_URL,
          })}
        </p>
      </div>

      <DashboardFirstRunOnboardingCard
        variant="apiKeys"
        hasActiveApiKey={hasActiveApiKey}
      />

      <SecurityGuide t={t} />

      <IntegrationGuide t={t} />

      {oneTimeSecret ? (
        <OneTimeSecretCard
          secret={oneTimeSecret}
          keyName={createdKey?.name}
          copyStatus={copyFullKeyStatus}
          onCopy={handleCopyFullKey}
          onDismiss={dismissOneTimeSecret}
          t={t}
        />
      ) : null}

      <Card id="create-api-key">
        <CardHeader>
          <CardTitle>{t("dashboard.apiKeys.createApiKey")}</CardTitle>
          <CardDescription>{t("dashboard.apiKeys.createApiKeyDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleCreate}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="key-name">{t("dashboard.apiKeys.keyName")}</Label>
              <Input
                id="key-name"
                placeholder={t("dashboard.apiKeys.keyNamePlaceholder")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={creating}
                maxLength={64}
              />
            </div>
            <Button type="submit" className="w-full sm:w-auto" disabled={creating}>
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {creating ? t("dashboard.apiKeys.creating") : t("dashboard.apiKeys.createApiKey")}
            </Button>
          </form>
          {createError ? (
            <ActionErrorAlert error={createError} className="mt-4" />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("dashboard.apiKeys.yourApiKeys")}</CardTitle>
          <CardDescription>{t("dashboard.apiKeys.yourApiKeysDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          {listLoadFailed ? (
            <ActionErrorAlert
              error={{
                message:
                  listLoadError?.message ??
                  t("dashboard.apiKeys.loadErrorTempDesc"),
                status: listLoadError?.httpStatus ?? 500,
                code: listLoadError?.code,
              }}
              className="mb-4"
            />
          ) : null}
          {revokeError ? (
            <ActionErrorAlert error={revokeError} className="mb-4" />
          ) : null}
          {keys.length > 0 ? (
            <ApiKeysTable
              keys={keys}
              accessToken={accessToken}
              revokingId={revokingId}
              onRevoke={handleRevoke}
              t={t}
            />
          ) : listLoadFailed ? null : (
            <EmptyState t={t} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SecurityGuide({ t }: { t: (key: string) => string }) {
  return (
    <Card className="border-amber-300/60 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-600" />
          {t("dashboard.apiKeys.securityTitle")}
        </CardTitle>
        <CardDescription>{t("dashboard.apiKeys.securityDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>{t("dashboard.apiKeys.securityItem1")}</li>
          <li>{t("dashboard.apiKeys.securityItem2")}</li>
          <li>{t("dashboard.apiKeys.securityItem3")}</li>
        </ul>
      </CardContent>
    </Card>
  );
}

function IntegrationGuide({ t }: { t: (key: string) => string }) {
  return (
    <Card className="border-muted bg-muted/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4 shrink-0" />
          {t("dashboard.apiKeys.quickStart")}
        </CardTitle>
        <CardDescription>{t("dashboard.apiKeys.quickStartDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>{t("dashboard.apiKeys.quickStartItem1")}</li>
          <li>{t("dashboard.apiKeys.quickStartItem2")}</li>
          <li>{t("dashboard.apiKeys.quickStartItem3")}</li>
          <li>{t("dashboard.apiKeys.quickStartItem4")}</li>
        </ul>
        <p className="text-sm text-muted-foreground">
          {t("dashboard.apiKeys.authHeaderHint")}{" "}
          <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">
            Authorization: Bearer {TOKFAI_API_KEY_PLACEHOLDER}
          </code>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/dashboard/docs">
              {t("dashboard.apiKeys.viewApiDocs")}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/dashboard/playground">
              {t("dashboard.apiKeys.tryChatPlayground")}
            </Link>
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/dashboard/docs#cursor-integration">
              {t("dashboard.apiKeys.cursorGuide")}
            </Link>
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/dashboard/docs#cherry-studio">
              {t("dashboard.apiKeys.cherryStudioGuide")}
            </Link>
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/dashboard/image-playground">
              {t("dashboard.apiKeys.tryImagePlayground")}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function OneTimeSecretCard({
  secret,
  keyName,
  copyStatus,
  onCopy,
  onDismiss,
  t,
}: {
  secret: string;
  keyName?: string;
  copyStatus: "idle" | "copied";
  onCopy: () => void;
  onDismiss: () => void;
  t: (key: string) => string;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [snippetCopiedId, setSnippetCopiedId] = useState<string | null>(null);
  const curlExample = chatCompletionsCurl(secret, TOKFAI_RECOMMENDED_MODEL);
  const authHeaderValue = authorizationHeader(secret);

  useEffect(() => {
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [secret]);

  async function handleSnippetCopy(id: string, value: string) {
    const ok = await copyToClipboard(value);
    if (ok) {
      setSnippetCopiedId(id);
      window.setTimeout(() => setSnippetCopiedId(null), 2000);
    }
  }

  return (
    <Card
      ref={cardRef}
      id="one-time-secret-card"
      className="border-2 border-emerald-400 bg-emerald-50 shadow-md ring-2 ring-emerald-400/30 dark:border-emerald-700 dark:bg-emerald-950/40 dark:ring-emerald-700/40"
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-emerald-950 dark:text-emerald-50">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          {keyName
            ? formatMessage(t("dashboard.apiKeys.apiKeyCreatedNamed"), {
                name: keyName,
              })
            : t("dashboard.apiKeys.apiKeyCreated")}
        </CardTitle>
        <CardDescription className="text-sm text-emerald-900/90 dark:text-emerald-100/90">
          {t("dashboard.apiKeys.oneTimeSecretDesc")}
        </CardDescription>
        <p className="text-sm text-emerald-900/80 dark:text-emerald-100/80">
          {t("dashboard.apiKeys.nextStepsHint")}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label className="text-xs uppercase tracking-wide text-emerald-900/80 dark:text-emerald-100/80">
            {t("dashboard.apiKeys.yourApiKey")}
          </Label>
          <code
            id="one-time-secret"
            className="block max-h-40 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-emerald-200 bg-white p-4 font-mono text-sm leading-relaxed text-foreground dark:border-emerald-800 dark:bg-background"
          >
            {secret}
          </code>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <CopyableSnippetField
            label={t("dashboard.apiKeys.baseUrlLabel")}
            value={TOKFAI_API_BASE_URL}
            copyId="base-url"
            copiedId={snippetCopiedId}
            onCopy={handleSnippetCopy}
            copyLabel={t("dashboard.apiKeys.copyBaseUrl")}
            copiedLabel={t("dashboard.apiKeys.copied")}
            className="[&_code]:border-emerald-200 [&_code]:bg-white dark:[&_code]:border-emerald-800 dark:[&_code]:bg-background"
          />
          <div className="flex flex-col gap-2">
            <Label className="text-xs uppercase tracking-wide text-emerald-900/80 dark:text-emerald-100/80">
              {t("dashboard.apiKeys.recommendedModelLabel")}
            </Label>
            <code className="block rounded-md border border-emerald-200 bg-white p-3 font-mono text-xs dark:border-emerald-800 dark:bg-background">
              {TOKFAI_RECOMMENDED_MODEL}
            </code>
          </div>
        </div>
        <CopyableSnippetField
          label={t("dashboard.apiKeys.authorizationHeader")}
          value={authHeaderValue}
          copyId="auth-header"
          copiedId={snippetCopiedId}
          onCopy={handleSnippetCopy}
          copyLabel={t("dashboard.apiKeys.copyAuthHeader")}
          copiedLabel={t("dashboard.apiKeys.copied")}
          className="[&_code]:border-emerald-200 [&_code]:bg-white dark:[&_code]:border-emerald-800 dark:[&_code]:bg-background"
        />
        <CopyableSnippetField
          label={t("dashboard.apiKeys.curlExampleLabel")}
          value={curlExample}
          copyId="curl-test"
          copiedId={snippetCopiedId}
          onCopy={handleSnippetCopy}
          copyLabel={t("dashboard.apiKeys.copyCurl")}
          copiedLabel={t("dashboard.apiKeys.copied")}
          className="[&_code]:max-h-48 [&_code]:whitespace-pre-wrap [&_code]:break-all [&_code]:border-emerald-200 [&_code]:bg-white dark:[&_code]:border-emerald-800 dark:[&_code]:bg-background"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button type="button" className="w-full sm:w-auto" onClick={onCopy}>
            {copyStatus === "copied" ? (
              <>
                <Check className="h-4 w-4" />
                {t("dashboard.apiKeys.copied")}
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                {t("dashboard.apiKeys.copyFullKey")}
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            onClick={onDismiss}
          >
            {t("dashboard.apiKeys.savedMyKey")}
          </Button>
          <Button type="button" variant="outline" className="w-full sm:w-auto" asChild>
            <Link href="/dashboard/playground">
              {t("dashboard.apiKeys.tryChatPlayground")}
            </Link>
          </Button>
          <Button type="button" variant="outline" className="w-full sm:w-auto" asChild>
            <Link href="/dashboard/docs">
              {t("dashboard.apiKeys.viewDocs")}
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button type="button" variant="outline" className="w-full sm:w-auto" asChild>
            <Link href="/dashboard/docs#cursor-integration">
              {t("dashboard.apiKeys.cursorGuide")}
            </Link>
          </Button>
          <Button type="button" variant="outline" className="w-full sm:w-auto" asChild>
            <Link href="/dashboard/docs#cherry-studio">
              {t("dashboard.apiKeys.cherryStudioGuide")}
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function ApiKeysTable({
  keys,
  accessToken,
  revokingId,
  onRevoke,
  t,
}: {
  keys: ApiKeyListItem[];
  accessToken: string;
  revokingId: string | null;
  onRevoke: (key: ApiKeyListItem) => void;
  t: (key: string) => string;
}) {
  const [copyingId, setCopyingId] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<ActionErrorState | null>(null);

  async function handleCopyKey(key: ApiKeyListItem) {
    if (key.status !== "active" || copyingId) return;

    setCopyingId(key.id);
    setCopyError(null);

    try {
      const secret = await revealMeApiKey(key.id, { accessToken });
      if (!isFullTokfaiApiKey(secret)) {
        throw new DmitApiError({
          status: 500,
          message:
            "The server returned an incomplete key. Create a new key to copy the full secret.",
          code: "invalid_reveal_secret",
          requestMethod: "POST",
          requestUrl: dmitUrl(ME_API_KEYS_REVEAL_PATH),
        });
      }
      const ok = await copyToClipboard(secret);
      if (ok) {
        setCopiedKeyId(key.id);
        window.setTimeout(() => setCopiedKeyId(null), 2000);
      }
    } catch (err) {
      setCopyError(
        toActionError(err, {
          method: "POST",
          url: dmitUrl(ME_API_KEYS_REVEAL_PATH),
        })
      );
    } finally {
      setCopyingId(null);
    }
  }

  return (
    <ResponsiveTableScroll>
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-4 font-medium">{t("dashboard.apiKeys.colName")}</th>
            <th className="py-2 pr-4 font-medium">{t("dashboard.apiKeys.colPrefix")}</th>
            <th className="py-2 pr-4 font-medium">{t("dashboard.apiKeys.colStatus")}</th>
            <th className="py-2 pr-4 font-medium">{t("dashboard.apiKeys.colCreated")}</th>
            <th className="py-2 pr-4 font-medium">{t("dashboard.apiKeys.colLastUsed")}</th>
            <th className="py-2 pr-4 font-medium">{t("dashboard.apiKeys.colRevokedAt")}</th>
            <th className="py-2 pr-0 text-right font-medium">{t("dashboard.apiKeys.colActions")}</th>
          </tr>
        </thead>
        <tbody>
          {copyError ? (
            <tr>
              <td colSpan={7} className="pb-3">
                <ActionErrorAlert error={copyError} />
              </td>
            </tr>
          ) : null}
          {keys.map((key) => {
            const isRevoking = revokingId === key.id;
            const isActive = key.status === "active";
            const isCopying = copyingId === key.id;
            const keyCopied = copiedKeyId === key.id;
            const canReveal = key.can_reveal === true;

            return (
              <tr key={key.id} className="border-b last:border-0">
                <td className="py-3 pr-4 font-medium">{key.name}</td>
                <td className="py-3 pr-4">
                  <div className="flex flex-col gap-2">
                    <code
                      className="font-mono text-xs text-muted-foreground"
                      title={key.prefix || undefined}
                    >
                      {key.prefix || "—"}
                    </code>
                    {isActive && canReveal ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 w-fit px-2"
                        disabled={copyingId != null}
                        onClick={() => handleCopyKey(key)}
                      >
                        {isCopying ? (
                          <>
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            {t("dashboard.apiKeys.copying")}
                          </>
                        ) : keyCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            {t("dashboard.apiKeys.copied")}
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            {t("dashboard.apiKeys.copyKey")}
                          </>
                        )}
                      </Button>
                    ) : isActive && !canReveal ? (
                      <p className="max-w-xs text-xs text-muted-foreground">
                        {t(LEGACY_KEY_MESSAGE_KEY)}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge status={key.status} t={t} />
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {formatDate(key.created_at)}
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {key.last_used_at
                    ? formatDate(key.last_used_at)
                    : t("dashboard.apiKeys.neverUsed")}
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {key.revoked_at
                    ? formatDate(key.revoked_at)
                    : "—"}
                </td>
                <td className="py-3 pr-0 text-right">
                  {isActive ? (
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      disabled={revokingId != null}
                      onClick={() => onRevoke(key)}
                    >
                      {isRevoking ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          {t("dashboard.apiKeys.revoking")}
                        </>
                      ) : (
                        t("dashboard.apiKeys.revoke")
                      )}
                    </Button>
                  ) : (
                    <span className="text-xs font-medium text-muted-foreground">
                      {t("dashboard.apiKeys.revoked")}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ResponsiveTableScroll>
  );
}

function ActionErrorAlert({
  error,
  className,
}: {
  error: ActionErrorState;
  className?: string;
}) {
  return (
    <Card className={`border-destructive/30 bg-destructive/5 ${className ?? ""}`}>
      <CardContent className="flex items-start gap-2 pt-4">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <p className="text-sm text-destructive" role="alert">
          {error.message}
        </p>
      </CardContent>
    </Card>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: string;
  t: (key: string) => string;
}) {
  if (status === "active") {
    return <Badge variant="success">{t("dashboard.apiKeys.active")}</Badge>;
  }
  if (status === "revoked") {
    return <Badge variant="outline">{t("dashboard.apiKeys.revoked")}</Badge>;
  }
  return <Badge variant="outline">{status}</Badge>;
}

function EmptyState({ t }: { t: (key: string) => string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-16 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <KeyRound className="h-5 w-5" />
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">
        {t("dashboard.apiKeys.emptyTitle")}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" size="sm" asChild>
          <a href="#create-api-key">{t("dashboard.apiKeys.emptyCreateFirst")}</a>
        </Button>
        <Button type="button" size="sm" variant="outline" asChild>
          <Link href="/pricing">{t("dashboard.apiKeys.emptyRecharge")}</Link>
        </Button>
        <Button type="button" size="sm" variant="ghost" asChild>
          <Link href="/dashboard/docs">{t("dashboard.apiKeys.viewDocs")}</Link>
        </Button>
      </div>
    </div>
  );
}

type MeKeyLike = {
  id: string;
  name: string;
  status: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at?: string | null;
  prefix?: string;
  can_reveal?: boolean;
};

function meKeyToListItem(key: MeKeyLike): ApiKeyListItem {
  const status = key.revoked_at ? "revoked" : key.status;
  return {
    id: key.id,
    name: key.name,
    prefix: key.prefix ?? "",
    status,
    created_at: key.created_at,
    last_used_at: key.last_used_at,
    revoked_at: key.revoked_at ?? null,
    can_reveal:
      key.can_reveal === true && status === "active",
  };
}

function toRevokeActionError(err: unknown): ActionErrorState {
  const base = toActionError(err, {
    method: "POST",
    url: dmitUrl(ME_API_KEYS_REVOKE_PATH),
  });
  if (base.method && base.url) return base;
  return {
    ...base,
    method: base.method ?? "POST",
    url: base.url ?? dmitUrl(ME_API_KEYS_REVOKE_PATH),
  };
}

function dmitUrl(path: string): string {
  return `${getDmitBaseUrl()}${path}`;
}

function toActionError(
  err: unknown,
  fallback?: { method: string; url: string }
): ActionErrorState {
  if (err instanceof DmitApiError) {
    const detail =
      err.code && err.message
        ? `${err.message} (${err.code})`
        : err.message;
    return {
      message: userMessageForDashboardError(err.status, err.code, detail),
      status: err.status,
      code: err.code,
      method: err.requestMethod ?? fallback?.method,
      url: err.requestUrl ?? fallback?.url,
    };
  }
  if (err instanceof Error) {
    return {
      message: userMessageForDmitError(0, undefined, err.message),
      status: 0,
      method: fallback?.method,
      url: fallback?.url,
    };
  }
  return {
    message: userMessageForDashboardError(500),
    status: 500,
    method: fallback?.method,
    url: fallback?.url,
  };
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
