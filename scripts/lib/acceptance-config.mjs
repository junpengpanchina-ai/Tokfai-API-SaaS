/**
 * Shared acceptance mode resolution for internal operator scripts.
 * Default: offline/mock — never hit api.tokfai.com without LIVE=1 or --live.
 */

export const PRODUCTION_API_BASE = "https://api.tokfai.com/v1";
export const DEFAULT_MOCK_HOST = "127.0.0.1";
export const DEFAULT_MOCK_PORT = 8787;
export const DEFAULT_MOCK_KEY = `sk-tokfai_${"a".repeat(48)}`;

export function acceptanceTestRunId() {
  return (process.env.TOKFAI_ACCEPTANCE_RUN ?? "p787").trim() || "p787";
}

export function isLiveMode(argv = process.argv) {
  const liveEnv = process.env.LIVE;
  if (liveEnv === "1" || liveEnv === "true" || liveEnv === "yes") return true;
  return argv.includes("--live");
}

export function getMockBaseUrl() {
  const host = process.env.MOCK_HOST ?? DEFAULT_MOCK_HOST;
  const port = parseInt(process.env.MOCK_PORT ?? String(DEFAULT_MOCK_PORT), 10);
  return `http://${host}:${port}/v1`;
}

/**
 * Resolve API base for acceptance scripts.
 * Offline mode ALWAYS uses the mock URL (MOCK_HOST/MOCK_PORT) and ignores
 * TOKFAI_API_BASE so a production server env cannot hijack offline smokes
 * onto real DMIT (which then 401s on the mock key).
 */
export function resolveApiBaseUrl(live) {
  if (live) {
    const explicit = process.env.TOKFAI_API_BASE;
    if (explicit) return explicit.replace(/\/+$/, "");
    return PRODUCTION_API_BASE;
  }
  return getMockBaseUrl();
}

/**
 * Resolve the API key for acceptance scripts.
 * Offline: prefer the key returned by ensureMockGateway / MOCK_API_KEY /
 * DEFAULT_MOCK_KEY. Never use TOKFAI_API_KEY offline (production key ≠ mock).
 */
export function resolveAcceptanceApiKey(live, mockApiKey) {
  if (live) {
    return (process.env.TOKFAI_API_KEY ?? "").trim();
  }
  return (
    mockApiKey ||
    process.env.MOCK_API_KEY ||
    DEFAULT_MOCK_KEY
  ).trim();
}

export function printOfflineDefaultHint(scriptPath) {
  console.log("Offline acceptance is the default — production API is not contacted.");
  console.log(`  Offline: node scripts/p786-offline-customer-acceptance.mjs`);
  console.log(`  Live:    LIVE=1 node ${scriptPath}`);
  console.log(`           LIVE=1 node scripts/p787-live-smoke.mjs`);
}

export function exitUnlessLive(scriptPath) {
  if (isLiveMode()) return true;
  printOfflineDefaultHint(scriptPath);
  process.exit(2);
}
