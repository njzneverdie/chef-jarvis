-- Storage remove() first selects the object and then deletes it, so the
-- delete policy alone matches nothing under RLS and the app's cleanup on
-- Cancel silently left the video behind. Users may see only their own
-- folder in the private video-imports bucket; nothing becomes public.
drop policy if exists video_imports_select_own on storage.objects;
create policy video_imports_select_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'video-imports'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
