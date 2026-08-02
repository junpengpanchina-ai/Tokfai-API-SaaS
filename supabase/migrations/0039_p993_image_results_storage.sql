-- P993 — Tokfai-controlled durable storage for image generation results.
-- Same Supabase Storage architecture as playground-inputs; separate bucket
-- so provider temporary URLs are never returned to clients as the final URL.
-- Public read (no Authorization) so Cherry Studio / OpenAI-compatible clients
-- can display data[].url directly. Writes only via service_role (DMIT).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'image-results',
  'image-results',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "image_results_select_public" on storage.objects;
drop policy if exists "image_results_insert_service" on storage.objects;
drop policy if exists "image_results_update_service" on storage.objects;
drop policy if exists "image_results_delete_service" on storage.objects;

-- Anonymous / client GET of the public URL must work without Authorization.
create policy "image_results_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'image-results');

-- Authenticated inserts are not used for results; DMIT uses service_role
-- which bypasses RLS. Keep no authenticated insert policy on purpose.
