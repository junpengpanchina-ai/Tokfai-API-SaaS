#!/usr/bin/env node
/**
 * Offline smoke for Tokfai + dify OpenAI-compatible integration.
 * Default: mock only. LIVE=1 may call https://api.tokfai.com/v1.
 * Does not exercise image generation or load tests.
 *
 * Usage: node scripts/p924-dify-client-smoke.mjs
 */

import { runThirdPartyClientSmoke } from "./lib/third-party-client-smoke.mjs";

await runThirdPartyClientSmoke("dify", "scripts/p924-dify-client-smoke.mjs");
