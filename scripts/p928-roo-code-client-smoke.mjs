#!/usr/bin/env node
/**
 * Offline smoke for Tokfai + roo-code OpenAI-compatible integration.
 * Default: mock only. LIVE=1 may call https://api.tokfai.com/v1.
 * Does not exercise image generation or load tests.
 *
 * Usage: node scripts/p928-roo-code-client-smoke.mjs
 */

import { runThirdPartyClientSmoke } from "./lib/third-party-client-smoke.mjs";

await runThirdPartyClientSmoke("roo-code", "scripts/p928-roo-code-client-smoke.mjs");
