#!/usr/bin/env node
/**
 * Admin write API smoke — dry-run by default; live writes only with TOKFAI_ADMIN_WRITE_SMOKE=1.
 *
 * Usage (dry-run / validation only):
 *   TOKFAI_ADMIN_JWT=<token> node scripts/admin-write-smoke.mjs
 *
 * Live (smoke-prefixed data only, cleaned up at end):
 *   TOKFAI_ADMIN_JWT=<token> TOKFAI_ADMIN_WRITE_SMOKE=1 node scripts/admin-write-smoke.mjs
 *
 * Env:
 *   TOKFAI_API_BASE              default https://api.tokfai.com
 *   TOKFAI_ADMIN_JWT             required
 *   TOKFAI_ADMIN_WRITE_SMOKE     set to 1 to perform real writes on tokfai-smoke-* resources
 *   TOKFAI_WRITE_SMOKE_TIMEOUT_MS default 30000
 */

import { randomUUID } from "node:crypto";
import { getAcceptanceHeaders } from "./lib/acceptance-http.mjs";

const API_ROOT = normalizeBase(
  process.env.TOKFAI_API_BASE,
  "https://api.tokfai.com"
);
const ADMIN_JWT = (process.env.TOKFAI_ADMIN_JWT ?? "").trim();
const LIVE = process.env.TOKFAI_ADMIN_WRITE_SMOKE === "1";
const TIMEOUT_MS = Math.max(
  5000,
  parseInt(process.env.TOKFAI_WRITE_SMOKE_TIMEOUT_MS ?? "30000", 10) || 30_000
);
const SMOKE_PREFIX = "tokfai-smoke";
const RUN_ID = randomUUID().replace(/-/g, "").slice(0, 8);

/** @type {Array<{ id: string, status: 'PASS'|'WARN'|'FAIL'|'SKIP', detail: string }>} */
const results = [];

function normalizeBase(value, fallback) {
  return (value?.trim() || fallback).replace(/\/+$/, "");
}

function record(id, status, detail) {
  results.push({ id, status, detail });
  console.log(`[${status.padEnd(4)}] ${id} — ${detail}`);
}

function decodeJwtExp(token) {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(
      Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
        "utf8"
      )
    );
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

function assertJwtFresh(token) {
  if (!token) {
    console.error("TOKFAI_ADMIN_JWT is required.");
    process.exit(1);
  }
  const exp = decodeJwtExp(token);
  if (exp === null) {
    console.error(
      "TOKFAI_ADMIN_JWT could not be decoded (expected JWT). Regenerate a Supabase access token."
    );
    process.exit(1);
  }
  const now = Math.floor(Date.now() / 1000);
  if (exp <= now) {
    console.error(
      `TOKFAI_ADMIN_JWT expired at ${new Date(exp * 1000).toISOString()}. Regenerate and retry.`
    );
    process.exit(1);
  }
}

