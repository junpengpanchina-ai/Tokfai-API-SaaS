import type { ImageGenerationResponse } from "@/lib/dashboard-safe/image-api";
import { resolvePlaygroundRiskMessage } from "@/lib/dashboard-safe/playground-errors";

export {
  formatCreditsSafe,
  formatDateTimeSafe,
} from "@/lib/dashboard-safe/format-helpers";

export { setDashboardApiKeySecret } from "@/lib/dashboard-safe/api-key-session";

type LooseImageResult = ImageGenerationResponse & Record<string, unknown>;

function readUrl(value: unknown): string | null {
  if (typeof value !== "object" || value == null) return null;
  const url = (value as { url?: unknown }).url;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

/** Rounded credits for sidebar balance display (max 2 decimal places). */
export function formatCreditBalanceDisplaySafe(
  value: number | null | undefined
): string {
  const n = value ?? 0;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n);
}

/** Compatible parsing for image URL fields across upstream response shapes. */
export function resolveGeneratedImageUrl(
  result: ImageGenerationResponse | null | undefined
): string | null {
  if (!result) return null;

  const loose = result as LooseImageResult;
  const fromData = readUrl(Array.isArray(loose.data) ? loose.data[0] : null);
  if (fromData) return fromData;

  if (typeof loose.image_url === "string" && loose.image_url.trim()) {
    return loose.image_url.trim();
  }

  const fromOutput = readUrl(Array.isArray(loose.output) ? loose.output[0] : null);
  if (fromOutput) return fromOutput;

  const fromImages = readUrl(Array.isArray(loose.images) ? loose.images[0] : null);
  if (fromImages) return fromImages;

  return null;
}

/** True when the response includes base64 image data but no displayable URL. */
export function hasGeneratedImageBase64(
  result: ImageGenerationResponse | null | undefined
): boolean {
  if (!result) return false;
  const loose = result as LooseImageResult;
  const first = Array.isArray(loose.data) ? loose.data[0] : null;
  if (typeof first !== "object" || first == null) return false;
  const b64 = (first as { b64_json?: unknown }).b64_json;
  return typeof b64 === "string" && b64.trim().length > 0;
}

export function resolveImageCreatedAt(
  result: ImageGenerationResponse | null | undefined
): string | null {
  if (!result) return null;

  const loose = result as LooseImageResult;
  if (typeof loose.created_at === "string" && loose.created_at.trim()) {
    const fromField = new Date(loose.created_at.trim());
    if (!Number.isNaN(fromField.getTime())) {
      return fromField.toISOString();
    }
  }

  if (!result.created) return null;
  const ms =
    result.created > 1_000_000_000_000
      ? result.created
      : result.created * 1000;
  const date = new Date(ms);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function imagePlaygroundErrorMessage(
  status: number,
  code: string | undefined,
  t: (key: string) => string,
  rawMessage?: string
): string {
  return resolvePlaygroundRiskMessage(
    "imagePlayground",
    status,
    code,
    t,
    rawMessage
  );
}
