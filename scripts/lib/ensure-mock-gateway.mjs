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

export async function waitForMock(baseUrl, apiKey, attempts = 30, delayMs = 300) {
  const url = `${baseUrl.replace(/\/+$/, "")}/models`;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return true;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/**
 * Start mock gateway if not already reachable.
 * @returns {{ spawned: boolean, child?: import('node:child_process').ChildProcess, baseUrl: string, apiKey: string }}
 */
export async function ensureMockGateway(options = {}) {
  const host = options.host ?? process.env.MOCK_HOST ?? DEFAULT_MOCK_HOST;
  const port = parseInt(
    options.port ?? process.env.MOCK_PORT ?? String(DEFAULT_MOCK_PORT),
    10
  );
  const apiKey = options.apiKey ?? process.env.MOCK_API_KEY ?? DEFAULT_MOCK_KEY;
  const baseUrl = `http://${host}:${port}/v1`;

  const ready = await waitForMock(baseUrl, apiKey, 3, 200);
  if (ready) {
    return { spawned: false, baseUrl, apiKey };
  }

  const child = spawn(process.execPath, [MOCK_SCRIPT], {
    env: {
      ...process.env,
      MOCK_HOST: host,
      MOCK_PORT: String(port),
      MOCK_API_KEY: apiKey,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const up = await waitForMock(baseUrl, apiKey);
  if (!up) {
    child.kill();
    throw new Error("Mock gateway failed to start");
  }

  return { spawned: true, child, baseUrl, apiKey };
}

export { getMockBaseUrl, DEFAULT_MOCK_KEY };
