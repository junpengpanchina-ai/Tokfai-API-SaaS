import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_MOCK_HOST,
  DEFAULT_MOCK_PORT,
  DEFAULT_MOCK_KEY,
  getMockBaseUrl,
} from "./acceptance-config.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MOCK_SCRIPT = join(ROOT, "scripts/p786-offline-customer-mock.mjs");

/** Fallback when DEFAULT_MOCK_PORT is occupied by real DMIT (also defaults to 8787). */
const FALLBACK_MOCK_PORT = 18787;

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

/**
 * Confirm the process on baseUrl is OUR offline mock and accepts apiKey.
 * GET /v1/models alone is insufficient — real DMIT also serves that route.
 */
export async function isMockGatewayReady(baseUrl, apiKey) {
  const root = baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
  try {
    const modelsRes = await fetch(`${root}/v1/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!modelsRes.ok) return false;
    const modelsBody = await modelsRes.json().catch(() => null);
    const ids = Array.isArray(modelsBody?.data)
      ? modelsBody.data.map((r) => r.id)
      : [];
    // Mock catalog always includes these compat aliases.
    if (!ids.includes("gpt-5.4-pro") || !ids.includes("gpt-5")) return false;

    const chatRes = await fetch(`${root}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5",
        messages: [{ role: "user", content: "Say ok only." }],
        stream: false,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (chatRes.status === 401 || chatRes.status === 403) return false;
    if (!chatRes.ok) return false;
    const chatBody = await chatRes.json().catch(() => null);
    // Mock responses always include tokfai.resolved_model.
    if (chatBody?.tokfai?.resolved_model !== "gpt-5") return false;
    if (typeof chatBody?.request_id !== "string") return false;

    // Require p914 error-trigger support so stale mocks are not reused.
    const errRes = await fetch(`${root}/v1/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "__tokfai_mock_insufficient_credits",
        messages: [{ role: "user", content: "hi" }],
        stream: false,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (errRes.status !== 402) return false;

    // Require vision analyze route so stale mocks are not reused after P942.
    const visionRes = await fetch(`${root}/v1/vision/analyze`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "vision-auto",
        image_url: "https://cdn.tokfai.com/demo.png",
        prompt: "ok",
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!visionRes.ok) return false;
    const visionBody = await visionRes.json().catch(() => null);
    if (visionBody?.object !== "vision.analysis") return false;

    return true;
  } catch {
    return false;
  }
}

/** @deprecated use isMockGatewayReady — kept for older callers */
export async function waitForMock(baseUrl, apiKey, attempts = 30, delayMs = 300) {
  for (let i = 0; i < attempts; i++) {
    if (await isMockGatewayReady(baseUrl, apiKey)) return true;
    await sleep(delayMs);
  }
  return false;
}

function spawnMock({ host, port, apiKey }) {
  return spawn(process.execPath, [MOCK_SCRIPT], {
    env: {
      ...process.env,
      // Isolate child from production key / API base hijacks.
      TOKFAI_API_KEY: "",
      TOKFAI_API_BASE: "",
      LIVE: "",
      MOCK_HOST: host,
      MOCK_PORT: String(port),
      MOCK_API_KEY: apiKey,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/**
 * Start (or attach to) the offline mock gateway.
 * Always returns the apiKey that the mock accepts — callers must use it.
 *
 * @returns {Promise<{
 *   spawned: boolean,
 *   child?: import('node:child_process').ChildProcess,
 *   baseUrl: string,
 *   apiKey: string,
 *   host: string,
 *   port: number,
 * }>}
 */
export async function ensureMockGateway(options = {}) {
  const host = options.host ?? process.env.MOCK_HOST ?? DEFAULT_MOCK_HOST;
  // Offline mock key must NOT come from TOKFAI_API_KEY (production key → 401 on mock).
  const apiKey =
    options.apiKey ?? process.env.MOCK_API_KEY ?? DEFAULT_MOCK_KEY;
  const preferredPort = parseInt(
    options.port ?? process.env.MOCK_PORT ?? String(DEFAULT_MOCK_PORT),
    10
  );
  const portsToTry = [
    preferredPort,
    ...(preferredPort === FALLBACK_MOCK_PORT ? [] : [FALLBACK_MOCK_PORT]),
  ];

  for (const port of portsToTry) {
    const baseUrl = `http://${host}:${port}/v1`;
    if (await isMockGatewayReady(baseUrl, apiKey)) {
      return { spawned: false, baseUrl, apiKey, host, port };
    }
  }

  for (const port of portsToTry) {
    const baseUrl = `http://${host}:${port}/v1`;
    const child = spawnMock({ host, port, apiKey });

    let spawnError = null;
    child.once("error", (err) => {
      spawnError = err;
    });

    const up = await waitForMock(baseUrl, apiKey, 40, 250);
    if (up) {
      return { spawned: true, child, baseUrl, apiKey, host, port };
    }

    child.kill();
    if (spawnError) {
      // try next port
      continue;
    }
  }

  throw new Error(
    `Mock gateway failed to start on ports ${portsToTry.join(", ")}. ` +
      `Port ${preferredPort} may be occupied by real DMIT — tried fallback ${FALLBACK_MOCK_PORT}.`
  );
}

export { getMockBaseUrl, DEFAULT_MOCK_KEY };
