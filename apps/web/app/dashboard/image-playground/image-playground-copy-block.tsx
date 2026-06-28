"use client";

import { Check, Copy } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

export function useImagePlaygroundCopyToClipboard() {
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

export function ImagePlaygroundCopyButton({
  copied,
  onCopy,
  copyLabel,
  copiedLabel,
}: {
  copied: boolean;
  onCopy: () => void;
  copyLabel: string;
  copiedLabel: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-8 shrink-0"
      onClick={onCopy}
    >
      {copied ? (
        <>
          <Check className="h-4 w-4" />
          {copiedLabel}
        </>
      ) : (
        <>
          <Copy className="h-4 w-4" />
          {copyLabel}
        </>
      )}
    </Button>
  );
}
