import type { ModelsClientData, ModelsTableRow } from "./dtos/models";
import { TOKFAI_RECOMMENDED_MODEL } from "@/lib/tokfai-api";

/** Static dashboard model fallback when catalog/pricing SSR fails. */
export const FALLBACK_CHAT_MODEL_IDS = [
  "auto-fast",
  "auto-pro",
  "auto-cheap",
  "gpt-5",
  "gpt-5.5",
  "gemini-3-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "gemini-3-pro",
] as const;

export const FALLBACK_IMAGE_MODEL_IDS = [
  "nano-banana-fast",
  "nano-banana",
  "gpt-image-2",
] as const;

export const FALLBACK_DEFAULT_CHAT_MODEL = "auto-fast";
export const FALLBACK_DEFAULT_IMAGE_MODEL = "nano-banana-fast";

const FALLBACK_NOTE = "Catalog pricing temporarily unavailable.";

function fallbackRow(id: string, type: "chat" | "image"): ModelsTableRow {
  return {
    id,
    type,
    status: "available",
    useCase: id,
    inputPrice: "—",
    outputPrice: "—",
    unit: type === "chat" ? "per 1M tokens" : "per generation",
    note: FALLBACK_NOTE,
    shortEstimate: "—",
    longEstimate: "—",
    approxRmb: "—",
  };
}

export function buildFallbackModelsClientData(): ModelsClientData {
  const chatRows = FALLBACK_CHAT_MODEL_IDS.map((id) => fallbackRow(id, "chat"));
  const imageRows = FALLBACK_IMAGE_MODEL_IDS.map((id) =>
    fallbackRow(id, "image")
  );

  return {
    stats: {
      totalAvailable: chatRows.length + imageRows.length,
      chatCount: chatRows.length,
      imageCount: imageRows.length,
      defaultModelId: TOKFAI_RECOMMENDED_MODEL,
    },
    rows: [...chatRows, ...imageRows],
    packageRows: [],
    defaultImage: FALLBACK_DEFAULT_IMAGE_MODEL,
    hasCatalogPricing: false,
  };
}

export const EMPTY_MODELS_CLIENT_DATA: ModelsClientData =
  buildFallbackModelsClientData();

export function logDashboardSsrFailOpen(error: unknown, context: string): void {
  console.error("[dashboard-ssr-fail-open]", context, error);
}
