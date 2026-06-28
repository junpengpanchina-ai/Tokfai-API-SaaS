"use client";

import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export function usePlaygroundCopyToClipboard() {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);

  async function copyText(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedId(id);
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(null);
    }
  }

  return { copiedId, copyText };
}

export function PlaygroundCopyButton({
  copied,
  onCopy,
  copyLabel,
  copiedLabel,
  size = "sm",
}: {
  copied: boolean;
  onCopy: () => void;
  copyLabel: string;
  copiedLabel: string;
  size?: "sm" | "icon";
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size={size === "icon" ? "icon" : "sm"}
      className={size === "icon" ? "h-8 w-8 shrink-0" : "h-8 shrink-0"}
      onClick={onCopy}
    >
      {copied ? (
        <>
          <Check className="h-4 w-4" />
          {size !== "icon" ? copiedLabel : null}
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          {size !== "icon" ? copyLabel : null}
        </>
      )}
    </Button>
  );
}

export function PlaygroundCopyableSnippetField({
  id,
  label,
  value,
  copied,
  onCopy,
  copyLabel,
  copiedLabel,
  monospace = true,
}: {
  id: string;
  label: string;
  value: string;
  copied: boolean;
  onCopy: (id: string, value: string) => void;
  copyLabel: string;
  copiedLabel: string;
  monospace?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        <PlaygroundCopyButton
          copied={copied}
          onCopy={() => onCopy(id, value)}
          copyLabel={copyLabel}
          copiedLabel={copiedLabel}
          size="icon"
        />
      </div>
      <pre
        id={id}
        className={`max-h-48 overflow-x-auto rounded-md border bg-muted/30 p-3 text-sm ${
          monospace ? "font-mono whitespace-pre-wrap break-all" : ""
        }`}
      >
        {value}
      </pre>
    </div>
  );
}

export function PlaygroundCopyConfigAction({
  id,
  value,
  copiedId,
  onCopy,
  label,
  copiedLabel,
  primary = false,
}: {
  id: string;
  value: string;
  copiedId: string | null;
  onCopy: (id: string, value: string) => void;
  label: string;
  copiedLabel: string;
  primary?: boolean;
}) {
  const copied = copiedId === id;
  return (
    <Button
      type="button"
      size="sm"
      variant={primary ? "default" : "outline"}
      onClick={() => onCopy(id, value)}
    >
      {copied ? copiedLabel : label}
    </Button>
  );
}
