"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
import { resolvePostLoginPath } from "@/lib/auth/login-redirect";
import { getOAuthRedirectOrigin } from "@/lib/auth/site-url";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { createClient } from "@/lib/supabase/client";

const LOGIN_ERROR_KEYS: Record<string, string> = {
  missing_code: "auth.login.errorMissingCode",
  auth_callback_failed: "auth.login.errorOAuthFailed",
  oauth_callback_failed: "auth.login.errorOAuthFailed",
};

function getLoginErrorMessage(
  error: string | undefined,
  t: (key: string) => string
) {
  if (!error) {
    return null;
  }

  const key = LOGIN_ERROR_KEYS[error];
  return key ? t(key) : error;
}

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
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    getLoginErrorMessage(initialError, t)
  );

  const postLoginPath = resolvePostLoginPath(nextPath, legacyRedirect);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    router.replace(postLoginPath);
    router.refresh();
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
      setError(oauthError.message);
      setGoogleLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("auth.login.title")}</CardTitle>
        <CardDescription>{t("auth.login.description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">{t("auth.login.email")}</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.login.emailPlaceholder")}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">{t("auth.login.password")}</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={loading || googleLoading}>
            {loading ? t("auth.login.signingIn") : t("auth.login.signIn")}
          </Button>

          <div className="relative my-2 text-center text-xs uppercase tracking-wider text-muted-foreground">
            <span className="bg-card px-2">{t("auth.login.or")}</span>
            <span className="absolute inset-x-0 top-1/2 -z-10 h-px bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            onClick={handleGoogleLogin}
            disabled={loading || googleLoading}
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
