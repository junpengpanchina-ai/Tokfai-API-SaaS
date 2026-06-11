import type { AuthError } from "@supabase/supabase-js";

const URL_AUTH_ERROR_KEYS: Record<string, string> = {
  missing_code: "auth.login.errorMissingCode",
  auth_callback_failed: "auth.login.errorOAuthFailed",
  oauth_callback_failed: "auth.login.errorOAuthFailed",
};

function normalizeAuthText(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

/** Map Supabase Auth errors to i18n keys (never expose raw messages). */
export function resolveAuthErrorMessageKey(
  error: Pick<AuthError, "message" | "code"> | null | undefined
): string {
  if (!error) {
    return "auth.errors.generic";
  }

  const message = normalizeAuthText(error.message);
  const code = normalizeAuthText(error.code);

  if (
    code === "invalid_credentials" ||
    message.includes("invalid login credentials")
  ) {
    return "auth.errors.invalidCredentials";
  }

  if (
    code === "email_not_confirmed" ||
    message.includes("email not confirmed")
  ) {
    return "auth.errors.emailNotConfirmed";
  }

  if (
    code === "user_already_exists" ||
    code === "email_exists" ||
    message.includes("user already registered") ||
    message.includes("already been registered")
  ) {
    return "auth.errors.userAlreadyRegistered";
  }

  if (
    code === "validation_failed" ||
    message.includes("invalid email") ||
    message.includes("unable to validate email")
  ) {
    return "auth.errors.invalidEmail";
  }

  if (
    message.includes("password") &&
    (message.includes("at least") ||
      message.includes("too short") ||
      message.includes("weak"))
  ) {
    return "auth.errors.weakPassword";
  }

  if (
    code === "signup_disabled" ||
    message.includes("signups not allowed")
  ) {
    return "auth.errors.signupsDisabled";
  }

  if (
    code === "over_request_rate_limit" ||
    message.includes("rate limit")
  ) {
    return "auth.errors.rateLimited";
  }

  if (message.includes("oauth") || message.includes("provider")) {
    return "auth.login.errorOAuthFailed";
  }

  return "auth.errors.generic";
}

export function resolveAuthErrorMessage(
  error: Pick<AuthError, "message" | "code"> | null | undefined,
  t: (key: string) => string
): string {
  return t(resolveAuthErrorMessageKey(error));
}

/** Map callback / login URL `error` slugs to i18n (never expose raw slugs). */
export function resolveUrlAuthErrorMessage(
  error: string | null | undefined,
  t: (key: string) => string
): string | null {
  if (!error) {
    return null;
  }

  const key = URL_AUTH_ERROR_KEYS[error];
  return t(key ?? "auth.errors.generic");
}
