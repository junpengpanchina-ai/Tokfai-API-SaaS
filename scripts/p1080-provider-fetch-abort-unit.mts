/**
 * P1080 — REAL providerFetch abort unit (mock global fetch only).
 *
 * Proves client AbortSignal aborts the in-flight fetch and does not wait out
 * a long timeout (no 300s zombie).
 *
 *   npx tsx scripts/p1080-provider-fetch-abort-unit.mts
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PASS = "TOKFAI_P1080_PROVIDER_FETCH_ABORT_UNIT_PASS";
const FAIL = "TOKFAI_P1080_PROVIDER_FETCH_ABORT_UNIT_FAIL";

function ensureDummyEnv(): void {
  const set = (k: string, v: string) => {
    if (!process.env[k]) process.env[k] = v;
  };
  set("NODE_ENV", "test");
  set("SUPABASE_URL", "https://example.supabase.co");
  set("SUPABASE_JWT_SECRET", "p1080-fetch-abort-jwt-secret-32chars!");
  set("TOKEN_PEPPER", "p1080-fetch-abort-token-pepper-32chars!");
  set("GRSAI_API_KEY", "p1080-fetch-abort-grsai-key");
  set("STRIPE_WEBHOOK_SECRET", "whsec_p1080_fetch_abort");
  set("TOKFAI_REDIS_ENABLED", "false");
}

ensureDummyEnv();

const originalFetch = globalThis.fetch;
let fetchStarted = 0;
let fetchAborted = 0;

globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
  fetchStarted += 1;
  const signal = init?.signal;
  return await new Promise<Response>((_resolve, reject) => {
    if (signal?.aborted) {
      fetchAborted += 1;
      reject(new DOMException("The operation was aborted.", "AbortError"));
      return;
    }
    const onAbort = () => {
      fetchAborted += 1;
      reject(new DOMException("The operation was aborted.", "AbortError"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    // Never resolves unless aborted — simulates a stuck upstream.
  });
}) as typeof fetch;

const { providerFetch } = await import(
  join(ROOT, "apps/dmit-api/src/upstream/grsai.ts")
);
const { ApiError } = await import(join(ROOT, "apps/dmit-api/src/errors.ts"));

let failed = 0;
function assert(cond: boolean, label: string, detail?: string) {
  if (cond) console.log(`PASS  [P1080 FETCH] ${label}`);
  else {
    failed += 1;
    console.error(`FAIL  [P1080 FETCH] ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const provider = {
  id: "mock",
  label: "mock",
  enabled: true,
  baseUrl: "https://mock.example",
  apiKey: "sk-test",
  chatPath: "/v1/chat/completions",
  timeoutMs: 700_000,
  priority: 1,
  weight: 1,
  supportedModels: "*" as const,
};

{
  const ac = new AbortController();
  const started = Date.now();
  const p = providerFetch(
    provider as any,
    "/v1/chat/completions",
    {
      method: "POST",
      json: { model: "gpt-5.5", messages: [{ role: "user", content: "x" }] },
      timeoutMs: 700_000,
      abortSignal: ac.signal,
    },
    { requestId: "fetch_abort", route: "/v1/responses" }
  );
  await new Promise((r) => setTimeout(r, 30));
  assert(fetchStarted === 1, "fetch started");
  ac.abort();
  let err: unknown;
  try {
    await p;
  } catch (e) {
    err = e;
  }
  const elapsed = Date.now() - started;
  assert(
    err instanceof ApiError && err.code === "client_aborted",
    "throws client_aborted",
    err instanceof ApiError ? err.code : String(err)
  );
  assert(fetchAborted === 1, "underlying fetch aborted");
  assert(elapsed < 5_000, "no long zombie wait", `elapsed=${elapsed}`);
}

globalThis.fetch = originalFetch;

if (failed > 0) {
  console.error(FAIL);
  process.exit(1);
}
console.log(PASS);
process.exit(0);
