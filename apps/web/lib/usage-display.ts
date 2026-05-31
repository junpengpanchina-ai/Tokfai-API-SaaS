import type { MeUsageLogEntry } from "@/lib/dmit/server";
import { formatCreditsPrecise, formatInt } from "@/lib/format";
import { isAvailableImageModel } from "@/lib/model-catalog";

export type { MeUsageLogEntry };

export type UsageKind = "chat" | "image";

export function getUsageKind(
  model: string | null | undefined
): UsageKind {
  if (model && isAvailableImageModel(model)) {
    return "image";
  }
  return "chat";
}

export function usageKindLabel(kind: UsageKind): string {
  return kind === "image" ? "Image" : "Chat";
}

export function formatUsageCredits(
  row: MeUsageLogEntry,
  kind: UsageKind
): string {
  if (row.status !== "succeeded") return "—";

  const value = row.credits_charged;
  if (value == null || value === "") return "—";

  const n = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(n)) return "—";

  if (kind === "image") {
    return n === 1 ? "1 credit" : `${formatInt(n)} credits`;
  }

  return formatCreditsPrecise(n);
}

export function formatUsageTokenCell(
  kind: UsageKind,
  value: number | null | undefined,
  field: "prompt" | "completion" | "total"
): string {
  if (kind === "image") {
    if (field === "total") return "image generation";
    return "—";
  }

  if (value == null) return "—";
  return formatInt(value);
}
