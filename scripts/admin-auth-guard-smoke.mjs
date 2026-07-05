#!/usr/bin/env node
/**
 * Admin auth guard smoke — verify /admin/* cannot be accessed without admin JWT.
 *
 * Usage:
 *   node scripts/admin-auth-guard-smoke.mjs
 *   TOKFAI_USER_JWT=... TOKFAI_ADMIN_JWT=... node scripts/admin-auth-guard-smoke.mjs
 *
 * Env:
 *   TOKFAI_API_BASE     default https://api.tokfai.com
 *   TOKFAI_USER_JWT     optional — non-admin Supabase access token
 *   TOKFAI_ADMIN_JWT    optional — admin Supabase access token (200 check SKIP if unset)
 */

import { getAcceptanceHeaders } from "./lib/acceptance-http.mjs";

const API_ROOT = normalizeBase(
  process.env.TOKFAI_API_BASE,
  "https://api.tokfai.com"
);
const USER_JWT = (process.env.TOKFAI_USER_JWT ?? "").trim();
const ADMIN_JWT = (process.env.TOKFAI_ADMIN_JWT ?? "").trim();
const TARGET_PATH = "/admin/users";
const TIMEOUT_MS = Math.max(
  5000,
  parseInt(process.env.TOKFAI_AUTH_SMOKE_TIMEOUT_MS ?? "30000", 10) || 30_000
);

const FAKE_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlLXVzZXItaWQifQ.invalid-signature";

/** @type {Array<{ id: string, status: 'PASS'|'WARN'|'FAIL'|'SKIP', detail: string }>} */
const results = [];

function normalizeBase(value, fallback) {
  return (value?.trim() || fallback).replace(/\/+$/, "");
}

function record(id, status, detail) {
  results.push({ id, status, detail });
  console.log(`[${status.padEnd(4)}] ${id} — ${detail}`);
}

function isAuthBlocked(status) {
  return status === 401 || status === 403;
}

async function fetchAdminUsers(token) {
  const url = `${API_ROOT}${TARGET_PATH}`;
  const headers = {
    ...getAcceptanceHeaders(),
    Accept: "application/json",
  };

  if (token !== undefined) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await res.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }

  const code =
    body?.error?.code ??
    (typeof body?.error === "string" ? body.error : null) ??
    null;

  return { status: res.status, code, body };
}

async function checkNoToken() {
  const id = "No token → GET /admin/users";
  try {
    const { status, code } = await fetchAdminUsers(undefined);
    if (isAuthBlocked(status)) {
      record(id, "PASS", `HTTP ${status}${code ? ` (${code})` : ""}`);
      return;
    }
    record(id, "FAIL", `expected 401/403, got HTTP ${status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(id, "FAIL", message);
  }
}

async function checkFakeToken() {
  const id = "Fake token → GET /admin/users";
  try {
    const { status, code } = await fetchAdminUsers(FAKE_JWT);
    if (isAuthBlocked(status)) {
      record(id, "PASS", `HTTP ${status}${code ? ` (${code})` : ""}`);
      return;
    }
    record(id, "FAIL", `expected 401/403, got HTTP ${status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(id, "FAIL", message);
  }
}

async function checkUserToken() {
  const id = "User token → GET /admin/users";
  if (!USER_JWT) {
    record(id, "SKIP", "TOKFAI_USER_JWT not set");
    return;
  }

  try {
    const { status, code } = await fetchAdminUsers(USER_JWT);
    if (isAuthBlocked(status)) {
      record(id, "PASS", `HTTP ${status}${code ? ` (${code})` : ""}`);
      return;
    }
    record(id, "FAIL", `non-admin must get 401/403, got HTTP ${status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(id, "FAIL", message);
  }
}

async function checkAdminToken() {
  const id = "Admin token → GET /admin/users";
  if (!ADMIN_JWT) {
    record(id, "SKIP", "TOKFAI_ADMIN_JWT not set");
    return;
  }

  try {
    const { status, code, body } = await fetchAdminUsers(ADMIN_JWT);
    if (status === 200 && body && typeof body === "object" && "data" in body) {
      const count = Array.isArray(body.data) ? body.data.length : "?";
      record(id, "PASS", `HTTP 200 (data rows=${count})`);
      return;
    }
    if (isAuthBlocked(status)) {
      record(
        id,
        "FAIL",
        `admin JWT rejected: HTTP ${status}${code ? ` (${code})` : ""}`
      );
      return;
    }
    record(id, "FAIL", `expected HTTP 200 JSON, got ${status}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    record(id, "FAIL", message);
  }
}

function printSummary() {
  const counts = { PASS: 0, WARN: 0, FAIL: 0, SKIP: 0 };
  for (const row of results) counts[row.status] += 1;

  console.log("\n=== Summary ===");
  console.log(`API: ${API_ROOT}${TARGET_PATH}`);
  console.log(
    `PASS=${counts.PASS} WARN=${counts.WARN} FAIL=${counts.FAIL} SKIP=${counts.SKIP}`
  );

  if (counts.FAIL > 0) {
    console.log("\nFAILED:");
    for (const row of results.filter((r) => r.status === "FAIL")) {
      console.log(`  - ${row.id}: ${row.detail}`);
    }
    process.exit(1);
  }

  console.log("\nOK — admin auth guard smoke passed.");
}

async function main() {
  console.log("=== Tokfai admin auth guard smoke ===");
  console.log(`API: ${API_ROOT}`);
  console.log("");

  await checkNoToken();
  await checkFakeToken();
  await checkUserToken();
  await checkAdminToken();

  printSummary();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
