-- Memory Capsule: private storage buckets and access policies.
-- Object paths start with the relationship id: <relationship_id>/memories/<memory_id>/<file>

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('relationship-media', 'relationship-media', false, 524288000,
    array['image/jpeg','image/png','image/webp','image/heic','image/heif','video/mp4','video/quicktime']),
  ('relationship-covers', 'relationship-covers', false, 20971520,
    array['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('relationship-letters', 'relationship-letters', false, 20971520,
    array['image/jpeg','image/png','image/webp','image/heic','image/heif']),
  ('relationship-avatars', 'relationship-avatars', false, 5242880,
    array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Safely extracts the relationship id from the first folder of an object path.
create or replace function public.storage_relationship_id(object_name text)
returns uuid
language plpgsql
stable
set search_path = public
as $$
begin
  return (storage.foldername(object_name))[1]::uuid;
exception when others then
  return null;
end;
$$;

-- Members of a relationship may read, upload, and delete objects under its folder.
do $$
declare
  b text;
begin
  foreach b in array array['relationship-media', 'relationship-covers', 'relationship-letters'] loop
    execute format('drop policy if exists %I on storage.objects', b || '_select');
    execute format('drop policy if exists %I on storage.objects', b || '_insert');
    execute format('drop policy if exists %I on storage.objects', b || '_delete');

    execute format(
      'create policy %I on storage.objects for select to authenticated using (
         bucket_id = %L and public.is_relationship_member(public.storage_relationship_id(name)))',
      b || '_select', b);

    execute format(
      'create policy %I on storage.objects for insert to authenticated with check (
         bucket_id = %L and public.is_relationship_member(public.storage_relationship_id(name)))',
      b || '_insert', b);

    execute format(
      'create policy %I on storage.objects for delete to authenticated using (
         bucket_id = %L and public.is_relationship_member(public.storage_relationship_id(name)))',
      b || '_delete', b);
  end loop;
end
$$;

-- Avatars: each person manages their own; a partner may view it.
drop policy if exists relationship_avatars_select on storage.objects;
drop policy if exists relationship_avatars_insert on storage.objects;
drop policy if exists relationship_avatars_delete on storage.objects;

create policy relationship_avatars_select on storage.objects for select to authenticated
  using (
    bucket_id = 'relationship-avatars'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1
        from public.relationship_members me
        join public.relationship_members them on them.relationship_id = me.relationship_id
        where me.user_id = auth.uid()
          and them.user_id::text = (storage.foldername(name))[1]
      )
    )
  );

create policy relationship_avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'relationship-avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy relationship_avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'relationship-avatars' and (storage.foldername(name))[1] = auth.uid()::text);
