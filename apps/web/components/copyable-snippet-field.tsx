"use client";

import { Check, Copy } from "lucide-react";

import { CopyButton } from "@/components/copy-code-block";
import { Label } from "@/components/ui/label";

export function CopyableSnippetField({
  label,
  value,
  copyId,
  copiedId,
  onCopy,
  copyLabel,
  copiedLabel,
  mono = true,
  className,
}: {
  label: string;
  value: string;
  copyId: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  copyLabel: string;
  copiedLabel: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </Label>
        <CopyButton
          copied={copiedId === copyId}
          onCopy={() => onCopy(copyId, value)}
          copyLabel={copyLabel}
          copiedLabel={copiedLabel}
          size="sm"
        />
      </div>
      <code
        className={
          mono
            ? "block overflow-x-auto rounded-md border bg-muted/40 p-3 font-mono text-xs leading-relaxed break-all"
            : "block rounded-md border bg-muted/40 p-3 text-sm leading-relaxed"
        }
      >
        {value}
      </code>
    </div>
  );
}

export function CopyConfigAction({
  id,
  value,
  copiedId,
  onCopy,
  label,
  copiedLabel,
}: {
  id: string;
  value: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  label: string;
  copiedLabel: string;
}) {
  const copied = copiedId === id;
  return (
    <button
      type="button"
      onClick={() => onCopy(id, value)}
      className="inline-flex items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" />
          {copiedLabel}
        </>
      ) : (
        <>
          <Copy className="h-3.5 w-3.5" />
          {label}
        </>
      )}
    </button>
  );
}
