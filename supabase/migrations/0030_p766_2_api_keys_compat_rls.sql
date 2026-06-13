-- P766.2 — api_keys can_reveal column, RLS policies, hash index (idempotent).

alter table public.api_keys
  add column if not exists can_reveal boolean not null default false;

update public.api_keys
set can_reveal = true
where encrypted_secret is not null
  and revoked_at is null;

alter table public.api_keys enable row level security;

drop policy if exists "api_keys_select_own" on public.api_keys;
drop policy if exists "api_keys_insert_own" on public.api_keys;
drop policy if exists "api_keys_update_own" on public.api_keys;
drop policy if exists "api_keys_service_role_all" on public.api_keys;

create policy "api_keys_select_own"
  on public.api_keys
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "api_keys_insert_own"
  on public.api_keys
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "api_keys_update_own"
  on public.api_keys
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- DMIT writes via service_role (PostgREST); explicit policy avoids RLS violations.
create policy "api_keys_service_role_all"
  on public.api_keys
  for all
  to service_role
  using (true)
  with check (true);

grant insert, update on public.api_keys to authenticated;

create index if not exists api_keys_hash_active_idx
  on public.api_keys (hash)
  where revoked_at is null;