async function adminFetch(method, path, { body, idempotencyKey } = {}) {
  const url = `${API_ROOT}/admin${path}`;
  const headers = {
    ...getAcceptanceHeaders(),
    Authorization: `Bearer ${ADMIN_JWT}`,
    Accept: "application/json",
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  if (idempotencyKey) {
    headers["Idempotency-Key"] = idempotencyKey;
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  const text = await res.text();
  let parsed = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = { _raw: text.slice(0, 200) };
  }

  return { status: res.status, body: parsed, text };
}

function expectStatus(id, result, allowed, detailOk) {
  if (allowed.includes(result.status)) {
    record(id, "PASS", detailOk ?? `status=${result.status}`);
    return true;
  }
  const code =
    result.body?.error?.code ??
    (typeof result.body?.error === "string" ? result.body.error : null);
  record(
    id,
    "FAIL",
    `expected ${allowed.join("|")} got ${result.status}${code ? ` code=${code}` : ""}`
  );
  return false;
}

async function runDryRun() {
  console.log("Mode: DRY-RUN (validation / OPTIONS / auth only)");
  console.log("Set TOKFAI_ADMIN_WRITE_SMOKE=1 for live smoke-prefixed writes.\n");

  // OPTIONS on a write path (CORS preflight may 204/200/404 depending on gateway)
  try {
    const opt = await adminFetch("OPTIONS", "/settings");
    if ([200, 204, 404, 405].includes(opt.status)) {
      record("options.settings", "PASS", `status=${opt.status}`);
    } else if (opt.status >= 500) {
      record("options.settings", "FAIL", `status=${opt.status}`);
    } else {
      record("options.settings", "WARN", `status=${opt.status}`);
    }
  } catch (error) {
    record(
      "options.settings",
      "WARN",
      `OPTIONS not available: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  // Empty / invalid patches must be 400 (not 5xx)
  const cases = [
    {
      id: "validation.settings.empty",
      method: "PATCH",
      path: "/settings",
      body: {},
      allowed: [400],
    },
    {
      id: "validation.settings.disallowed",
      method: "PATCH",
      path: "/settings",
      body: { stripe_secret_key: "sk_test_fake" },
      allowed: [400],
    },
    {
      id: "validation.channels.empty",
      method: "PATCH",
      path: "/channels/primary-channel",
      body: {},
      allowed: [400],
    },
    {
      id: "validation.channels.unknown",
      method: "PATCH",
      path: "/channels/does-not-exist",
      body: { enabled: false },
      allowed: [404],
    },
    {
      id: "validation.pricing.empty",
      method: "PATCH",
      path: "/pricing/__tokfai_smoke_missing__",
      body: {},
      allowed: [400, 404],
    },
    {
      id: "validation.api_keys.missing",
      method: "POST",
      path: `/api-keys/${randomUUID()}/revoke`,
      body: {},
      allowed: [404],
    },
    {
      id: "validation.announcements.invalid",
      method: "POST",
      path: "/announcements",
      body: { title: "" },
      allowed: [400],
    },
    {
      id: "validation.recharge_plans.invalid",
      method: "POST",
      path: "/recharge-plans",
      body: { name: "" },
      allowed: [400],
    },
    {
      id: "validation.credits.user_not_found",
      method: "POST",
      path: "/credits/adjust",
      body: {
        user_id: randomUUID(),
        amount: 1,
        direction: "add",
        reason: "smoke",
      },
      allowed: [404],
      skipIdempotency: true,
    },
  ];

  for (const testCase of cases) {
    const result = await adminFetch(testCase.method, testCase.path, {
      body: testCase.body,
      idempotencyKey: testCase.skipIdempotency
        ? undefined
        : `${SMOKE_PREFIX}-dry-${RUN_ID}-${testCase.id}`,
    });
    expectStatus(
      testCase.id,
      result,
      testCase.allowed,
      `status=${result.status} (structured validation)`
    );
  }

  // Auth: no token must not succeed on write
  {
    const url = `${API_ROOT}/admin/settings`;
    const res = await fetch(url, {
      method: "PATCH",
      headers: {
        ...getAcceptanceHeaders(),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ site_name: "x" }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 401 || res.status === 403) {
      record("auth.write.no_token", "PASS", `status=${res.status}`);
    } else {
      record("auth.write.no_token", "FAIL", `expected 401|403 got ${res.status}`);
    }
  }
}

async function runLive() {
  console.log(
    `Mode: LIVE (TOKFAI_ADMIN_WRITE_SMOKE=1) — resources prefixed ${SMOKE_PREFIX}-*`
  );
  console.log(`Run id: ${RUN_ID}\n`);

  const created = {
    announcementId: null,
    planId: null,
    settingsTouched: false,
    channelTouched: false,
  };

  try {
    // Settings allowlisted patch (process overlay — restore after)
    {
      const before = await adminFetch("GET", "/settings");
      const prevName = before.body?.data?.site_name ?? "Tokfai";
      const patch = await adminFetch("PATCH", "/settings", {
        body: { site_name: `${SMOKE_PREFIX}-${RUN_ID}` },
        idempotencyKey: `${SMOKE_PREFIX}-settings-${RUN_ID}`,
      });
      if (expectStatus("live.settings.patch", patch, [200])) {
        created.settingsTouched = true;
        const restore = await adminFetch("PATCH", "/settings", {
          body: { site_name: prevName },
          idempotencyKey: `${SMOKE_PREFIX}-settings-restore-${RUN_ID}`,
        });
        expectStatus("live.settings.restore", restore, [200]);
      }
    }

    // Channel overlay enable/disable (restore enabled)
    {
      const patch = await adminFetch("PATCH", "/channels/primary-channel", {
        body: { priority: 1, enabled: true },
        idempotencyKey: `${SMOKE_PREFIX}-channel-${RUN_ID}`,
      });
      if (expectStatus("live.channels.patch", patch, [200])) {
        created.channelTouched = true;
        const masked = patch.body?.data?.base_url_masked;
        if (typeof masked === "string" && masked.includes("***")) {
          record("live.channels.base_url_masked", "PASS", "base_url_masked present");
        } else {
          record(
            "live.channels.base_url_masked",
            "WARN",
            "base_url_masked missing or unexpected"
          );
        }
      }
    }

    // Announcement create → publish → unpublish → leave disabled for cleanup note
    {
      const slug = `${SMOKE_PREFIX}-ann-${RUN_ID}`;
      const create = await adminFetch("POST", "/announcements", {
        body: {
          title: `${SMOKE_PREFIX} announcement ${RUN_ID}`,
          slug,
          content: "Smoke test announcement — safe to delete.",
          enabled: false,
          priority: 9999,
        },
        idempotencyKey: `${SMOKE_PREFIX}-ann-create-${RUN_ID}`,
      });
      if (expectStatus("live.announcements.create", create, [201])) {
        created.announcementId = create.body?.data?.id ?? null;
        if (created.announcementId) {
          const pub = await adminFetch(
            "POST",
            `/announcements/${created.announcementId}/publish`,
            { idempotencyKey: `${SMOKE_PREFIX}-ann-pub-${RUN_ID}` }
          );
          expectStatus("live.announcements.publish", pub, [200]);
          const unpub = await adminFetch(
            "POST",
            `/announcements/${created.announcementId}/unpublish`,
            { idempotencyKey: `${SMOKE_PREFIX}-ann-unpub-${RUN_ID}` }
          );
          expectStatus("live.announcements.unpublish", unpub, [200]);
        }
      }
    }

    // Recharge plan create → disable (archive via delete)
    {
      const planId = `${SMOKE_PREFIX}-plan-${RUN_ID}`;
      const create = await adminFetch("POST", "/recharge-plans", {
        body: {
          id: planId,
          name: `${SMOKE_PREFIX} plan ${RUN_ID}`,
          amount_cents: 100,
          base_credits: 10,
          bonus_credits: 0,
          enabled: false,
          visible: false,
          sort_order: 99999,
        },
        idempotencyKey: `${SMOKE_PREFIX}-plan-create-${RUN_ID}`,
      });
      if (expectStatus("live.recharge_plans.create", create, [201])) {
        created.planId = create.body?.data?.id ?? planId;
        const disable = await adminFetch(
          "PATCH",
          `/recharge-plans/${created.planId}`,
          {
            body: { enabled: false, visible: false },
            idempotencyKey: `${SMOKE_PREFIX}-plan-disable-${RUN_ID}`,
          }
        );
        expectStatus("live.recharge_plans.disable", disable, [200]);
        const archive = await adminFetch(
          "DELETE",
          `/recharge-plans/${created.planId}`,
          { idempotencyKey: `${SMOKE_PREFIX}-plan-archive-${RUN_ID}` }
        );
        expectStatus("live.recharge_plans.archive", archive, [200]);
        created.planId = null;
      }
    }

    // Pricing: dry validation against missing model (no real price change)
    {
      const patch = await adminFetch(
        "PATCH",
        `/pricing/${SMOKE_PREFIX}-missing-model`,
        {
          body: { input_price: 1 },
          idempotencyKey: `${SMOKE_PREFIX}-pricing-${RUN_ID}`,
        }
      );
      expectStatus("live.pricing.missing_model", patch, [404]);
    }

    // Models: patch missing model
    {
      const patch = await adminFetch(
        "PATCH",
        `/models/${SMOKE_PREFIX}-missing-model`,
        {
          body: { enabled: false },
          idempotencyKey: `${SMOKE_PREFIX}-model-${RUN_ID}`,
        }
      );
      expectStatus("live.models.missing", patch, [404]);
    }

    // API keys revoke missing
    {
      const revoke = await adminFetch(
        "POST",
        `/api-keys/${randomUUID()}/revoke`,
        { idempotencyKey: `${SMOKE_PREFIX}-key-revoke-${RUN_ID}` }
      );
      expectStatus("live.api_keys.revoke_missing", revoke, [404]);
    }
  } finally {
    if (created.announcementId) {
      const unpub = await adminFetch(
        "POST",
        `/announcements/${created.announcementId}/unpublish`,
        { idempotencyKey: `${SMOKE_PREFIX}-ann-cleanup-${RUN_ID}` }
      );
      if ([200, 404].includes(unpub.status)) {
        record(
          "cleanup.announcement.unpublish",
          "PASS",
          `status=${unpub.status} id=${created.announcementId}`
        );
      } else {
        record(
          "cleanup.announcement.unpublish",
          "WARN",
          `could not unpublish ${created.announcementId} status=${unpub.status}`
        );
      }
    }
    if (created.planId) {
      const archive = await adminFetch(
        "DELETE",
        `/recharge-plans/${created.planId}`,
        { idempotencyKey: `${SMOKE_PREFIX}-plan-cleanup-${RUN_ID}` }
      );
      if ([200, 404].includes(archive.status)) {
        record(
          "cleanup.recharge_plan.archive",
          "PASS",
          `status=${archive.status} id=${created.planId}`
        );
      } else {
        record(
          "cleanup.recharge_plan.archive",
          "WARN",
          `could not archive ${created.planId} status=${archive.status}`
        );
      }
    }
  }
}

async function main() {
  console.log("=== Tokfai admin write smoke ===");
  console.log(`API:  ${API_ROOT}/admin/*`);
  console.log(`JWT:  ${ADMIN_JWT ? `${ADMIN_JWT.slice(0, 12)}…` : "(missing)"}`);
  console.log(`LIVE: ${LIVE ? "yes" : "no (dry-run)"}`);
  console.log("");

  assertJwtFresh(ADMIN_JWT);

  if (LIVE) {
    await runLive();
  } else {
    await runDryRun();
  }

  const fail = results.filter((r) => r.status === "FAIL").length;
  const warn = results.filter((r) => r.status === "WARN").length;
  const pass = results.filter((r) => r.status === "PASS").length;
  const skip = results.filter((r) => r.status === "SKIP").length;

  console.log("\n=== Summary ===");
  console.log(`PASS=${pass} WARN=${warn} FAIL=${fail} SKIP=${skip}`);

  if (fail > 0) {
    console.log("RESULT: FAIL");
    process.exit(1);
  }
  if (warn > 0) {
    console.log("RESULT: PASS (with warnings)");
    process.exit(0);
  }
  console.log("RESULT: PASS");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
