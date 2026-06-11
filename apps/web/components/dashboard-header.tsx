"use client";

import Link from "next/link";
import { useState } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-provider";
import { useI18n } from "@/lib/i18n/i18n-provider";

function truncateEmail(email: string, maxLength = 28): string {
  if (email.length <= maxLength) return email;
  const at = email.indexOf("@");
  if (at <= 0) return `${email.slice(0, maxLength - 1)}…`;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length + domain.length <= maxLength) return email;
  const keepLocal = Math.max(4, maxLength - domain.length - 1);
  return `${local.slice(0, keepLocal)}…${domain}`;
}

export function DashboardHeader({ email }: { email: string }) {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const displayEmail = truncateEmail(email);

  async function handleSignOut() {
    if (signingOut) {
      return;
    }

    setSignOutError(null);
    setSigningOut(true);

    const { error } = await signOut();
    setSigningOut(false);

    if (error) {
      setSignOutError(error);
    }
  }

  return (
    <header className="sticky top-0 z-30 flex shrink-0 flex-col gap-2 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:h-16 sm:flex-row sm:items-center sm:justify-between sm:gap-3 sm:py-0 md:static">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Link href="/" className="flex shrink-0 items-center gap-2 md:hidden">
          <div className="grid h-7 w-7 place-items-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
            T
          </div>
          <span className="text-sm font-semibold tracking-tight">Tokfai</span>
        </Link>
        <div
          className="min-w-0 text-xs text-muted-foreground sm:text-sm"
          title={email || undefined}
        >
          <span className="hidden sm:inline">{t("common.signedInAs")} </span>
          <span className="font-medium text-foreground">{displayEmail}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-1 self-end sm:self-auto">
        <LanguageSwitcher />
        <div className="flex flex-col items-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 px-2 text-xs sm:h-9 sm:px-3 sm:text-sm"
            disabled={signingOut}
            onClick={handleSignOut}
          >
            {signingOut ? t("common.signingOut") : t("common.signOut")}
          </Button>
          {signOutError ? (
            <p
              className="max-w-[10rem] truncate text-xs text-destructive sm:max-w-[12rem]"
              role="alert"
            >
              {signOutError}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
