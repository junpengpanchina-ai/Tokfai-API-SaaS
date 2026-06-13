#!/usr/bin/env node
/**
 * P766.2 — api_keys schema / RLS compatibility check (service role only).
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/check-api-keys-db-compat.mjs
 */

import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const EXPECTED_COLUMNS = [
  "id",
  "user_id",
  "name",
  "key_id",
  "prefix",
  "hash",
  "created_at",
  "last_used_at",
  "revoked_at",
  "encrypted_secret",
  "can_reveal",
];

function maskId(id) {
  if (!id || typeof id !== "string") return "(none)";
  return id.length <= 10 ? `${id.slice(0, 4)}…` : `${id.slice(0, 8)}…`;
}

function maskKeyId(keyId) {
  if (!keyId || typeof keyId !== "string") return "(none)";
  return keyId.length <= 6 ? `${keyId.slice(0, 3)}…` : `${keyId.slice(0, 6)}…`;
}

async function probeColumns(sb) {
  const present = [];
  for (const col of EXPECTED_COLUMNS) {
    const { error } = await sb.from("api_keys").select(col).limit(1);
    if (!error) present.push(col);
  }
  const presentSet = new Set(present);
  const missing = EXPECTED_COLUMNS.filter((c) => !presentSet.has(c));
  return { present, missing };
}

async function main() {
  if (!url || !serviceKey) {
    console.error(
      "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY before running."
    );
    process.exit(1);
  }

  const sb = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log("=== P766.2 api_keys DB compatibility ===");
  console.log("");

  const { count: total, error: totalErr } = await sb
    .from("api_keys")
    .select("id", { count: "exact", head: true });
  if (totalErr) {
    console.error("count total failed:", totalErr.message);
    process.exit(1);
  }

  const { count: active, error: activeErr } = await sb
    .from("api_keys")
    .select("id", { count: "exact", head: true })
    .is("revoked_at", null);
  if (activeErr) {
    console.error("count active failed:", activeErr.message);
    process.exit(1);
  }

  const revoked = (total ?? 0) - (active ?? 0);

  console.log(`total:   ${total ?? 0}`);
  console.log(`active:  ${active ?? 0}`);
  console.log(`revoked: ${revoked}`);
  console.log("");

  const { present, missing } = await probeColumns(sb);
  console.log(`columns present: ${present.length ? present.join(", ") : "(none)"}`);
  console.log(`columns missing: ${missing.length ? missing.join(", ") : "(none)"}`);
  console.log("");

  const listSelect = [
    "id",
    "name",
    "prefix",
    "key_id",
    "revoked_at",
    present.includes("can_reveal") ? "can_reveal" : null,
  ]
    .filter(Boolean)
    .join(", ");

  const { data: recent, error: recentErr } = await sb
    .from("api_keys")
    .select(listSelect)
    .order("created_at", { ascending: false })
    .limit(10);

  if (recentErr) {
    console.error("recent keys query failed:", recentErr.message);
    process.exit(1);
  }

  console.log("recent keys (max 10):");
  for (const row of recent ?? []) {
    const status = row.revoked_at ? "revoked" : "active";
    const canReveal =
      "can_reveal" in row && row.can_reveal != null
        ? String(row.can_reveal)
        : "n/a";
    console.log(
      [
        `id=${maskId(row.id)}`,
        `name=${row.name ?? "(none)"}`,
        `prefix=${row.prefix ?? "(none)"}`,
        `key_id=${maskKeyId(row.key_id)}`,
        `can_reveal=${canReveal}`,
        `status=${status}`,
      ].join(" | ")
    );
  }

  console.log("");
  console.log("Done (hash / encrypted_secret never printed).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
