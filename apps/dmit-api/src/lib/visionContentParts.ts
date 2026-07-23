/**
 * OpenAI-style content part helpers for vision / multimodal.
 *
 * Prepared for future /v1/chat/completions image_url support.
 * Text chat (Cherry) continues to ignore image_url via chatCompletionCompat —
 * do not wire this into the text main path until product enables it.
 */

export type VisionImageUrlPart = {
  type: "image_url";
  image_url: { url: string };
};

export type VisionTextPart = {
  type: "text";
  text: string;
};

export type VisionContentPart = VisionTextPart | VisionImageUrlPart;

/** Extract http(s)/data image URLs from OpenAI content parts arrays. */
export function extractImageUrlsFromContent(content: unknown): string[] {
  if (!Array.isArray(content)) return [];
  const urls: string[] = [];
  for (const item of content) {
    if (!item || typeof item !== "object") continue;
    const part = item as Record<string, unknown>;
    if (part.type !== "image_url") continue;
    const imageUrl = part.image_url;
    if (typeof imageUrl === "string" && imageUrl.trim()) {
      urls.push(imageUrl.trim());
      continue;
    }
    if (imageUrl && typeof imageUrl === "object" && !Array.isArray(imageUrl)) {
      const url = (imageUrl as Record<string, unknown>).url;
      if (typeof url === "string" && url.trim()) urls.push(url.trim());
    }
  }
  return urls;
}

/** True when content parts include at least one image_url part. */
export function contentHasImageUrlParts(content: unknown): boolean {
  return extractImageUrlsFromContent(content).length > 0;
}

/** Build multimodal user content for the dedicated vision upstream body. */
export function buildVisionUserContentParts(args: {
  prompt: string;
  imageUrl: string;
}): VisionContentPart[] {
  return [
    { type: "text", text: args.prompt },
    {
      type: "image_url",
      image_url: { url: args.imageUrl },
    },
  ];
}
