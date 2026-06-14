"use client";

import { Check, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { useI18n, type Locale } from "@/lib/i18n/i18n-provider";
import { cn } from "@/lib/utils";

const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
];

export function LanguageSwitcher({
  dropUp = false,
  className,
}: {
  dropUp?: boolean;
  className?: string;
}) {
  const { locale, setLocale, t } = useI18n();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const currentLabel =
    LOCALE_OPTIONS.find((option) => option.value === locale)?.label ?? "English";

  return (
    <div className={cn("relative", className)} ref={containerRef}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1.5"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("common.language")}
        onClick={() => setOpen((prev) => !prev)}
      >
        <Globe className="h-4 w-4" />
        <span>{currentLabel}</span>
      </Button>

      {open ? (
        <div
          role="listbox"
          aria-label={t("common.language")}
          className={cn(
            "absolute z-50 min-w-[9rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
            dropUp ? "bottom-full mb-1 left-0" : "right-0 top-full mt-1"
          )}
        >
          {LOCALE_OPTIONS.map((option) => {
            const selected = option.value === locale;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent hover:text-accent-foreground",
                  selected && "bg-accent/60"
                )}
                onClick={() => {
                  setLocale(option.value);
                  setOpen(false);
                }}
              >
                <span>{option.label}</span>
                {selected ? <Check className="h-4 w-4" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
