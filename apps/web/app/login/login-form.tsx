"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  resolveAuthErrorMessage,
  resolveUrlAuthErrorMessage,
} from "@/lib/auth/auth-errors";
import { resolvePostLoginPath } from "@/lib/auth/login-redirect";
import { getOAuthRedirectOrigin } from "@/lib/auth/site-url";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({
  nextPath,
  legacyRedirect,
  initialError,
}: {
  nextPath?: string;
  legacyRedirect?: string;
  initialError?: string;
}) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    resolveUrlAuthErrorMessage(initialError, t)
  );

  const postLoginPath = resolvePostLoginPath(
    nextPath ?? searchParams.get("next"),
    legacyRedirect ?? searchParams.get("redirect")
  );
  const isBusy = loading || googleLoading;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (authError) {
      setError(resolveAuthErrorMessage(authError, t));
      return;
    }

    window.location.assign(postLoginPath);
  }

  async function handleGoogleLogin() {
    setError(null);
    setGoogleLoading(true);

    const callbackUrl = new URL(`${getOAuthRedirectOrigin()}/auth/callback`);
    callbackUrl.searchParams.set("next", postLoginPath);

    const supabase = createClient();
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: callbackUrl.toString(),
      },
    });

    if (oauthError) {
      setError(resolveAuthErrorMessage(oauthError, t));
      setGoogleLoading(false);
    }
  }

  return (
    <Card className="w-full min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle>{t("auth.login.title")}</CardTitle>
        <CardDescription className="break-words">
          {t("auth.login.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="email">{t("auth.login.email")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.login.emailPlaceholder")}
              disabled={isBusy}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="password">{t("auth.login.password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isBusy}
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive break-words" role="alert">
              {error}
            </p>
          ) : null}

          <Button
            type="submit"
            className="w-full whitespace-normal text-center"
            disabled={isBusy}
          >
            {loading ? t("auth.login.signingIn") : t("auth.login.signIn")}
          </Button>

          <div className="relative my-2 text-center text-xs uppercase tracking-wider text-muted-foreground">
            <span className="bg-card px-2">{t("auth.login.or")}</span>
            <span className="absolute inset-x-0 top-1/2 -z-10 h-px bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full whitespace-normal text-center"
            onClick={handleGoogleLogin}
            disabled={isBusy}
          >
            {googleLoading
              ? t("auth.login.googleRedirecting")
              : t("auth.login.continueWithGoogle")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
