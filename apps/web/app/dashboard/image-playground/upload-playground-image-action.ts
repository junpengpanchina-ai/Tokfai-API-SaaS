"use server";

import { createClient } from "@/lib/supabase/server";
import {
  PlaygroundImageUploadError,
  validatePlaygroundImageFile,
} from "@/lib/dashboard-safe/upload-validation";

const PLAYGROUND_INPUTS_BUCKET = "playground-inputs";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export async function uploadPlaygroundImageAction(
  formData: FormData
): Promise<{ ok: true; publicUrl: string } | { ok: false; message: string; code: string }> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, message: "No file provided.", code: "missing_file" };
  }

  try {
    validatePlaygroundImageFile(file);
  } catch (err) {
    if (err instanceof PlaygroundImageUploadError) {
      return { ok: false, message: err.message, code: err.code };
    }
    return { ok: false, message: "Upload failed.", code: "upload_failed" };
  }

  const ext = EXT_BY_MIME[file.type];
  if (!ext) {
    return {
      ok: false,
      message: "Supported formats: PNG, JPG, WEBP.",
      code: "unsupported_file_type",
    };
  }

  const supabase = createClient();
  if (!supabase) {
    return {
      ok: false,
      message: "Upload temporarily unavailable.",
      code: "client_unavailable",
    };
  }

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      ok: false,
      message: authError?.message ?? "Please sign in again.",
      code: "not_authenticated",
    };
  }

  const objectPath = `${user.id}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from(PLAYGROUND_INPUTS_BUCKET)
    .upload(objectPath, file, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return {
      ok: false,
      message: uploadError.message.trim() || "Upload failed.",
      code: "upload_failed",
    };
  }

  const { data } = supabase.storage
    .from(PLAYGROUND_INPUTS_BUCKET)
    .getPublicUrl(objectPath);

  const publicUrl = data.publicUrl?.trim();
  if (!publicUrl) {
    return { ok: false, message: "Upload failed.", code: "upload_failed" };
  }

  return { ok: true, publicUrl };
}
