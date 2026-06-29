"use client";

import { useEffect, useState } from "react";

import {
  consumeAuthSuccess,
  type AuthSuccessKind,
} from "@/lib/dashboard-safe/auth-success-flash";
import { useDashboardLabels } from "@/lib/dashboard-safe/use-dashboard-labels";

export function AuthSuccessToast() {
  const { t } = useDashboardLabels();
  const [kind, setKind] = useState<AuthSuccessKind | null>(null);

  useEffect(() => {
    setKind(consumeAuthSuccess());
  }, []);

  useEffect(() => {
    if (!kind) {
      return;
    }

    const timer = window.setTimeout(() => setKind(null), 5000);
    return () => window.clearTimeout(timer);
  }, [kind]);

  if (!kind) {
    return null;
  }

  const message =
    kind === "signup"
      ? t("auth.success.accountCreated")
      : t("auth.success.welcomeBack");

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-4 top-4 z-50 flex justify-center sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2"
    >
      <div className="pointer-events-auto flex max-w-md items-start gap-3 rounded-lg border border-emerald-500/30 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-lg dark:border-emerald-500/20 dark:bg-emerald-950/90 dark:text-emerald-50">
        <p className="min-w-0 flex-1 break-words">{message}</p>
        <button
          type="button"
          className="shrink-0 rounded px-1 text-emerald-800/70 transition hover:text-emerald-950 dark:text-emerald-200/80 dark:hover:text-emerald-50"
          aria-label={t("auth.success.dismiss")}
          onClick={() => setKind(null)}
        >
          ×
        </button>
      </div>
    </div>
  );
}
