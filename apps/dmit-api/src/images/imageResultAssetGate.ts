/**
 * P993 — Image result URL gate.
 *
 * Provider returning a URL string is NOT success. Before completed + charge:
 * 1) GET provider URL (limited redirects)
 * 2) HTTP 2xx + Content-Type image/* + non-empty body within size limit
 * 3) Persist to Tokfai Supabase Storage
 * 4) GET Tokfai public URL and re-verify
 *
 * Never use HEAD in place of GET for the success gate.
 */

import { randomUUID } from "node:crypto";

import { ApiError } from "../errors.js";
import { isBlockedImageHostname } from "../upstream/imageUrlResolver.js";

export const IMAGE_RESULTS_BUCKET = "image-results";
export const MAX_IMAGE_RESULT_BYTES = 10 * 1024 * 1024;
export const IMAGE_RESULT_FETCH_TIMEOUT_MS = 15_000;
export const IMAGE_RESULT_MAX_REDIRECTS = 5;

const USER_AGENT = "Tokfai-Image-Result-Gate/1.0 (+https://tokfai.com)";

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

const STORAGE_ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);

export type PersistedImageAsset = {
  publicUrl: string;
  contentType: string;
  byteLength: number;
  objectPath: string;
};

export type ImageAssetGateDeps = {
  fetchImpl?: typeof fetch;
  uploadObject?: (args: {
    objectPath: string;
    bytes: Uint8Array;
    contentType: string;
  }) => Promise<string>;
  verifyPublicUrl?: (url: string) => Promise<void>;
};

/**
 * Download provider image, persist to Tokfai storage, verify public URL.
 * Throws ApiError with stable codes — caller must fail task and not charge.
 */
export async function downloadValidateAndPersistProviderImage(args: {
  providerUrl: string | null | undefined;
  requestId: string;
  userId: string;
  deps?: ImageAssetGateDeps;
}): Promise<PersistedImageAsset> {
  const raw = typeof args.providerUrl === "string" ? args.providerUrl.trim() : "";
  if (!raw) {
    throw assetGateError(
      "missing_url",
      "Image generation completed without a usable image URL."
    );
  }

  const fetched = await getValidatedImageBytes(raw, args.deps?.fetchImpl);
  const contentType = normalizePersistableContentType(fetched.contentType);
  if (!contentType) {
    throw assetGateError(
      "provider_asset_invalid",
      "Provider returned a non-image or unsupported image Content-Type."
    );
  }

  const ext = EXT_BY_MIME[contentType] ?? "bin";
  // Unpredictable path — never echo user/provider path segments.
  const objectPath = `${args.userId}/${randomUUID()}.${ext}`;

  const upload =
    args.deps?.uploadObject ??
    ((uploadArgs) => defaultUploadObject(uploadArgs));

  let publicUrl: string;
  try {
    publicUrl = await upload({
      objectPath,
      bytes: fetched.bytes,
      contentType,
    });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw assetGateError(
      "asset_persist_failed",
      "Failed to persist the generated image."
    );
  }

  if (!publicUrl.trim()) {
    throw assetGateError(
      "asset_persist_failed",
      "Failed to persist the generated image."
    );
  }

  const verify =
    args.deps?.verifyPublicUrl ??
    ((url) => defaultVerifyPublicUrl(url, args.deps?.fetchImpl));

  try {
    await verify(publicUrl);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw assetGateError(
      "asset_verify_failed",
      "Tokfai image URL failed verification."
    );
  }

  return {
    publicUrl,
    contentType,
    byteLength: fetched.bytes.byteLength,
    objectPath,
  };
}

