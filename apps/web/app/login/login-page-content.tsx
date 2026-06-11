"use client";

import { Suspense } from "react";
import Link from "next/link";

import { signupPathWithNext } from "@/lib/auth/login-redirect";
import { useI18n } from "@/lib/i18n/i18n-provider";

import { LoginForm } from "./login-form";

export function LoginPageContent({
  nextPath,
  legacyRedirect,
  initialError,
}: {
  nextPath?: string;
  legacyRedirect?: string;
  initialError?: string;
}) {
  const { t } = useI18n();
  const signupHref = signupPathWithNext(nextPath ?? legacyRedirect);

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
        <Suspense
          fallback={
            <div className="h-[420px] w-full animate-pulse rounded-lg bg-muted" />
          }
        >
          <LoginForm
            nextPath={nextPath}
            legacyRedirect={legacyRedirect}
            initialError={initialError}
          />
        </Suspense>
        <p className="mt-6 text-center text-sm text-muted-foreground">
          {t("auth.login.noAccount")}{" "}
          <Link
            href={signupHref}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            {t("auth.login.createOne")}
          </Link>
        </p>
      </div>
    </div>
  );
}
