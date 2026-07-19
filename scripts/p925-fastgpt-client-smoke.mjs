#!/usr/bin/env node
/**
 * Offline smoke for Tokfai + fastgpt OpenAI-compatible integration.
 * Default: mock only. LIVE=1 may call https://api.tokfai.com/v1.
 * Does not exercise image generation or load tests.
 *
 * Usage: node scripts/p925-fastgpt-client-smoke.mjs
 */

import { runThirdPartyClientSmoke } from "./lib/third-party-client-smoke.mjs";

await runThirdPartyClientSmoke("fastgpt", "scripts/p925-fastgpt-client-smoke.mjs");
