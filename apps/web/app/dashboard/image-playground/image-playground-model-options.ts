/** Route-local image model list — no @/lib/model-catalog. */

export type ImagePlaygroundSize =
  | "1024x1024"
  | "1792x1024"
  | "1024x1792";

export type ImagePlaygroundModelId = string;

export type ImagePlaygroundModelOption = {
  id: string;
  displayName: string;
  creditsPerRequest: number;
  status: "available" | "coming_soon";
};

const IMAGE_MODELS: ImagePlaygroundModelOption[] = [
  {
    id: "gpt-image-2",
    displayName: "GPT Image 2",
    creditsPerRequest: 600,
    status: "available",
  },
  {
    id: "nano-banana-fast",
    displayName: "Nano Banana Fast",
    creditsPerRequest: 440,
    status: "available",
  },
  {
    id: "nano-banana",
    displayName: "Nano Banana",
    creditsPerRequest: 1400,
    status: "available",
  },
  {
    id: "nano-banana-pro",
    displayName: "Nano Banana Pro",
    creditsPerRequest: 1800,
    status: "available",
  },
];

export const IMAGE_PLAYGROUND_DEFAULT_MODEL = "gpt-image-2";

export const IMAGE_PLAYGROUND_MODEL_IDS = IMAGE_MODELS
  .filter((model) => model.status === "available")
  .map((model) => model.id);

export const IMAGE_PLAYGROUND_SIZES: ImagePlaygroundSize[] = [
  "1024x1024",
  "1792x1024",
  "1024x1792",
];

export function isAvailableImageModel(modelId: string): boolean {
  return IMAGE_PLAYGROUND_MODEL_IDS.includes(modelId);
}

export function getImageModelOptionById(
  modelId: string
): ImagePlaygroundModelOption | undefined {
  return IMAGE_MODELS.find((model) => model.id === modelId);
}

export function getImageModelCreditsPerRequest(modelId: string): number | null {
  const entry = getImageModelOptionById(modelId);
  if (!entry || entry.status !== "available") return null;
  return entry.creditsPerRequest;
}

export function formatImageCreditsAmount(
  credits: number,
  locale: "en" | "zh"
): string {
  return credits.toLocaleString(locale === "zh" ? "zh-CN" : "en-US");
}

export function formatImageModelSelectLabel(
  modelId: string,
  locale: "en" | "zh"
): string {
  const entry = getImageModelOptionById(modelId);
  if (!entry) return modelId;
  const price = formatImageCreditsAmount(entry.creditsPerRequest, locale);
  return `${entry.displayName} (${modelId}) · ${price} credits / generation`;
}
