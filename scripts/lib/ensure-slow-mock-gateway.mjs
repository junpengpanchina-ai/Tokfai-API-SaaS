import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SLOW_MOCK_SCRIPT = join(ROOT, "scripts/p792-slow-upstream-mock.mjs");

export const DEFAULT_SLOW_MOCK_HOST = "127.0.0.1";
export const DEFAULT_SLOW_MOCK_PORT = 8788;
export const DEFAULT_SLOW_MOCK_KEY = "sk-tokfai_mock_acceptance";

export async function waitForSlowMock(baseUrl, apiKey, attempts = 40, delayMs = 500) {
  const url = `${baseUrl.replace(/\/+$/, "")}/models`;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
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
 * Start P792 slow upstream mock if not already reachable.
 * @returns {{ spawned: boolean, child?: import('node:child_process').ChildProcess, baseUrl: string, apiKey: string }}
 */
export async function ensureSlowMockGateway(options = {}) {
  const host = options.host ?? process.env.MOCK_HOST ?? DEFAULT_SLOW_MOCK_HOST;
  const port = parseInt(
    options.port ?? process.env.MOCK_PORT ?? String(DEFAULT_SLOW_MOCK_PORT),
    10
  );
  const apiKey = options.apiKey ?? process.env.MOCK_API_KEY ?? DEFAULT_SLOW_MOCK_KEY;
  const baseUrl = `http://${host}:${port}/v1`;

  const ready = await waitForSlowMock(baseUrl, apiKey, 3, 200);
  if (ready) {
    return { spawned: false, baseUrl, apiKey };
  }

  const child = spawn(process.execPath, [SLOW_MOCK_SCRIPT], {
    env: {
      ...process.env,
      MOCK_HOST: host,
      MOCK_PORT: String(port),
      MOCK_API_KEY: apiKey,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const up = await waitForSlowMock(baseUrl, apiKey);
  if (!up) {
    child.kill();
    throw new Error("P792 slow mock gateway failed to start");
  }

  return { spawned: true, child, baseUrl, apiKey };
}
