-- Video recipe import: a private bucket for videos the user saved themselves.
-- Files live at "<auth user id>/<uuid>.<mp4|mov|m4v>" only until the
-- chef-meal-plan function has sent them to Gemini; the function deletes them
-- right after, and leftovers on the user's next import. Nothing is public.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'video-imports',
  'video-imports',
  false,
  52428800,
  array['video/mp4', 'video/quicktime', 'video/x-m4v']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Users may only upload into, and delete from, their own folder. There is no
-- select policy: only the service role (the edge function) reads the files.
drop policy if exists video_imports_insert_own on storage.objects;
create policy video_imports_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'video-imports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists video_imports_delete_own on storage.objects;
create policy video_imports_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'video-imports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
