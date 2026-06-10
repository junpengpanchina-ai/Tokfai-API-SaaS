"use client";

import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

export function useCopyToClipboard() {
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

export function CopyButton({
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

export function CodeBlock({
  id,
  label,
  code,
  copied,
  onCopy,
  copyLabel,
  copiedLabel,
}: {
  id: string;
  label: string;
  code: string;
  copied: boolean;
  onCopy: (id: string, value: string) => void;
  copyLabel: string;
  copiedLabel: string;
}) {
  return (
    <div className="overflow-hidden rounded-lg border bg-muted">
      <div className="flex items-center justify-between border-b bg-background/70 px-4 py-2">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        <CopyButton
          copied={copied}
          onCopy={() => onCopy(id, code)}
          copyLabel={copyLabel}
          copiedLabel={copiedLabel}
        />
      </div>
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}
