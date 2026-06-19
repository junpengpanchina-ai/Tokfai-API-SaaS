import { TOKFAI_HEALTH_URL } from "@/lib/tokfai-api";

/** Single health probe timeout — single attempt, no polling. */
export const API_READINESS_TIMEOUT_MS = 2000;

export type ApiReadinessMessages = {
  availableLabel: string;
  availableDescription: string;
  unavailableLabel: string;
  unavailableDescription: string;
  unavailableRecommendedAction: string;
};

export type ApiReadiness =
  | { status: "checking" }
  | { status: "available"; label: string; description: string }
  | { status: "unavailable"; label: string; description: string; recommendedAction: string };

/**
 * Lightweight public health probe — GET only, no auth header, one attempt, 2s timeout.
 * Never surfaces raw fetch errors to callers (customer-safe).
 */
export async function checkApiReadiness(
  messages: ApiReadinessMessages
): Promise<Exclude<ApiReadiness, { status: "checking" }>> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_READINESS_TIMEOUT_MS);
    const response = await fetch(TOKFAI_HEALTH_URL, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      return {
        status: "available",
        label: messages.availableLabel,
        description: messages.availableDescription,
      };
    }
  } catch {
    // Customer-safe — no error details
  }

  return {
    status: "unavailable",
    label: messages.unavailableLabel,
    description: messages.unavailableDescription,
    recommendedAction: messages.unavailableRecommendedAction,
  };
}

export function buildApiReadinessMessages(
  t: (key: string) => string
): ApiReadinessMessages {
  return {
    availableLabel: t("integration.apiReadiness.availableTitle"),
    availableDescription: t("integration.apiReadiness.availableDescription"),
    unavailableLabel: t("integration.apiReadiness.unavailableTitle"),
    unavailableDescription: t("integration.apiReadiness.unavailableDescription"),
    unavailableRecommendedAction: t("integration.apiReadiness.prepareNow"),
  };
}
