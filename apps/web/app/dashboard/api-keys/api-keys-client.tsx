"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Copy,
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
  revealMeApiKey,
  revokeApiKey,
  type CreateApiKeyResponse,
  type MeApiKeyMetadata,
} from "@/lib/dmit/client";
import {
  userMessageForDashboardError,
  userMessageForDmitError,
} from "@/lib/dmit-messages";
import { TOKFAI_API_BASE_URL } from "@/lib/tokfai-api";

export interface ApiKeyListItem {
  id: string;
  name: string;
  key_prefix: string;
  status: "active" | "revoked" | string;
  created_at: string;
  last_used_at: string | null;
  revoked_at?: string | null;
  can_reveal: boolean;
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
  const [copiedFullKeyId, setCopiedFullKeyId] = useState<string | null>(null);
  const [revealingId, setRevealingId] = useState<string | null>(null);
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
          url: `${getDmitBaseUrl()}/v1/me/api-keys`,
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

  async function handleRevealAndCopy(key: ApiKeyListItem) {
    if (key.status !== "active" || !key.can_reveal || revealingId) return;

    setRevealingId(key.id);
    setRevokeError(null);

    try {
      const secret = await revealMeApiKey(key.id, { accessToken });
      const ok = await copyToClipboard(secret);
      if (ok) {
        setCopiedFullKeyId(key.id);
        window.setTimeout(() => setCopiedFullKeyId(null), 2000);
      }
    } catch (err) {
      setRevokeError(
        toActionError(err, {
          method: "POST",
          url: `${getDmitBaseUrl()}/v1/me/api-keys/${encodeURIComponent(
            key.id
          )}/reveal`,
        })
      );
    } finally {
      setRevealingId(null);
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
      {oneTimeSecret ? (
        <OneTimeSecretCard
          secret={oneTimeSecret}
          keyName={createdKey?.name}
          copyStatus={copyFullKeyStatus}
          onCopy={handleCopyFullKey}
          onDismiss={dismissOneTimeSecret}
        />
      ) : null}

      <div>
        <h1 className="text-3xl font-semibold tracking-tight">API Keys</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create keys to authenticate against{" "}
          <code className="rounded bg-muted px-1 text-xs">{TOKFAI_API_BASE_URL}</code>.
          Full active keys can be copied again while encrypted storage is available.
        </p>
      </div>

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
            Prefixes are safe labels. Use Copy full key for active keys that can
            still be revealed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {revokeError ? (
            <ActionErrorAlert error={revokeError} className="mb-4" />
          ) : null}
          {keys.length > 0 ? (
            <ApiKeysTable
              keys={keys}
              copiedFullKeyId={copiedFullKeyId}
              revealingId={revealingId}
              revokingId={revokingId}
              onRevealAndCopy={handleRevealAndCopy}
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
          This key is shown only once. Copy it now.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <code
          id="one-time-secret"
          className="block max-h-40 overflow-x-auto whitespace-pre-wrap break-all rounded-md border border-emerald-200 bg-white p-4 font-mono text-sm leading-relaxed text-foreground dark:border-emerald-800 dark:bg-background"
        >
          {secret}
        </code>
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
        </div>
      </CardContent>
    </Card>
  );
}

function ApiKeysTable({
  keys,
  copiedFullKeyId,
  revealingId,
  revokingId,
  onRevealAndCopy,
  onRevoke,
}: {
  keys: ApiKeyListItem[];
  copiedFullKeyId: string | null;
  revealingId: string | null;
  revokingId: string | null;
  onRevealAndCopy: (key: ApiKeyListItem) => void;
  onRevoke: (key: ApiKeyListItem) => void;
}) {
  const [copiedPrefixId, setCopiedPrefixId] = useState<string | null>(null);

  async function handleCopyPrefix(key: ApiKeyListItem) {
    const ok = await copyToClipboard(key.key_prefix);
    if (ok) {
      setCopiedPrefixId(key.id);
      window.setTimeout(() => setCopiedPrefixId(null), 2000);
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
            <th className="py-2 pr-4 font-medium">Last used</th>
            <th className="py-2 pr-4 font-medium">Created</th>
            <th className="py-2 pr-4 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => {
            const isRevoking = revokingId === key.id;
            const isRevealing = revealingId === key.id;
            const isActive = key.status === "active";
            return (
              <tr key={key.id} className="border-b last:border-0">
                <td className="py-3 pr-4 font-medium">{key.name}</td>
                <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                  {key.key_prefix}
                </td>
                <td className="py-3 pr-4">
                  <StatusBadge status={key.status} />
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {key.last_used_at ? formatDate(key.last_used_at) : "Never"}
                </td>
                <td className="py-3 pr-4 text-muted-foreground">
                  {formatDate(key.created_at)}
                </td>
                <td className="py-3 pr-0 text-right">
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleCopyPrefix(key)}
                    >
                      {copiedPrefixId === key.id ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          Copy prefix
                        </>
                      )}
                    </Button>
                    {isActive ? (
                      <>
                        {key.can_reveal ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={revealingId != null}
                            onClick={() => onRevealAndCopy(key)}
                          >
                            {isRevealing ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Copying...
                              </>
                            ) : copiedFullKeyId === key.id ? (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                Copied
                              </>
                            ) : (
                              <>
                                <Copy className="h-3.5 w-3.5" />
                                Reveal / Copy full key
                              </>
                            )}
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled
                            title="This key cannot be revealed. Please create a new one."
                          >
                            Secret unavailable
                          </Button>
                        )}
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
                      </>
                    ) : (
                      <span className="text-xs font-medium text-muted-foreground">
                        Revoked
                      </span>
                    )}
                  </div>
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
        No API keys yet. Create your first key above, then use it from the
        creation card or copy it later from this list.
      </p>
      <Button type="button" size="sm" variant="outline" asChild>
        <a href="#create-api-key">Create API key</a>
      </Button>
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
  key_prefix?: string;
  can_reveal?: boolean;
};

function meKeyToListItem(key: MeKeyLike): ApiKeyListItem {
  return {
    id: key.id,
    name: key.name,
    key_prefix: key.key_prefix ?? key.prefix ?? "",
    status: key.revoked_at ? "revoked" : key.status,
    created_at: key.created_at,
    last_used_at: key.last_used_at,
    revoked_at: key.revoked_at ?? null,
    can_reveal: Boolean(key.can_reveal && !key.revoked_at),
  };
}

function toRevokeActionError(err: unknown): ActionErrorState {
  const base = toActionError(err, {
    method: "POST",
    url: `${getDmitBaseUrl()}/v1/me/api-keys/revoke`,
  });
  if (base.method && base.url) return base;
  return {
    ...base,
    method: base.method ?? "POST",
    url:
      base.url ??
      `${getDmitBaseUrl()}/v1/me/api-keys/revoke`,
  };
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
