import { createClient } from "@/lib/supabase/client";

export const PLAYGROUND_INPUTS_BUCKET = "playground-inputs";
export const MAX_PLAYGROUND_INPUT_IMAGES = 4;
export const MAX_PLAYGROUND_IMAGE_BYTES = 10 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

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

function resolveStorageErrorMessage(message: string): string {
  const normalized = message.trim();
  if (!normalized) {
    return "Upload failed.";
  }
  return normalized;
}

export async function uploadPlaygroundImage(file: File): Promise<string> {
  console.info("[image-upload] start", {
    name: file.name,
    type: file.type,
    size: file.size,
  });

  validatePlaygroundImageFile(file);

  const ext = EXT_BY_MIME[file.type];
  if (!ext) {
    throw new PlaygroundImageUploadError(
      "Supported formats: PNG, JPG, WEBP.",
      "unsupported_file_type"
    );
  }

  const supabase = createClient();
  if (!supabase) {
    throw new PlaygroundImageUploadError(
      "Authentication is temporarily unavailable.",
      "not_authenticated"
    );
  }
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    const message = authError?.message ?? "Please sign in again.";
    console.error("[image-upload] failed", authError ?? new Error(message));
    throw new PlaygroundImageUploadError(message, "not_authenticated");
  }

  const objectPath = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(PLAYGROUND_INPUTS_BUCKET)
    .upload(objectPath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    const message = resolveStorageErrorMessage(uploadError.message);
    console.error("[image-upload] failed", uploadError);
    throw new PlaygroundImageUploadError(message, "upload_failed");
  }

  const { data } = supabase.storage
    .from(PLAYGROUND_INPUTS_BUCKET)
    .getPublicUrl(objectPath);

  const publicUrl = data.publicUrl?.trim();
  if (!publicUrl) {
    const message = "Upload failed.";
    console.error("[image-upload] failed", new Error(message));
    throw new PlaygroundImageUploadError(message, "upload_failed");
  }

  console.info("[image-upload] success", {
    path: objectPath,
    publicUrlPresent: true,
  });

  return publicUrl;
}
