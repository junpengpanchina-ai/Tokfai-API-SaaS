"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  Trash2,
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
  listApiKeys,
  revokeApiKey,
  type ApiKey,
  type ApiKeyWithSecret,
} from "@/lib/dmit/client";

type ListState =
  | { status: "loading" }
  | { status: "ready"; keys: ApiKey[] }
  | { status: "error"; message: string };

export function ApiKeysClient({ accessToken }: { accessToken: string }) {
  const router = useRouter();
  const [list, setList] = useState<ListState>({ status: "loading" });

  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [revealed, setRevealed] = useState<ApiKeyWithSecret | null>(null);
  const [copied, setCopied] = useState(false);

  const [revokingId, setRevokingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setList({ status: "loading" });
    try {
      const keys = await listApiKeys({ accessToken });
      setList({ status: "ready", keys });
    } catch (err) {
      if (err instanceof DmitApiError && err.isAuth) {
        router.replace("/login?redirect=%2Fdashboard%2Fapi-keys");
        return;
      }
      setList({ status: "error", message: formatError(err) });
    }
  }, [accessToken, router]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;
    const name = newName.trim();
    if (!name) {
      setCreateError("Name is required.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    setCopied(false);
    try {
      const created = await createApiKey({ name }, { accessToken });
      setRevealed(created);
      setNewName("");
      await load();
    } catch (err) {
      if (err instanceof DmitApiError && err.isAuth) {
        router.replace("/login?redirect=%2Fdashboard%2Fapi-keys");
        return;
      }
      setCreateError(formatError(err));
    } finally {
      setCreating(false);
    }
  }

  async function handleRevoke(key: ApiKey) {
    const ok = window.confirm(
      `Revoke "${key.name}"? Any traffic using this key will start failing immediately.`
    );
    if (!ok) return;

    setRevokingId(key.id);
    try {
      await revokeApiKey(key.id, { accessToken });
      await load();
    } catch (err) {
      if (err instanceof DmitApiError && err.isAuth) {
        router.replace("/login?redirect=%2Fdashboard%2Fapi-keys");
        return;
      }
      window.alert(`Revoke failed: ${formatError(err)}`);
    } finally {
      setRevokingId(null);
    }
  }

  async function handleCopy() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Some browsers (or insecure contexts) block clipboard. Fall back to
      // selecting the text so the user can copy manually.
      const el = document.getElementById("revealed-key") as HTMLInputElement | null;
      el?.select();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">API Keys</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create keys to authenticate against{" "}
            <code className="rounded bg-muted px-1 text-xs">
              api.tokfai.com
            </code>
            .
          </p>
        </div>
      </div>

      {revealed ? (
        <RevealedKeyBanner
          revealed={revealed}
          copied={copied}
          onCopy={handleCopy}
          onDismiss={() => {
            setRevealed(null);
            setCopied(false);
          }}
        />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Create a new key</CardTitle>
          <CardDescription>
            Give it a name you&apos;ll recognise. You&apos;ll see the full
            secret exactly once.
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
                required
              />
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {creating ? "Creating…" : "Create key"}
            </Button>
          </form>
          {createError ? (
            <p className="mt-3 text-sm text-destructive" role="alert">
              {createError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your keys</CardTitle>
          <CardDescription>
            Active <code>sk-tokfai-...</code> tokens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <KeyList state={list} revokingId={revokingId} onRevoke={handleRevoke} />
        </CardContent>
      </Card>
    </div>
  );
}

function KeyList({
  state,
  revokingId,
  onRevoke,
}: {
  state: ListState;
  revokingId: string | null;
  onRevoke: (key: ApiKey) => void;
}) {
  if (state.status === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading keys…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 py-12 text-center">
        <AlertTriangle className="h-5 w-5 text-destructive" />
        <p className="text-sm font-medium">Could not load API keys</p>
        <p className="max-w-md text-xs text-muted-foreground">{state.message}</p>
      </div>
    );
  }

  if (state.keys.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-md border border-dashed py-16 text-center">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground">
          <KeyRound className="h-5 w-5" />
        </div>
        <p className="text-sm text-muted-foreground">
          No keys yet. Create one above to start calling the API.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
            <th className="py-2 pr-4 font-medium">Name</th>
            <th className="py-2 pr-4 font-medium">Prefix</th>
            <th className="py-2 pr-4 font-medium">Last used</th>
            <th className="py-2 pr-4 font-medium">Created</th>
            <th className="py-2 pr-2 text-right font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {state.keys.map((key) => (
            <tr key={key.id} className="border-b last:border-0">
              <td className="py-3 pr-4 font-medium">{key.name}</td>
              <td className="py-3 pr-4 font-mono text-xs text-muted-foreground">
                {key.prefix}…
              </td>
              <td className="py-3 pr-4 text-muted-foreground">
                {key.last_used_at ? (
                  formatDate(key.last_used_at)
                ) : (
                  <Badge variant="outline">Never</Badge>
                )}
              </td>
              <td className="py-3 pr-4 text-muted-foreground">
                {formatDate(key.created_at)}
              </td>
              <td className="py-3 pr-2 text-right">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => onRevoke(key)}
                  disabled={revokingId === key.id}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                >
                  {revokingId === key.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                  Revoke
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RevealedKeyBanner({
  revealed,
  copied,
  onCopy,
  onDismiss,
}: {
  revealed: ApiKeyWithSecret;
  copied: boolean;
  onCopy: () => void;
  onDismiss: () => void;
}) {
  return (
    <Card className="border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          Save your new key now
        </CardTitle>
        <CardDescription className="text-amber-900/80 dark:text-amber-100/80">
          This is the only time we&apos;ll show <strong>{revealed.name}</strong>
          . Once you close this banner the secret is gone — you&apos;ll have to
          create another key if you lose it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          id="revealed-key"
          readOnly
          value={revealed.secret}
          onFocus={(e) => e.currentTarget.select()}
          className="font-mono text-xs"
        />
        <div className="flex shrink-0 gap-2">
          <Button onClick={onCopy} variant="default">
            {copied ? (
              <>
                <Check className="h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copy
              </>
            )}
          </Button>
          <Button onClick={onDismiss} variant="outline">
            I&apos;ve saved it
          </Button>
        </div>
      </CardContent>
    </Card>
  );
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

function formatError(err: unknown): string {
  if (err instanceof DmitApiError) {
    if (err.status === 0) {
      return "Could not reach api.tokfai.com. Check your network or CORS config.";
    }
    return err.message;
  }
  if (err instanceof TypeError) {
    return "Network error reaching api.tokfai.com.";
  }
  if (err instanceof Error) return err.message;
  return "Unknown error.";
}