export async function getValidatedImageBytes(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<{ bytes: Uint8Array; contentType: string }> {
  let response: Response;
  try {
    response = await fetchImageGet(url, fetchImpl, 0);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw assetGateError(
      "provider_asset_unavailable",
      "Could not download the provider image."
    );
  }

  if (response.status === 404 || response.status === 403) {
    throw assetGateError(
      "provider_asset_unavailable",
      `Provider image URL returned HTTP ${response.status}.`
    );
  }

  if (response.status < 200 || response.status >= 300) {
    throw assetGateError(
      "provider_asset_unavailable",
      `Provider image URL returned HTTP ${response.status}.`
    );
  }

  const contentType = normalizeContentType(
    response.headers.get("content-type")
  );
  if (!isAcceptableImageContentType(contentType)) {
    throw assetGateError(
      "provider_asset_invalid",
      "Provider image Content-Type is not image/*."
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw assetGateError(
      "provider_asset_invalid",
      "Provider image body is empty."
    );
  }
  if (bytes.byteLength > MAX_IMAGE_RESULT_BYTES) {
    throw assetGateError(
      "provider_asset_invalid",
      "Provider image exceeds the configured size limit."
    );
  }

  return { bytes, contentType: contentType! };
}

export function isAcceptableImageContentType(
  contentType: string | null
): boolean {
  if (!contentType) return false;
  if (!contentType.startsWith("image/")) return false;
  // SVG can carry script; never accept as a billable generation result.
  if (contentType === "image/svg+xml") return false;
  return true;
}

export function normalizePersistableContentType(
  contentType: string
): string | null {
  const normalized = contentType === "image/jpg" ? "image/jpeg" : contentType;
  if (!STORAGE_ALLOWED_MIME.has(normalized)) {
    // Still image/* but not in bucket allow-list → treat as invalid for persist.
    return null;
  }
  return normalized;
}

export function assetGateError(code: string, publicMessage: string): ApiError {
  return new ApiError({
    status: 502,
    message: publicMessage,
    code,
    type: "upstream_error",
    publicMessage,
  });
}

async function fetchImageGet(
  url: string,
  fetchImpl: typeof fetch,
  redirectCount: number
): Promise<Response> {
  if (redirectCount > IMAGE_RESULT_MAX_REDIRECTS) {
    throw assetGateError(
      "provider_asset_unavailable",
      "Too many redirects while downloading the provider image."
    );
  }

  const validated = assertFetchableHttpUrl(url);

  let response: Response;
  try {
    response = await fetchImpl(validated, {
      method: "GET",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "image/*,*/*;q=0.8",
      },
      redirect: "manual",
      signal: AbortSignal.timeout(IMAGE_RESULT_FETCH_TIMEOUT_MS),
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    if (name === "TimeoutError" || name === "AbortError") {
      throw assetGateError(
        "provider_asset_unavailable",
        "Timed out downloading the provider image."
      );
    }
    throw assetGateError(
      "provider_asset_unavailable",
      "Could not download the provider image."
    );
  }

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) {
      throw assetGateError(
        "provider_asset_unavailable",
        "Redirect response missing location."
      );
    }
    const nextUrl = new URL(location, validated).toString();
    return fetchImageGet(nextUrl, fetchImpl, redirectCount + 1);
  }

  // Cap body size while reading.
  const contentLength = response.headers.get("content-length");
  if (contentLength) {
    const size = Number(contentLength);
    if (Number.isFinite(size) && size > MAX_IMAGE_RESULT_BYTES) {
      throw assetGateError(
        "provider_asset_invalid",
        "Provider image exceeds the configured size limit."
      );
    }
  }

  const reader = response.body?.getReader();
  if (!reader) {
    return response;
  }

  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > MAX_IMAGE_RESULT_BYTES) {
      await reader.cancel();
      throw assetGateError(
        "provider_asset_invalid",
        "Provider image exceeds the configured size limit."
      );
    }
    chunks.push(value);
  }

  const combined = concatUint8Arrays(chunks, total);
  return new Response(combined, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

function assertFetchableHttpUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw assetGateError(
      "provider_asset_invalid",
      "Provider image URL is invalid."
    );
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw assetGateError(
      "provider_asset_invalid",
      "Provider image URL must be http or https."
    );
  }
  if (isBlockedImageHostname(parsed.hostname)) {
    throw assetGateError(
      "provider_asset_unavailable",
      "Provider image URL is not allowed."
    );
  }
  return parsed.toString();
}

async function defaultUploadObject(args: {
  objectPath: string;
  bytes: Uint8Array;
  contentType: string;
}): Promise<string> {
  // Lazy import so unit tests can exercise the gate without boot env.
  const { supabase } = await import("../supabase.js");
  const { env } = await import("../env.js");

  const { error } = await supabase()
    .storage.from(IMAGE_RESULTS_BUCKET)
    .upload(args.objectPath, args.bytes, {
      contentType: args.contentType,
      upsert: false,
      cacheControl: "public, max-age=31536000, immutable",
    });

  if (error) {
    throw assetGateError(
      "asset_persist_failed",
      "Failed to persist the generated image."
    );
  }

  const { data } = supabase()
    .storage.from(IMAGE_RESULTS_BUCKET)
    .getPublicUrl(args.objectPath);

  const publicUrl = data.publicUrl?.trim() ?? "";
  if (!publicUrl) {
    // Fallback construct when client omits publicUrl.
    const base = env.SUPABASE_URL.replace(/\/$/, "");
    return `${base}/storage/v1/object/public/${IMAGE_RESULTS_BUCKET}/${args.objectPath}`;
  }
  return publicUrl;
}

async function defaultVerifyPublicUrl(
  url: string,
  fetchImpl: typeof fetch = fetch
): Promise<void> {
  let response: Response;
  try {
    response = await fetchImageGet(url, fetchImpl, 0);
  } catch (err) {
    if (err instanceof ApiError) {
      throw assetGateError(
        "asset_verify_failed",
        "Tokfai image URL failed verification."
      );
    }
    throw assetGateError(
      "asset_verify_failed",
      "Tokfai image URL failed verification."
    );
  }

  if (response.status < 200 || response.status >= 300) {
    throw assetGateError(
      "asset_verify_failed",
      "Tokfai image URL failed verification."
    );
  }

  const contentType = normalizeContentType(
    response.headers.get("content-type")
  );
  if (!isAcceptableImageContentType(contentType)) {
    throw assetGateError(
      "asset_verify_failed",
      "Tokfai image URL Content-Type is not image/*."
    );
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0) {
    throw assetGateError(
      "asset_verify_failed",
      "Tokfai image URL returned an empty body."
    );
  }
}

function normalizeContentType(value: string | null): string | null {
  if (!value) return null;
  return value.split(";")[0]?.trim().toLowerCase() ?? null;
}

function concatUint8Arrays(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Ledger / usage idempotency key for an image task (request_id == task_id). */
export function imageTaskLedgerReferenceId(requestId: string): string {
  return requestId;
}
