#!/usr/bin/env node
/**
 * Offline smoke for Tokfai + nextchat OpenAI-compatible integration.
 * Default: mock only. LIVE=1 may call https://api.tokfai.com/v1.
 * Does not exercise image generation or load tests.
 *
 * Usage: node scripts/p922-nextchat-client-smoke.mjs
 */

import { runThirdPartyClientSmoke } from "./lib/third-party-client-smoke.mjs";

await runThirdPartyClientSmoke("nextchat", "scripts/p922-nextchat-client-smoke.mjs");
