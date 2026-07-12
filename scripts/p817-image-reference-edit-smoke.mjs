#!/usr/bin/env node
/**
 * P817 — Reference-image edit smoke.
 *
 * Offline (default): mock gateway + local normalize unit checks via tsx.
 * Live: LIVE=1 TOKFAI_API_KEY=sk-tokfai_... node scripts/p817-image-reference-edit-smoke.mjs
 *
 * Asserts:
 * 1) dataURL reference images are accepted
 * 2) images_count / upstream_images_count >= 1
 * 3) blob URLs are rejected / blocked
 * 4) reference edit without images → 400 reference_image_missing
 * 5) plain text-to-image without images still works
 */

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_MOCK_KEY,
  isLiveMode,
  resolveApiBaseUrl,
  printOfflineDefaultHint,
} from "./lib/acceptance-config.mjs";
import { acceptanceFetch } from "./lib/acceptance-http.mjs";
import { ensureMockGateway } from "./lib/ensure-mock-gateway.mjs";

const SCRIPT = "scripts/p817-image-reference-edit-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LIVE = isLiveMode();
let mockChild = null;

const TINY_PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

if (!LIVE) {
  const mock = await ensureMockGateway();
  mockChild = mock.child;
}

const BASE = resolveApiBaseUrl(LIVE).replace(/\/v1$/, "");
const API_KEY = LIVE
  ? process.env.TOKFAI_API_KEY ?? ""
  : process.env.TOKFAI_API_KEY ?? process.env.MOCK_API_KEY ?? DEFAULT_MOCK_KEY;

const TIMEOUT_MS = Math.max(
  1000,
  parseInt(process.env.IMAGE_TIMEOUT_MS ?? "120000", 10) || 120_000
);

function pass(label) {
  console.log(`PASS  ${label}`);
  return true;
}

function fail(label, detail) {
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
  return false;
}

function errorCode(body) {
  return body?.error?.code ?? body?.code ?? null;
}

async function postImages(body) {
  return acceptanceFetch(`${BASE}/v1/images/generations`, {
    method: "POST",
    timeoutMs: TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

async function runNormalizeUnitChecks() {
  return new Promise((resolve) => {
    const tsxCli = join(
      ROOT,
      "apps/dmit-api/node_modules/tsx/dist/cli.mjs"
    );
    const child = spawn(
      process.execPath,
      [tsxCli, join(ROOT, "scripts/p817-normalize-image-inputs-unit.mts")],
      {
        cwd: ROOT,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (code) => {
      if (stdout.trim()) process.stdout.write(stdout);
      if (stderr.trim()) process.stderr.write(stderr);
      resolve(code === 0);
    });
  });
}

async function run() {
  if (!LIVE) {
    printOfflineDefaultHint(SCRIPT);
    console.log(`offline mock: ${BASE}/v1/images/generations`);
    console.log("");
  } else {
    console.log(`live production: ${BASE}/v1/images/generations`);
    console.log("");
  }

  if (!API_KEY) {
    fail("API key present", "TOKFAI_API_KEY is required in LIVE mode");
    process.exit(1);
  }

  let ok = true;

  // --- Local normalize unit checks (source of truth for DMIT) ---
  {
    const unitOk = await runNormalizeUnitChecks();
    ok =
      (unitOk
        ? pass("normalizeImageInputs unit checks")
        : fail("normalizeImageInputs unit checks")) && ok;
  }

  // --- Reference edit with dataURL images ---
  {
    const { res, body } = await postImages({
      model: "nano-banana-fast",
      prompt: "保留人物主体，把西装换成龙袍",
      images: [TINY_PNG_DATA_URL],
      size: "1024x1024",
      mode: "reference_edit",
      response_format: "url",
      n: 1,
    });

    const imagesCount = body?.images_count ?? body?.input_images_count ?? 0;
    const upstreamCount = body?.upstream_images_count ?? 0;
    const requestId = body?.request_id ?? null;

    if (
      res.status === 200 &&
      imagesCount >= 1 &&
      upstreamCount >= 1 &&
      requestId &&
      Array.isArray(body?.data) &&
      body.data[0]?.url
    ) {
      ok =
        pass(
          "POST /v1/images/generations with images dataURL (reference_edit)"
        ) && ok;
    } else {
      ok =
        fail(
          "POST /v1/images/generations with images dataURL (reference_edit)",
          `status=${res.status} images_count=${imagesCount} upstream_images_count=${upstreamCount} request_id=${requestId} code=${errorCode(body)}`
        ) && ok;
    }
  }

  // --- text_to_image without images still works ---
  {
    const { res, body } = await postImages({
      model: "nano-banana-fast",
      prompt: "a clean product photo of a ceramic mug on white background",
      size: "1024x1024",
      mode: "text_to_image",
      response_format: "url",
      n: 1,
    });

    if (res.status === 200 && Array.isArray(body?.data) && body.data[0]?.url) {
      ok = pass("POST /v1/images/generations text_to_image without images") && ok;
    } else {
      ok =
        fail(
          "POST /v1/images/generations text_to_image without images",
          `status=${res.status} code=${errorCode(body)}`
        ) && ok;
    }
  }

  // --- reference intent without images → 400 ---
  {
    const { res, body } = await postImages({
      model: "nano-banana-fast",
      prompt: "保留人物主体，把西装换成龙袍",
      size: "1024x1024",
      mode: "reference_edit",
      response_format: "url",
      n: 1,
    });

    if (res.status === 400 && errorCode(body) === "reference_image_missing") {
      ok =
        pass(
          "POST without images + 保留人物主体 → 400 reference_image_missing"
        ) && ok;
    } else {
      ok =
        fail(
          "POST without images + 保留人物主体 → 400 reference_image_missing",
          `status=${res.status} code=${errorCode(body)}`
        ) && ok;
    }
  }

  // --- blob URL blocked ---
  {
    const { res, body } = await postImages({
      model: "nano-banana-fast",
      prompt: "保留人物主体，把西装换成龙袍",
      images: ["blob:https://tokfai.com/fake-id"],
      size: "1024x1024",
      mode: "reference_edit",
      response_format: "url",
      n: 1,
    });

    const code = errorCode(body);
    if (
      res.status === 400 &&
      (code === "reference_image_missing" || code === "invalid_image_url")
    ) {
      ok = pass("blob: URL is blocked for reference images") && ok;
    } else {
      ok =
        fail(
          "blob: URL is blocked for reference images",
          `status=${res.status} code=${code}`
        ) && ok;
    }
  }

  if (mockChild) {
    mockChild.kill();
  }

  console.log("");
  console.log(ok ? "ALL CHECKS PASSED" : "SOME CHECKS FAILED");
  process.exit(ok ? 0 : 1);
}

run().catch((err) => {
  if (mockChild) mockChild.kill();
  console.error(err);
  process.exit(1);
});
