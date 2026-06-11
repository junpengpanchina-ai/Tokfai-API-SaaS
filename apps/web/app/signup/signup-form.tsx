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
  resolveUnknownAuthErrorMessage,
} from "@/lib/auth/auth-errors";
import { assignAfterAuth } from "@/lib/auth/auth-success-flash";
import { resolvePostLoginPath } from "@/lib/auth/login-redirect";
import { getOAuthRedirectOrigin } from "@/lib/auth/site-url";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { createClient } from "@/lib/supabase/client";

export function SignupForm({
  nextPath,
  legacyRedirect,
}: {
  nextPath?: string;
  legacyRedirect?: string;
}) {
  const { t } = useI18n();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const postLoginPath = resolvePostLoginPath(
    nextPath ?? searchParams.get("next"),
    legacyRedirect ?? searchParams.get("redirect")
  );
  const isBusy = loading || googleLoading;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const origin = getOAuthRedirectOrigin();
      const callbackUrl = new URL(`${origin}/auth/callback`);
      callbackUrl.searchParams.set("next", postLoginPath);

      const { data, error: authError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: callbackUrl.toString(),
        },
      });

      if (authError) {
        setError(resolveAuthErrorMessage(authError, t));
        setLoading(false);
        return;
      }

      if (data.user && !data.session) {
        setInfo(t("auth.signup.confirmEmail"));
        setLoading(false);
        return;
      }

      if (data.session) {
        assignAfterAuth(postLoginPath, "signup");
        return;
      }

      setLoading(false);
    } catch (err) {
      setError(resolveUnknownAuthErrorMessage(t, err));
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setInfo(null);
    setGoogleLoading(true);

    try {
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
    } catch (err) {
      setError(resolveUnknownAuthErrorMessage(t, err));
      setGoogleLoading(false);
    }
  }

  return (
    <Card className="w-full min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle>{t("auth.signup.title")}</CardTitle>
        <CardDescription className="break-words">
          {t("auth.signup.description")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex min-w-0 flex-col gap-4">
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="signup-email">{t("auth.signup.email")}</Label>
            <Input
              id="signup-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.signup.emailPlaceholder")}
              disabled={isBusy}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <Label htmlFor="signup-password">{t("auth.signup.password")}</Label>
            <Input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.signup.passwordPlaceholder")}
              disabled={isBusy}
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive break-words" role="alert">
              {error}
            </p>
          ) : null}
          {info ? (
            <p
              className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground break-words"
              role="status"
            >
              {info}
            </p>
          ) : null}

          <Button
            type="submit"
            className="w-full whitespace-normal text-center"
            disabled={isBusy}
          >
            {loading ? t("auth.signup.creating") : t("auth.signup.createAccount")}
          </Button>

          <div className="relative my-2 text-center text-xs uppercase tracking-wider text-muted-foreground">
            <span className="bg-card px-2">{t("auth.signup.or")}</span>
            <span className="absolute inset-x-0 top-1/2 -z-10 h-px bg-border" />
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full whitespace-normal text-center"
            onClick={handleGoogle}
            disabled={isBusy}
          >
            {googleLoading
              ? t("auth.signup.googleRedirecting")
              : t("auth.signup.continueWithGoogle")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
