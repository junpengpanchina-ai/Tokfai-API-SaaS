-- P766.1 — speed up active API key auth lookups by hash.
-- Idempotent: IF NOT EXISTS on index name.

create index if not exists api_keys_hash_active_idx
  on public.api_keys (hash)
  where revoked_at is null;
