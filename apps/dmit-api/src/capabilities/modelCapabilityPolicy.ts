import { ApiError } from "../errors.js";
import {
  IMAGE_MODEL_NOT_FOR_CHAT_CODE,
  MODEL_NOT_IMAGE_CAPABLE_CODE,
  isNonImageTextModel,
} from "../lib/imageProviderIsolation.js";
import { isUnavailableImageModel } from "../upstream/imageModelAliases.js";

/**
 * Runtime capability routing policy (image/media foundation).
 *
 * Hard limits:
 * - Does not alter GPT/Gemini text chat success paths.
 * - Image models stay on /v1/images/* (never chat/completions or responses).
 * - video_generation is reserved / disabled (policy only — no production wire-up).
 */

export type ModelCapability =
  | "text_chat"
  | "image_generation"
  | "image_edit"
  | "video_generation";

export type CapabilityAvailability = "enabled" | "reserved" | "disabled";

/** Re-export stable isolation codes (P954). */
export {
  IMAGE_MODEL_NOT_FOR_CHAT_CODE,
  MODEL_NOT_IMAGE_CAPABLE_CODE,
  isNonImageTextModel,
};

const TEXT_CHAT_MODELS = [
  "gpt-5.5",
  "gpt-5.4",
  "gpt-5.4-pro",
  "gemini-3-pro",
  "gemini-2.5-flash",
] as const;

const IMAGE_GENERATION_MODELS = [
  "nano-banana",
  "nano-banana-fast",
  "nano-banana-2",
  "gpt-image-2",
  "gpt-image-2-vip",
] as const;
const IMAGE_EDIT_MODELS = [
  "nano-banana",
  "nano-banana-fast",
  "nano-banana-2",
  "gpt-image-2",
  "gpt-image-2-vip",
] as const;

/** Primary capability table (explicit product policy). */
const MODEL_CAPABILITIES: Record<string, ModelCapability[]> = {
  "gpt-5.5": ["text_chat"],
  "gpt-5.4": ["text_chat"],
  "gpt-5.4-pro": ["text_chat"],
  "gemini-3-pro": ["text_chat"],
  "gemini-2.5-flash": ["text_chat"],
  "nano-banana": ["image_generation", "image_edit"],
  "nano-banana-fast": ["image_generation", "image_edit"],
  "nano-banana-2": ["image_generation", "image_edit"],
  "gpt-image-2": ["image_generation", "image_edit"],
  "gpt-image-2-vip": ["image_generation", "image_edit"],
};

const CAPABILITY_AVAILABILITY: Record<ModelCapability, CapabilityAvailability> =
  {
    text_chat: "enabled",
    image_generation: "enabled",
    image_edit: "enabled",
    /** Policy pedestal only — not wired to production. */
    video_generation: "reserved",
  };

function normalizeModelId(model: string): string {
  return String(model ?? "")
    .trim()
    .toLowerCase()
    .replace(/^models\//, "")
    .replace(/^openai\//, "")
    .replace(/^google\//, "");
}

/** Nano Banana family (+ legacy gpt-image-*) share image capabilities. */
function isImageFamilyModel(model: string): boolean {
  const m = normalizeModelId(model);
  if (m === "nano-banana" || m.startsWith("nano-banana-")) return true;
  if (m === "gpt-image" || m.startsWith("gpt-image-")) return true;
  return false;
}

export function getCapabilityAvailability(
  capability: ModelCapability
): CapabilityAvailability {
  return CAPABILITY_AVAILABILITY[capability];
}

/**
 * Capabilities declared for a model. Empty array = unknown to this policy
 * (callers may fall through to catalog allowlists).
 */
export function getModelCapability(model: string): ModelCapability[] {
  const m = normalizeModelId(model);
  const listed = MODEL_CAPABILITIES[m];
  if (listed) return [...listed];

  if (isImageFamilyModel(m)) {
    return ["image_generation", "image_edit"];
  }

  return [];
}

export function isImageModel(model: string): boolean {
  const caps = getModelCapability(model);
  return (
    caps.includes("image_generation") ||
    caps.includes("image_edit") ||
    isImageFamilyModel(model)
  );
}

export function isVideoModel(model: string): boolean {
  return getModelCapability(model).includes("video_generation");
}

export function isTextChatModel(model: string): boolean {
  return getModelCapability(model).includes("text_chat");
}

/**
 * Throws ApiError when the model may not perform `requestedCapability`.
 * video_generation is always blocked (reserved / disabled).
 */
export function assertCapabilityAllowed(
  model: string,
  requestedCapability: ModelCapability
): void {
  const availability = getCapabilityAvailability(requestedCapability);

  if (
    requestedCapability === "video_generation" ||
    availability === "reserved" ||
    availability === "disabled"
  ) {
    throw new ApiError({
      status: 400,
      message: `Capability \`${requestedCapability}\` is ${
        availability === "enabled" ? "reserved" : availability
      }.`,
      code: "capability_not_available",
      type: "invalid_request_error",
      publicMessage: "该能力暂未开放。",
    });
  }

  const isImageCap =
    requestedCapability === "image_generation" ||
    requestedCapability === "image_edit";

  if (isImageCap && isUnavailableImageModel(model)) {
    throw new ApiError({
      status: 400,
      message: "当前图片模型不可用，请切换图片模型",
      code: "image_model_not_available",
      type: "invalid_request_error",
      publicMessage: "当前图片模型不可用，请切换图片模型",
    });
  }

  const caps = getModelCapability(model);
  if (!caps.includes(requestedCapability)) {
    throw new ApiError({
      status: 400,
      message: isImageCap
        ? "当前图片模型不可用，请切换图片模型"
        : `Model \`${normalizeModelId(model)}\` does not support \`${requestedCapability}\`.`,
      code: isImageCap ? "image_model_not_available" : "model_not_available",
      type: "invalid_request_error",
    });
  }
}

/** Policy constants for smokes / docs. */
export const CAPABILITY_POLICY = {
  text_chat: [...TEXT_CHAT_MODELS],
  image_generation: [...IMAGE_GENERATION_MODELS],
  image_edit: [...IMAGE_EDIT_MODELS],
  video_generation: {
    models: [] as string[],
    status: CAPABILITY_AVAILABILITY.video_generation,
  },
} as const;
