-- Store encrypted API key material for owner-initiated reveal/copy.
-- Authentication continues to use api_keys.hash only.

alter table public.api_keys
  add column if not exists encrypted_secret text;
