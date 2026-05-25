import { ApiError } from "../errors.js";

export type ImageUrlResolveSource =
  | "direct"
  | "google_imgres"
  | "html_og_image"
  | "html_twitter_image"
  | "html_first_image";

export interface ResolvedImageInputUrl {
  url: string;
  source: ImageUrlResolveSource;
}

const RESOLVE_FETCH_TIMEOUT_MS = 8_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 5;

const IMAGE_EXTENSIONS = /\.(png|jpe?g|webp)(\?|$)/i;

const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
]);

const USER_AGENT =
  "Tokfai-Image-URL-Resolver/1.0 (+https://tokfai.com)";

export function sanitizeImageUrlForLog(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const pathWithQuery = `${parsed.pathname}${parsed.search}`;
    return `${parsed.host}${pathWithQuery.slice(0, 80)}`;
  } catch {
    return "(invalid-url)";
  }
}

export async function resolveImageInputUrl(
  rawUrl: string
): Promise<ResolvedImageInputUrl> {
  try {
    return await resolveImageInputUrlInner(rawUrl);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw resolveError(
      "image_url_resolve_failed",
      "Could not resolve the image URL."
    );
  }
}

async function resolveImageInputUrlInner(
  rawUrl: string
): Promise<ResolvedImageInputUrl> {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    throw resolveError("invalid_image_url", "Image URL is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw resolveError("invalid_image_url", "Image URL must be a valid URL.");
  }

  assertFetchableUrl(parsed);

  if (hasGoogleImgUrlParam(parsed) || isGoogleImgresUrl(parsed)) {
    const imgUrl = extractGoogleImgUrl(parsed);
    if (!imgUrl) {
      throw resolveError(
        "no_image_found_on_page",
        "Could not find an image URL in this link."
      );
    }
    const inner = await resolveImageInputUrlInner(safeDecodeURIComponent(imgUrl));
    return { url: inner.url, source: "google_imgres" };
  }

  if (hasDirectImagePath(parsed.pathname)) {
    await assertResolvableImageUrl(parsed.toString());
    return { url: parsed.toString(), source: "direct" };
  }

  const headResult = await probeImageContentType(parsed.toString());
  if (headResult.isImage) {
    return { url: parsed.toString(), source: "direct" };
  }

  const html = await fetchHtml(parsed.toString());
  const candidates = extractImageCandidatesFromHtml(html, parsed);

  for (const candidate of candidates) {
    try {
      assertFetchableUrl(new URL(candidate.url));
      await assertResolvableImageUrl(candidate.url);
      return { url: candidate.url, source: candidate.source };
    } catch (err) {
      if (err instanceof ApiError && err.code === "unsupported_image_content_type") {
        continue;
      }
      if (err instanceof ApiError && err.code === "image_url_unreachable") {
        continue;
      }
      throw err;
    }
  }

  throw resolveError(
    "no_image_found_on_page",
    "Could not find a usable image on this page."
  );
}

export async function resolveImageInputUrls(
  rawUrls: string[]
): Promise<ResolvedImageInputUrl[]> {
  const resolved: ResolvedImageInputUrl[] = [];
  for (const rawUrl of rawUrls) {
    resolved.push(await resolveImageInputUrl(rawUrl));
  }
  return resolved;
}

function resolveError(code: string, publicMessage: string): ApiError {
  return ApiError.badRequest(publicMessage, code);
}

function assertFetchableUrl(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw resolveError(
      "invalid_image_url",
      "Only http and https image URLs are supported."
    );
  }

  if (isBlockedHostname(url.hostname)) {
    throw resolveError("invalid_image_url", "This image URL is not allowed.");
  }
}

function isBlockedHostname(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;

  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local")
  ) {
    return true;
  }

  if (host === "::1" || host === "[::1]") {
    return true;
  }

  const withoutBrackets =
    host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;

  if (isPrivateOrMetadataIpv4(withoutBrackets)) {
    return true;
  }

  if (isPrivateOrMetadataIpv6(withoutBrackets)) {
    return true;
  }

  return false;
}

function isPrivateOrMetadataIpv4(host: string): boolean {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;

  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }

  const a = octets[0]!;
  const b = octets[1]!;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;

  return false;
}

function isPrivateOrMetadataIpv6(host: string): boolean {
  if (!host.includes(":")) return false;

  const normalized = host.toLowerCase();
  if (normalized === "::1") return true;
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  if (
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb")
  ) {
    return true;
  }

  return false;
}

function hasDirectImagePath(pathname: string): boolean {
  return IMAGE_EXTENSIONS.test(pathname);
}

function isGoogleImgresUrl(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return host.includes("google.") && url.pathname.includes("/imgres");
}

function hasGoogleImgUrlParam(url: URL): boolean {
  return url.searchParams.has("imgurl");
}

function extractGoogleImgUrl(url: URL): string | null {
  const imgUrl = url.searchParams.get("imgurl");
  if (!imgUrl?.trim()) return null;
  return imgUrl.trim();
}

async function assertResolvableImageUrl(url: string): Promise<void> {
  const probe = await probeImageContentType(url);
  if (!probe.isImage) {
    throw resolveError(
      "unsupported_image_content_type",
      "URL does not point to a supported image (PNG, JPG, or WEBP)."
    );
  }
}

