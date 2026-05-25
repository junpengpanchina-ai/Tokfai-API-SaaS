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
import {
  TOKFAI_API_BASE_URL,
  TOKFAI_API_KEY_PLACEHOLDER,
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

const REVOKE_CONFIRM_MESSAGE =
  "Revoke this API key? Existing apps using this key will stop working.";

export function ApiKeysClient({
  accessToken,
  initialKeys,
}: {
  accessToken: string;
  initialKeys: ApiKeyListItem[];
}) {
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
    if (!window.confirm(REVOKE_CONFIRM_MESSAGE)) return;

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

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">API Keys</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create keys to authenticate requests to{" "}
          <code className="rounded bg-muted px-1 text-xs">{TOKFAI_API_BASE_URL}</code>.
          The full secret is shown once when created. Active keys can be revealed
          and copied again with{" "}
          <span className="font-medium">Copy key</span>.
        </p>
      </div>

      <IntegrationGuide />

      {oneTimeSecret ? (
        <OneTimeSecretCard
          secret={oneTimeSecret}
          keyName={createdKey?.name}
          copyStatus={copyFullKeyStatus}
          onCopy={handleCopyFullKey}
          onDismiss={dismissOneTimeSecret}
        />
      ) : null}

      <Card id="create-api-key">
        <CardHeader>
          <CardTitle>Create API key</CardTitle>
          <CardDescription>
            Optional name for your reference. Leave blank to use the default name.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={handleCreate}
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
          >
            <div className="flex flex-1 flex-col gap-2">
              <Label htmlFor="key-name">Key name</Label>
              <Input
                id="key-name"
                placeholder="e.g. production"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                disabled={creating}
                maxLength={64}
              />
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {creating ? "Creating..." : "Create API key"}
            </Button>
          </form>
          {createError ? (
            <ActionErrorAlert error={createError} className="mt-4" />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your API keys</CardTitle>
          <CardDescription>
            Prefixes are shown for identification. Use Copy key to copy the full
            secret for active keys.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {revokeError ? (
            <ActionErrorAlert error={revokeError} className="mb-4" />
          ) : null}
          {keys.length > 0 ? (
            <ApiKeysTable
              keys={keys}
              accessToken={accessToken}
              revokingId={revokingId}
              onRevoke={handleRevoke}
            />
          ) : (
            <EmptyState />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function IntegrationGuide() {
  return (
    <Card className="border-muted bg-muted/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4 shrink-0" />
          Quick start
        </CardTitle>
        <CardDescription>
          Send your key on every request to the Tokfai API.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Full secret is shown once when created.</li>
          <li>Active keys can be revealed and copied again from the list.</li>
          <li>
            Use this key in Cursor, Cherry Studio, OpenAI SDK, or curl.
          </li>
          <li>
            Legacy keys that cannot be revealed: create a new key to copy the
            full secret.
          </li>
        </ul>
        <p className="text-sm text-muted-foreground">
          Use this key in{" "}
          <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">
            Authorization: Bearer {TOKFAI_API_KEY_PLACEHOLDER}
          </code>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/docs">
              View API docs
              <ExternalLink className="h-3.5 w-3.5" />
            </Link>
          </Button>
          <Button type="button" variant="outline" size="sm" asChild>
            <Link href="/dashboard/image-playground">Try Image Playground</Link>
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
}: {
  secret: string;
  keyName?: string;
  copyStatus: "idle" | "copied";
  onCopy: () => void;
  onDismiss: () => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [secret]);

  return (
    <Card
      ref={cardRef}
      id="one-time-secret-card"
      className="border-2 border-emerald-400 bg-emerald-50 shadow-md ring-2 ring-emerald-400/30 dark:border-emerald-700 dark:bg-emerald-950/40 dark:ring-emerald-700/40"
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg text-emerald-950 dark:text-emerald-50">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
          {keyName ? `API key created: ${keyName}` : "API key created"}
        </CardTitle>
        <CardDescription className="text-base text-emerald-900/90 dark:text-emerald-100/90">
          Copy and store this key now. The full secret is shown once at creation.
          You can also copy it later from the list with Copy key.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label className="text-xs uppercase tracking-wide text-emerald-900/80 dark:text-emerald-100/80">
            Your API key
          </Label>
          <code
            id="one-time-secret"
            className="block max-h-40 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-emerald-200 bg-white p-4 font-mono text-sm leading-relaxed text-foreground dark:border-emerald-800 dark:bg-background"
          >
            {secret}
          </code>
        </div>
        <div className="flex flex-col gap-2">
          <Label className="text-xs uppercase tracking-wide text-emerald-900/80 dark:text-emerald-100/80">
            Authorization header
          </Label>
          <code className="block overflow-x-auto rounded-md border border-emerald-200 bg-white p-3 font-mono text-xs leading-relaxed text-foreground dark:border-emerald-800 dark:bg-background">
            Authorization: Bearer {secret}
          </code>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="lg" onClick={onCopy}>
            {copyStatus === "copied" ? (
              <>
                <Check className="h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy full key
              </>
            )}
          </Button>
          <Button type="button" size="lg" variant="outline" onClick={onDismiss}>
            I&apos;ve saved my key
          </Button>
          <Button type="button" size="lg" variant="ghost" asChild>
            <Link href="/docs">
              Read the docs
              <ExternalLink className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const LEGACY_KEY_MESSAGE =
  "Create a new key to copy the full secret. Legacy keys that cannot be revealed must be replaced.";

function ApiKeysTable({
  keys,
  accessToken,
  revokingId,
  onRevoke,
}: {
  keys: ApiKeyListItem[];
  accessToken: string;
  revokingId: string | null;
  onRevoke: (key: ApiKeyListItem) => void;
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
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium">Prefix</th>
            <th className="py-2 pr-4 font-medium">Status</th>
            <th className="py-2 pr-4 font-medium">Created</th>
            <th className="py-2 pr-4 font-medium">Last used</th>
            <th className="py-2 pr-0 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {copyError ? (
            <tr>
              <td colSpan={6} className="pb-3">
                <ActionErrorAlert error={copyError} />
              </td>
            </tr>
          ) : null}
          {keys.map((key) => {
            const isRevoking = revokingId === key.id;
            const isActive = key.status === "active";
            const isCopying = copyingId === key.id;
            const keyCopied = copiedKeyId === key.id;
            const canReveal = key.can_reveal !== false;

            return (
              <tr key={key.id} className="border-b last:border-0">
                <td className="py-3 pr-4 font-medium">{key.name}</td>
                <td className="py-3 pr-4">
                  <div className="flex flex-col gap-2">
                    <code className="font-mono text-xs text-muted-foreground">
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
                            Copying...
                          </>
                        ) : keyCopied ? (
                          <>
                            <Check className="h-3.5 w-3.5" />
                            Copied
                          </>
                        ) : (
                          <>
                            <Copy className="h-3.5 w-3.5" />
                            Copy key
                          </>
                        )}
                      </Button>
                    ) : isActive && !canReveal ? (
                      <p className="max-w-xs text-xs text-muted-foreground">
                        {LEGACY_KEY_MESSAGE}
                      </p>
                    ) : null}
                  </div>
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge status={key.status} />
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {formatDate(key.created_at)}
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {key.last_used_at
                    ? formatDate(key.last_used_at)
                    : "Never used"}
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
                          Revoking...
                        </>
                      ) : (
                        "Revoke"
                      )}
                    </Button>
                  ) : (
                    <span className="text-xs font-medium text-muted-foreground">
                      Revoked
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
        <div>
          <p className="text-sm text-destructive" role="alert">
            {error.message}
          </p>
          <p className="mt-1 font-mono text-xs text-muted-foreground">
            {error.method ? <>method={error.method} </> : null}
            {error.url ? (
              <>
                url={error.url}
                <br />
              </>
            ) : null}
            status={error.status} code={error.code ?? "n/a"}
            <br />
            message={error.message}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "active") return <Badge variant="success">Active</Badge>;
  if (status === "revoked") return <Badge variant="outline">Revoked</Badge>;
  return <Badge variant="outline">{status}</Badge>;
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-16 text-center">
      <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <KeyRound className="h-5 w-5" />
      </div>
      <p className="max-w-sm text-sm text-muted-foreground">
        No API keys yet. Create your first key above — the full secret is shown
        once, so copy it immediately.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button type="button" size="sm" variant="outline" asChild>
          <a href="#create-api-key">Create API key</a>
        </Button>
        <Button type="button" size="sm" variant="ghost" asChild>
          <Link href="/docs">View docs</Link>
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
      key.can_reveal ??
      (status === "active" ? true : false),
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
    return {
      message: userMessageForDashboardError(err.status, err.code, err.message),
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
