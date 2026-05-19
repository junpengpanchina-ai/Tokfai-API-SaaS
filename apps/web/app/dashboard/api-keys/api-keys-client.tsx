"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  AlertTriangle,
  Check,
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
  createMeApiKey,
  DmitApiError,
  type CreateMeApiKeyResponse,
} from "@/lib/dmit/client";

export interface ApiKeyListItem {
  id: string;
  name: string;
  key_prefix: string;
  status: "active" | "revoked" | string;
  created_at: string;
  last_used_at: string | null;
}

interface CreateErrorState {
  message: string;
  status: number;
  code?: string;
}

export function ApiKeysClient({
  accessToken,
  initialKeys,
}: {
  accessToken: string;
  initialKeys: ApiKeyListItem[];
}) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<CreateErrorState | null>(null);
  const [created, setCreated] = useState<CreateMeApiKeyResponse | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creating) return;

    setCreating(true);
    setCreateError(null);
    setCopied(false);

    try {
      const trimmed = newName.trim();
      const result = await createMeApiKey(
        trimmed ? { name: trimmed } : {},
        { accessToken }
      );
      setCreated(result);
      setNewName("");
      router.refresh();
    } catch (err) {
      if (err instanceof DmitApiError) {
        setCreateError({
          message: err.message,
          status: err.status,
          code: err.code,
        });
      } else if (err instanceof Error) {
        setCreateError({
          message: err.message,
          status: 0,
        });
      } else {
        setCreateError({
          message: "Failed to create API key.",
          status: 0,
        });
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleCopy() {
    if (!created?.secret) return;
    try {
      await navigator.clipboard.writeText(created.secret);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      const el = document.getElementById("one-time-secret") as HTMLInputElement | null;
      el?.select();
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">API Keys</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Create keys to authenticate against{" "}
          <code className="rounded bg-muted px-1 text-xs">api.tokfai.com</code>.
          Full secrets are shown only once at creation.
        </p>
      </div>

      {created ? (
        <Card className="border-amber-300 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-950/30">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              One-time secret
            </CardTitle>
            <CardDescription className="text-amber-900/80 dark:text-amber-100/80">
              Copy this key now. You won&apos;t be able to see it again.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Input
              id="one-time-secret"
              readOnly
              value={created.secret}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
            <Button onClick={handleCopy} className="shrink-0">
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
          </CardContent>
        </Card>
      ) : null}

      <Card>
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
                placeholder="e.g. playground"
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
              {creating ? "Creating…" : "Create API key"}
            </Button>
          </form>
          {createError ? (
            <Card className="mt-4 border-destructive/30 bg-destructive/5">
              <CardContent className="pt-4">
                <p className="text-sm text-destructive" role="alert">
                  {createError.message}
                </p>
                <p className="mt-2 font-mono text-xs text-muted-foreground">
                  status={createError.status} code={createError.code ?? "n/a"}
                </p>
              </CardContent>
            </Card>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your API keys</CardTitle>
          <CardDescription>
            Only prefixes and usage metadata are shown. Full secrets cannot be
            retrieved after creation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {initialKeys.length > 0 ? (
            <ApiKeysTable keys={initialKeys} />
          ) : (
            <EmptyState />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ApiKeysTable({ keys }: { keys: ApiKeyListItem[] }) {
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
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
      <p className="text-sm text-muted-foreground">
        No API keys yet. Create one above to start calling the API.
      </p>
    </div>
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
