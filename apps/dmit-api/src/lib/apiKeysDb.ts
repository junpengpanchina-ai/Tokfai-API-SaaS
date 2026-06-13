import type { PostgrestError } from "@supabase/supabase-js";

import { encryptSecretIfConfigured } from "../auth/keyEncryption.js";
import type { NewApiKeyMaterial } from "../auth/apiKey.js";
import { supabase } from "../supabase.js";
import type { ApiKeyRow } from "../types.js";

/** Columns present in production before P766.2. */
export const API_KEY_BASE_SELECT =
  "id, name, prefix, key_id, created_at, last_used_at, revoked_at";

export const API_KEY_LIST_SELECT = `${API_KEY_BASE_SELECT}, can_reveal`;

export const API_KEY_LIST_FALLBACK_SELECT =
  `${API_KEY_BASE_SELECT}, encrypted_secret`;

type ApiKeyListRow = Pick<
  ApiKeyRow,
  | "id"
  | "name"
  | "prefix"
  | "key_id"
  | "created_at"
  | "last_used_at"
  | "revoked_at"
> & {
  can_reveal?: boolean | null;
  encrypted_secret?: string | null;
};

export interface ApiKeyListItem {
  id: string;
  name: string;
  prefix: string;
  key_id: string;
  status: "active" | "revoked";
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  can_reveal: boolean;
}

export function resolveCanReveal(row: ApiKeyListRow): boolean {
  if (row.revoked_at) return false;
  if (typeof row.can_reveal === "boolean") return row.can_reveal;
  return Boolean(row.encrypted_secret);
}

export function mapApiKeyListRow(row: ApiKeyListRow): ApiKeyListItem {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    key_id: row.key_id,
    status: row.revoked_at ? "revoked" : "active",
    created_at: row.created_at,
    last_used_at: row.last_used_at,
    revoked_at: row.revoked_at,
    can_reveal: resolveCanReveal(row),
  };
}

function isMissingCanRevealColumn(error: PostgrestError | null): boolean {
  if (!error) return false;
  const msg = error.message.toLowerCase();
  return msg.includes("can_reveal") && msg.includes("does not exist");
}

export async function listApiKeysForUser(
  userId: string
): Promise<{ data: ApiKeyListItem[]; error: PostgrestError | null }> {
  const sb = supabase();
  const primary = await sb
    .from("api_keys")
    .select<string, ApiKeyListRow>(API_KEY_LIST_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (!primary.error) {
    return {
      data: (primary.data ?? []).map(mapApiKeyListRow),
      error: null,
    };
  }

  if (!isMissingCanRevealColumn(primary.error)) {
    return { data: [], error: primary.error };
  }

  const fallback = await sb
    .from("api_keys")
    .select<string, ApiKeyListRow>(API_KEY_LIST_FALLBACK_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (fallback.error) {
    return { data: [], error: fallback.error };
  }

  return {
    data: (fallback.data ?? []).map(mapApiKeyListRow),
    error: null,
  };
}

export type { NewApiKeyMaterial };

export interface ApiKeyInsertPayload {
  user_id: string;
  name: string;
  key_id: string;
  prefix: string;
  hash: string;
  encrypted_secret: string | null;
  can_reveal: boolean;
}

export function buildApiKeyInsertPayload(
  userId: string,
  name: string,
  material: NewApiKeyMaterial
): ApiKeyInsertPayload {
  const encryptedSecret = encryptSecretIfConfigured(material.fullKey);
  return {
    user_id: userId,
    name,
    key_id: material.keyId,
    prefix: material.prefix,
    hash: material.hash,
    encrypted_secret: encryptedSecret,
    can_reveal: Boolean(encryptedSecret),
  };
}

export async function insertApiKeyRow(
  payload: ApiKeyInsertPayload
): Promise<{
  data: Pick<
    ApiKeyRow,
    "id" | "name" | "prefix" | "created_at" | "last_used_at" | "revoked_at"
  > | null;
  error: PostgrestError | null;
}> {
  const sb = supabase();
  const withCanReveal = await sb
    .from("api_keys")
    .insert(payload)
    .select(
      "id, name, prefix, created_at, last_used_at, revoked_at"
    )
    .single();

  if (!withCanReveal.error) {
    return withCanReveal;
  }

  if (!isMissingCanRevealColumn(withCanReveal.error)) {
    return withCanReveal;
  }

  const { can_reveal: _canReveal, ...legacyPayload } = payload;
  return sb
    .from("api_keys")
    .insert(legacyPayload)
    .select("id, name, prefix, created_at, last_used_at, revoked_at")
    .single();
}

function isMissingCanRevealOnWrite(error: PostgrestError | null): boolean {
  return isMissingCanRevealColumn(error);
}

export async function revokeApiKeyRow(
  id: string,
  userId: string,
  revokedAt: string
): Promise<{
  data: Pick<ApiKeyRow, "id" | "revoked_at"> | null;
  error: PostgrestError | null;
}> {
  const sb = supabase();
  const withFlag = await sb
    .from("api_keys")
    .update({ revoked_at: revokedAt, can_reveal: false })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id, revoked_at")
    .maybeSingle();

  if (!withFlag.error) {
    return withFlag;
  }

  if (!isMissingCanRevealOnWrite(withFlag.error)) {
    return withFlag;
  }

  return sb
    .from("api_keys")
    .update({ revoked_at: revokedAt })
    .eq("id", id)
    .eq("user_id", userId)
    .select("id, revoked_at")
    .maybeSingle();
}
