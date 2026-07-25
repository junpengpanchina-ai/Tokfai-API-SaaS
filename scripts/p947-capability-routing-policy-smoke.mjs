#!/usr/bin/env node
/**
 * P947 — Capability routing / model policy smoke (docs + static checks only).
 *
 * Hard limits:
 *   - no LIVE / mock gateway
 *   - no billing / alias / Cherry / Nginx / Nano Banana production edits
 *   - does not modify chat main-path runtime or release gate judgment
 *
 * Usage:
 *   node scripts/p947-capability-routing-policy-smoke.mjs
 *
 * Acceptance:
 *   TOKFAI_P947_CAPABILITY_ROUTING_POLICY_PASS
 */

import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pass, fail } from "./lib/client-compat-smoke-bootstrap.mjs";

const SCRIPT = "scripts/p947-capability-routing-policy-smoke.mjs";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const POLICY_DOC = join(ROOT, "docs/p947-capability-routing-policy.md");
const PASS_MARKER = "TOKFAI_P947_CAPABILITY_ROUTING_POLICY_PASS";
const FAIL_MARKER = "TOKFAI_P947_CAPABILITY_ROUTING_POLICY_FAIL";

/** Capability IDs that must appear in the policy doc. */
const REQUIRED_CAPABILITY_IDS = [
  "text_chat",
  "code_agent",
  "long_context",
  "ecommerce_copy",
  "geo_content",
  "image_generation_async",
  "image_edit_async",
  "video_generation_async",
];

/**
 * Six capability families the smoke must find (text/code/ecommerce/geo/image/video).
 * Each entry: label + patterns that must all match the doc.
 */
const SIX_FAMILIES = [
  {
    family: "text",
    patterns: [/text_chat/, /\btext\b/i],
  },
  {
    family: "code",
    patterns: [/code_agent/, /\bcode\b/i],
  },
  {
    family: "ecommerce",
    patterns: [/ecommerce_copy/, /ecommerce/i],
  },
  {
    family: "geo",
    patterns: [/geo_content/, /\bgeo\b/i],
  },
  {
    family: "image",
    patterns: [
      /image_generation_async/,
      /image_edit_async/,
      /\bimage\b/i,
    ],
  },
  {
    family: "video",
    patterns: [/video_generation_async/, /\bvideo\b/i],
  },
];

function includesAll(text, patterns) {
  return patterns.every((re) => re.test(text));
}

function checkCapabilityIds(doc) {
  let ok = true;
  for (const id of REQUIRED_CAPABILITY_IDS) {
    if (!doc.includes(id)) {
      ok = fail("capability id present", `missing \`${id}\``) && false;
    }
  }
  if (ok) {
    pass(
      `capability ids (${REQUIRED_CAPABILITY_IDS.length}): ${REQUIRED_CAPABILITY_IDS.join(", ")}`
    );
  }
  return ok;
}

function checkSixFamilies(doc) {
  let ok = true;
  const missing = [];
  for (const { family, patterns } of SIX_FAMILIES) {
    if (!includesAll(doc, patterns)) {
      missing.push(family);
      ok = false;
    }
  }
  if (!ok) {
    fail(
      "six capability families",
      `missing or incomplete: ${missing.join(", ")} (need text/code/ecommerce/geo/image/video)`
    );
  } else {
    pass("six capability families: text/code/ecommerce/geo/image/video");
  }
  return ok;
}

