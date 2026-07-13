import {
  AdminApiError,
  type AdminCreditsAdjustErrorBody,
} from "@/lib/admin/client";

export function formatAdminAdjustError(
  error: unknown,
  t: (key: string) => string
): { code: string; message: string } {
  if (error instanceof AdminApiError && error.isSessionExpired) {
    return {
      code: error.code ?? "missing_access_token",
      message: t("admin.common.sessionExpired"),
    };
  }

  if (error instanceof AdminApiError) {
    const code = error.code ?? "unknown_error";
    const body = (error.body ?? {}) as AdminCreditsAdjustErrorBody;

    if (
      code === "insufficient_credits" ||
      code === "insufficient_credits_for_deduct"
    ) {
      const current =
        typeof body.current_credits === "number"
          ? body.current_credits
          : null;
      const requested =
        typeof body.requested_amount === "number"
          ? body.requested_amount
          : null;

      if (current != null && requested != null) {
        return {
          code: "insufficient_credits_for_deduct",
          message: t("admin.adjust.insufficientCreditsDetail")
            .replace("{current}", String(current))
            .replace("{requested}", String(requested)),
        };
      }

      return {
        code: "insufficient_credits_for_deduct",
        message: t("admin.adjust.insufficientCredits"),
      };
    }

    if (code === "user_not_found" || code === "target_user_not_found") {
      return {
        code: "user_not_found",
        message: t("admin.adjust.userNotFound"),
      };
    }

    if (code === "idempotent_replay") {
      return {
        code,
        message: t("admin.adjust.idempotentReplay"),
      };
    }

    if (code === "invalid_amount") {
      return {
        code,
        message: t("admin.adjust.invalidAmount"),
      };
    }

    return {
      code,
      message: error.message || code,
    };
  }

  if (error instanceof Error) {
    return {
      code: "unknown_error",
      message: error.message,
    };
  }

  return {
    code: "unknown_error",
    message: t("admin.adjust.failed"),
  };
}
