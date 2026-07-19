/**
 * Shared offline runner for p920–p928 third-party client smokes.
 * Default: mock gateway only. LIVE=1 may hit api.tokfai.com — never real upstream hosts.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  bootstrapClientCompatSmoke,
  pass,
  fail,
} from "./client-compat-smoke-bootstrap.mjs";
import { acceptanceFetch } from "./acceptance-http.mjs";
import {
  THIRD_PARTY_CLIENT_PROFILES,
  REQUIRED_MODEL_IDS,
  CLIENT_ERROR_CODES,
  FORBIDDEN_DOC_HOSTS,
  TOKFAI_API_V1,
} from "./third-party-client-profiles.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..");

const DOC_FILES = [
  "docs/tokfai-third-party-clients.zh.md",
  "apps/web/lib/docs/public-beta-docs-registry.ts",
];

function readCorpus() {
  return DOC_FILES.map((rel) => {
    try {
      return readFileSync(join(ROOT, rel), "utf8");
    } catch {
      return "";
    }
  }).join("\n");
}

/**
 * @param {string} profileId
 * @param {string} scriptRel
 */
export async function runThirdPartyClientSmoke(profileId, scriptRel) {
  const profile = THIRD_PARTY_CLIENT_PROFILES[profileId];
  if (!profile) {
    console.error(`Unknown client profile: ${profileId}`);
    process.exit(1);
  }

  console.log(`=== ${profile.name} client smoke (${profileId}) ===\n`);
  const ctx = await bootstrapClientCompatSmoke(scriptRel);
  let ok = true;

  try {
    const corpus = readCorpus();

    for (const phrase of profile.docPhrases) {
      if (!corpus.includes(phrase)) {
        ok = fail(`docs mention ${JSON.stringify(phrase)}`, "missing") && ok;
      } else {
        ok = pass(`docs mention ${JSON.stringify(phrase)}`) && ok;
      }
    }

    for (const modelId of REQUIRED_MODEL_IDS) {
      if (!corpus.includes(modelId)) {
        ok = fail(`docs cover model ${modelId}`, "missing") && ok;
      }
    }
    if (REQUIRED_MODEL_IDS.every((id) => corpus.includes(id))) {
      ok = pass(`docs cover models: ${REQUIRED_MODEL_IDS.join(", ")}`) && ok;
    }

    for (const code of CLIENT_ERROR_CODES) {
      if (!corpus.includes(code)) {
        ok = fail(`docs cover error ${code}`, "missing") && ok;
      }
    }
    if (CLIENT_ERROR_CODES.every((c) => corpus.includes(c))) {
      ok = pass(`docs cover Tokfai errors: ${CLIENT_ERROR_CODES.join(", ")}`) && ok;
    }

    if (!corpus.includes(TOKFAI_API_V1)) {
      ok = fail("docs use https://api.tokfai.com/v1", "missing") && ok;
    } else {
      ok = pass("docs use https://api.tokfai.com/v1") && ok;
    }

    // Host leak check scoped to the dedicated third-party guide (other legacy
    // chapters may still mention wrong-host diagnostics elsewhere).
    const guide = readFileSync(
      join(ROOT, "docs/tokfai-third-party-clients.zh.md"),
      "utf8"
    );
    let guideHostLeak = null;
    for (const re of FORBIDDEN_DOC_HOSTS) {
      if (re.test(guide)) {
        guideHostLeak = String(re);
        break;
      }
    }
    if (guideHostLeak) {
      ok =
        fail(
          "third-party guide must not include upstream hosts",
          guideHostLeak
        ) && ok;
    } else {
      ok = pass("third-party guide has no upstream host URLs") && ok;
    }

    {
      const { res, body } = await ctx.getJson("/v1/models");
      const rows = Array.isArray(body?.data) ? body.data : [];
      const ids = new Set(rows.map((r) => r.id));
      const missing = REQUIRED_MODEL_IDS.filter((id) => !ids.has(id));
      const badOwned = rows.filter(
        (r) => r.owned_by && String(r.owned_by).toLowerCase() !== "tokfai"
      );
      const unlabeled = rows.filter((r) => {
        if (!REQUIRED_MODEL_IDS.includes(r.id)) return false;
        const label = r.display_name || r.name || r.title || "";
        return !/^Tokfai\s+/i.test(label);
      });
      if (res.status !== 200 || missing.length || badOwned.length || unlabeled.length) {
        ok =
          fail(
            `${profile.name}: GET /v1/models Tokfai registry`,
            `HTTP ${res.status} missing=${missing.join(",")} owned=${badOwned.length} unlabeled=${unlabeled.length}`
          ) && ok;
      } else {
        ok =
          pass(
            `${profile.name}: GET /v1/models Tokfai branding + required ids`
          ) && ok;
      }
    }

    {
      const { res, body } = await acceptanceFetch(`${ctx.BASE}/v1/chat/completions`, {
        method: "POST",
        headers: {
          ...ctx.authHeaders(profile.headers ?? {}),
        },
        body: JSON.stringify(profile.chatBody),
        timeoutMs: ctx.TIMEOUT_MS,
      });
      const resolved = body?.tokfai?.resolved_model;
      const content = body?.choices?.[0]?.message?.content;
      const expect = profile.expectResolved;
      if (
        res.status === 401 ||
        res.status !== 200 ||
        !content ||
        (expect && resolved !== expect)
      ) {
        ok =
          fail(
            `${profile.name}: chat/completions contract`,
            `HTTP ${res.status} resolved=${resolved} expect=${expect} code=${body?.error?.code}`
          ) && ok;
      } else {
        ok =
          pass(
            `${profile.name}: chat/completions → resolved=${resolved}`
          ) && ok;
      }
    }
  } finally {
    ctx.cleanup();
  }

  console.log(ok ? `\n${profile.passToken}` : `\n${profile.failToken}`);
  process.exit(ok ? 0 : 1);
}
