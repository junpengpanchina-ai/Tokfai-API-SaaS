/**
 * Shared offline/LIVE bootstrap for p910–p915 client compat smokes.
 */

import {
  isLiveMode,
  printOfflineDefaultHint,
  resolveAcceptanceApiKey,
  resolveApiBaseUrl,
} from "./acceptance-config.mjs";
import { ensureMockGateway } from "./ensure-mock-gateway.mjs";
import { acceptanceFetch } from "./acceptance-http.mjs";

export async function bootstrapClientCompatSmoke(scriptPath) {
  const LIVE = isLiveMode();
  let mockChild = null;
  let BASE;
  let API_KEY;

  if (!LIVE) {
    printOfflineDefaultHint(scriptPath);
    const mock = await ensureMockGateway();
    mockChild = mock.child ?? null;
    BASE = mock.baseUrl.replace(/\/v1$/, "");
    API_KEY = resolveAcceptanceApiKey(false, mock.apiKey);
  } else {
    BASE = resolveApiBaseUrl(true).replace(/\/v1$/, "");
    API_KEY = resolveAcceptanceApiKey(true);
    if (!API_KEY.startsWith("sk-tokfai_")) {
      throw new Error("LIVE=1 requires TOKFAI_API_KEY=sk-tokfai_...");
    }
  }

  const TIMEOUT_MS = Math.max(
    1000,
    parseInt(process.env.CHAT_TIMEOUT_MS ?? "120000", 10) || 120_000
  );

  function authHeaders(extra = {}) {
    return {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  async function postJson(path, body) {
    return acceptanceFetch(`${BASE}${path}`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify(body),
      timeoutMs: TIMEOUT_MS,
    });
  }

  async function getJson(path) {
    return acceptanceFetch(`${BASE}${path}`, {
      headers: authHeaders(),
      timeoutMs: TIMEOUT_MS,
    });
  }

  function cleanup() {
    if (mockChild) {
      try {
        mockChild.kill();
      } catch {
        // ignore
      }
    }
  }

  console.log(LIVE ? `live: ${BASE}` : `offline mock: ${BASE}`);
  console.log(`api_key: ${API_KEY.slice(0, 14)}… (len=${API_KEY.length})`);
  console.log("");

  return { LIVE, BASE, API_KEY, TIMEOUT_MS, postJson, getJson, cleanup, authHeaders };
}

export function pass(label) {
  console.log(`PASS  ${label}`);
  return true;
}

export function fail(label, detail) {
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
  return false;
}
