/** Image upload validation — dashboard-safe (upload via server action). */

export const MAX_PLAYGROUND_INPUT_IMAGES = 4;
export const MAX_PLAYGROUND_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

export class PlaygroundImageUploadError extends Error {
  readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = "PlaygroundImageUploadError";
    this.code = code;
  }
}

export function isAllowedPlaygroundImageType(file: File): boolean {
  return ALLOWED_MIME_TYPES.has(file.type);
}

export function validatePlaygroundImageFile(file: File): void {
  if (!isAllowedPlaygroundImageType(file)) {
    throw new PlaygroundImageUploadError(
      "Supported formats: PNG, JPG, WEBP.",
      "unsupported_file_type"
    );
  }
  if (file.size > MAX_PLAYGROUND_IMAGE_BYTES) {
    throw new PlaygroundImageUploadError(
      "Each image must be 10 MB or smaller.",
      "file_too_large"
    );
  }
}

export function isValidImageUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}
