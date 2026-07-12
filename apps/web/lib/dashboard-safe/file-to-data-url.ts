/**
 * Convert an uploaded File to a data URL for API reference images.
 * Never send blob: URLs to DMIT — servers cannot read browser-local blobs.
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(new Error("Failed to read image file as data URL."));
    };
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string" || !result.startsWith("data:image/")) {
        reject(new Error("Invalid image data URL."));
        return;
      }
      resolve(result);
    };
    reader.readAsDataURL(file);
  });
}

export function isBlobUrl(value: string | null | undefined): boolean {
  return Boolean(value && /^blob:/i.test(value));
}

export function isDataImageUrl(value: string | null | undefined): boolean {
  return Boolean(value && /^data:image\//i.test(value));
}

export function isHttpImageUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/** Prefer data URL, then public https URL — never blob preview URLs. */
export function pickApiImageSource(options: {
  sourceDataUrl?: string | null;
  sourceUrl?: string | null;
  previewUrl?: string | null;
}): string | null {
  if (options.sourceDataUrl && isDataImageUrl(options.sourceDataUrl)) {
    return options.sourceDataUrl;
  }
  if (options.sourceUrl && isHttpImageUrl(options.sourceUrl)) {
    return options.sourceUrl;
  }
  if (options.previewUrl && isHttpImageUrl(options.previewUrl)) {
    return options.previewUrl;
  }
  return null;
}
