#!/usr/bin/env node
/**
 * P830 — Image workbench grounding / no-smoke-prompt smoke (offline, static).
 *
 * Checks:
 * 1) vision requires uploaded image
 * 2) copywriting uses image analysis when image exists
 * 3) generated prompt includes user purpose and extra requirement
 * 4) no default smoke prompt in consumer image requests
 * 5) result text must reference uploaded image context (prompt contract)
 *
 * Usage: node scripts/p830-image-workbench-grounding-smoke.mjs
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function pass(label) {
  console.log(`PASS  ${label}`);
  return true;
}

function fail(label, detail) {
  console.error(`FAIL  ${label}`);
  if (detail) console.error(`      ${detail}`);
  return false;
}

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function checkVisionRequiresImage() {
  const vision = read(
    "apps/web/app/dashboard/image-playground/ecommerce-vision-tab.tsx"
  );
  const prompts = read(
    "apps/web/lib/dashboard-safe/ecommerce-image-analysis.ts"
  );

  if (!vision.includes("analysisNeedsImage") && !vision.includes("needImage")) {
    return fail("image workbench vision requires uploaded image", "no needImage gate");
  }
  if (!vision.includes("!isCopyMode && readyUrls.length === 0")) {
    return fail(
      "image workbench vision requires uploaded image",
      "analysis path does not block without image"
    );
  }
  if (!prompts.includes("用户已上传一张真实图片") || !prompts.includes("禁止编造")) {
    return fail(
      "image workbench vision requires uploaded image",
      "understand prompt not grounded"
    );
  }
  if (!prompts.includes("风险与注意事项") || !prompts.includes("平台建议")) {
    return fail(
      "image workbench vision requires uploaded image",
      "missing risk/platform sections"
    );
  }

  return pass("image workbench vision requires uploaded image");
}

function checkCopyUsesImageAnalysis() {
  const vision = read(
    "apps/web/app/dashboard/image-playground/ecommerce-vision-tab.tsx"
  );
  const prompts = read(
    "apps/web/lib/dashboard-safe/ecommerce-image-analysis.ts"
  );

  if (!vision.includes("hasImage: readyUrls.length > 0")) {
    return fail(
      "copywriting uses image analysis when image exists",
      "hasImage not passed to prompt builder"
    );
  }
  if (!prompts.includes("先基于图片做结构化理解")) {
    return fail(
      "copywriting uses image analysis when image exists",
      "missing structured-understanding instruction"
    );
  }
  if (!prompts.includes("必须引用图片里的真实元素")) {
    return fail(
      "copywriting uses image analysis when image exists",
      "missing cite-visual-elements instruction"
    );
  }
  if (!prompts.includes("未上传图片，以下基于文字需求生成")) {
    return fail(
      "copywriting uses image analysis when image exists",
      "missing no-image text-only branch"
    );
  }
  if (!vision.includes("copyNoImageHint")) {
    return fail(
      "copywriting uses image analysis when image exists",
      "UI missing no-image hint"
    );
  }

  return pass("copywriting uses image analysis when image exists");
}

function checkGeneratePromptAssemblesUserInput() {
  const builder = read(
    "apps/web/lib/dashboard-safe/image-workbench-generate-prompt.ts"
  );
  const client = read(
    "apps/web/app/dashboard/image-playground/image-playground-client.tsx"
  );

  if (!builder.includes("用途：") || !builder.includes("风格：")) {
    return fail(
      "generated prompt includes user purpose and extra requirement",
      "builder missing purpose/style lines"
    );
  }
  if (!builder.includes("用户补充需求：") && !builder.includes("extraNeed")) {
    return fail(
      "generated prompt includes user purpose and extra requirement",
      "builder missing extraNeed"
    );
  }
  if (!client.includes("buildImageWorkbenchGeneratePrompt")) {
    return fail(
      "generated prompt includes user purpose and extra requirement",
      "client not using builder"
    );
  }
  if (!client.includes("generatePurpose") || !client.includes("generateStyle")) {
    return fail(
      "generated prompt includes user purpose and extra requirement",
      "client missing purpose/style state"
    );
  }

  return pass("generated prompt includes user purpose and extra requirement");
}

function checkNoSmokeDefault() {
  const presets = read(
    "apps/web/app/dashboard/image-playground/image-playground-presets.ts"
  );
  const client = read(
    "apps/web/app/dashboard/image-playground/image-playground-client.tsx"
  );
  const labels = read(
    "apps/web/app/dashboard/image-playground/image-playground-labels.ts"
  );
  const analysis = read(
    "apps/web/lib/dashboard-safe/ecommerce-image-analysis.ts"
  );

  if (!presets.includes('IMAGE_PLAYGROUND_DEFAULT_PROMPT = ""')) {
    return fail(
      "no default smoke prompt in consumer image requests",
      "DEFAULT_PROMPT is not empty"
    );
  }
  if (/futuristic API dashboard/i.test(client)) {
    return fail(
      "no default smoke prompt in consumer image requests",
      "client still references futuristic API dashboard"
    );
  }
  if (/futuristic API dashboard/i.test(labels)) {
    return fail(
      "no default smoke prompt in consumer image requests",
      "labels still contain smoke product prompt"
    );
  }
  if (client.includes("|| IMAGE_PLAYGROUND_DEFAULT_PROMPT")) {
    return fail(
      "no default smoke prompt in consumer image requests",
      "fallback still uses DEFAULT_PROMPT"
    );
  }
  if (!analysis.includes("isImageWorkbenchSmokePrompt")) {
    return fail(
      "no default smoke prompt in consumer image requests",
      "smoke detector missing"
    );
  }
  if (!client.includes("smokePromptBlocked") && !client.includes("isImageWorkbenchSmokePrompt")) {
    return fail(
      "no default smoke prompt in consumer image requests",
      "client does not block smoke prompts"
    );
  }

  return pass("no default smoke prompt in consumer image requests");
}

function checkResultMustReferenceImageContext() {
  const prompts = read(
    "apps/web/lib/dashboard-safe/ecommerce-image-analysis.ts"
  );

  const required = [
    "图片是唯一事实来源",
    "与图片无关的泛文案",
    "淘宝/拼多多商品图",
    "用户补充说明（必须纳入分析）",
    "用户补充需求（必须优先服从）",
  ];
  const missing = required.filter((s) => !prompts.includes(s));
  if (missing.length) {
    return fail(
      "result text must reference uploaded image context",
      missing.join("; ")
    );
  }

  return pass("result text must reference uploaded image context");
}

let ok = true;
ok = checkVisionRequiresImage() && ok;
ok = checkCopyUsesImageAnalysis() && ok;
ok = checkGeneratePromptAssemblesUserInput() && ok;
ok = checkNoSmokeDefault() && ok;
ok = checkResultMustReferenceImageContext() && ok;

if (!ok) process.exit(1);
console.log("\nP830 image workbench grounding smoke: all checks passed.");
