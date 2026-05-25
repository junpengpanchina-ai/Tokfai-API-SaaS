"use client";

import { LanguageSwitcher } from "@/components/language-switcher";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function DashboardHeader({ email }: { email: string }) {
  const { t } = useI18n();

  return (
    <header className="flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60 sm:px-6">
      <div className="truncate text-sm text-muted-foreground">
        {t("common.signedInAs")}{" "}
        <span className="font-medium text-foreground">{email}</span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <LanguageSwitcher />
        <form action="/auth/sign-out" method="post">
          <Button type="submit" variant="ghost" size="sm">
            {t("common.signOut")}
          </Button>
        </form>
      </div>
    </header>
  );
}
