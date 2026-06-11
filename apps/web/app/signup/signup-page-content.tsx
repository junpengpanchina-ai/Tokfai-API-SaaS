"use client";

import Link from "next/link";

import { loginPathWithNext } from "@/lib/auth/login-redirect";
import { useI18n } from "@/lib/i18n/i18n-provider";

import { SignupForm } from "./signup-form";

export function SignupPageContent({
  nextPath,
  legacyRedirect,
}: {
  nextPath?: string;
  legacyRedirect?: string;
}) {
  const { t } = useI18n();
  const loginHref = loginPathWithNext(nextPath ?? legacyRedirect);

  return (
    <div className="flex min-h-screen min-w-0 items-center justify-center bg-muted/30 px-4 py-12">
      <div className="w-full min-w-0 max-w-sm">
        <div className="mb-8 text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-md bg-primary font-bold text-primary-foreground">
              T
            </div>
            <span className="text-lg font-semibold tracking-tight">Tokfai</span>
          </Link>
        </div>
        <SignupForm nextPath={nextPath} legacyRedirect={legacyRedirect} />
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("auth.signup.hasAccount")}{" "}
          <Link
            href={loginHref}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t("auth.signup.logIn")}
          </Link>
        </p>
      </div>
    </div>
  );
}
