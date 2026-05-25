"use client";

import { useState } from "react";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth/auth-provider";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function DashboardHeader({ email }: { email: string }) {
  const { t } = useI18n();
  const { signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

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
    <header className="flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-6">
      <div className="truncate text-sm text-muted-foreground">
        {t("common.signedInAs")}{" "}
        <span className="font-medium text-foreground">{email}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <LanguageSwitcher />
        <div className="flex flex-col items-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={signingOut}
            onClick={handleSignOut}
          >
            {signingOut ? t("common.signingOut") : t("common.signOut")}
          </Button>
          {signOutError ? (
            <p className="max-w-[12rem] truncate text-xs text-destructive" role="alert">
              {signOutError}
            </p>
          ) : null}
        </div>
      </div>
    </header>
  );
}
