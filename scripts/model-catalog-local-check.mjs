#!/usr/bin/env node
/**
 * Offline model catalog guard checks (no live API / DB required).
 *
 * Usage: node scripts/model-catalog-local-check.mjs
 */

import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

execFileSync("npx", ["tsx", "scripts/model-catalog-local-check.ts"], {
  cwd: path.join(root, "apps/dmit-api"),
  stdio: "inherit",
});