async function probeImageContentType(
  url: string
): Promise<{ isImage: boolean; contentType: string | null }> {
  const validated = validateUrlBeforeFetch(url);

  let response: Response;
  try {
    response = await fetchWithLimits(validated, {
      method: "HEAD",
      maxBytes: 0,
    });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw resolveError(
      "image_url_unreachable",
      "Could not reach the image URL."
    );
  }

  if (response.status >= 400) {
    try {
      response = await fetchWithLimits(validated, {
        method: "GET",
        maxBytes: 64 * 1024,
      });
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw resolveError(
        "image_url_unreachable",
        "Could not reach the image URL."
      );
    }
  }

  const contentType = normalizeContentType(
    response.headers.get("content-type")
  );

  return {
    isImage: contentType ? ALLOWED_IMAGE_CONTENT_TYPES.has(contentType) : false,
    contentType,
  };
}

async function fetchHtml(url: string): Promise<string> {
  const validated = validateUrlBeforeFetch(url);

  let response: Response;
  try {
    response = await fetchWithLimits(validated, {
      method: "GET",
      maxBytes: MAX_HTML_BYTES,
      accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8",
    });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw resolveError(
      "image_url_unreachable",
      "Could not fetch the page URL."
    );
  }

  if (!response.ok) {
    throw resolveError(
      "image_url_unreachable",
      "Could not fetch the page URL."
    );
  }

  const contentType = normalizeContentType(
    response.headers.get("content-type")
  );
  if (contentType?.startsWith("image/")) {
    throw resolveError(
      "image_url_resolve_failed",
      "Expected a webpage but received an image response."
    );
  }

  return response.text();
}

function validateUrlBeforeFetch(url: string, redirectCount = 0): string {
  if (redirectCount > MAX_REDIRECTS) {
    throw resolveError("image_url_resolve_failed", "Too many redirects.");
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw resolveError("invalid_image_url", "Image URL must be a valid URL.");
  }

  assertFetchableUrl(parsed);
  return parsed.toString();
}

async function fetchWithLimits(
  url: string,
  options: {
    method: "GET" | "HEAD";
    maxBytes: number;
    accept?: string;
  },
  redirectCount = 0
): Promise<Response> {
  const headers: Record<string, string> = {
    "User-Agent": USER_AGENT,
  };
  if (options.accept) {
    headers.Accept = options.accept;
  }

  const response = await fetch(url, {
    method: options.method,
    headers,
    redirect: "manual",
    signal: AbortSignal.timeout(RESOLVE_FETCH_TIMEOUT_MS),
  });

  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) {
      throw resolveError(
        "image_url_unreachable",
        "Redirect response missing location."
      );
    }
    const nextRedirect = redirectCount + 1;
    if (nextRedirect > MAX_REDIRECTS) {
      throw resolveError("image_url_resolve_failed", "Too many redirects.");
    }
    const nextUrl = new URL(location, url).toString();
    validateUrlBeforeFetch(nextUrl, nextRedirect);
    return fetchWithLimits(nextUrl, options, nextRedirect);
  }

  if (options.method === "GET" && options.maxBytes > 0) {
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
      if (total > options.maxBytes) {
        await reader.cancel();
        break;
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

  return response;
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

function normalizeContentType(value: string | null): string | null {
  if (!value) return null;
  return value.split(";")[0]?.trim().toLowerCase() ?? null;
}

interface HtmlImageCandidate {
  url: string;
  source: ImageUrlResolveSource;
}

function extractImageCandidatesFromHtml(
  html: string,
  pageUrl: URL
): HtmlImageCandidate[] {
  const candidates: HtmlImageCandidate[] = [];

  const ogImage = extractMetaContent(html, "og:image");
  if (ogImage) {
    candidates.push({
      url: toAbsoluteUrl(ogImage, pageUrl),
      source: "html_og_image",
    });
  }

  const twitterImage = extractMetaContent(html, "twitter:image");
  if (twitterImage) {
    candidates.push({
      url: toAbsoluteUrl(twitterImage, pageUrl),
      source: "html_twitter_image",
    });
  }

  const imageSrcLink = extractLinkRelImageSrc(html);
  if (imageSrcLink) {
    candidates.push({
      url: toAbsoluteUrl(imageSrcLink, pageUrl),
      source: "html_first_image",
    });
  }

  const firstImg = extractFirstImgSrc(html);
  if (firstImg) {
    candidates.push({
      url: toAbsoluteUrl(firstImg, pageUrl),
      source: "html_first_image",
    });
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.url)) return false;
    seen.add(candidate.url);
    return true;
  });
}

function extractMetaContent(html: string, key: string): string | null {
  const escaped = escapeRegExp(key);
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`,
      "i"
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`,
      "i"
    ),
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1].trim());
    }
  }

  return null;
}

function extractLinkRelImageSrc(html: string): string | null {
  const pattern =
    /<link[^>]+rel=["'][^"']*image_src[^"']*["'][^>]+href=["']([^"']+)["']/i;
  const match = html.match(pattern);
  if (match?.[1]) return decodeHtmlEntities(match[1].trim());

  const reversePattern =
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*image_src[^"']*["']/i;
  const reverseMatch = html.match(reversePattern);
  return reverseMatch?.[1]
    ? decodeHtmlEntities(reverseMatch[1].trim())
    : null;
}

function extractFirstImgSrc(html: string): string | null {
  const pattern = /<img[^>]+src=["']([^"']+)["']/i;
  const match = html.match(pattern);
  return match?.[1] ? decodeHtmlEntities(match[1].trim()) : null;
}

function toAbsoluteUrl(src: string, pageUrl: URL): string {
  try {
    return new URL(src, pageUrl).toString();
  } catch {
    throw resolveError("invalid_image_url", "Resolved image URL is invalid.");
  }
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
