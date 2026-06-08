import { AdminApiError } from "@/lib/admin/client";

type ZodFlattenDetail = {
  formErrors?: string[];
  fieldErrors?: Record<string, string[] | undefined>;
};

const ERROR_CODE_LABEL_KEYS: Record<string, string> = {
  invalid_id: "admin.rechargePlans.colId",
  invalid_name: "admin.rechargePlans.colName",
  invalid_amount_yuan: "admin.rechargePlans.colAmount",
  invalid_amount_cents: "admin.rechargePlans.colAmount",
  invalid_base_credits: "admin.rechargePlans.colBaseCredits",
  invalid_bonus_credits: "admin.rechargePlans.colBonusCredits",
  invalid_total_credits: "admin.rechargePlans.colCredits",
  invalid_sort_order: "admin.rechargePlans.colSortOrder",
  invalid_badge: "admin.rechargePlans.colBadge",
  invalid_description: "admin.rechargePlans.colDescription",
  invalid_credits: "admin.rechargePlans.colCredits",
  invalid_stripe_price_id: "admin.rechargePlans.colStripePriceId",
  invalid_stripe_product_id: "admin.rechargePlans.colStripePriceId",
  invalid_body: "admin.rechargePlans.invalidBody",
};

const FIELD_LABEL_KEYS: Record<string, string> = {
  id: "admin.rechargePlans.colId",
  name: "admin.rechargePlans.colName",
  amount_yuan: "admin.rechargePlans.colAmount",
  amount_cents: "admin.rechargePlans.colAmount",
  base_credits: "admin.rechargePlans.colBaseCredits",
  bonus_credits: "admin.rechargePlans.colBonusCredits",
  sort_order: "admin.rechargePlans.colSortOrder",
  badge: "admin.rechargePlans.colBadge",
  description: "admin.rechargePlans.colDescription",
  credits: "admin.rechargePlans.colCredits",
};

function fieldLabel(field: string, t: (key: string) => string): string {
  const key = FIELD_LABEL_KEYS[field];
  return key ? t(key) : field;
}

function errorCodeLabel(code: string, t: (key: string) => string): string {
  const key = ERROR_CODE_LABEL_KEYS[code];
  return key ? t(key) : code;
}

function translateValidationMessage(
  codeOrField: string,
  message: string,
  t: (key: string) => string
): string {
  if (message === "invalid_recharge_plan_id") {
    return t("admin.rechargePlans.planIdInvalid");
  }
  if (message === "Expected integer, received float") {
    return t("admin.rechargePlans.integerRequired");
  }
  if (message.includes("amount_yuan or amount_cents is required")) {
    return t("admin.rechargePlans.amountRequired");
  }
  if (message.includes("must be greater than 0")) {
    return t("admin.rechargePlans.creditsMustBePositive");
  }
  if (message.includes("computed server-side")) {
    return t("admin.rechargePlans.serverComputedField");
  }
  if (message.includes("Unrecognized key")) {
    return message;
  }
  if (codeOrField === "invalid_amount_yuan" || codeOrField === "amount_yuan") {
    if (message.includes("positive")) return t("admin.rechargePlans.amountInvalid");
  }
  return message;
}

function formatCodeDetailLine(
  code: string,
  message: string,
  t: (key: string) => string
): string {
  const label = errorCodeLabel(code, t);
  const text = translateValidationMessage(code, message, t);
  return `${label}: ${text}`;
}

function formatFieldMessages(
  field: string,
  messages: string[],
  t: (key: string) => string
): string[] {
  const label = fieldLabel(field, t);
  return messages.map(
    (message) => `${label}: ${translateValidationMessage(field, message, t)}`
  );
}

export function formatRechargePlanValidationDetail(
  detail: unknown,
  t: (key: string) => string
): string | null {
  if (!detail || typeof detail !== "object") return null;

  const record = detail as Record<string, unknown>;
  const lines: string[] = [];

  const isStableCodeDetail = Object.keys(record).every(
    (key) => key === "invalid_body" || key.startsWith("invalid_")
  );

  if (isStableCodeDetail && !("fieldErrors" in record) && !("formErrors" in record)) {
    for (const [code, value] of Object.entries(record)) {
      if (typeof value !== "string" || !value.trim()) continue;
      lines.push(formatCodeDetailLine(code, value, t));
    }
    return lines.length > 0 ? lines.join("；") : null;
  }

  if ("formErrors" in record || "fieldErrors" in record) {
    const flat = detail as ZodFlattenDetail;
    if (flat.formErrors?.length) {
      lines.push(...flat.formErrors);
    }
    for (const [field, messages] of Object.entries(flat.fieldErrors ?? {})) {
      if (!messages?.length) continue;
      lines.push(...formatFieldMessages(field, messages, t));
    }
  } else {
    for (const [field, value] of Object.entries(record)) {
      if (!Array.isArray(value) || value.length === 0) continue;
      const messages = value.filter((item): item is string => typeof item === "string");
      if (messages.length === 0) continue;
      lines.push(...formatFieldMessages(field, messages, t));
    }
  }

  return lines.length > 0 ? lines.join("；") : null;
}

export function formatAdminRechargePlanError(
  error: unknown,
  t: (key: string) => string,
  fallback: string
): string {
  if (error instanceof AdminApiError) {
    if (error.isSessionExpired) {
      return t("admin.common.sessionExpired");
    }
    if (error.code === "recharge_plan_already_exists") {
      return t("admin.rechargePlans.planIdExists");
    }
    if (error.code === "invalid_recharge_plan_fields") {
      const detailMessage = formatRechargePlanValidationDetail(error.detail, t);
      if (detailMessage) return detailMessage;
      if (
        error.message &&
        error.message !== "invalid_recharge_plan_fields" &&
        error.message !== "Invalid recharge plan fields."
      ) {
        return error.message;
      }
      return t("admin.rechargePlans.invalidFields");
    }
    return error.message;
  }
  return error instanceof Error ? error.message : fallback;
}

export function draftRechargePlanValidationMessage(
  error: Error,
  t: (key: string) => string
): string {
  switch (error.message) {
    case "invalid_plan_id":
      return t("admin.rechargePlans.planIdInvalid");
    case "invalid_name":
      return t("admin.rechargePlans.nameRequired");
    case "invalid_amount":
      return t("admin.rechargePlans.amountInvalid");
    case "invalid_base_credits":
      return `${t("admin.rechargePlans.colBaseCredits")}: ${t("admin.rechargePlans.integerRequired")}`;
    case "invalid_bonus_credits":
      return `${t("admin.rechargePlans.colBonusCredits")}: ${t("admin.rechargePlans.integerRequired")}`;
    case "invalid_sort_order":
      return `${t("admin.rechargePlans.colSortOrder")}: ${t("admin.rechargePlans.integerRequired")}`;
    case "invalid_total_credits":
      return t("admin.rechargePlans.creditsMustBePositive");
    default:
      return t("admin.rechargePlans.invalidFields");
  }
}

/** Convert yuan (e.g. 49.9) to integer cents for APIs that accept amount_cents. */
export function yuanToAmountCents(amountYuan: number): number {
  return Math.round(amountYuan * 100);
}
