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

function isUpstreamLoadSignal(
  status: number,
  code: string | undefined,
  rawMessage?: string
): boolean {
  const normalized = (code ?? "").toLowerCase();
  const detail = (rawMessage ?? "").toLowerCase();

  return (
    UPSTREAM_CODES.has(normalized) ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    status >= 500 ||
    detail.includes("model load") ||
    detail.includes("load is too high")
  );
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

    if (normalized === "upstream_timeout" || status === 504) {
      return t(`${prefix}.upstreamTimeout`);
    }

    if (isUpstreamLoadSignal(status, code, rawMessage)) {
      return t(`${prefix}.upstreamError`);
    }

    return t(`${prefix}.upstreamError`);
  }

  if (kind === "rate_limit") {
    return t(`${prefix}.rateLimited`);
  }

  if (kind === "validation") {
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
  kind: PlaygroundErrorKind
): string | null {
  if (kind === "upstream") {
    return scope === "imagePlayground"
      ? "dashboard.imagePlayground.errors.billingNotChargedHint"
      : "dashboard.playground.errors.switchModelHint";
  }
  return null;
}
