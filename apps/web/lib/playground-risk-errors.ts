export type PlaygroundErrorKind =
  | "auth"
  | "credits"
  | "upstream"
  | "rate_limit"
  | "validation"
  | "unknown";

const AUTH_TOKEN_CODES = new Set([
  "missing_token",
  "missing_api_key",
  "no_api_key",
  "invalid_token",
  "invalid_api_key",
]);

const UPSTREAM_CODES = new Set([
  "upstream_error",
  "upstream_timeout",
  "upstream_auth_error",
  "upstream_rate_limited",
  "upstream_model_busy",
  "image_generation_failed",
  "network_error",
]);

export function classifyPlaygroundError(
  status: number,
  code?: string | null
): PlaygroundErrorKind {
  const normalized = (code ?? "").toLowerCase();

  if (status === 402 || normalized === "insufficient_credits") {
    return "credits";
  }

  if (
    AUTH_TOKEN_CODES.has(normalized) ||
    status === 401 ||
    normalized === "key_not_revealable"
  ) {
    return "auth";
  }

  if (normalized === "model_not_available") {
    return "validation";
  }

  if (
    UPSTREAM_CODES.has(normalized) ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status >= 500
  ) {
    return "upstream";
  }

  if (normalized === "rate_limited" || status === 429) {
    return "rate_limit";
  }

  if (
    normalized === "missing_prompt" ||
    normalized === "model_not_found" ||
    normalized === "key_reveal_timeout" ||
    normalized === "page_image_not_found"
  ) {
    return "validation";
  }

  return "unknown";
}

/** Friendly i18n message — never returns raw upstream/provider text. */
export function resolvePlaygroundRiskMessage(
  scope: "playground" | "imagePlayground",
  status: number,
  code: string | undefined,
  t: (key: string) => string,
  rawMessage?: string
): string {
  const prefix = `dashboard.${scope}.errors`;
  const normalized = (code ?? "").toLowerCase();
  const kind = classifyPlaygroundError(status, code);

  if (kind === "credits") {
    return t(`${prefix}.insufficientCredits`);
  }

  if (kind === "auth") {
    if (normalized === "key_not_revealable") {
      return t(`${prefix}.keyNotRetrievable`);
    }
    return t(`${prefix}.invalidOrMissingToken`);
  }

  if (kind === "upstream") {
    if (scope === "imagePlayground") {
      if (normalized === "upstream_timeout") {
        return t(`${prefix}.upstreamTimeout`);
      }
      if (normalized === "image_generation_failed") {
        return t(`${prefix}.imageGenerationFailed`);
      }
      return t(`${prefix}.upstreamError`);
    }

    if (normalized === "upstream_model_busy") {
      return t(`${prefix}.upstreamModelBusy`);
    }

    if (normalized === "upstream_timeout" || status === 504) {
      return t(`${prefix}.upstreamTimeout`);
    }

    return t(`${prefix}.upstreamError`);
  }

  if (kind === "rate_limit") {
    return t(`${prefix}.rateLimited`);
  }

  if (kind === "validation") {
    if (normalized === "model_not_available") {
      return t(`${prefix}.modelNotAvailable`);
    }

    if (normalized === "key_reveal_timeout") {
      return t("dashboard.playground.apiKeyLoadTimedOut");
    }

    const codeMap: Record<string, string> = {
      missing_prompt: `${prefix}.missingPrompt`,
      model_not_found: `${prefix}.modelNotFound`,
      page_image_not_found: `${prefix}.pageImageNotFound`,
    };

    const mapped = codeMap[normalized];
    if (mapped) {
      return t(mapped);
    }

    if (status === 404) {
      return t(`${prefix}.modelNotFound`);
    }
  }

  return t(`${prefix}.unknown`);
}

export function playgroundRiskHintKey(
  scope: "playground" | "imagePlayground",
  kind: PlaygroundErrorKind,
  code?: string | null
): string | null {
  const normalized = (code ?? "").toLowerCase();

  if (kind === "upstream") {
    return scope === "imagePlayground"
      ? "dashboard.imagePlayground.errors.billingNotChargedHint"
      : "dashboard.playground.errors.switchModelHint";
  }

  if (
    kind === "validation" &&
    scope === "playground" &&
    normalized === "model_not_available"
  ) {
    return "dashboard.playground.errors.switchModelHint";
  }

  return null;
}