function checkNanoBananaPolicy(doc) {
  const hasNano = /nano\s*banana/i.test(doc);
  const hasAsyncOnly = /async-only/i.test(doc);
  const hasNotPublicStable = /not public stable/i.test(doc);
  // Must associate Nano Banana with both markers nearby in the Nano Banana section.
  const nanoSection =
    doc.match(/###?\s*2\.3[\s\S]*?(?=###?\s*2\.4|##\s*3\.|$)/i)?.[0] ?? "";
  const sectionHasAsync = /async-only/i.test(nanoSection);
  const sectionHasNotPublic = /not public stable/i.test(nanoSection);

  let ok = true;
  if (!hasNano) {
    ok = fail("Nano Banana mentioned", "doc must mention Nano Banana") && false;
  } else {
    pass("Nano Banana mentioned");
  }
  if (!hasAsyncOnly || !sectionHasAsync) {
    ok =
      fail(
        "Nano Banana async-only",
        "Nano Banana section must mark async-only"
      ) && false;
  } else {
    pass("Nano Banana marked async-only");
  }
  if (!hasNotPublicStable || !sectionHasNotPublic) {
    ok =
      fail(
        "Nano Banana not public stable",
        "Nano Banana section must mark not public stable"
      ) && false;
  } else {
    pass("Nano Banana marked not public stable");
  }
  return ok;
}

function checkVideoPolicy(doc) {
  const videoSection =
    doc.match(/###?\s*2\.4[\s\S]*?(?=##\s*3\.|$)/i)?.[0] ?? "";
  const hasFutureAsync =
    /future async-only/i.test(doc) && /future async-only/i.test(videoSection);
  const hasVideoCap = /video_generation_async/.test(doc);

  let ok = true;
  if (!hasVideoCap) {
    ok =
      fail("video capability", "missing video_generation_async") && false;
  } else {
    pass("video capability id present");
  }
  if (!hasFutureAsync) {
    ok =
      fail(
        "Video future async-only",
        "Video section must mark future async-only"
      ) && false;
  } else {
    pass("Video marked future async-only");
  }
  return ok;
}

function checkChatSurfaceIsolation(doc) {
  const hasChatCompletions = /chat\/completions/i.test(doc);
  const hasResponses = /\/v1\/responses|responses/i.test(doc);
  // Explicit isolation language: chat surfaces must not be polluted by image/video.
  const isolationPatterns = [
    /不允许被图片\s*\/\s*视频能力污染/,
    /禁止被图片\s*\/\s*视频能力污染/,
    /不进入.*chat\/completions/,
    /不进入.*responses/,
  ];
  const hasIsolationLanguage = isolationPatterns.some((re) => re.test(doc));

  // Hard: image/video async caps listed as forbidden on chat surfaces.
  const forbidsImageOnChat =
    /image_generation_async[\s\S]{0,400}不进入[\s\S]{0,200}chat\/completions/i.test(
      doc
    ) ||
    /不得[\s\S]{0,80}路由进[\s\S]{0,200}image_generation_async/i.test(doc) ||
    (/chat\/completions/.test(doc) &&
      /image_generation_async/.test(doc) &&
      /污染/.test(doc));

  const forbidsVideoOnChat =
    /video_generation_async/.test(doc) &&
    (/不进入/.test(doc) || /污染/.test(doc) || /future async-only/i.test(doc));

  let ok = true;
  if (!hasChatCompletions) {
    ok = fail("chat/completions surface", "doc must mention chat/completions") && false;
  } else {
    pass("chat/completions surface mentioned");
  }
  if (!hasResponses) {
    ok = fail("responses surface", "doc must mention responses") && false;
  } else {
    pass("responses surface mentioned");
  }
  if (!hasIsolationLanguage || !forbidsImageOnChat || !forbidsVideoOnChat) {
    ok =
      fail(
        "chat/responses isolation from image/video",
        "doc must forbid image/video capabilities from polluting chat/completions and responses"
      ) && false;
  } else {
    pass(
      "chat/completions & responses must not be polluted by image/video capabilities"
    );
  }
  return ok;
}

function checkHardLimitsStated(doc) {
  const limits = [
    [/billing/i, "billing"],
    [/alias/i, "alias"],
    [/Cherry/i, "Cherry"],
    [/Nginx/i, "Nginx"],
    [/Nano Banana/i, "Nano Banana production"],
  ];
  let ok = true;
  for (const [re, label] of limits) {
    if (!re.test(doc)) {
      ok = fail("hard limits stated", `missing mention of ${label}`) && false;
    }
  }
  if (ok) {
    pass("hard limits stated (billing/alias/Cherry/Nginx/Nano Banana)");
  }
  // Pause production opening for media
  if (!/暂停/.test(doc) && !/pause/i.test(doc)) {
    ok =
      fail(
        "production pause stated",
        "doc must state Nano Banana / image / video production opening is paused"
      ) && false;
  } else {
    pass("media production opening paused (stated)");
  }
  return ok;
}

async function main() {
  console.log("=== P947 Capability routing / model policy (static) ===");
  console.log(`script: ${SCRIPT}`);
  console.log("mode: docs + static checks only (no LIVE, no mock, no upstream)");
  console.log("");

  let doc;
  try {
    doc = await readFile(POLICY_DOC, "utf8");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    fail("policy doc readable", message);
    console.log("");
    console.log(FAIL_MARKER);
    process.exit(1);
  }

  if (!doc.trim()) {
    fail("policy doc non-empty", "docs/p947-capability-routing-policy.md is empty");
    console.log("");
    console.log(FAIL_MARKER);
    process.exit(1);
  }
  pass("policy doc readable: docs/p947-capability-routing-policy.md");

  let allOk = true;
  allOk = checkCapabilityIds(doc) && allOk;
  allOk = checkSixFamilies(doc) && allOk;
  allOk = checkNanoBananaPolicy(doc) && allOk;
  allOk = checkVideoPolicy(doc) && allOk;
  allOk = checkChatSurfaceIsolation(doc) && allOk;
  allOk = checkHardLimitsStated(doc) && allOk;

  console.log("");
  console.log(allOk ? PASS_MARKER : FAIL_MARKER);
  process.exit(allOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  console.log(FAIL_MARKER);
  process.exit(1);
});
