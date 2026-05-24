-- Supabase Storage bucket for Image Playground input images.
-- Frontend uploads locally selected files here, then passes public URLs to DMIT.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'playground-inputs',
  'playground-inputs',
  true,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "playground_inputs_insert_own" on storage.objects;
drop policy if exists "playground_inputs_select_public" on storage.objects;
drop policy if exists "playground_inputs_delete_own" on storage.objects;

create policy "playground_inputs_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'playground-inputs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "playground_inputs_select_public"
  on storage.objects for select
  to public
  using (bucket_id = 'playground-inputs');

create policy "playground_inputs_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'playground-inputs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
