"use client";

import { Check, Globe } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "./classnames";

import { type DashboardLocale } from "./labels";
import { useDashboardLabels } from "./use-dashboard-labels";

const LOCALE_OPTIONS: { value: DashboardLocale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "zh", label: "中文" },
];

export function DashboardLanguageSwitcher({
  dropUp = false,
  className,
}: {
  dropUp?: boolean;
  className?: string;
}) {
  const { locale, setLocale, t } = useDashboardLabels();
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

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 gap-1.5 px-2"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <Globe className="h-4 w-4" />
        <span className="text-xs">{t("nav.language")}</span>
      </Button>
      {open ? (
        <div
          className={cn(
            "absolute right-0 z-50 min-w-[8rem] rounded-md border bg-popover p-1 shadow-md",
            dropUp ? "bottom-full mb-1" : "top-full mt-1"
          )}
        >
          {LOCALE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={cn(
                "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-muted",
                locale === option.value && "bg-muted"
              )}
              onClick={() => {
                setLocale(option.value);
                setOpen(false);
              }}
            >
              {locale === option.value ? (
                <Check className="h-3.5 w-3.5" />
              ) : (
                <span className="w-3.5" />
              )}
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
