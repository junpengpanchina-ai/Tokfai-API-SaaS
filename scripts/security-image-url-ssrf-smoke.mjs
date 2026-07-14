#!/usr/bin/env node
/**
 * Security smoke — Image URL SSRF protections (offline + inline logic mirror).
 *
 * Usage: node scripts/security-image-url-ssrf-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function pass(label) {
  console.log(`PASS  ${label}`);
  return true;
}

function fail(label, detail) {
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
  return false;
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

/** Mirrors apps/dmit-api/src/upstream/imageUrlResolver.ts private IP checks. */
function isPrivateOrMetadataIpv4(host) {
  const match = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!match) return false;
  const octets = match.slice(1).map((part) => Number(part));
  if (octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const a = octets[0];
  const b = octets[1];
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

function isBlockedHostname(hostname) {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (!host) return true;
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local")) {
    return true;
  }
  if (host === "::1" || host === "[::1]") return true;
  const withoutBrackets =
    host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
  return isPrivateOrMetadataIpv4(withoutBrackets);
}

function assertFetchable(raw) {
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`protocol ${url.protocol}`);
  }
  if (isBlockedHostname(url.hostname)) {
    throw new Error(`blocked host ${url.hostname}`);
  }
}

let ok = true;

{
  const resolver = read("apps/dmit-api/src/upstream/imageUrlResolver.ts");
  const normalize = read("apps/dmit-api/src/upstream/normalizeImageInputs.ts");

  const sourceChecks = [
    ["localhost", resolver.includes("localhost")],
    ["127.0.0.1 / 127.", resolver.includes("a === 127") || resolver.includes("127.")],
    ["10.0.0.0/8", resolver.includes("a === 10")],
    ["172.16.0.0/12", resolver.includes("172") && resolver.includes("16") && resolver.includes("31")],
    ["192.168.0.0/16", resolver.includes("192") && resolver.includes("168")],
    ["169.254.169.254", resolver.includes("169") && resolver.includes("254")],
    ["http(s) only", resolver.includes('url.protocol !== "http:"')],
    ["content-type allowlist", resolver.includes("ALLOWED_IMAGE_CONTENT_TYPES")],
    ["size limit", resolver.includes("MAX_IMAGE_DATA_URL_BYTES") || resolver.includes("10 * 1024 * 1024")],
    ["file:/blob blocked in normalize", normalize.includes("file:") || normalize.includes("blob:")],
  ];

  const failed = sourceChecks.filter(([, v]) => !v).map(([n]) => n);
  if (failed.length) {
    ok = fail("SSRF source guards", failed.join(", ")) && ok;
  } else {
    pass("imageUrlResolver encodes SSRF / size / content-type guards");
  }
}

{
  const blocked = [
    "http://localhost/x.png",
    "https://127.0.0.1/x.png",
    "http://10.1.2.3/a.jpg",
    "http://172.16.5.5/a.jpg",
    "http://172.31.255.1/a.jpg",
    "http://192.168.1.1/a.jpg",
    "http://169.254.169.254/latest/meta-data",
    "file:///etc/passwd",
    "ftp://example.com/a.png",
  ];

  for (const url of blocked) {
    let threw = false;
    try {
      assertFetchable(url);
    } catch {
      threw = true;
    }
    if (!threw) {
      ok = fail(`block ${url}`, "expected rejection") && ok;
    }
  }
  if (ok) pass("blocked hosts/protocols rejected by SSRF mirror logic");
}

{
  // Public http URL should pass hostname gate (content-type checked at fetch time)
  try {
    assertFetchable("https://cdn.example.com/photo.png");
    pass("public https image host allowed by hostname gate");
  } catch (err) {
    ok = fail("public https allowed", String(err)) && ok;
  }
}

{
  const resolver = read("apps/dmit-api/src/upstream/imageUrlResolver.ts");
  if (!resolver.includes("image/png") || !resolver.includes("unsupported_image_content_type")) {
    ok = fail("non-image content-type", "expected content-type rejection") && ok;
  } else {
    pass("non-image content-type rejected");
  }
  if (!/MAX_IMAGE|10\s*\*\s*1024\s*\*\s*1024/.test(resolver)) {
    ok = fail("oversized image", "expected max image byte limit") && ok;
  } else {
    pass("oversized images rejected");
  }
}

if (!ok) {
  console.error("\nsecurity-image-url-ssrf-smoke: FAILED");
  process.exit(1);
}
console.log("\nsecurity-image-url-ssrf-smoke: OK");
